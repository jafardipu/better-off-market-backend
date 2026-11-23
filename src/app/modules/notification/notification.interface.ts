import { ObjectId } from 'mongodb';

export interface TNotification {
  receiver: ObjectId;
  message: string;
  description?: string;
  // refference: ObjectId;
  date?: Date;
  link?: string;
  // Optional fields used by typed notifications (e.g. PROPERTY_UNDER_CONTRACT).
  type?: string;
  title?: string;
  metadata?: Record<string, string>;
  read: boolean;
  isDeleted: boolean;
}
