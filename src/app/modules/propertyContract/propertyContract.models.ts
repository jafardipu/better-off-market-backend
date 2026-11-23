import { Schema, model } from 'mongoose';
import {
  IPropertyContract,
  PropertyContractModel,
} from './propertyContract.interface';
import { STATUS_OPTIONS } from '../properties/properties.constants';
import {
  BUYER_NAME_MAX_LENGTH,
  TITLE_COMPANY_MAX_LENGTH,
} from './propertyContract.constants';

// One record per "Mark Under Contract" submission. A property can go
// Under Contract → Active → Under Contract again, so records are never reused.
const propertyContractSchema = new Schema<IPropertyContract, PropertyContractModel>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    buyerName: {
      type: String,
      trim: true,
      maxlength: BUYER_NAME_MAX_LENGTH,
      default: null,
    },
    closingDate: {
      type: Date,
      default: null,
    },
    titleCompany: {
      type: String,
      trim: true,
      maxlength: TITLE_COMPANY_MAX_LENGTH,
      default: null,
    },
    previousStatus: {
      type: String,
      enum: STATUS_OPTIONS,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

propertyContractSchema.index({ createdAt: -1 });
propertyContractSchema.index({ property: 1, createdAt: -1 });
propertyContractSchema.index({ seller: 1, createdAt: -1 });

export const PropertyContract = model<IPropertyContract, PropertyContractModel>(
  'PropertyContract',
  propertyContractSchema,
);
