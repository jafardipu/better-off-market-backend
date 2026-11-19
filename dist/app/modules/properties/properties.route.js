"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertiesRoutes = void 0;
const express_1 = require("express");
const multer_1 = __importStar(require("multer"));
const properties_controller_1 = require("./properties.controller");
const validateRequest_1 = __importDefault(require("../../middleware/validateRequest"));
const properties_validation_1 = require("./properties.validation");
const parseData_1 = __importDefault(require("../../middleware/parseData"));
const auth_1 = __importDefault(require("../../middleware/auth"));
const user_constants_1 = require("../user/user.constants");
const properties_upload_middleware_1 = __importDefault(require("./properties.upload.middleware"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: (0, multer_1.memoryStorage)() });
const propertyUploadFields = upload.fields([
    { name: 'photos', maxCount: 50 },
    { name: 'documents', maxCount: 10 },
]);
router.post('/', (0, auth_1.default)(user_constants_1.USER_ROLE.user), propertyUploadFields, (0, parseData_1.default)(), properties_upload_middleware_1.default, (0, validateRequest_1.default)(properties_validation_1.propertyValidation.createPropertyValidationSchema), properties_controller_1.propertyController.createProperty);
router.get('/', properties_controller_1.propertyController.getAllProperties);
router.get('/dashboard', (0, auth_1.default)(user_constants_1.USER_ROLE.admin), properties_controller_1.propertyController.getAllPropertiesForDashboard);
router.get('/property-type-counts', properties_controller_1.propertyController.getPropertyTypeCounts);
router.get('/web-content', properties_controller_1.propertyController.getAllPropertiesForWeb);
router.get('/price-dropped', properties_controller_1.propertyController.getPriceDroppedProperties);
router.get('/my-listing', (0, auth_1.default)(user_constants_1.USER_ROLE.user), properties_controller_1.propertyController.getMyListingProperties);
router.get('/seller/:sellerId/dashboard', properties_controller_1.propertyController.getPropertiesBySellerForDashboard);
router.get('/seller/:sellerId', properties_controller_1.propertyController.getPropertiesBySeller);
router.get('/:id', properties_controller_1.propertyController.getPropertyById);
router.patch('/:id', (0, auth_1.default)(user_constants_1.USER_ROLE.user), propertyUploadFields, (0, parseData_1.default)(), properties_upload_middleware_1.default, (0, validateRequest_1.default)(properties_validation_1.propertyValidation.updatePropertyValidationSchema), properties_controller_1.propertyController.updateProperty);
router.patch('/increase-views/:id', properties_controller_1.propertyController.increaseViewCount),
    router.patch('/increase-rsvp/:id', properties_controller_1.propertyController.increaseRSVPCount),
    router.delete('/:id', (0, auth_1.default)(user_constants_1.USER_ROLE.user, user_constants_1.USER_ROLE.admin), properties_controller_1.propertyController.deleteProperty);
// ============================================== admin routes ================================================
router.patch('/approve/:id', (0, auth_1.default)(user_constants_1.USER_ROLE.admin), properties_controller_1.propertyController.approveProperty);
router.patch('/reject/:id', (0, auth_1.default)(user_constants_1.USER_ROLE.admin), properties_controller_1.propertyController.rejectProperty);
exports.propertiesRoutes = router;
