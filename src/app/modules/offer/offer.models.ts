import { Schema, model } from 'mongoose';
import { IOffer, OfferModel } from './offer.interface';
import {
  FINANCING_TYPES,
  CLOSING_COST_OPTIONS,
  POSSESSION_OPTIONS,
  YES_NO,
  PAID_BY,
  MADE_BY,
  OFFER_STATUS,
  OFFER_STATUS_OPTIONS,
} from './offer.constants';

const offerTermsFields = {
  offerAmount: { type: Number, required: true },
  earnestMoney: { type: Number, required: true },
  financingType: { type: String, enum: FINANCING_TYPES, required: true },
  otherFinancingType: { type: String, default: null },
  financingTerms: { type: String, default: null },

  closingCostOption: { type: String, enum: CLOSING_COST_OPTIONS, required: true },
  sellerContribution: { type: Number, default: null },

  inspectionContingency: { type: String, enum: YES_NO, required: true },
  inspectionDays: { type: Number, default: null },
  appraisalContingency: { type: String, enum: YES_NO, required: true },
  // appraisalDays: { type: Number, default: null },

  hasAgent: { type: String, enum: YES_NO, required: true },
  agentName: { type: String, default: null },
  brokerageName: { type: String, default: null },
  commission: { type: String, default: null },
  paidBy: { type: String, enum: PAID_BY, default: null },

  personalPropertyIncluded: { type: String, default: null },
  itemsToBeRemoved: { type: String, default: null },

  titleCompany: { type: String, default: null },
  closingDate: { type: String, default: null },
  possession: { type: String, enum: POSSESSION_OPTIONS, default: null },
  sellerPostClosingDays: { type: Number, default: null },

  additionalTerms: { type: String, default: null },
  notesToSeller: { type: String, default: null },
  notesToBuyer: { type: String, default: null },

};

const offerHistorySchema = new Schema(
  {
    ...offerTermsFields,
    round: { type: Number, required: true },
    madeBy: { type: String, enum: MADE_BY, required: true },
    madeByUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: OFFER_STATUS_OPTIONS, default: OFFER_STATUS.pending, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const currentTermsSchema = new Schema(offerTermsFields, { _id: false, timestamps: { createdAt: true, updatedAt: false } });

const offerSchema: Schema<IOffer> = new Schema(
  {
    property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },


    // offer accept part 
    offerAcceptedBy: { type: String, enum: MADE_BY, default: null },
    isBuyerAddedAuthorizedSigner: { type: Boolean, default: false },
    isSellerAddedAuthorizedSigner: { type: Boolean, default: false },

    // NEW FLOW: true once the seller submits contract details for this offer (POST /property-contracts with offerId)
    isContractDetailsSubmitted: { type: Boolean, default: false },

    status: {
      type: String,
      enum: OFFER_STATUS_OPTIONS,
      default: OFFER_STATUS.pending,
    },
    currentRound: { type: Number, default: 1 },
    lastActionBy: { type: String, enum: MADE_BY, required: true },

    currentTerms: { type: currentTermsSchema, required: true },
    history: { type: [offerHistorySchema], default: [] },

    supportingDocuments: {
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

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

offerSchema.statics.IsOfferExistId = async function (id: string) {
  return await Offer.findById(id);
};

offerSchema.pre('find', function (next) {
  this.where({ isDeleted: false });
  next();
});

offerSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({ $match: { isDeleted: false } });
  next();
});

export const Offer = model<IOffer, OfferModel>('Offer', offerSchema);