/* eslint-disable no-console */
// One-time backfill of BuyerActivity from existing data.
//
//   npm run backfill:buyer-activity                 (from the repo root, uses .env)
//   node dist/scripts/backfillBuyerActivity.js      (after `npm run build`)
//
// Safe to run more than once: every write is the same $min upsert the live
// tracking uses, so earlier dates win and nothing is ever moved later.
//
// Backfilled:
//   firstSavedAt          earliest favorite per user + property (incl. soft-deleted ones)
//   firstRsvpAt           earliest open-house RSVP
//   firstOfferSubmittedAt earliest offer per buyer + property (incl. withdrawn/deleted)
//   firstNegotiationAt    earliest counter-offer (offer history entry after round 1)
//   firstMessagedSellerAt earliest chat message with propertyInfo sent by a
//                         non-seller to that property's seller. The automatic
//                         "I plan to attend this open house." message sent on
//                         an RSVP is skipped: it is not the buyer writing to the
//                         seller (live tracking doesn't count it either).
// Not backfilled:
//   firstViewedAt         views were only counted, never linked to users.
import dns from 'dns';
import mongoose, { Types } from 'mongoose';
import config from '../app/config';
import { BuyerActivity } from '../app/modules/buyerActivity/buyerActivity.models';
import { OPEN_HOUSE_RSVP_MESSAGE_TEXT } from '../app/modules/buyerActivity/buyerActivity.constants';
import { TBuyerActivityField } from '../app/modules/buyerActivity/buyerActivity.interface';
import Favorite from '../app/modules/favorite/favorite.models';
import { OpenHouseRsvp } from '../app/modules/OpenHouseRsvp/OpenHouseRsvp.model';
import { Offer } from '../app/modules/offer/offer.models';
import { Message } from '../app/modules/message/message.model';
import { Property } from '../app/modules/properties/properties.models';

// Same DNS servers as src/server.ts, so mongodb+srv URLs resolve the same way.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const BATCH_SIZE = 500;

type TRow = { buyer: Types.ObjectId; property: Types.ObjectId; at: Date };

// The raw driver (`.collection`) is used on purpose: it skips the soft-delete
// hooks, so unsaved favorites and deleted offers still count as activity.
const groupEarliest = (idFields: { buyer: string; property: string }, at: string) => [
  {
    $group: {
      _id: { buyer: idFields.buyer, property: idFields.property },
      at: { $min: at },
    },
  },
  {
    $project: {
      _id: 0,
      buyer: '$_id.buyer',
      property: '$_id.property',
      at: 1,
    },
  },
];

const sources: { field: TBuyerActivityField; load: () => Promise<TRow[]> }[] = [
  {
    field: 'firstSavedAt',
    load: () =>
      Favorite.collection
        .aggregate<TRow>(groupEarliest({ buyer: '$user', property: '$property' }, '$createdAt'))
        .toArray(),
  },
  {
    field: 'firstRsvpAt',
    load: () =>
      OpenHouseRsvp.collection
        .aggregate<TRow>(groupEarliest({ buyer: '$buyer', property: '$property' }, '$createdAt'))
        .toArray(),
  },
  {
    field: 'firstOfferSubmittedAt',
    load: () =>
      Offer.collection
        .aggregate<TRow>(groupEarliest({ buyer: '$buyer', property: '$property' }, '$createdAt'))
        .toArray(),
  },
  {
    field: 'firstNegotiationAt',
    load: () =>
      Offer.collection
        .aggregate<TRow>([
          { $unwind: '$history' },
          { $match: { 'history.round': { $gt: 1 } } },
          // History entries carry their own createdAt; fall back to the
          // offer's updatedAt for any entry without one.
          {
            $set: { negotiatedAt: { $ifNull: ['$history.createdAt', '$updatedAt'] } },
          },
          ...groupEarliest({ buyer: '$buyer', property: '$property' }, '$negotiatedAt'),
        ])
        .toArray(),
  },
];

// Messages need the property's seller to decide whether they count, so they
// are grouped by sender + receiver + property and filtered after the seller
// lookup.
const loadMessageRows = () =>
  Message.collection
    .aggregate<TRow & { receiver: Types.ObjectId }>([
      {
        $match: {
          'propertyInfo._id': { $exists: true, $ne: null },
          text: { $ne: OPEN_HOUSE_RSVP_MESSAGE_TEXT },
        },
      },
      {
        $group: {
          _id: {
            buyer: '$senderId',
            receiver: '$receiverId',
            property: '$propertyInfo._id',
          },
          at: { $min: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          buyer: '$_id.buyer',
          receiver: '$_id.receiver',
          property: '$_id.property',
          at: 1,
        },
      },
    ])
    .toArray();

const loadSellers = async (propertyIds: Types.ObjectId[]) => {
  const sellers = new Map<string, Types.ObjectId | null>();
  for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
    const batch = propertyIds.slice(i, i + BATCH_SIZE);
    // Raw driver: includes soft-deleted listings (the activity still happened).
    const docs = await Property.collection
      .find({ _id: { $in: batch } }, { projection: { seller: 1 } })
      .toArray();
    docs.forEach(doc =>
      sellers.set(String(doc._id), (doc.seller as Types.ObjectId) ?? null),
    );
  }
  return sellers;
};

type TPair = {
  buyer: Types.ObjectId;
  property: Types.ObjectId;
  seller: Types.ObjectId | null;
  fields: Partial<Record<TBuyerActivityField, Date>>;
  earliest: Date;
  latest: Date;
};

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const run = async () => {
  await mongoose.connect(config.database_url as string);
  console.log('MongoDB connected');

  // The unique { buyer, property } index must exist before upserting.
  await BuyerActivity.createIndexes();

  const rowsByField: { field: TBuyerActivityField; rows: TRow[] }[] = [];
  for (const source of sources) {
    rowsByField.push({ field: source.field, rows: await source.load() });
  }
  const messageRows = await loadMessageRows();

  const propertyIds = new Map<string, Types.ObjectId>();
  [...rowsByField.flatMap(({ rows }) => rows), ...messageRows].forEach(row => {
    if (row.property) propertyIds.set(String(row.property), row.property);
  });
  const sellers = await loadSellers([...propertyIds.values()]);

  const pairs = new Map<string, TPair>();
  const stats: Record<string, { found: number; kept: number }> = {};

  const addRow = (field: TBuyerActivityField, row: TRow) => {
    stats[field] = stats[field] ?? { found: 0, kept: 0 };
    stats[field].found += 1;

    if (!row.buyer || !row.property || !isValidDate(row.at)) return;
    const propertyKey = String(row.property);
    if (!sellers.has(propertyKey)) return; // listing no longer exists
    const seller = sellers.get(propertyKey) ?? null;
    if (seller && String(seller) === String(row.buyer)) return; // own listing

    const key = `${String(row.buyer)}:${propertyKey}`;
    const pair =
      pairs.get(key) ??
      ({
        buyer: row.buyer,
        property: row.property,
        seller,
        fields: {},
        earliest: row.at,
        latest: row.at,
      } as TPair);

    const current = pair.fields[field];
    if (!current || row.at < current) pair.fields[field] = row.at;
    if (row.at < pair.earliest) pair.earliest = row.at;
    if (row.at > pair.latest) pair.latest = row.at;
    pairs.set(key, pair);
    stats[field].kept += 1;
  };

  rowsByField.forEach(({ field, rows }) => rows.forEach(row => addRow(field, row)));

  // A message counts only when it went TO the property's seller.
  messageRows.forEach(row => {
    const seller = sellers.get(String(row.property));
    if (!seller || String(row.receiver) !== String(seller)) {
      stats.firstMessagedSellerAt = stats.firstMessagedSellerAt ?? { found: 0, kept: 0 };
      stats.firstMessagedSellerAt.found += 1;
      return;
    }
    addRow('firstMessagedSellerAt', row);
  });

  // One upsert per buyer + property. $min only ever moves dates earlier.
  // createdAt/updatedAt are widened to cover the backfilled activity.
  const ops = [...pairs.values()].map(pair => ({
    updateOne: {
      filter: { buyer: pair.buyer, property: pair.property },
      update: {
        $min: { ...pair.fields, createdAt: pair.earliest },
        $max: { updatedAt: pair.latest },
        $setOnInsert: { seller: pair.seller },
      },
      upsert: true,
    },
  }));

  let upserted = 0;
  let modified = 0;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = ops.slice(i, i + BATCH_SIZE);
    let result;
    try {
      result = await BuyerActivity.collection.bulkWrite(batch, { ordered: false });
    } catch (error) {
      // A live request may have created the same buyer + property between
      // our read and write. The writes are idempotent, so retry the batch once.
      if ((error as { code?: number })?.code !== 11000) throw error;
      result = await BuyerActivity.collection.bulkWrite(batch, { ordered: false });
    }
    upserted += result.upsertedCount;
    modified += result.modifiedCount;
  }

  console.log('Rows found / used per field (skipped = own listing, missing listing, or not sent to the seller):');
  Object.entries(stats).forEach(([field, { found, kept }]) =>
    console.log(`  ${field.padEnd(22)} ${found} found, ${kept} used`),
  );
  console.log(`Buyer + property pairs: ${ops.length}`);
  console.log(`  created: ${upserted}`);
  console.log(`  updated: ${modified}`);
  console.log(`  already up to date: ${ops.length - upserted - modified}`);
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async error => {
    console.error('Buyer activity backfill failed:', error);
    await mongoose.disconnect().catch(() => null);
    process.exit(1);
  });
