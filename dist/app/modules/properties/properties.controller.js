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
exports.propertyController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const properties_service_1 = require("./properties.service");
const createProperty = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    req.body.seller = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const result = yield properties_service_1.propertyService.createProperty(req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property created successfully',
        data: result,
    });
}));
const getAllProperties = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getAllProperties(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Properties fetched successfully',
        data: result.data,
        meta: result.meta,
    });
}));
const getAllPropertiesForDashboard = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getAllPropertiesForDashboard(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Properties fetched successfully',
        data: {
            properties: result.data,
            statusCounts: result.statusCounts,
        },
        meta: result.meta,
    });
}));
const getPropertyTypeCounts = (0, catchAsync_1.default)((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getPropertyTypeCounts();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property type counts fetched successfully',
        data: result,
    });
}));
const getAllPropertiesForWeb = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getAllPropertiesForWeb(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Properties fetched successfully',
        data: result.data,
        meta: result.meta,
    });
}));
const getPriceDroppedProperties = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getPriceDroppedProperties(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Price-dropped properties fetched successfully',
        data: result.data,
        meta: result.meta,
    });
}));
const getMyListingProperties = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getMyListingProperties(req.user.userId, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'My listings fetched successfully',
        data: {
            properties: result.data,
            statusCounts: result.statusCounts,
        },
        meta: result.meta,
    });
}));
const getPropertyById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getPropertyById(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property fetched successfully',
        data: result,
    });
}));
const getPropertiesBySeller = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getPropertiesBySeller(req.params.sellerId, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Seller properties fetched successfully',
        data: result.data,
        meta: result.meta,
    });
}));
const getPropertiesBySellerForDashboard = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.getPropertiesBySellerForDashboard(req.params.sellerId, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Seller properties fetched successfully',
        data: result.data,
        meta: result.meta,
    });
}));
const updateProperty = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const removedPropertyFileUrls = Array.isArray(res.locals.removedPropertyFileUrls)
        ? res.locals.removedPropertyFileUrls.filter((url) => typeof url === 'string')
        : [];
    const result = yield properties_service_1.propertyService.updateProperty(req.params.id, req.body, removedPropertyFileUrls);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property updated successfully',
        data: result,
    });
}));
const deleteProperty = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield properties_service_1.propertyService.deleteProperty(req.params.id, {
        userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
        role: (_b = req.user) === null || _b === void 0 ? void 0 : _b.role,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property deleted successfully',
        data: result,
    });
}));
// ================================================ admin controller =====================================
const approveProperty = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.approveProperty(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property approved successfully',
        data: result,
    });
}));
const rejectProperty = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.rejectProperty(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property rejected successfully',
        data: result,
    });
}));
const increaseViewCount = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.increaseViewCount(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property view count increased successfully',
        data: result,
    });
}));
const increaseRSVPCount = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield properties_service_1.propertyService.increaseRSVPCount(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Property RSVP count increased successfully',
        data: result,
    });
}));
exports.propertyController = {
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
    increaseViewCount,
    increaseRSVPCount,
    // admin
    approveProperty,
    rejectProperty,
};
