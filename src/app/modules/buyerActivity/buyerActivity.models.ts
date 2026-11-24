import { Schema, model } from 'mongoose';
import { BuyerActivityModel, IBuyerActivity } from './buyerActivity.interface';

// The first* dates deliberately have NO default. They are written with $min,
// and in MongoDB null sorts below every date, so a stored null would block
// $min from ever setting the real timestamp. A missing field is what lets the
// first $min set it.
const buyerActivitySchema = new Schema<IBuyerActivity, BuyerActivityModel>(
  {
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    firstViewedAt: { type: Date },
    firstSavedAt: { type: Date },
    firstRsvpAt: { type: Date },
    firstMessagedSellerAt: { type: Date },
    firstOfferSubmittedAt: { type: Date },
    firstNegotiationAt: { type: Date },
  },
  { timestamps: true },
);

buyerActivitySchema.index({ buyer: 1, property: 1 }, { unique: true });
buyerActivitySchema.index({ property: 1 });
buyerActivitySchema.index({ seller: 1 });

export const BuyerActivity = model<IBuyerActivity, BuyerActivityModel>(
  'BuyerActivity',
  buyerActivitySchema,
);
