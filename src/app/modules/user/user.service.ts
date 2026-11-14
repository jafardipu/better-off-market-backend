/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { IUser } from './user.interface';
import { User } from './user.models';
import { buildPropertyLabel, checkUserExit, getYearRange } from './user.utils';
import { sendNotificationMessage } from '../notification/notification.utils';
import { Property } from '../properties/properties.models';
import { STATUS } from '../properties/properties.constants';
import { Types } from 'mongoose';
import Reviews from '../reviews/reviews.models';
import { Offer } from '../offer/offer.models';
import { OFFER_STATUS } from '../offer/offer.constants';
import { PropertyView } from '../PropertyView/PropertyView.model';
import QueryBuilder from '../../class/builder/QueryBuilder';
import { userSearchableFields } from './user.constants';


const createUser = async (payload: IUser): Promise<IUser> => {
  const exitUser = await checkUserExit(payload);

  if (exitUser) {
    return exitUser;
  }

  if (payload?.isGoogleLogin) {
    payload.verification = {
      otp: 0,
      expiresAt: new Date(Date.now()),
      status: true,
    };
  }

  if (!payload.isGoogleLogin && !payload.password) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password is required');
  }

  const user = await User.create(payload);
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed');
  }
  const admin = await User.GetAdminUser();
  const notificationPayload = {
    message: `New User Created An Account`,
    description: `A new user has registered with the name ${user.name} and email ${user.email}.`,
    userId: admin?._id?.toString()!,
    fcmToken: admin?.fcmToken,
    link: "/users"
  };

  sendNotificationMessage(notificationPayload);

  return user;
};

const getAllUsers = async (query: Record<string, unknown>) => {
  const propertyQuery = new QueryBuilder(User.find(), query)
    .search(userSearchableFields)
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await propertyQuery.modelQuery;
  const meta = await propertyQuery.countTotal();
  return { data, meta };
}

const getUserById = async (id: string) => {
  const result = await User.findById(id).select('-password');
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
  return result;
};

const getSellerProfile = async (sellerId: string) => {
  const seller = await User.findById(sellerId).select('-password');

  if (!seller) {
    throw new AppError(httpStatus.NOT_FOUND, 'Seller not found');
  }

  const ratingAgg = await Reviews.aggregate([
    { $match: { seller: new Types.ObjectId(sellerId), isDeleted: false } },
    {
      $group: {
        _id: '$seller',
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const avgRating = ratingAgg[0]?.avgRating
    ? Number(ratingAgg[0].avgRating.toFixed(2))
    : 0;
  const totalReviews = ratingAgg[0]?.totalReviews || 0;

  const activeListing = await Property.countDocuments({
    seller: sellerId,
    status: STATUS.active,
    isDeleted: false,
  });

  const totalListing = await Property.countDocuments({
    seller: sellerId,
    status: { $ne: STATUS.pending },
    isDeleted: false,
  });

  return {
    ...seller.toObject(),
    avgRating,
    totalReviews,
    activeListing,
    totalListing,
  };
};

const getSellerDashboardStats = async (sellerId: string) => {
  const sellerObjectId = new Types.ObjectId(sellerId);

  const activeListings = await Property.countDocuments({
    seller: sellerId,
    status: { $in: [STATUS.active, STATUS.under_contact] },
    isDeleted: false,
  });

  const newOffers = await Offer.countDocuments({
    seller: sellerId,
    status: OFFER_STATUS.pending,
    isDeleted: false,
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const totalViewsThisWeek = await PropertyView.countDocuments({
    seller: sellerObjectId,
    viewedAt: { $gte: oneWeekAgo },
  });

  return {
    activeListings,
    newOffers,
    totalViewsThisWeek,
  };
}

const getListingAnalytics = async (sellerId: string, year?: string) => {
  const sellerObjectId = new Types.ObjectId(sellerId);
  const { start, end } = getYearRange(year);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const totalViewsThisWeek = await PropertyView.countDocuments({
    seller: sellerObjectId,
    viewedAt: { $gte: oneWeekAgo },
  });

  const totalOffersReceived = await Offer.countDocuments({
    seller: sellerId,
    isDeleted: false,
  });

  const activePropertyMatch = {
    seller: sellerObjectId,
    status: { $in: [STATUS.active, STATUS.under_contact] },
    isDeleted: false,
  };

  // Views — all active/under-contract listings, 0-view included, top 10 by count
  const viewsAgg: {
    _id: Types.ObjectId;
    propertyType: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    county: string;
    count: number;
  }[] = await Property.aggregate([
    { $match: activePropertyMatch },
    {
      $lookup: {
        from: 'propertyviews',
        let: { propertyId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$property', '$$propertyId'] },
              viewedAt: { $gte: start, $lt: end },
            },
          },
        ],
        as: 'viewDocs',
      },
    },
    {
      $project: {
        propertyType: 1,
        streetAddress: 1,
        city: 1,
        state: 1,
        zipCode: 1,
        county: 1,
        count: { $size: '$viewDocs' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const views = viewsAgg.map((v) => ({
    propertyId: v._id.toString(),
    label: buildPropertyLabel(v),
    count: v.count,
  }));
  const maxViewsCount = views[0]?.count || 0;

  // Saves — same pattern: all active/under-contract listings, 0-save included, top 10 by count
  const savesAgg: {
    _id: Types.ObjectId;
    propertyType: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    county: string;
    count: number;
  }[] = await Property.aggregate([
    { $match: activePropertyMatch },
    {
      $lookup: {
        from: 'favorites',
        let: { propertyId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$property', '$$propertyId'] },
              isDeleted: false,
              createdAt: { $gte: start, $lt: end },
            },
          },
        ],
        as: 'saveDocs',
      },
    },
    {
      $project: {
        propertyType: 1,
        streetAddress: 1,
        city: 1,
        state: 1,
        zipCode: 1,
        county: 1,
        count: { $size: '$saveDocs' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const saves = savesAgg.map((s) => ({
    propertyId: s._id.toString(),
    label: buildPropertyLabel(s),
    count: s.count,
  }));
  const maxSavesCount = saves[0]?.count || 0;

  return {
    totalViewsThisWeek,
    totalOffersReceived,
    views,
    maxViewsCount,
    saves,
    maxSavesCount,
  };
};

const updateUser = async (id: string, payload: Partial<IUser>) => {
  const user = await User.findByIdAndUpdate(id, payload, { new: true });
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User updating failed');
  }

  return user;
};

const deleteUser = async (id: string) => {
  const user = await User.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  );

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'user deleting failed');
  }

  return user;
};


export const userService = {
  getAllUsers,
  createUser,
  getSellerProfile,
  getUserById,
  getSellerDashboardStats,
  getListingAnalytics,
  updateUser,
  deleteUser,
};
