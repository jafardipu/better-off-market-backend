import { Server } from 'socket.io';
import callbackFn from '../utils/callbackFn';
import { Chat } from '../../modules/chat/chat.model';
import { Message } from '../../modules/message/message.model';
import { serializeMessage } from '../utils/serializeMessage';
import getChatList from './chatList.handlers';
import { getSocketIdByUserId } from '../utils/onlineUsers';
import { User } from '../../modules/user/user.models';
import { sendActivityEmail } from '../../utils/activityEmail';
import config from '../../config';

interface IPayload {
    imageUrl?: string[]; // matches frontend's field name
    text?: string;
    receiver: string; // matches frontend's field name
    chatId?: string;
}

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

        const message = await Message.create({
            chatId,
            senderId: user.userId,
            receiverId: payload.receiver,
            text: payload.text ?? null,
            images: payload.imageUrl?.length
                ? payload.imageUrl.map((url) => ({ url }))
                : [],
        });

        await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });

        const serialized = serializeMessage(message);

        const senderSocketId = getSocketIdByUserId(user.userId);
        const receiverSocketId = getSocketIdByUserId(payload.receiver);

        // namespaced event, raw message object — matches frontend exactly
        const eventName = `new-message::${chatId}`;
        if (senderSocketId) io.to(senderSocketId).emit(eventName, serialized);
        if (receiverSocketId) io.to(receiverSocketId).emit(eventName, serialized);

        await getChatList(io, { userId: user.userId }, {}, () => { });
        await getChatList(io, { userId: payload.receiver }, {}, () => { });

        if (payload.receiver && payload.receiver !== user.userId) {
            const [sender, receiverUser] = await Promise.all([
                User.findById(user.userId).select('name'),
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
                actionUrl: `${config.client_Url}/messages`,
                actionLabel: 'Open Messages',
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