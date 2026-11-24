import httpStatus from 'http-status';
import { PipelineStage, Types } from 'mongoose';
import AppError from '../../error/AppError';
import { Property } from '../properties/properties.models';
import { User } from '../user/user.models';
import { PropertyContract } from '../propertyContract/propertyContract.models';
import { BuyerActivity } from './buyerActivity.models';
import {
  BUYER_ACTIVITY_DEFAULT_LIMIT,
  BUYER_ACTIVITY_FIELDS,
  BUYER_ACTIVITY_MAX_LIMIT,
  BUYER_ACTIVITY_SEARCHABLE_FIELDS,
  BUYER_ACTIVITY_SORT_FIELDS,
} from './buyerActivity.constants';

const isObjectIdString = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const queryString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

// Outputs null instead of dropping the key when a field is missing, so every
// item has the same documented shape.
const orNull = (field: string) => ({ $ifNull: [field, null] });

// `null` when the joined document is missing, otherwise the given shape.
const objectOrNull = (idPath: string, shape: Record<string, unknown>) => ({
  $cond: [{ $ifNull: [idPath, false] }, shape, null],
});

const getAllBuyerActivities = async (query: Record<string, unknown>) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(
    toPositiveInt(query.limit, BUYER_ACTIVITY_DEFAULT_LIMIT),
    BUYER_ACTIVITY_MAX_LIMIT,
  );
  const searchTerm = queryString(query.searchTerm);
  const sortBy = queryString(query.sortBy) || 'updatedAt';
  const sortOrder = (queryString(query.sortOrder) || 'desc').toLowerCase();

  const sortField = BUYER_ACTIVITY_SORT_FIELDS[sortBy];
  if (!sortField) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `sortBy must be one of: ${Object.keys(BUYER_ACTIVITY_SORT_FIELDS).join(', ')}`,
    );
  }
  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    throw new AppError(httpStatus.BAD_REQUEST, 'sortOrder must be asc or desc');
  }
  const direction = sortOrder === 'asc' ? 1 : -1;

  // ?buyer= / ?property= / ?seller= narrow the list before any joins (indexed).
  const idMatch: Record<string, Types.ObjectId> = {};
  for (const key of ['buyer', 'property', 'seller'] as const) {
    const value = queryString(query[key]);
    if (!value) continue;
    if (!isObjectIdString(value)) {
      throw new AppError(httpStatus.BAD_REQUEST, `${key} must be a valid id`);
    }
    idMatch[key] = new Types.ObjectId(value);
  }

  const pipeline: PipelineStage[] = [
    ...(Object.keys(idMatch).length ? [{ $match: idMatch }] : []),
    {
      $lookup: {
        from: Property.collection.name,
        localField: 'property',
        foreignField: '_id',
        as: 'propertyDoc',
      },
    },
    { $unwind: '$propertyDoc' },
    // Same rule as property contracts: soft-deleted listings are hidden.
    { $match: { 'propertyDoc.isDeleted': { $ne: true } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'buyer',
        foreignField: '_id',
        as: 'buyerDoc',
      },
    },
    { $unwind: { path: '$buyerDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'seller',
        foreignField: '_id',
        as: 'sellerDoc',
      },
    },
    { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
    {
      // The latest contract for this buyer + property, if any.
      $lookup: {
        from: PropertyContract.collection.name,
        let: { buyerId: '$buyer', propertyId: '$property' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$buyer', '$$buyerId'] },
                  { $eq: ['$property', '$$propertyId'] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ],
        as: 'contractDoc',
      },
    },
    { $unwind: { path: '$contractDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        createdAt: 1,
        updatedAt: 1,
        ...Object.fromEntries(
          BUYER_ACTIVITY_FIELDS.map(field => [field, orNull(`$${field}`)]),
        ),
        buyer: objectOrNull('$buyerDoc._id', {
          _id: '$buyerDoc._id',
          name: orNull('$buyerDoc.name'),
          email: orNull('$buyerDoc.email'),
          phoneNumber: orNull('$buyerDoc.phoneNumber'),
          profile: orNull('$buyerDoc.profile'),
        }),
        property: {
          _id: '$propertyDoc._id',
          streetAddress: orNull('$propertyDoc.streetAddress'),
          city: orNull('$propertyDoc.city'),
          state: orNull('$propertyDoc.state'),
          zipCode: orNull('$propertyDoc.zipCode'),
          status: orNull('$propertyDoc.status'),
          photos: { $ifNull: ['$propertyDoc.photos', []] },
        },
        seller: objectOrNull('$sellerDoc._id', {
          _id: '$sellerDoc._id',
          name: orNull('$sellerDoc.name'),
          email: orNull('$sellerDoc.email'),
        }),
        contract: objectOrNull('$contractDoc._id', {
          _id: '$contractDoc._id',
          buyerContactSource: orNull('$contractDoc.buyerContactSource'),
          certifiedAt: orNull('$contractDoc.certifiedAt'),
          createdAt: '$contractDoc.createdAt',
        }),
      },
    },
  ];

  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    pipeline.push({
      $match: {
        $or: BUYER_ACTIVITY_SEARCHABLE_FIELDS.map(field => ({ [field]: regex })),
      },
    });
  }

  pipeline.push(
    // _id as a tie-breaker keeps pagination stable.
    { $sort: { [sortField]: direction, _id: direction } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await BuyerActivity.aggregate(pipeline);
  const total: number = result?.total?.[0]?.count ?? 0;

  return {
    data: result?.data ?? [],
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
  };
};

export const buyerActivityService = {
  getAllBuyerActivities,
};
