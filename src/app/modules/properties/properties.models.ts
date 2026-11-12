import { Schema, model } from 'mongoose';
import { ILocation, IProperty, PropertyModel } from './properties.interface';
import {
  PROPERTY_TYPES,
  OWNERSHIP_TYPES,
  HOA_OPTIONS,
  HOA_FREQUENCY,
  STATUS_OPTIONS,
  STATUS
} from './properties.constants';

const LocationSchema = new Schema<ILocation>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },

    coordinates: {
      type: [Number],
      required: true,

      validate: {
        validator: function (value: number[]) {
          return value.length === 2;
        },
        message: 'Coordinates must contain [longitude, latitude]',
      },
    },
  },
  {
    _id: false,
  },
);



const propertySchema: Schema<IProperty> = new Schema(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: STATUS_OPTIONS,
        message: ` {VALUE} is not a valid status. Accepted values: ${STATUS_OPTIONS.join(
          ', ',
        )}`,
      },
      default: STATUS.pending,
      required: true,
    },

    propertyType: {
      type: String,
      enum: PROPERTY_TYPES,
      required: true,
    },
    useType: { type: String, default: null },
    useTypeOther: { type: String, default: null },

    // Ownership
    ownership: {
      type: String,
      enum: OWNERSHIP_TYPES,
      required: true,
    },

    // map location
    location: {
      type: LocationSchema,
      required: true,
    },
    // Basic Information
    streetAddress: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String, required: true },
    zipCode: { type: String, required: true },
    county: { type: String, required: true },
    countyType: { type: String, required: true },
    parcelIds: { type: String, default: null },
    listingPrice: { type: Number, required: true },
    oldListingPrice: { type: Number, default: null },
    buyItNowPrice: { type: Number, default: null },
    arv: { type: Number, default: null },
    marketingDescription: { type: String, required: true, maxlength: 3000 },
    utilities: { type: String, default: null },

    specifications: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Major Components & Ages
    roofMaterial: { type: String, default: null },
    roofMaterialOther: { type: String, default: null },
    roofAge: { type: Number, default: null },
    heatingSystem: { type: String, default: null },
    heatingSystemOther: { type: String, default: null },
    heatingAge: { type: Number, default: null },
    cooling: { type: String, default: null },
    coolingOther: { type: String, default: null },
    coolingAge: { type: Number, default: null },
    waterHeating: { type: String, default: null },
    waterHeatingOther: { type: String, default: null },
    waterHeatingAge: { type: Number, default: null },
    water: { type: String, default: null },
    waterOther: { type: String, default: null },
    sewer: { type: String, default: null },
    sewerOther: { type: String, default: null },
    foundation: { type: String, default: null },
    foundationOther: { type: String, default: null },
    otherUpdates: { type: String, default: null },

    // HOA
    hasHoa: {
      type: String,
      enum: HOA_OPTIONS,
      default: 'no',
    },
    hoaAmount: { type: Number, default: null },
    hoaFrequency: {
      type: String,
      enum: HOA_FREQUENCY,
      default: null,
    },
    hoaIncludes: { type: String, default: null },

    // Closing
    titleCompany: { type: String, default: null },
    closingDate: { type: String, required: true },

    // Files
    photos: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length >= 5,
        message: 'Minimum 5 high-res photos required',
      },
    },
    documents: {
      type: [
        {
          name: { type: String, required: true },
          size: { type: String, required: true },
          updated: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
      default: [],
    },

    totalViews: {
      type: Number,
      default: 0,
    },

    totalSaved: {
      type: Number,
      default: 0,
    },

    totalOffers: {
      type: Number,
      default: 0,
    },

    totalRsvp: {
      type: Number,
      default: 0
    },

    openHouse: {
      type: {
        date: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
      required: false
    },

    approvedDate: {
      type: Date,
      default: null,
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


propertySchema.index({ location: '2dsphere' });

propertySchema.statics.IsPropertyExistId = async function (id: string) {
  return await Property.findById(id);
};

propertySchema.statics.GetPropertiesBySeller = async function (
  sellerId: string,
) {
  return await Property.find({ seller: sellerId });
};

propertySchema.pre('find', function (next) {
  this.where({ isDeleted: false });
  next();
});

propertySchema.pre('findOne', function (next) {
  this.where({ isDeleted: false });
  next();
});

propertySchema.pre('aggregate', function (next) {
  const pipeline = this.pipeline();
  const firstStageIsGeoNear =
    pipeline.length > 0 && Object.prototype.hasOwnProperty.call(pipeline[0], '$geoNear');

  if (firstStageIsGeoNear) {
    pipeline.splice(1, 0, { $match: { isDeleted: false } });
  } else {
    pipeline.unshift({ $match: { isDeleted: false } });
  }
  next();
});

export const Property = model<IProperty, PropertyModel>(
  'Property',
  propertySchema,
);