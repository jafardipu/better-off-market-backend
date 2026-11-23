import httpStatus from 'http-status';
import mongoose, { PipelineStage, Types } from 'mongoose';
import AppError from '../../error/AppError';
import { Property } from '../properties/properties.models';
import { STATUS, STATUS_OPTIONS } from '../properties/properties.constants';
import { IProperty } from '../properties/properties.interface';
import { User } from '../user/user.models';
import { PropertyContract } from './propertyContract.models';
import {
  ICreatePropertyContractPayload,
  IPropertyContract,
} from './propertyContract.interface';
import {
  CONTRACT_ALLOWED_FROM_STATUSES,
  PROPERTY_CONTRACT_DEFAULT_LIMIT,
  PROPERTY_CONTRACT_MAX_LIMIT,
  PROPERTY_CONTRACT_SORT_FIELDS,
} from './propertyContract.constants';
import {
  cleanOptionalString,
  escapeRegex,
  isObjectIdString,
  notifyAdminsOfPropertyContract,
  parseDateOnly,
} from './propertyContract.utils';

const BLOCKED_STATUS_MESSAGES: Record<string, string> = {
  [STATUS.under_contact]: 'This property is already Under Contract',
  [STATUS.sold]: 'This property has already been sold',
  [STATUS.rejected]: 'A rejected listing cannot be marked as Under Contract',
};

const createPropertyContract = async (
  sellerId: string,
  payload: ICreatePropertyContractPayload,
) => {
  // validateRequest only checks the body, so normalize it here.
  const propertyId = cleanOptionalString(payload?.propertyId);
  if (!isObjectIdString(propertyId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'propertyId is not a valid id');
  }

  const buyerName = cleanOptionalString(payload.buyerName);
  const titleCompany = cleanOptionalString(payload.titleCompany);
  const closingDateInput = cleanOptionalString(payload.closingDate);
  const closingDate = closingDateInput ? parseDateOnly(closingDateInput) : null;
  if (closingDateInput && !closingDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Anticipated closing date must be a valid date (YYYY-MM-DD)',
    );
  }

  // findById goes through the pre('findOne') hook, so deleted listings 404.
  const property = await Property.findById(propertyId);
  if (!property) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  if (property.seller?.toString() !== sellerId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only mark your own property as Under Contract',
    );
  }

  if (!CONTRACT_ALLOWED_FROM_STATUSES.includes(property.status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      BLOCKED_STATUS_MESSAGES[property.status] ??
        `A property with status "${property.status}" cannot be marked as Under Contract`,
    );
  }

  const previousStatus = property.status;
  let committed: { contract: IPropertyContract; property: IProperty } | undefined;

  const session = await mongoose.startSession();
  try {
    // withTransaction retries transient errors (e.g. write conflicts) and
    // aborts on any thrown error, so either both writes commit or neither does.
    await session.withTransaction(async () => {
      // Only flip the status if nobody changed it since we read it above.
      const updatedProperty = await Property.findOneAndUpdate(
        {
          _id: property._id,
          seller: property.seller,
          status: previousStatus,
          isDeleted: false,
        },
        { status: STATUS.under_contact },
        { new: true, session },
      );

      if (!updatedProperty) {
        throw new AppError(
          httpStatus.CONFLICT,
          "This property's status changed while you were submitting. Please refresh and try again.",
        );
      }

      const [created] = await PropertyContract.create(
        [
          {
            property: property._id,
            seller: property.seller,
            buyerName,
            closingDate,
            titleCompany,
            previousStatus,
          },
        ],
        { session },
      );
      committed = {
        contract: created.toObject(),
        property: updatedProperty.toObject(),
      };
    });
  } finally {
    await session.endSession();
  }

  if (!committed) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to mark property as Under Contract',
    );
  }

  // Fire-and-forget: the response must not wait for email / notification,
  // and their failures are logged inside without failing the request.
  void notifyAdminsOfPropertyContract({ ...committed, sellerId });

  return committed.contract;
};

// ============================== admin reads ==============================

// Outputs null instead of dropping the key when a field is missing, so every
// item has the same documented shape.
const orNull = (field: string) => ({ $ifNull: [field, null] });

// Joins the live property and the seller, drops contracts whose property was
// soft-deleted, and shapes each item for the admin dashboard.
const contractDetailStages = (): PipelineStage[] => [
  {
    $lookup: {
      from: Property.collection.name,
      localField: 'property',
      foreignField: '_id',
      as: 'property',
    },
  },
  { $unwind: '$property' },
  { $match: { 'property.isDeleted': { $ne: true } } },
  {
    $lookup: {
      from: User.collection.name,
      localField: 'seller',
      foreignField: '_id',
      as: 'seller',
    },
  },
  { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
  {
    $project: {
      _id: 1,
      buyerName: orNull('$buyerName'),
      closingDate: orNull('$closingDate'),
      titleCompany: orNull('$titleCompany'),
      previousStatus: 1,
      createdAt: 1,
      updatedAt: 1,
      property: {
        _id: '$property._id',
        streetAddress: orNull('$property.streetAddress'),
        city: orNull('$property.city'),
        state: orNull('$property.state'),
        zipCode: orNull('$property.zipCode'),
        county: orNull('$property.county'),
        propertyType: orNull('$property.propertyType'),
        listingPrice: orNull('$property.listingPrice'),
        photos: { $ifNull: ['$property.photos', []] },
        status: orNull('$property.status'),
      },
      // null if the seller's user document no longer exists.
      seller: {
        $cond: [
          { $ifNull: ['$seller._id', false] },
          {
            _id: '$seller._id',
            name: orNull('$seller.name'),
            email: orNull('$seller.email'),
            phoneNumber: orNull('$seller.phoneNumber'),
            profile: orNull('$seller.profile'),
          },
          null,
        ],
      },
    },
  },
];

const SEARCHABLE_FIELDS = [
  'property.streetAddress',
  'property.city',
  'property.zipCode',
  'seller.name',
  'seller.email',
  'buyerName',
  'titleCompany',
];

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const queryString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getAllPropertyContracts = async (query: Record<string, unknown>) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(
    toPositiveInt(query.limit, PROPERTY_CONTRACT_DEFAULT_LIMIT),
    PROPERTY_CONTRACT_MAX_LIMIT,
  );
  const searchTerm = queryString(query.searchTerm);
  const status = queryString(query.status);
  const sortBy = queryString(query.sortBy) || 'createdAt';
  const sortOrder = (queryString(query.sortOrder) || 'desc').toLowerCase();

  if (status && !(STATUS_OPTIONS as string[]).includes(status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `status must be one of: ${STATUS_OPTIONS.join(', ')}`,
    );
  }

  const sortField = PROPERTY_CONTRACT_SORT_FIELDS[sortBy];
  if (!sortField) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `sortBy must be one of: ${Object.keys(PROPERTY_CONTRACT_SORT_FIELDS).join(', ')}`,
    );
  }

  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    throw new AppError(httpStatus.BAD_REQUEST, 'sortOrder must be asc or desc');
  }
  const direction = sortOrder === 'asc' ? 1 : -1;

  const match: Record<string, unknown> = {};
  if (status) {
    // property.status is the live status from the $lookup, not a snapshot.
    match['property.status'] = status;
  }
  if (searchTerm) {
    const regex = new RegExp(escapeRegex(searchTerm), 'i');
    match.$or = SEARCHABLE_FIELDS.map(field => ({ [field]: regex }));
  }

  const pipeline: PipelineStage[] = [
    ...contractDetailStages(),
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    // _id as a tie-breaker keeps pagination stable.
    { $sort: { [sortField]: direction, _id: direction } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await PropertyContract.aggregate(pipeline);
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

const getPropertyContractById = async (id: string) => {
  if (!isObjectIdString(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid property contract id');
  }

  const [contract] = await PropertyContract.aggregate([
    { $match: { _id: new Types.ObjectId(id) } },
    ...contractDetailStages(),
  ]);

  if (!contract) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property contract not found');
  }

  return contract;
};

export const propertyContractService = {
  createPropertyContract,
  getAllPropertyContracts,
  getPropertyContractById,
};
