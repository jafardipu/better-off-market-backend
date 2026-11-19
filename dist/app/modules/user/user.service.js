"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../error/AppError"));
const user_models_1 = require("./user.models");
const user_utils_1 = require("./user.utils");
const notification_utils_1 = require("../notification/notification.utils");
const properties_models_1 = require("../properties/properties.models");
const properties_constants_1 = require("../properties/properties.constants");
const mongoose_1 = require("mongoose");
const reviews_models_1 = __importDefault(require("../reviews/reviews.models"));
const offer_models_1 = require("../offer/offer.models");
const offer_constants_1 = require("../offer/offer.constants");
const PropertyView_model_1 = require("../PropertyView/PropertyView.model");
const QueryBuilder_1 = __importDefault(require("../../class/builder/QueryBuilder"));
const user_constants_1 = require("./user.constants");
const createUser = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const exitUser = yield (0, user_utils_1.checkUserExit)(payload);
    if (exitUser) {
        return exitUser;
    }
    if (payload === null || payload === void 0 ? void 0 : payload.isGoogleLogin) {
        payload.verification = {
            otp: 0,
            expiresAt: new Date(Date.now()),
            status: true,
        };
    }
    if (!payload.isGoogleLogin && !payload.password) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Password is required');
    }
    const user = yield user_models_1.User.create(payload);
    if (!user) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User creation failed');
    }
    const admin = yield user_models_1.User.GetAdminUser();
    const notificationPayload = {
        message: `New User Created An Account`,
        description: `A new user has registered with the name ${user.name} and email ${user.email}.`,
        userId: (_a = admin === null || admin === void 0 ? void 0 : admin._id) === null || _a === void 0 ? void 0 : _a.toString(),
        fcmToken: admin === null || admin === void 0 ? void 0 : admin.fcmToken,
        link: "/users"
    };
    (0, notification_utils_1.sendNotificationMessage)(notificationPayload);
    return user;
});
const getAllUsers = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(user_models_1.User.find(), query)
        .search(user_constants_1.userSearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    return { data, meta };
});
const getUserById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_models_1.User.findById(id).select('-password');
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    return result;
});
const getSellerProfile = (sellerId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const seller = yield user_models_1.User.findById(sellerId).select('-password');
    if (!seller) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Seller not found');
    }
    const ratingAgg = yield reviews_models_1.default.aggregate([
        { $match: { seller: new mongoose_1.Types.ObjectId(sellerId), isDeleted: false } },
        {
            $group: {
                _id: '$seller',
                avgRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
            },
        },
    ]);
    const avgRating = ((_a = ratingAgg[0]) === null || _a === void 0 ? void 0 : _a.avgRating)
        ? Number(ratingAgg[0].avgRating.toFixed(2))
        : 0;
    const totalReviews = ((_b = ratingAgg[0]) === null || _b === void 0 ? void 0 : _b.totalReviews) || 0;
    const activeListing = yield properties_models_1.Property.countDocuments({
        seller: sellerId,
        status: properties_constants_1.STATUS.active,
        isDeleted: false,
    });
    const totalListing = yield properties_models_1.Property.countDocuments({
        seller: sellerId,
        status: { $ne: properties_constants_1.STATUS.pending },
        isDeleted: false,
    });
    return Object.assign(Object.assign({}, seller.toObject()), { avgRating,
        totalReviews,
        activeListing,
        totalListing });
});
const getSellerDashboardStats = (sellerId) => __awaiter(void 0, void 0, void 0, function* () {
    const sellerObjectId = new mongoose_1.Types.ObjectId(sellerId);
    const activeListings = yield properties_models_1.Property.countDocuments({
        seller: sellerId,
        status: { $in: [properties_constants_1.STATUS.active, properties_constants_1.STATUS.under_contact] },
        isDeleted: false,
    });
    const newOffers = yield offer_models_1.Offer.countDocuments({
        seller: sellerId,
        status: offer_constants_1.OFFER_STATUS.pending,
        isDeleted: false,
    });
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const totalViewsThisWeek = yield PropertyView_model_1.PropertyView.countDocuments({
        seller: sellerObjectId,
        viewedAt: { $gte: oneWeekAgo },
    });
    return {
        activeListings,
        newOffers,
        totalViewsThisWeek,
    };
});
const getListingAnalytics = (sellerId, year) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const sellerObjectId = new mongoose_1.Types.ObjectId(sellerId);
    const { start, end } = (0, user_utils_1.getYearRange)(year);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const totalViewsThisWeek = yield PropertyView_model_1.PropertyView.countDocuments({
        seller: sellerObjectId,
        viewedAt: { $gte: oneWeekAgo },
    });
    const totalOffersReceived = yield offer_models_1.Offer.countDocuments({
        seller: sellerId,
        isDeleted: false,
    });
    const activePropertyMatch = {
        seller: sellerObjectId,
        status: { $in: [properties_constants_1.STATUS.active, properties_constants_1.STATUS.under_contact] },
        isDeleted: false,
    };
    // Views — all active/under-contract listings, 0-view included, top 10 by count
    const viewsAgg = yield properties_models_1.Property.aggregate([
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
        label: (0, user_utils_1.buildPropertyLabel)(v),
        count: v.count,
    }));
    const maxViewsCount = ((_a = views[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
    // Saves — same pattern: all active/under-contract listings, 0-save included, top 10 by count
    const savesAgg = yield properties_models_1.Property.aggregate([
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
        label: (0, user_utils_1.buildPropertyLabel)(s),
        count: s.count,
    }));
    const maxSavesCount = ((_b = saves[0]) === null || _b === void 0 ? void 0 : _b.count) || 0;
    return {
        totalViewsThisWeek,
        totalOffersReceived,
        views,
        maxViewsCount,
        saves,
        maxSavesCount,
    };
});
const updateUser = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_models_1.User.findByIdAndUpdate(id, payload, { new: true });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'User updating failed');
    }
    return user;
});
const deleteUser = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_models_1.User.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'user deleting failed');
    }
    return user;
});
exports.userService = {
    getAllUsers,
    createUser,
    getSellerProfile,
    getUserById,
    getSellerDashboardStats,
    getListingAnalytics,
    updateUser,
    deleteUser,
};
