import { Types } from 'mongoose';
import { Property } from '../properties/properties.models';
import { BuyerActivity } from './buyerActivity.models';
import { BUYER_ACTIVITY_FIELDS } from './buyerActivity.constants';
import { TBuyerActivityField } from './buyerActivity.interface';

// Accepts a string or an ObjectId; returns the 24-hex id, or null.
const toIdString = (value: unknown): string | null => {
  if (!value) return null;
  const id =
    typeof value === 'string'
      ? value.trim()
      : (value as { toString(): string }).toString();
  return /^[a-f\d]{24}$/i.test(id) ? id : null;
};

const isDuplicateKeyError = (error: unknown) =>
  (error as { code?: number } | null)?.code === 11000;

type TRecordOptions = {
  // The property's seller, when the caller already has it (saves a query).
  sellerId?: unknown;
  // When the action happened. Defaults to now.
  at?: Date;
};

// Records the FIRST time a buyer did `field` on a listing.
// - Does nothing without a user, or when the user is the listing's seller.
// - $min keeps the earliest date and never moves it later; $setOnInsert sets
//   the seller only when the document is created.
// - Never throws: tracking must not fail or slow down the user's request, so
//   callers fire it with `void` and failures are only logged.
export const recordBuyerActivity = async (
  userId: unknown,
  propertyId: unknown,
  field: TBuyerActivityField,
  options: TRecordOptions = {},
): Promise<void> => {
  try {
    const buyerId = toIdString(userId);
    const listingId = toIdString(propertyId);
    if (!buyerId || !listingId) return;

    let sellerId = toIdString(options.sellerId);
    if (!sellerId) {
      // findById goes through the soft-delete hook, so deleted listings are skipped.
      const property = await Property.findById(listingId).select('seller').lean();
      if (!property) return;
      sellerId = toIdString(property.seller);
    }
    if (sellerId === buyerId) return;

    const at =
      options.at instanceof Date && !Number.isNaN(options.at.getTime())
        ? options.at
        : new Date();

    const filter = {
      buyer: new Types.ObjectId(buyerId),
      property: new Types.ObjectId(listingId),
    };
    const update = {
      $min: { [field]: at },
      $setOnInsert: { seller: sellerId ? new Types.ObjectId(sellerId) : null },
    };

    try {
      await BuyerActivity.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // A concurrent request created this buyer + property first. It exists
      // now, so the retry updates it instead of inserting.
      await BuyerActivity.updateOne(filter, update, { upsert: true });
    }
  } catch (error) {
    console.error(
      `Buyer activity ${field} not recorded (user ${String(userId)}, property ${String(propertyId)}):`,
      error,
    );
  }
};

// Chat messages: records firstMessagedSellerAt for the sender only when the
// message is tied to a listing and goes from a non-seller TO that listing's
// seller. Never throws.
export const recordBuyerMessagedSeller = async (
  senderId: unknown,
  receiverId: unknown,
  propertyId: unknown,
): Promise<void> => {
  try {
    const sender = toIdString(senderId);
    const receiver = toIdString(receiverId);
    const listingId = toIdString(propertyId);
    if (!sender || !receiver || !listingId) return;

    const property = await Property.findById(listingId).select('seller').lean();
    const sellerId = toIdString(property?.seller);
    if (!sellerId || receiver !== sellerId || sender === sellerId) return;

    await recordBuyerActivity(sender, listingId, 'firstMessagedSellerAt', {
      sellerId,
    });
  } catch (error) {
    console.error(
      `Buyer activity firstMessagedSellerAt not recorded (sender ${String(senderId)}, property ${String(propertyId)}):`,
      error,
    );
  }
};

// True if the activity record has at least one timestamp.
export const hasAnyBuyerActivity = (
  activity: Partial<Record<TBuyerActivityField, unknown>> | null | undefined,
) => Boolean(activity && BUYER_ACTIVITY_FIELDS.some(field => activity[field]));
