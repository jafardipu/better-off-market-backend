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
}
