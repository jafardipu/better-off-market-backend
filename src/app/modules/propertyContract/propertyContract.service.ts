import httpStatus from 'http-status';
import mongoose, { PipelineStage, Types } from 'mongoose';
import AppError from '../../error/AppError';
import { Property } from '../properties/properties.models';
import { STATUS, STATUS_OPTIONS } from '../properties/properties.constants';
import { IProperty } from '../properties/properties.interface';
import { User } from '../user/user.models';
// NEW FLOW: contract details from accepted offers + buyer activity
import { Offer } from '../offer/offer.models';
import { OFFER_STATUS } from '../offer/offer.constants';
import { BuyerActivity } from '../buyerActivity/buyerActivity.models';
import { BUYER_ACTIVITY_FIELDS } from '../buyerActivity/buyerActivity.constants';
import { PropertyContract } from './propertyContract.models';
import {
  ICreatePropertyContractPayload,
  IPropertyContract,
} from './propertyContract.interface';
import {
  BUYER_CONTACT_SOURCE_REQUIRED_MESSAGE,
  BUYER_CONTACT_SOURCES,
  CERTIFICATION_REQUIRED_MESSAGE,
  CONTRACT_ALLOWED_FROM_STATUSES,
  CONTRACT_ALREADY_SUBMITTED_MESSAGE,
  CONTRACT_SOURCE,
  CONTRACT_SOURCES,
  NEEDS_REVIEW_CONTACT_SOURCES,
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

  // NEW FLOW: required answer + certification, and the optional accepted offer.
  const buyerContactSource = cleanOptionalString(payload.buyerContactSource);
  if (!buyerContactSource || !BUYER_CONTACT_SOURCES.includes(buyerContactSource)) {
    throw new AppError(httpStatus.BAD_REQUEST, BUYER_CONTACT_SOURCE_REQUIRED_MESSAGE);
  }
  if (payload.certified !== true) {
    throw new AppError(httpStatus.BAD_REQUEST, CERTIFICATION_REQUIRED_MESSAGE);
  }
  const offerId = cleanOptionalString(payload.offerId);
  if (offerId && !isObjectIdString(offerId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'offerId is not a valid id');
  }

  // NEW FLOW: contract details submitted from an accepted offer.
  let offer: { _id: Types.ObjectId; buyer: Types.ObjectId } | null = null;
  if (offerId) {
    // Offer has no findOne soft-delete hook, so check isDeleted here.
    const found = await Offer.findById(offerId).lean();
    if (!found || found.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
    }
    if (found.seller?.toString() !== sellerId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Only the seller on this offer can submit its contract details',
      );
    }
    if (found.property?.toString() !== propertyId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'This offer is not for this property');
    }
    if (found.status !== OFFER_STATUS.accepted) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Contract details can only be submitted for an accepted offer',
      );
    }
    if (
      found.isContractDetailsSubmitted ||
      (await PropertyContract.exists({ offer: found._id }))
    ) {
      throw new AppError(httpStatus.CONFLICT, CONTRACT_ALREADY_SUBMITTED_MESSAGE);
    }
    offer = { _id: found._id as Types.ObjectId, buyer: found.buyer };
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

  // NEW FLOW: from an accepted offer, a property that is already Under Contract
  // (e.g. the seller marked it manually first) is allowed and keeps its status.
  const keepsUnderContract = Boolean(offer) && property.status === STATUS.under_contact;

  if (!CONTRACT_ALLOWED_FROM_STATUSES.includes(property.status) && !keepsUnderContract) {
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
    // aborts on any thrown error, so either all writes commit or none do.
    await session.withTransaction(async () => {
      const unchangedFilter = {
        _id: property._id,
        seller: property.seller,
        status: previousStatus,
        isDeleted: false,
      };
      // Only flip the status if nobody changed it since we read it above.
      // NEW FLOW: when it is already Under Contract, just re-check it in the
      // transaction and leave it as it is.
      const updatedProperty = keepsUnderContract
        ? await Property.findOne(unchangedFilter).session(session)
        : await Property.findOneAndUpdate(
            unchangedFilter,
            { status: STATUS.under_contact },
            { new: true, session },
          );

      if (!updatedProperty) {
        throw new AppError(
          httpStatus.CONFLICT,
          "This property's status changed while you were submitting. Please refresh and try again.",
        );
      }

      // NEW FLOW: mark the offer. The condition makes a second submission for
      // the same offer (e.g. a double click) fail with 409.
      if (offer) {
        const updatedOffer = await Offer.findOneAndUpdate(
          {
            _id: offer._id,
            status: OFFER_STATUS.accepted,
            isContractDetailsSubmitted: { $ne: true },
            isDeleted: { $ne: true },
          },
          { isContractDetailsSubmitted: true },
          { new: true, session },
        );
        if (!updatedOffer) {
          throw new AppError(httpStatus.CONFLICT, CONTRACT_ALREADY_SUBMITTED_MESSAGE);
        }
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
            // NEW FLOW: contract details from accepted offers
            offer: offer?._id ?? null,
            buyer: offer?.buyer ?? null,
            buyerContactSource,
            certifiedAt: new Date(),
            source: offer ? CONTRACT_SOURCE.offer_accepted : CONTRACT_SOURCE.manual,
          },
        ],
        { session },
      );
      committed = {
        contract: created.toObject(),
        property: updatedProperty.toObject(),
      };
    });
  } catch (error) {
    // The unique { offer } index is the last line of defense against two
    // contracts for one offer.
    if ((error as { code?: number } | null)?.code === 11000) {
      throw new AppError(httpStatus.CONFLICT, CONTRACT_ALREADY_SUBMITTED_MESSAGE);
    }
    throw error;
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
  // NEW FLOW: the linked buyer (offer flow only) and their activity on this listing.
  {
    $lookup: {
      from: User.collection.name,
      localField: 'buyer',
      foreignField: '_id',
      as: 'buyerUser',
    },
  },
  { $unwind: { path: '$buyerUser', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: BuyerActivity.collection.name,
      let: { buyerId: '$buyer', propertyId: '$property._id' },
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
        { $limit: 1 },
      ],
      as: 'buyerActivity',
    },
  },
  { $unwind: { path: '$buyerActivity', preserveNullAndEmptyArrays: true } },
  {
    $project: {
      _id: 1,
      buyerName: orNull('$buyerName'),
      closingDate: orNull('$closingDate'),
      titleCompany: orNull('$titleCompany'),
      previousStatus: 1,
      createdAt: 1,
      updatedAt: 1,
      // NEW FLOW: contract details from accepted offers. Older records have
      // none of these; they were all manual submissions.
      offer: orNull('$offer'),
      source: { $ifNull: ['$source', CONTRACT_SOURCE.manual] },
      buyerContactSource: orNull('$buyerContactSource'),
      certifiedAt: orNull('$certifiedAt'),
      buyer: {
        $cond: [
          { $ifNull: ['$buyerUser._id', false] },
          {
            _id: '$buyerUser._id',
            name: orNull('$buyerUser.name'),
            email: orNull('$buyerUser.email'),
            phoneNumber: orNull('$buyerUser.phoneNumber'),
          },
          null,
        ],
      },
      buyerActivity: {
        $cond: [
          { $ifNull: ['$buyerActivity._id', false] },
          {
            _id: '$buyerActivity._id',
            ...Object.fromEntries(
              BUYER_ACTIVITY_FIELDS.map(field => [
                field,
                orNull(`$buyerActivity.${field}`),
              ]),
            ),
            createdAt: '$buyerActivity.createdAt',
            updatedAt: '$buyerActivity.updatedAt',
          },
          null,
        ],
      },
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
  // NEW FLOW: hasPlatformActivity = the buyer activity has at least one
  // timestamp; needsReview = that, plus an "independent" or "unsure" answer.
  {
    $addFields: {
      hasPlatformActivity: {
        $or: BUYER_ACTIVITY_FIELDS.map(field => ({
          $ne: [{ $ifNull: [`$buyerActivity.${field}`, null] }, null],
        })),
      },
    },
  },
  {
    $addFields: {
      needsReview: {
        $and: [
          '$hasPlatformActivity',
          {
            $in: [
              { $ifNull: ['$buyerContactSource', null] },
              NEEDS_REVIEW_CONTACT_SOURCES,
            ],
          },
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
  // NEW FLOW: the linked buyer (offer flow)
  'buyer.name',
  'buyer.email',
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

  // NEW FLOW: source, buyerContactSource and needsReview filters.
  const source = queryString(query.source);
  if (source && !CONTRACT_SOURCES.includes(source)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `source must be one of: ${CONTRACT_SOURCES.join(', ')}`,
    );
  }
  const buyerContactSource = queryString(query.buyerContactSource);
  if (buyerContactSource && !BUYER_CONTACT_SOURCES.includes(buyerContactSource)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `buyerContactSource must be one of: ${BUYER_CONTACT_SOURCES.join(', ')}`,
    );
  }
  const needsReview = queryString(query.needsReview).toLowerCase();
  if (needsReview && needsReview !== 'true' && needsReview !== 'false') {
    throw new AppError(httpStatus.BAD_REQUEST, 'needsReview must be true or false');
  }

  const match: Record<string, unknown> = {};
  if (status) {
    // property.status is the live status from the $lookup, not a snapshot.
    match['property.status'] = status;
  }
  if (source) match.source = source;
  if (buyerContactSource) match.buyerContactSource = buyerContactSource;
  if (needsReview) match.needsReview = needsReview === 'true';
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
