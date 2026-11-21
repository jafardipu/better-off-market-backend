import { Schema, model } from 'mongoose';
import { IMessage, MessageModel } from './message.interface';

const messageSchema = new Schema<IMessage>(
    {
        chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
        senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, default: null },
        images: { type: [{ url: String }], default: [] },
        propertyInfo: {
            type: {
                _id: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
                address: { type: String, required: true },
                image: { type: String },
            },
            default: undefined,
            required: false,
        },
        seen: { type: Boolean, default: false },
    },
    { timestamps: true },
);

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1 });

export const Message = model<IMessage, MessageModel>('Message', messageSchema);