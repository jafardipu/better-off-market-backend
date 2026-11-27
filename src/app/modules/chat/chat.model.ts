import { Schema, model } from 'mongoose';
import { IChat, ChatModel } from './chat.interface';

const chatSchema = new Schema<IChat>(
    {
        participants: [
            { type: Schema.Types.ObjectId, ref: 'User', required: true },
        ],
        status: { type: String, enum: ['accepted'], default: 'accepted' },
    },
    { timestamps: true },
);

chatSchema.index({ participants: 1 });
// Chat list: a user's chats, most recently active first.
chatSchema.index({ participants: 1, updatedAt: -1 });

export const Chat = model<IChat, ChatModel>('Chat', chatSchema);