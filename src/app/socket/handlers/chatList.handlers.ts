import { Server, Socket } from 'socket.io';
import callbackFn from '../utils/callbackFn';
import { getMyChatList } from '../services/getChatList';

// Size of the chat lists pushed after send_message / seen. The website asks
// for 100, so a smaller push would shrink its sidebar.
export const CHAT_LIST_PUSH_LIMIT = 100;

// my_chat_list: replies to the socket that asked (emit + ack).
const getChatList = async (
    socket: Socket,
    payload: { limit?: number; page?: number } | undefined,
    callback: (arg: unknown) => void,
) => {
    const { page = 1, limit = 10 } = payload ?? {};

    try {
        const chatList = await getMyChatList(socket.data.userId, page, limit);

        socket.emit('chat_list', chatList);

        callbackFn(callback, {
            success: true,
            message: 'Chat list fetched successfully',
            data: chatList,
        });
    } catch (error: any) {
        callbackFn(callback, { success: false, message: error?.message });
    }
};

// Pushes a fresh chat list to every socket of the user (their room).
// Never throws, so callers can await it without a try/catch.
export const pushChatList = async (io: Server, userId: string) => {
    try {
        const chatList = await getMyChatList(userId, 1, CHAT_LIST_PUSH_LIMIT);
        io.to(userId).emit('chat_list', chatList);
    } catch (error) {
        console.error(`chat_list push to user ${userId} failed:`, error);
    }
};

// Pushes to each distinct user in parallel.
export const pushChatLists = (io: Server, userIds: string[]) =>
    Promise.all(
        Array.from(new Set(userIds.filter(Boolean))).map((userId) =>
            pushChatList(io, userId),
        ),
    );

export default getChatList;
