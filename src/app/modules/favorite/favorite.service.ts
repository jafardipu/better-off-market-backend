
import httpStatus from 'http-status';
import { PipelineStage, Types } from 'mongoose';
import { IFavorite } from './favorite.interface';
import Favorite from './favorite.models';
import AppError from '../../error/AppError';
import { Property } from '../properties/properties.models';
import { STATUS } from '../properties/properties.constants';

const SAVED_PROPERTY_STATUSES = [
  STATUS.active,
  STATUS.under_contact,
  STATUS.sold,
] as const;

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
};

const createFavorite = async (payload: IFavorite) => {
  const result = await Favorite.create(payload);

  Property.findByIdAndUpdate(result?.property, {
    $inc: { totalSaved: 1 },
  }).catch((err) => {
    console.error('Failed to increment favoriteCount:', err);
  });

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create favorite');
  }
  return result;
};

const getAllFavorite = async (query: Record<string, any>) => {
  const userId = query.user;
  if (!userId || !Types.ObjectId.isValid(String(userId))) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'User is not authenticated');
  }

  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
  if (
    status &&
    !SAVED_PROPERTY_STATUSES.includes(
      status as (typeof SAVED_PROPERTY_STATUSES)[number],
    )
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'status must be one of: Active, Under Contract, Sold',
    );
  }

  const page = toPositiveInt(query.page, 1);
  const limit = toPositiveInt(query.limit, 9);
  const skip = (page - 1) * limit;

  const statusMatch: PipelineStage[] = status
    ? [{ $match: { 'propertyDoc.status': status } }]
    : [];

  const [result] = await Favorite.aggregate([
    { $match: { user: new Types.ObjectId(String(userId)) } },
    {
      $lookup: {
        from: Property.collection.collectionName,
        localField: 'property',
        foreignField: '_id',
        as: 'propertyDoc',
      },
    },
    { $unwind: { path: '$propertyDoc', preserveNullAndEmptyArrays: false } },
    { $match: { 'propertyDoc.isDeleted': { $ne: true } } },
    {
      $facet: {
        counts: [
          { $group: { _id: '$propertyDoc.status', count: { $sum: 1 } } },
        ],
        data: [
          ...statusMatch,
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $addFields: { property: '$propertyDoc' } },
          { $project: { propertyDoc: 0 } },
        ],
        filteredTotal: [...statusMatch, { $count: 'count' }],
      },
    },
  ] as PipelineStage[]);

  const statusCounts = {
    all: 0,
    active: 0,
    under_contract: 0,
    sold: 0,
  };

  for (const row of result?.counts ?? []) {
    statusCounts.all += row.count;
    if (row._id === STATUS.active) statusCounts.active = row.count;
    else if (row._id === STATUS.under_contact) statusCounts.under_contract = row.count;
    else if (row._id === STATUS.sold) statusCounts.sold = row.count;
  }

  const total = result?.filteredTotal?.[0]?.count ?? 0;

  return {
    data: result?.data ?? [],
    meta: {
      page,
      limit,
      total,
      totalPage: total === 0 ? 0 : Math.ceil(total / limit),
    },
    statusCounts,
  };
};

const getFavoriteById = async (id: string) => {
  const result = await Favorite.findById(id);
  if (!result || result?.isDeleted) {
    throw new Error('Favorite not found!');
  }
  return result;
};

const updateFavorite = async (id: string, payload: Partial<IFavorite>) => {
  const result = await Favorite.findByIdAndUpdate(id, payload, { new: true });
  if (!result) {
    throw new Error('Failed to update Favorite');
  }
  return result;
};

const deleteFavorite = async (id: string) => {
  const result = await Favorite.findByIdAndDelete(id);

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete favorite');
  }

  Property.findByIdAndUpdate(result.property, {
    $inc: { totalSaved: -1 },
  }).catch((err) => {
    console.error('Failed to decrement favoriteCount:', err);
  });


  return result;
};

export const favoriteService = {
  createFavorite,
  getAllFavorite,
  getFavoriteById,
  updateFavorite,
  deleteFavorite,
};