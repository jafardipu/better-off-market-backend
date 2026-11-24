import { Model, Types } from 'mongoose';
import { BUYER_ACTIVITY_FIELDS } from './buyerActivity.constants';

export type TBuyerActivityField = (typeof BUYER_ACTIVITY_FIELDS)[number];

// One document per buyer + property. Each timestamp is the FIRST time the
// buyer did that action on this listing; once set it never changes.
export interface IBuyerActivity {
  _id?: Types.ObjectId;
  buyer: Types.ObjectId;
  property: Types.ObjectId;
  // The property's seller when the document was created (for admin filtering).
  seller?: Types.ObjectId | null;
  firstViewedAt?: Date;
  firstSavedAt?: Date;
  firstRsvpAt?: Date;
  firstMessagedSellerAt?: Date;
  firstOfferSubmittedAt?: Date;
  firstNegotiationAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BuyerActivityModel = Model<IBuyerActivity>;
