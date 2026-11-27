import { Socket } from 'socket.io';
import callbackFn from '../utils/callbackFn';
import { User } from '../../modules/user/user.models';
import { Chat } from '../../modules/chat/chat.model';
import { Message } from '../../modules/message/message.model';
import { serializeMessage } from '../utils/serializeMessage';

// message_page: one page of the conversation with payload.userId, newest page
// first, oldest → newest within the page. Replies to the socket that asked.
const MessagePageHandlers = async (
    socket: Socket,
    payload: { userId: string; limit?: number; page?: number } | undefined,
    currentUserId: string,
    callback: (data: unknown) => void,
) => {
    const { userId, page = 1, limit = 10 } = payload ?? ({} as { userId?: string; page?: number; limit?: number });

    if (!userId) {
        return callbackFn(callback, { success: false, message: 'userId is required' });
    }

    const skip = (page - 1) * limit;

    // Query by chat so the { chatId: 1, createdAt: -1 } index serves both the
    // filter and the sort. Same participant filter as send_message. All chats
    // between the pair are included, in case a race ever created two.
    const loadMessages = async () => {
        const chats = await Chat.find({
            participants: { $all: [currentUserId, userId], $size: 2 },
        }).select('_id');
        if (!chats.length) {
            return { messages: [], total: 0 };
        }

        const filter = { chatId: { $in: chats.map((chat) => chat._id) } };
        const [messages, total] = await Promise.all([
            Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Message.countDocuments(filter),
        ]);
        return { messages, total };
    };

    try {
        const [receiver, { messages, total }] = await Promise.all([
            User.findById(userId).select('_id'),
            loadMessages(),
        ]);

        if (!receiver) {
            return callbackFn(callback, { success: false, message: 'User not found!' });
        }

        const response = {
            data: messages.map(serializeMessage).reverse(),
            meta: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
                hasMore: skip + messages.length < total,
            },
            userId,
        };

        socket.emit('message', response);
        callbackFn(callback, {
            success: true,
            message: 'Messages fetched successfully',
            data: response,
        });
    } catch (error: any) {
        console.error('Error in message_page event:', error);
        callbackFn(callback, { success: false, message: error?.message });
    }
};

export default MessagePageHandlers;
