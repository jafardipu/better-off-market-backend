import { IMessage } from '../../modules/message/message.interface';
import { HydratedDocument } from 'mongoose';

export const serializeMessage = (msg: HydratedDocument<IMessage>) => ({
    _id: msg._id.toString(),
    sender: msg.senderId.toString(),
    receiver: msg.receiverId.toString(),
    text: msg.text ?? '',
    imageUrl: (msg.images ?? []).map((img) => img.url),
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    seen: msg.seen,
    chat: msg.chatId.toString(),
    ...(msg.propertyInfo?._id && msg.propertyInfo?.address
        ? {
            propertyInfo: {
                _id: msg.propertyInfo._id.toString(),
                address: msg.propertyInfo.address,
                ...(msg.propertyInfo.image
                    ? { image: msg.propertyInfo.image }
                    : {}),
            },
        }
        : {}),
});