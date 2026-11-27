import { Server } from 'socket.io';
import callbackFn from '../utils/callbackFn';
import { Chat } from '../../modules/chat/chat.model';
import { Message } from '../../modules/message/message.model';
import { serializeMessage } from '../utils/serializeMessage';
import { pushChatLists } from './chatList.handlers';
import { User } from '../../modules/user/user.models';
import { sendActivityEmail } from '../../utils/activityEmail';
import config from '../../config';
// NEW FLOW: buyer activity tracking
import { recordBuyerMessagedSeller } from '../../modules/buyerActivity/buyerActivity.utils';

interface IPayload {
    imageUrl?: string[]; // matches frontend's field name
    text?: string;
    receiver: string; // matches frontend's field name
    chatId?: string;
    propertyInfo?: { _id: string; address: string; image?: string };
}

// Emails the receiver about a new message, with a link that opens the conversation.
const sendNewMessageEmail = async (senderId: string, payload: IPayload) => {
    const [sender, receiverUser] = await Promise.all([
        User.findById(senderId).select('name'),
        User.findById(payload.receiver).select('name email'),
    ]);
    const preview = payload.text?.trim()
        ? payload.text.trim().slice(0, 180)
        : payload.imageUrl?.length
            ? 'Sent you an image'
            : 'Sent you a message';

    sendActivityEmail({
        to: receiverUser?.email,
        userName: receiverUser?.name,
        subject: 'You received a new message',
        title: 'New Message',
        body: `${sender?.name || 'Someone'} sent you a message.`,
        detailLabel: 'Message',
        detailValue: preview,
        actionUrl: `${config.client_Url}/message?user=${encodeURIComponent(senderId)}`,
        actionLabel: 'Open Messages',
    });
};

const sendMessage = async (
    io: Server,
    payload: IPayload,
    user: { userId: string },
    callback: (args: unknown) => void,
) => {
    try {
        let chatId = payload.chatId;

        if (!chatId) {
            let chat = await Chat.findOne({
                participants: { $all: [user.userId, payload.receiver], $size: 2 },
            });

            if (!chat) {
                chat = await Chat.create({
                    status: 'accepted',
                    participants: [user.userId, payload.receiver],
                });
            }

            chatId = chat._id.toString();
        }

        const propertyId = payload.propertyInfo?._id?.trim();
        const propertyAddress = payload.propertyInfo?.address?.trim();
        const propertyImage = payload.propertyInfo?.image?.trim();
        const propertyInfo =
            propertyId && propertyAddress
                ? {
                    _id: propertyId,
                    address: propertyAddress,
                    ...(propertyImage ? { image: propertyImage } : {}),
                }
                : undefined;

        const message = await Message.create({
            chatId,
            senderId: user.userId,
            receiverId: payload.receiver,
            text: payload.text ?? null,
            images: payload.imageUrl?.length
                ? payload.imageUrl.map((url) => ({ url }))
                : [],
            ...(propertyInfo ? { propertyInfo } : {}),
        });

        // NEW FLOW: buyer activity tracking — a message started from a listing's
        // "Message seller" button (propertyInfo._id) counts when it goes from a
        // non-seller TO that listing's seller. Checked inside; never throws.
        if (propertyId) {
            void recordBuyerMessagedSeller(user.userId, payload.receiver, propertyId);
        }

        await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });

        const serialized = serializeMessage(message);

        // namespaced event, raw message object — matches frontend exactly.
        // Rooms reach every tab/device of both users; a socket in both rooms
        // gets it once.
        io.to([user.userId, payload.receiver]).emit(`new-message::${chatId}`, serialized);

        await pushChatLists(io, [user.userId, payload.receiver]);

        // The email is not awaited, so the sender's ack doesn't wait for it.
        if (payload.receiver && payload.receiver !== user.userId) {
            void sendNewMessageEmail(user.userId, payload).catch((error) => {
                console.error('New message email failed:', error);
            });
        }

        callbackFn(callback, {
            success: true,
            message: 'Message sent successfully',
            data: serialized,
        });
    } catch (error: any) {
        callbackFn(callback, { success: false, message: error?.message });
    }
};

export default sendMessage;