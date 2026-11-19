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
exports.User = void 0;
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("../../config"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_constants_1 = require("./user.constants");
const userSchema = new mongoose_1.Schema({
    //basic info
    name: {
        type: String,
        required: true,
        default: null,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    fcmToken: {
        type: String,
        default: null,
    },
    password: {
        type: String,
        required: false,
    },
    role: {
        type: String,
        enum: user_constants_1.Role,
        default: user_constants_1.USER_ROLE.user,
    },
    //profile info
    profile: {
        type: String,
        default: null,
    },
    bio: {
        type: String,
        default: null,
    },
    gender: {
        type: String,
        enum: user_constants_1.gender,
        default: null,
    },
    dateOfBirth: {
        type: String,
        default: null,
    },
    phoneNumber: {
        type: String,
        required: false,
        sparse: true,
        trim: true,
        // validate: {
        //   validator: function (v: string) {
        //     return /^(\+?\d{8,15})$/.test(v);
        //   },
        //   message: (props: any) => `${props.value} is not a valid phone number!`,
        // },
        default: null,
    },
    location: {
        type: String,
        default: null,
    },
    loginWth: {
        type: String,
        enum: user_constants_1.Login_With,
        default: user_constants_1.Login_With.credentials,
    },
    company: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['active', 'blocked'],
        default: 'active',
    },
    expireAt: {
        type: Date,
        default: () => {
            const expireAt = new Date();
            return expireAt.setMinutes(expireAt.getMinutes() + 20);
        },
    },
    needsPasswordChange: {
        type: Boolean,
    },
    passwordChangedAt: {
        type: Date,
    },
    verification: {
        otp: {
            type: mongoose_1.Schema.Types.Mixed,
            default: 0,
        },
        expiresAt: {
            type: Date,
        },
        status: {
            type: Boolean,
            default: false,
        },
    },
    device: {
        ip: {
            type: String,
        },
        browser: {
            type: String,
        },
        os: {
            type: String,
        },
        device: {
            type: String,
        },
        lastLogin: {
            type: String,
        },
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
// userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
userSchema.pre('save', function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = this;
        if (this.password) {
            user.password = yield bcrypt_1.default.hash(user.password, Number(config_1.default.bcrypt_salt_rounds));
        }
        next();
    });
});
userSchema.statics.isUserExist = function (phoneNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({ phoneNumber: phoneNumber }).select('+password');
    });
};
userSchema.statics.isUserExistEmail = function (email) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({ email: email }).select('+password');
    });
};
userSchema.statics.isUserExist = function (phoneNumber, email) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = [];
        if (phoneNumber) {
            query.push({ phoneNumber });
        }
        if (email) {
            query.push({ email });
        }
        if (query.length === 0) {
            return null; // nothing provided
        }
        const existingUser = yield exports.User.findOne({
            $or: query,
        }).select('+password');
        if (!existingUser) {
            return null;
        }
        return {
            user: existingUser,
            phoneExists: phoneNumber ? existingUser.phoneNumber === phoneNumber : false,
            emailExists: email ? existingUser.email === email : false,
        };
    });
};
userSchema.statics.IsUserExistId = function (id) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findById(id).select('+password');
    });
};
userSchema.statics.isPasswordMatched = function (plainTextPassword, hashedPassword) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield bcrypt_1.default.compare(plainTextPassword, hashedPassword);
    });
};
userSchema.statics.GetAdminUser = function () {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({
            role: {
                $in: [user_constants_1.USER_ROLE.admin, user_constants_1.USER_ROLE.super_admin, user_constants_1.USER_ROLE.sub_admin],
            },
        });
    });
};
userSchema.statics.GetUserById = function (id) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findById(id).select('-password');
    });
};
userSchema.post('save', function (doc, next) {
    doc.password = '';
    doc.verification.otp = 0;
    next();
});
userSchema.post('findOneAndUpdate', function (doc, next) {
    doc.password = '';
    doc.verification.otp = 0;
    next();
});
userSchema.pre('find', function (next) {
    this.where({ isDeleted: false });
    next();
});
userSchema.pre('aggregate', function (next) {
    this.pipeline().unshift({ $match: { isDeleted: false } });
    next();
});
exports.User = (0, mongoose_1.model)('User', userSchema);
