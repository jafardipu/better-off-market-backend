import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import QueryBuilder from '../../class/builder/QueryBuilder';
import { IProperty } from './properties.interface';
import {
  PROPERTY_STATUS,
  PROPERTY_TYPES,
  propertySearchableFields,
  STATUS,
} from './properties.constants';
import { Property } from './properties.models';
import { Types } from 'mongoose';
import { FilterQuery, PipelineStage } from 'mongoose';
import { notifyGetInTouchSubscribers, notifySubscribersOfPriceChange, propertyAddress, PropertySearchQuery, toArray } from './properties.utils';
import { deleteRemovedPropertyFiles } from './properties.files';
import { PropertyView } from '../PropertyView/PropertyView.model';
import { OpenHouseRsvp } from '../OpenHouseRsvp/OpenHouseRsvp.model';
import { User } from '../user/user.models';
import { USER_ROLE } from '../user/user.constants';
import { sendNotificationMessage } from '../notification/notification.utils';
import { sendActivityEmail } from '../../utils/activityEmail';
import config from '../../config';
import { Chat } from '../chat/chat.model';
import { Message } from '../message/message.model';
import { serializeMessage } from '../../socket/utils/serializeMessage';
import { getSocketIdByUserId } from '../../socket/utils/onlineUsers';
import { getIO } from '../../socket/utils/io';
import getChatList from '../../socket/handlers/chatList.handlers';
// NEW FLOW: buyer activity tracking
import { recordBuyerActivity } from '../buyerActivity/buyerActivity.utils';



const createProperty = async (payload: IProperty) => {
  const result = await Property.create(payload);
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Property creation failed');
  }

  const admin = await User.GetAdminUser();

  const notificationPayload = {
    message: `A new property has been added`,
    description: ` A new property has been added from ${payload?.streetAddress}, ${payload?.city}, ${payload?.state}, ${payload?.zipCode}, ${payload?.county}. Please review it and take appropriate action.`,
    userId: admin?._id?.toString()!,
    fcmToken: admin?.fcmToken,
    link: `/listings/${result._id}`,
  };

  sendNotificationMessage(notificationPayload);

  const address = propertyAddress(
    payload.streetAddress,
    payload.city,
    payload.state,
    payload.zipCode,
    payload.county,
  );
  sendActivityEmail({
    to: admin?.email,
    userName: admin?.name,
    subject: 'New listing submitted for review',
    title: 'Listing Ready for Review',
    body: 'A seller submitted a new listing. Review it and approve or reject it.',
    detailLabel: 'Property',
    detailValue: address,
    actionUrl: `${config.client_Url}/listings/${result._id}`,
    actionLabel: 'Review Listing',
  });

  return result;
};

const getAllProperties = async (query: Record<string, unknown>) => {
  const propertyQuery = new QueryBuilder(Property.find(), query)
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();
  return { data, meta };
};

const getAllPropertiesForDashboard = async (query: Record<string, unknown>) => {
  const propertyQuery = new QueryBuilder(Property.find().populate('seller'), query)
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();

  const counts: { _id: string; count: number }[] = await Property.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const countMap: Record<string, number> = {};
  let all = 0;

  for (const c of counts) {
    countMap[c._id] = c.count;
    all += c.count;
  }

  const statusCounts: Record<string, number> = { all };
  for (const key of PROPERTY_STATUS) {
    const label = STATUS[key]; // "pending" -> "Pending"

    statusCounts[label] = countMap[label] || 0;
  }

  return { data, meta, statusCounts };
};

const getPropertyTypeCounts = async () => {
  const counts: { _id: string; count: number }[] = await Property.aggregate([
    {
      $match: {
        isDeleted: false,
        status: { $in: [STATUS.active, STATUS.under_contact] },
      },
    },
    { $group: { _id: '$propertyType', count: { $sum: 1 } } },
  ]);

  const countMap: Record<string, number> = {};
  for (const { _id, count } of counts) {
    countMap[_id] = count;
  }

  return Object.fromEntries(
    PROPERTY_TYPES.map((propertyType) => [propertyType, countMap[propertyType] || 0]),
  ) as Record<(typeof PROPERTY_TYPES)[number], number>;
};


const getAllPropertiesForWeb = async (query: PropertySearchQuery) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const counties = toArray(query.county);
  const propertyTypes = toArray(query.propertyType);
  const statuses = toArray(query.status) || [STATUS.active, STATUS.under_contact];

  const matchStage: Record<string, unknown> = {
    status: { $in: statuses },
  };

  if (counties?.length) {
    matchStage.county = { $in: counties };
  }

  if (propertyTypes?.length) {
    matchStage.propertyType = { $in: propertyTypes };
  }

  if (query.minPrice || query.maxPrice) {
    matchStage.listingPrice = {};
    if (query.minPrice) {
      (matchStage.listingPrice as Record<string, number>).$gte = Number(query.minPrice);
    }
    if (query.maxPrice) {
      (matchStage.listingPrice as Record<string, number>).$lte = Number(query.maxPrice);
    }
  }

  if (query.searchTerm?.trim()) {
    const regex = new RegExp(query.searchTerm.trim(), 'i');
    matchStage.$or = [
      { streetAddress: regex },
      { city: regex },
      { state: regex },
      { zipCode: regex },
      { county: regex },
    ];
  }

  const hasGeo = query.lat && query.lng;

  if (hasGeo) {
    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [Number(query.lng), Number(query.lat)],
          },
          distanceField: 'distance',
          spherical: true,
          query: matchStage,
        },
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await Property.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.totalCount[0]?.count || 0;

    return {
      data,
      meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    };
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    lowest: { listingPrice: 1 },
    highest: { listingPrice: -1 },
  };
  const sort = sortMap[query.sortBy || 'newest'];

  const [data, total] = await Promise.all([
    Property.find(matchStage).sort(sort).skip(skip).limit(limit),
    Property.countDocuments(matchStage),
  ]);

  return {
    data,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

const getPriceDroppedProperties = async (query: Record<string, unknown>) => {
  const filter: FilterQuery<IProperty> = {
    oldListingPrice: { $ne: null },
    status: { $in: [STATUS.active, STATUS.under_contact] },
    $expr: { $gt: ['$oldListingPrice', '$listingPrice'] },
  } as FilterQuery<IProperty>;

  // Always rank by most recent reduction; ignore client sort (e.g. -createdAt).
  const { sort: _ignoredSort, ...restQuery } = query;

  const propertyQuery = new QueryBuilder(
    Property.find(filter).sort({ priceDroppedAt: -1, updatedAt: -1 }),
    restQuery,
  )
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();

  return { data, meta };
};


const getMyListingProperties = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const propertyQuery = new QueryBuilder(
    Property.find({ seller: sellerId }),
    query,
  )
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();

  const counts: { _id: string; count: number }[] = await Property.aggregate([
    { $match: { seller: new Types.ObjectId(sellerId), isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const countMap: Record<string, number> = {};
  let all = 0;

  for (const c of counts) {
    countMap[c._id] = c.count;
    all += c.count;
  }

  const statusCounts: Record<string, number> = { all };
  for (const key of PROPERTY_STATUS) {
    const label = STATUS[key];
    statusCounts[key] = countMap[label] || 0;
  }

  return { data, meta, statusCounts };
};

const getPropertyById = async (id: string) => {
  const result = await Property.findById(id).populate('seller');
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }
  return result;
};

const getPropertiesBySeller = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const propertyQuery = new QueryBuilder(
    Property.find({
      seller: sellerId,
      status: { $nin: [STATUS.pending, STATUS.rejected] },
    }),
    query,
  )
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();

  return { data, meta };
};
const getPropertiesBySellerForDashboard = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const propertyQuery = new QueryBuilder(
    Property.find({
      seller: sellerId,
    }),
    query,
  )
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();

  return { data, meta };
};

// Seller-only status rules for PATCH /properties/:id. Sending the current
// status again is not a change and is always allowed.
// - Under Contract can only be set via POST /property-contracts, so the contract
//   details and admin alerts are always recorded.
// - Sold can only be set from Under Contract.
const assertSellerStatusChangeAllowed = (
  currentStatus: string,
  nextStatus?: string,
) => {
  if (!nextStatus || nextStatus === currentStatus) return;

  if (nextStatus === STATUS.under_contact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'To mark this property as Under Contract, use the Mark Under Contract form',
    );
  }

  if (nextStatus === STATUS.sold && currentStatus !== STATUS.under_contact) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'A property can only be marked as Sold while it is Under Contract',
    );
  }
};

const updateProperty = async (
  id: string,
  payload: Partial<IProperty>,
  removedFileUrls: string[] = [],
  actor: { userId?: string; role?: string } = {},
) => {

  const existing = await Property.findById(id);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  if (actor.role === USER_ROLE.user) {
    assertSellerStatusChangeAllowed(existing.status, payload.status);
  }

  const previousPrice = existing.listingPrice;
  const nextPrice =
    payload.listingPrice === undefined ? previousPrice : Number(payload.listingPrice);
  const priceChanged =
    payload.listingPrice !== undefined &&
    Number.isFinite(nextPrice) &&
    nextPrice !== Number(previousPrice);
  const priceReduced =
    payload.listingPrice !== undefined &&
    Number.isFinite(nextPrice) &&
    nextPrice < Number(previousPrice);
  const isPublicListing =
    existing.status === STATUS.active || existing.status === STATUS.under_contact;

  if (priceReduced) {
    payload.priceDroppedAt = new Date();
  }

  const result = await Property.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  if (result && removedFileUrls.length) {
    await deleteRemovedPropertyFiles(removedFileUrls);
  }

  if (result && priceChanged && isPublicListing) {
    const seller = result.seller
      ? await User.GetUserById(result.seller.toString())
      : null;
    void notifySubscribersOfPriceChange(
      result,
      seller?.name ?? 'Seller',
      previousPrice,
    ).catch((error) => {
      console.error('Failed to notify subscribers about price change:', error);
    });
  }

  return result;
};

const deleteProperty = async (
  id: string,
  actor: { userId?: string; role?: string },
) => {
  const existing = await Property.findById(id);

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  const isAdmin = actor.role === USER_ROLE.admin;
  if (!isAdmin && existing.seller?.toString() !== actor.userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You can only delete your own property',
    );
  }

  const result = await Property.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  );

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  if (isAdmin) {
    const seller = await User.GetUserById(result.seller.toString());
    if (seller?._id) {
      void sendNotificationMessage({
        message: 'Deleted your listed property',
        description: `Your listed property from ${result.streetAddress}, ${result.city}, ${result.state}, ${result.zipCode}, ${result.county} has been deleted by the admin.`,
        userId: seller._id.toString(),
        fcmToken: seller.fcmToken,
        link: '/properties-list',
      }).catch((error) => {
        console.error('Failed to notify seller about deleted property:', error);
      });
    }
  }

  return result;
};

// ======================================= admin services =======================================
const approveProperty = async (id: string) => {
  const result = await Property.findByIdAndUpdate(id, { status: STATUS.active, approvedDate: new Date() }, { new: true });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  const seller = await User.GetUserById(result.seller.toString());

  const notificationPayload = {
    message: `Approved your listed property`,
    description: `Your listed property from ${result?.streetAddress}, ${result?.city}, ${result?.state}, ${result?.zipCode}, ${result?.county} has been approved by the admin.`,
    userId: seller?._id?.toString()!,
    fcmToken: seller?.fcmToken,
    link: `/properties-list/${result._id}`,
  };

  sendNotificationMessage(notificationPayload);

  const address = propertyAddress(
    result.streetAddress,
    result.city,
    result.state,
    result.zipCode,
    result.county,
  );
  sendActivityEmail({
    to: seller?.email,
    userName: seller?.name,
    subject: 'Your listing is now Active',
    title: 'Listing Approved',
    body: 'Your listing has been approved and is now Active on BetterOffMarket.',
    detailLabel: 'Property',
    detailValue: address,
    actionUrl: `${config.client_Url}/properties-list/${result._id}`,
    actionLabel: 'View Listing',
  });

  void notifyGetInTouchSubscribers(result, seller?.name ?? 'Seller').catch((error) => {
    console.error('Failed to notify GetInTouch subscribers about approved property:', error);
  });

  return result;
}

const rejectProperty = async (id: string) => {

  const result = await Property.findByIdAndUpdate(id, { status: STATUS.rejected }, { new: true });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  const seller = await User.GetUserById(result.seller.toString());

  const notificationPayload = {
    message: `Rejected your listed property`,
    description: `Your listed property from ${result?.streetAddress}, ${result?.city}, ${result?.state}, ${result?.zipCode}, ${result?.county} has been rejected by the admin.`,
    userId: seller?._id?.toString()!,
    fcmToken: seller?.fcmToken,
    link: `/properties-list/${result._id}`,
  };

  sendNotificationMessage(notificationPayload);

  return result;
}

const increaseViewCount = async (id: string, viewerId?: string) => {
  const result = await Property.findByIdAndUpdate(id, { $inc: { totalViews: 1 } }, { new: true });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  PropertyView.create({
    property: id,
    seller: result.seller,
  }).catch((err) => {
    console.error('Failed to log property view:', err);
  });

  // NEW FLOW: buyer activity tracking (first view by a logged-in user; guests are not tracked)
  if (viewerId) {
    void recordBuyerActivity(viewerId, id, 'firstViewedAt', {
      sellerId: result.seller,
    });
  }

  return result;
}

const formatOpenHouseAddress = (property: IProperty) =>
  [property.streetAddress, property.city, [property.state, property.zipCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

const sendOpenHouseRsvpMessage = async (
  buyerId: string,
  sellerId: string,
  property: IProperty,
) => {
  let chat = await Chat.findOne({
    participants: { $all: [buyerId, sellerId], $size: 2 },
  });

  if (!chat) {
    chat = await Chat.create({
      status: 'accepted',
      participants: [buyerId, sellerId],
    });
  }

  const chatId = chat._id.toString();
  const address = formatOpenHouseAddress(property);
  const image = property.photos?.[0]?.trim();
  const propertyInfo = {
    _id: property._id,
    address,
    ...(image ? { image } : {}),
  };

  const message = await Message.create({
    chatId,
    senderId: buyerId,
    receiverId: sellerId,
    text: 'I plan to attend this open house.',
    images: [],
    propertyInfo,
  });

  await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });

  const io = getIO();
  if (io) {
    const serialized = serializeMessage(message);
    const eventName = `new-message::${chatId}`;
    const senderSocketId = getSocketIdByUserId(buyerId);
    const receiverSocketId = getSocketIdByUserId(sellerId);
    if (senderSocketId) io.to(senderSocketId).emit(eventName, serialized);
    if (receiverSocketId) io.to(receiverSocketId).emit(eventName, serialized);

    await getChatList(io, { userId: buyerId }, {}, () => { });
    await getChatList(io, { userId: sellerId }, {}, () => { });
  }
};

const increaseRSVPCount = async (propertyId: string, buyerId: string) => {
  if (!buyerId) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized');
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  const sellerId = property.seller?.toString();
  if (!sellerId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Listing has no seller');
  }

  if (sellerId === buyerId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot RSVP to your own open house',
    );
  }

  const existing = await OpenHouseRsvp.findOne({
    property: propertyId,
    buyer: buyerId,
  });
  if (existing) {
    // NEW FLOW: buyer activity tracking — use the original RSVP time ($min keeps the earliest)
    void recordBuyerActivity(buyerId, propertyId, 'firstRsvpAt', {
      sellerId,
      at: existing.createdAt,
    });
    return existing;
  }

  let rsvp;
  try {
    rsvp = await OpenHouseRsvp.create({
      property: propertyId,
      seller: sellerId,
      buyer: buyerId,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await OpenHouseRsvp.findOne({
        property: propertyId,
        buyer: buyerId,
      });
      if (duplicate) return duplicate;
    }
    throw error;
  }

  // NEW FLOW: buyer activity tracking (first open-house RSVP)
  void recordBuyerActivity(buyerId, propertyId, 'firstRsvpAt', {
    sellerId,
    at: rsvp.createdAt,
  });

  await Property.findByIdAndUpdate(propertyId, { $inc: { totalRsvp: 1 } });

  void sendOpenHouseRsvpMessage(buyerId, sellerId, property).catch((error) => {
    console.error('Failed to send open house RSVP chat message:', error);
  });

  return rsvp;
};

const getMyOpenHouseRsvps = async (
  userId: string,
  role?: string | string[],
) => {
  const resolvedRole = Array.isArray(role) ? role[0] : role;
  const asBuyer = resolvedRole === 'buyer';

  const query = OpenHouseRsvp.find(
    asBuyer ? { buyer: userId } : { seller: userId },
  )
    .sort({ createdAt: -1 })
    .populate(
      'property',
      '_id streetAddress city state zipCode photos openHouse',
    );

  if (asBuyer) {
    query.populate('seller', '_id name profile');
  } else {
    query.populate('buyer', '_id name profile');
  }

  return query;
};

const getPropertyOpenHouseRsvps = async (propertyId: string, userId: string) => {
  const property = await Property.findById(propertyId).select('seller');
  if (!property) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  if (property.seller?.toString() !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only the property seller can view these RSVPs',
    );
  }

  const data = await OpenHouseRsvp.find({ property: propertyId })
    .sort({ createdAt: -1 })
    .populate('buyer', '_id name')
    .select('_id createdAt buyer');

  return data;
};

export const propertyService = {
  createProperty,
  getAllProperties,
  getAllPropertiesForDashboard,
  getPropertyTypeCounts,
  getAllPropertiesForWeb,
  getPriceDroppedProperties,
  getMyListingProperties,
  getPropertyById,
  getPropertiesBySeller,
  getPropertiesBySellerForDashboard,
  updateProperty,
  deleteProperty,
  approveProperty,
  rejectProperty,
  increaseViewCount,
  increaseRSVPCount,
  getMyOpenHouseRsvps,
  getPropertyOpenHouseRsvps,
};