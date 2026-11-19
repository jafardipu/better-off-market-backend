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
exports.propertyService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../error/AppError"));
const QueryBuilder_1 = __importDefault(require("../../class/builder/QueryBuilder"));
const properties_constants_1 = require("./properties.constants");
const properties_models_1 = require("./properties.models");
const mongoose_1 = require("mongoose");
const properties_utils_1 = require("./properties.utils");
const properties_files_1 = require("./properties.files");
const PropertyView_model_1 = require("../PropertyView/PropertyView.model");
const user_models_1 = require("../user/user.models");
const user_constants_1 = require("../user/user.constants");
const notification_utils_1 = require("../notification/notification.utils");
const activityEmail_1 = require("../../utils/activityEmail");
const config_1 = __importDefault(require("../../config"));
const createProperty = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield properties_models_1.Property.create(payload);
    if (!result) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Property creation failed');
    }
    const admin = yield user_models_1.User.GetAdminUser();
    const notificationPayload = {
        message: `A new property has been added`,
        description: ` A new property has been added from ${payload === null || payload === void 0 ? void 0 : payload.streetAddress}, ${payload === null || payload === void 0 ? void 0 : payload.city}, ${payload === null || payload === void 0 ? void 0 : payload.state}, ${payload === null || payload === void 0 ? void 0 : payload.zipCode}, ${payload === null || payload === void 0 ? void 0 : payload.county}. Please review it and take appropriate action.`,
        userId: (_a = admin === null || admin === void 0 ? void 0 : admin._id) === null || _a === void 0 ? void 0 : _a.toString(),
        fcmToken: admin === null || admin === void 0 ? void 0 : admin.fcmToken,
        link: `/listings/${result._id}`,
    };
    (0, notification_utils_1.sendNotificationMessage)(notificationPayload);
    const address = (0, properties_utils_1.propertyAddress)(payload.streetAddress, payload.city, payload.state, payload.zipCode, payload.county);
    (0, activityEmail_1.sendActivityEmail)({
        to: admin === null || admin === void 0 ? void 0 : admin.email,
        userName: admin === null || admin === void 0 ? void 0 : admin.name,
        subject: 'New listing submitted for review',
        title: 'Listing Ready for Review',
        body: 'A seller submitted a new listing. Review it and approve or reject it.',
        detailLabel: 'Property',
        detailValue: address,
        actionUrl: `${config_1.default.client_Url}/listings/${result._id}`,
        actionLabel: 'Review Listing',
    });
    return result;
});
const getAllProperties = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find(), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    return { data, meta };
});
const getAllPropertiesForDashboard = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find().populate('seller'), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    const counts = yield properties_models_1.Property.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    let all = 0;
    for (const c of counts) {
        countMap[c._id] = c.count;
        all += c.count;
    }
    const statusCounts = { all };
    for (const key of properties_constants_1.PROPERTY_STATUS) {
        const label = properties_constants_1.STATUS[key]; // "pending" -> "Pending"
        statusCounts[label] = countMap[label] || 0;
    }
    return { data, meta, statusCounts };
});
const getPropertyTypeCounts = () => __awaiter(void 0, void 0, void 0, function* () {
    const counts = yield properties_models_1.Property.aggregate([
        {
            $match: {
                isDeleted: false,
                status: { $in: [properties_constants_1.STATUS.active, properties_constants_1.STATUS.under_contact] },
            },
        },
        { $group: { _id: '$propertyType', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const { _id, count } of counts) {
        countMap[_id] = count;
    }
    return Object.fromEntries(properties_constants_1.PROPERTY_TYPES.map((propertyType) => [propertyType, countMap[propertyType] || 0]));
});
const getAllPropertiesForWeb = (query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;
    const counties = (0, properties_utils_1.toArray)(query.county);
    const propertyTypes = (0, properties_utils_1.toArray)(query.propertyType);
    const statuses = (0, properties_utils_1.toArray)(query.status) || [properties_constants_1.STATUS.active, properties_constants_1.STATUS.under_contact];
    const matchStage = {
        status: { $in: statuses },
    };
    if (counties === null || counties === void 0 ? void 0 : counties.length) {
        matchStage.county = { $in: counties };
    }
    if (propertyTypes === null || propertyTypes === void 0 ? void 0 : propertyTypes.length) {
        matchStage.propertyType = { $in: propertyTypes };
    }
    if (query.minPrice || query.maxPrice) {
        matchStage.listingPrice = {};
        if (query.minPrice) {
            matchStage.listingPrice.$gte = Number(query.minPrice);
        }
        if (query.maxPrice) {
            matchStage.listingPrice.$lte = Number(query.maxPrice);
        }
    }
    if ((_a = query.searchTerm) === null || _a === void 0 ? void 0 : _a.trim()) {
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
        const pipeline = [
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
        const result = yield properties_models_1.Property.aggregate(pipeline);
        const data = ((_b = result[0]) === null || _b === void 0 ? void 0 : _b.data) || [];
        const total = ((_d = (_c = result[0]) === null || _c === void 0 ? void 0 : _c.totalCount[0]) === null || _d === void 0 ? void 0 : _d.count) || 0;
        return {
            data,
            meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
        };
    }
    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        lowest: { listingPrice: 1 },
        highest: { listingPrice: -1 },
    };
    const sort = sortMap[query.sortBy || 'newest'];
    const [data, total] = yield Promise.all([
        properties_models_1.Property.find(matchStage).sort(sort).skip(skip).limit(limit),
        properties_models_1.Property.countDocuments(matchStage),
    ]);
    return {
        data,
        meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    };
});
const getPriceDroppedProperties = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const filter = {
        oldListingPrice: { $ne: null },
        status: { $in: [properties_constants_1.STATUS.active, properties_constants_1.STATUS.under_contact] },
        $expr: { $gt: ['$oldListingPrice', '$listingPrice'] },
    };
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find(filter), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    return { data, meta };
});
const getMyListingProperties = (sellerId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find({ seller: sellerId }), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    const counts = yield properties_models_1.Property.aggregate([
        { $match: { seller: new mongoose_1.Types.ObjectId(sellerId), isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    let all = 0;
    for (const c of counts) {
        countMap[c._id] = c.count;
        all += c.count;
    }
    const statusCounts = { all };
    for (const key of properties_constants_1.PROPERTY_STATUS) {
        const label = properties_constants_1.STATUS[key];
        statusCounts[key] = countMap[label] || 0;
    }
    return { data, meta, statusCounts };
});
const getPropertyById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_models_1.Property.findById(id).populate('seller');
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    return result;
});
const getPropertiesBySeller = (sellerId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find({
        seller: sellerId,
        status: { $nin: [properties_constants_1.STATUS.pending, properties_constants_1.STATUS.rejected] },
    }), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    return { data, meta };
});
const getPropertiesBySellerForDashboard = (sellerId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const propertyQuery = new QueryBuilder_1.default(properties_models_1.Property.find({
        seller: sellerId,
    }), query)
        .search(properties_constants_1.propertySearchableFields)
        .filter()
        .paginate()
        .sort()
        .fields();
    const data = yield propertyQuery.modelQuery;
    const meta = yield propertyQuery.countTotal();
    return { data, meta };
});
const updateProperty = (id_1, payload_1, ...args_1) => __awaiter(void 0, [id_1, payload_1, ...args_1], void 0, function* (id, payload, removedFileUrls = []) {
    const existing = yield properties_models_1.Property.findById(id);
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
    });
    if (result && removedFileUrls.length) {
        yield (0, properties_files_1.deleteRemovedPropertyFiles)(removedFileUrls);
    }
    return result;
});
const deleteProperty = (id, actor) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const existing = yield properties_models_1.Property.findById(id);
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    const isAdmin = actor.role === user_constants_1.USER_ROLE.admin;
    if (!isAdmin && ((_a = existing.seller) === null || _a === void 0 ? void 0 : _a.toString()) !== actor.userId) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'You can only delete your own property');
    }
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    if (isAdmin) {
        const seller = yield user_models_1.User.GetUserById(result.seller.toString());
        if (seller === null || seller === void 0 ? void 0 : seller._id) {
            void (0, notification_utils_1.sendNotificationMessage)({
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
});
// ======================================= admin services =======================================
const approveProperty = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, { status: properties_constants_1.STATUS.active, approvedDate: new Date() }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    const seller = yield user_models_1.User.GetUserById(result.seller.toString());
    const notificationPayload = {
        message: `Approved your listed property`,
        description: `Your listed property from ${result === null || result === void 0 ? void 0 : result.streetAddress}, ${result === null || result === void 0 ? void 0 : result.city}, ${result === null || result === void 0 ? void 0 : result.state}, ${result === null || result === void 0 ? void 0 : result.zipCode}, ${result === null || result === void 0 ? void 0 : result.county} has been approved by the admin.`,
        userId: (_a = seller === null || seller === void 0 ? void 0 : seller._id) === null || _a === void 0 ? void 0 : _a.toString(),
        fcmToken: seller === null || seller === void 0 ? void 0 : seller.fcmToken,
        link: `/properties-list/${result._id}`,
    };
    (0, notification_utils_1.sendNotificationMessage)(notificationPayload);
    const address = (0, properties_utils_1.propertyAddress)(result.streetAddress, result.city, result.state, result.zipCode, result.county);
    (0, activityEmail_1.sendActivityEmail)({
        to: seller === null || seller === void 0 ? void 0 : seller.email,
        userName: seller === null || seller === void 0 ? void 0 : seller.name,
        subject: 'Your listing is now Active',
        title: 'Listing Approved',
        body: 'Your listing has been approved and is now Active on BetterOffMarket.',
        detailLabel: 'Property',
        detailValue: address,
        actionUrl: `${config_1.default.client_Url}/properties-list/${result._id}`,
        actionLabel: 'View Listing',
    });
    void (0, properties_utils_1.notifyGetInTouchSubscribers)(result, (_b = seller === null || seller === void 0 ? void 0 : seller.name) !== null && _b !== void 0 ? _b : 'Seller').catch((error) => {
        console.error('Failed to notify GetInTouch subscribers about approved property:', error);
    });
    return result;
});
const rejectProperty = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, { status: properties_constants_1.STATUS.rejected }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    const seller = yield user_models_1.User.GetUserById(result.seller.toString());
    const notificationPayload = {
        message: `Rejected your listed property`,
        description: `Your listed property from ${result === null || result === void 0 ? void 0 : result.streetAddress}, ${result === null || result === void 0 ? void 0 : result.city}, ${result === null || result === void 0 ? void 0 : result.state}, ${result === null || result === void 0 ? void 0 : result.zipCode}, ${result === null || result === void 0 ? void 0 : result.county} has been rejected by the admin.`,
        userId: (_a = seller === null || seller === void 0 ? void 0 : seller._id) === null || _a === void 0 ? void 0 : _a.toString(),
        fcmToken: seller === null || seller === void 0 ? void 0 : seller.fcmToken,
        link: `/properties-list/${result._id}`,
    };
    (0, notification_utils_1.sendNotificationMessage)(notificationPayload);
    return result;
});
const increaseViewCount = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, { $inc: { totalViews: 1 } }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    PropertyView_model_1.PropertyView.create({
        property: id,
        seller: result.seller,
    }).catch((err) => {
        console.error('Failed to log property view:', err);
    });
    return result;
});
const increaseRSVPCount = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_models_1.Property.findByIdAndUpdate(id, { $inc: { totalRsvp: 1 } }, { new: true });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
    }
    return result;
});
exports.propertyService = {
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
