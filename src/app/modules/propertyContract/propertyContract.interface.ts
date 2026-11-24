import { Model, Types } from 'mongoose';

export interface IPropertyContract {
  _id?: Types.ObjectId;
  property: Types.ObjectId;
  seller: Types.ObjectId;
  buyerName: string | null;
  // Anticipated closing date, stored as UTC midnight.
  closingDate: Date | null;
  titleCompany: string | null;
  // The property's status just before it was marked Under Contract.
  previousStatus: string;

  // NEW FLOW: contract details from accepted offers. All optional so records
  // created before these fields existed still load.
  // The accepted offer this contract was submitted from.
  offer?: Types.ObjectId | null;
  // offer.buyer; null for a manual "Mark Under Contract" (typed buyer name only).
  buyer?: Types.ObjectId | null;
  // betteroffmarket | independent | unsure
  buyerContactSource?: string | null;
  // Server time when the seller's certification was received.
  certifiedAt?: Date | null;
  // offer_accepted | manual
  source?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type PropertyContractModel = Model<IPropertyContract>;

// Raw request body for POST /property-contracts. validateRequest does not
// write parsed values back, so the service normalizes these itself.
export interface ICreatePropertyContractPayload {
  propertyId: string;
  buyerName?: string | null;
  closingDate?: string | null;
  titleCompany?: string | null;
  // NEW FLOW: contract details from accepted offers
  offerId?: string | null;
  buyerContactSource?: string | null;
  certified?: unknown;
}
