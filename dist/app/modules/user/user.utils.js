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
exports.getYearRange = exports.buildPropertyLabel = exports.checkUserExit = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../error/AppError"));
const user_models_1 = require("./user.models");
const bcrypt_1 = __importDefault(require("bcrypt"));
const config_1 = __importDefault(require("../../config"));
const properties_utils_1 = require("../properties/properties.utils");
const checkUserExit = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const isExist = yield user_models_1.User.isUserExistEmail(payload.email);
    if (isExist && !((_a = isExist === null || isExist === void 0 ? void 0 : isExist.verification) === null || _a === void 0 ? void 0 : _a.status)) {
        // User exists but not verified — update their info (e.g. resend OTP flow)
        const updateData = Object.assign({}, payload);
        updateData.password = yield bcrypt_1.default.hash(payload === null || payload === void 0 ? void 0 : payload.password, Number(config_1.default.bcrypt_salt_rounds));
        const user = yield user_models_1.User.findByIdAndUpdate(isExist === null || isExist === void 0 ? void 0 : isExist._id, updateData, {
            new: true,
        });
        if (!user) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'user creation failed');
        }
        return user;
    }
    else if (isExist && ((_b = isExist === null || isExist === void 0 ? void 0 : isExist.verification) === null || _b === void 0 ? void 0 : _b.status)) {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'User already exists with this email');
    }
    // isExist is null/undefined → no user found, caller should proceed to create new user
    return null;
});
exports.checkUserExit = checkUserExit;
const buildPropertyLabel = (p) => {
    const address = (0, properties_utils_1.propertyAddress)(p.streetAddress, p.city, p.state, p.zipCode, p.county);
    return p.propertyType ? `${p.propertyType} — ${address}` : address;
};
exports.buildPropertyLabel = buildPropertyLabel;
const getYearRange = (year) => {
    const y = year ? Number(year) : new Date().getFullYear();
    return {
        start: new Date(`${y}-01-01T00:00:00.000Z`),
        end: new Date(`${y + 1}-01-01T00:00:00.000Z`),
    };
};
exports.getYearRange = getYearRange;
