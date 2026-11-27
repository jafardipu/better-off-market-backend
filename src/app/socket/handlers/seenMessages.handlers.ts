import { Server } from 'socket.io';
import callbackFn from '../utils/callbackFn';
import { Chat } from '../../modules/chat/chat.model';
import { Message } from '../../modules/message/message.model';
import { pushChatLists } from './chatList.handlers';

const SeenMessageHandlers = async (
    io: Server,
    chatId: string | undefined,
    user: { userId: string },
    callback: (arg: unknown) => void,
) => {
    if (!chatId) {
        return callbackFn(callback, { success: false, message: 'chatId is required' });
    }

    try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return callbackFn(callback, { success: false, message: 'chat not found' });
        }

        const result = await Message.updateMany(
            { chatId: chat._id, receiverId: user.userId, seen: false },
            { $set: { seen: true } },
        );

        // Nothing changed, so both users' chat lists are already correct.
        if (result.modifiedCount > 0) {
            await pushChatLists(
                io,
                chat.participants.map((participant) => participant.toString()),
            );
        }

        callbackFn(callback, { success: true, message: 'Messages marked as seen' });
    } catch (error: any) {
        callbackFn(callback, { success: false, message: error?.message || 'seen message failed' });
    }
};

export default SeenMessageHandlers;
