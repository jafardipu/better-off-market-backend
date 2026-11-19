import { Error, Schema, model } from 'mongoose';
import config from '../../config';
import bcrypt from 'bcrypt';
import { IUser, UserModel } from './user.interface';
import { gender, Login_With, Role, USER_ROLE } from './user.constants';

const userSchema: Schema<IUser> = new Schema(
  {
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
      enum: Role,
      default: USER_ROLE.user,
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
      enum: gender,
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
      enum: Login_With,
      default: Login_With.credentials,
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
        type: Schema.Types.Mixed,
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
  },
  {
    timestamps: true,
  },
);

// userSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

userSchema.pre('save', async function (next) {
  const user = this;
  if (this.password) {
    user.password = await bcrypt.hash(
      user.password,
      Number(config.bcrypt_salt_rounds),
    );
  }

  next();
});

userSchema.statics.isUserExist = async function (phoneNumber: string) {
  return await User.findOne({ phoneNumber: phoneNumber }).select('+password');
};
userSchema.statics.isUserExistEmail = async function (email: string) {
  return await User.findOne({ email: email }).select('+password');
};

userSchema.statics.isUserExist = async function (
  phoneNumber?: string,
  email?: string,
) {
  const query: any[] = [];

  if (phoneNumber) {
    query.push({ phoneNumber });
  }

  if (email) {
    query.push({ email });
  }

  if (query.length === 0) {
    return null; // nothing provided
  }

  const existingUser = await User.findOne({
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
};

userSchema.statics.IsUserExistId = async function (id: string) {
  return await User.findById(id).select('+password');
};
userSchema.statics.isPasswordMatched = async function (
  plainTextPassword,
  hashedPassword,
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

userSchema.statics.GetAdminUser = async function () {
  return await User.findOne({
    role: {
      $in: [USER_ROLE.admin, USER_ROLE.super_admin, USER_ROLE.sub_admin],
    },
  });
};

userSchema.statics.GetUserById = async function (id: string) {
  return await User.findById(id).select('-password');
}

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

export const User = model<IUser, UserModel>('User', userSchema);
