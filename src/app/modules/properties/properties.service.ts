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
import { notifyGetInTouchSubscribers, PropertySearchQuery, toArray } from './properties.utils';
import { deleteRemovedPropertyFiles } from './properties.files';
import { PropertyView } from '../PropertyView/PropertyView.model';
import { User } from '../user/user.models';
import { USER_ROLE } from '../user/user.constants';
import { sendNotificationMessage } from '../notification/notification.utils';



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

  const propertyQuery = new QueryBuilder(Property.find(filter), query)
    .search(propertySearchableFields)
    .filter()
    .paginate()
    .sort()
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

const updateProperty = async (
  id: string,
  payload: Partial<IProperty>,
  removedFileUrls: string[] = [],
) => {

  const existing = await Property.findById(id);
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  const result = await Property.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

  if (result && removedFileUrls.length) {
    await deleteRemovedPropertyFiles(removedFileUrls);
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

const increaseViewCount = async (id: string) => {
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

  return result;
}

const increaseRSVPCount = async (id: string) => {
  const result = await Property.findByIdAndUpdate(id, { $inc: { totalRsvp: 1 } }, { new: true });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }
  return result;
}

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
  increaseRSVPCount
};