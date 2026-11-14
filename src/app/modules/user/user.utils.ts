import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { IUser } from './user.interface';
import { User } from './user.models';
import bcrypt from 'bcrypt';
import config from '../../config';
import { propertyAddress } from '../properties/properties.utils';

export const checkUserExit = async (payload: IUser) => {
  const isExist = await User.isUserExistEmail(payload.email as string);

  if (isExist && !isExist?.verification?.status) {
    // User exists but not verified — update their info (e.g. resend OTP flow)
    const updateData = { ...payload };
    updateData.password = await bcrypt.hash(
      payload?.password,
      Number(config.bcrypt_salt_rounds),
    );
    const user = await User.findByIdAndUpdate(isExist?._id, updateData, {
      new: true,
    });
    if (!user) {
      throw new AppError(httpStatus.BAD_REQUEST, 'user creation failed');
    }
    return user;
  } else if (isExist && isExist?.verification?.status) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'User already exists with this email',
    );
  }

  // isExist is null/undefined → no user found, caller should proceed to create new user
  return null;
};

export const buildPropertyLabel = (p: {
  propertyType?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
}) => {
  const address = propertyAddress(
    p.streetAddress,
    p.city,
    p.state,
    p.zipCode,
    p.county,
  );
  return p.propertyType ? `${p.propertyType} — ${address}` : address;
};

export const getYearRange = (year?: string) => {
  const y = year ? Number(year) : new Date().getFullYear();
  return {
    start: new Date(`${y}-01-01T00:00:00.000Z`),
    end: new Date(`${y + 1}-01-01T00:00:00.000Z`),
  };
};