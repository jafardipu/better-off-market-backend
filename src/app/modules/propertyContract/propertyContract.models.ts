import { Schema, model } from 'mongoose';
import {
  IPropertyContract,
  PropertyContractModel,
} from './propertyContract.interface';
import { STATUS_OPTIONS } from '../properties/properties.constants';
import {
  BUYER_CONTACT_SOURCES,
  BUYER_NAME_MAX_LENGTH,
  CONTRACT_SOURCE,
  CONTRACT_SOURCES,
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

    // NEW FLOW: contract details from accepted offers. All optional so older
    // records still load.
    offer: {
      type: Schema.Types.ObjectId,
      ref: 'Offer',
      default: null,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    buyerContactSource: {
      type: String,
      enum: [...BUYER_CONTACT_SOURCES, null],
      default: null,
    },
    certifiedAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: CONTRACT_SOURCES,
      default: CONTRACT_SOURCE.manual,
    },
  },
  {
    timestamps: true,
  },
);

propertyContractSchema.index({ createdAt: -1 });
propertyContractSchema.index({ property: 1, createdAt: -1 });
propertyContractSchema.index({ seller: 1, createdAt: -1 });
// NEW FLOW: at most one contract per offer (records without an offer are not indexed).
propertyContractSchema.index(
  { offer: 1 },
  { unique: true, partialFilterExpression: { offer: { $type: 'objectId' } } },
);
// NEW FLOW: buyer + property lookups from buyer activity.
propertyContractSchema.index({ buyer: 1, property: 1, createdAt: -1 });

export const PropertyContract = model<IPropertyContract, PropertyContractModel>(
  'PropertyContract',
  propertyContractSchema,
);
