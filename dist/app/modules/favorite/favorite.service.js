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
exports.favoriteService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = require("mongoose");
const favorite_models_1 = __importDefault(require("./favorite.models"));
const AppError_1 = __importDefault(require("../../error/AppError"));
const properties_models_1 = require("../properties/properties.models");
const properties_constants_1 = require("../properties/properties.constants");
const SAVED_PROPERTY_STATUSES = [
    properties_constants_1.STATUS.active,
    properties_constants_1.STATUS.under_contact,
    properties_constants_1.STATUS.sold,
];
const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return Math.floor(parsed);
};
const createFavorite = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield favorite_models_1.default.create(payload);
    properties_models_1.Property.findByIdAndUpdate(result === null || result === void 0 ? void 0 : result.property, {
        $inc: { totalSaved: 1 },
    }).catch((err) => {
        console.error('Failed to increment favoriteCount:', err);
    });
    if (!result) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Failed to create favorite');
    }
    return result;
});
const getAllFavorite = (query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const userId = query.user;
    if (!userId || !mongoose_1.Types.ObjectId.isValid(String(userId))) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'User is not authenticated');
    }
    const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
    const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
    if (status &&
        !SAVED_PROPERTY_STATUSES.includes(status)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'status must be one of: Active, Under Contract, Sold');
    }
    const page = toPositiveInt(query.page, 1);
    const limit = toPositiveInt(query.limit, 9);
    const skip = (page - 1) * limit;
    const statusMatch = status
        ? [{ $match: { 'propertyDoc.status': status } }]
        : [];
    const [result] = yield favorite_models_1.default.aggregate([
        { $match: { user: new mongoose_1.Types.ObjectId(String(userId)) } },
        {
            $lookup: {
                from: properties_models_1.Property.collection.collectionName,
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
    ]);
    const statusCounts = {
        all: 0,
        active: 0,
        under_contract: 0,
        sold: 0,
    };
    for (const row of (_a = result === null || result === void 0 ? void 0 : result.counts) !== null && _a !== void 0 ? _a : []) {
        statusCounts.all += row.count;
        if (row._id === properties_constants_1.STATUS.active)
            statusCounts.active = row.count;
        else if (row._id === properties_constants_1.STATUS.under_contact)
            statusCounts.under_contract = row.count;
        else if (row._id === properties_constants_1.STATUS.sold)
            statusCounts.sold = row.count;
    }
    const total = (_d = (_c = (_b = result === null || result === void 0 ? void 0 : result.filteredTotal) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.count) !== null && _d !== void 0 ? _d : 0;
    return {
        data: (_e = result === null || result === void 0 ? void 0 : result.data) !== null && _e !== void 0 ? _e : [],
        meta: {
            page,
            limit,
            total,
            totalPage: total === 0 ? 0 : Math.ceil(total / limit),
        },
        statusCounts,
    };
});
const getFavoriteById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield favorite_models_1.default.findById(id);
    if (!result || (result === null || result === void 0 ? void 0 : result.isDeleted)) {
        throw new Error('Favorite not found!');
    }
    return result;
});
const updateFavorite = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield favorite_models_1.default.findByIdAndUpdate(id, payload, { new: true });
    if (!result) {
        throw new Error('Failed to update Favorite');
    }
    return result;
});
const deleteFavorite = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield favorite_models_1.default.findByIdAndDelete(id);
    if (!result) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Failed to delete favorite');
    }
    properties_models_1.Property.findByIdAndUpdate(result.property, {
        $inc: { totalSaved: -1 },
    }).catch((err) => {
        console.error('Failed to decrement favoriteCount:', err);
    });
    return result;
});
exports.favoriteService = {
    createFavorite,
    getAllFavorite,
    getFavoriteById,
    updateFavorite,
    deleteFavorite,
};
