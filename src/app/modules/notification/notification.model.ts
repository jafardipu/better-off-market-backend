import { Schema, model } from 'mongoose';
import { TNotification } from './notification.interface';

const NotificationSchema = new Schema<TNotification>(
  {
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver id is required'],
    },
    // refference: {
    //   type: Schema.Types.ObjectId,
    //   //   dynamic refference
    //   refPath: 'model_type',
    //   required: [true, 'Receiver id is required'],
    // },
    message: {
      type: String,
      required: [true, 'Message is required'],
    },
    description: {
      type: String,
      default: '',
    },
    read: {
      type: Boolean,
      default: false,
    },
    link: {
      type: String,
      default: '',
    },
    // Optional: set only by typed notifications; absent on older records.
    type: {
      type: String,
    },
    title: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

NotificationSchema.pre('find', function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

NotificationSchema.pre('findOne', function (next) {
  this.where({ isDeleted: { $ne: true } });
  next();
});

NotificationSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  next();
});

export const Notification = model<TNotification>(
  'Notification',
  NotificationSchema,
);
