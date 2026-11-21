import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from './middleware/auth.socket';
import { broadcastOnlineUsers } from './handlers/onlineUser.handlers';
import MessagePageHandlers from './handlers/massagePage.handlers';
import getChatList from './handlers/chatList.handlers';
import SeenMessageHandlers from './handlers/seenMessages.handlers';
import sendMessage from './handlers/sendMessage.handlers';
import getReceiverId from './services/getReceiverId';
import {
    setUserSocket,
    removeUserSocket,
    getUserIdBySocketId,
    getSocketIdByUserId,
} from './utils/onlineUsers';
import { setIO } from './utils/io';

const handleTyping = async (
    io: Server,
    socket: Socket,
    chatId: string,
    isTyping: boolean,
) => {
    const receiverId = await getReceiverId(chatId, socket.data.userId);
    if (!receiverId) return;

    const receiverSocketId = getSocketIdByUserId(receiverId);
    if (!receiverSocketId) return;

    // namespaced per-chat, matches frontend's `typing::${chatId}` listener
    io.to(receiverSocketId).emit(`typing::${chatId}`, {
        userId: socket.data.userId,
        isTyping,
    });
};

const initializeSocket = async (server: HttpServer) => {
    const io = new Server(server, { cors: { origin: '*' } });
    setIO(io);

    io.use(socketAuthMiddleware);

    io.on('connection', async (socket: Socket) => {
        const userId = socket.data?.userId as string;

        if (!userId) {
            console.warn(`Socket ${socket.id} connected without userId — disconnecting`);
            socket.disconnect();
            return;
        }

        // console.log(`✅ Connected: userId=${userId} socketId=${socket.id}`);
        setUserSocket(userId, socket.id);
        broadcastOnlineUsers(io); // auto-broadcast — frontend never asks explicitly

        socket.on('message_page', (payload, callback) =>
            MessagePageHandlers(io, payload, userId, callback),
        );

        socket.on('my_chat_list', (payload, callback) =>
            getChatList(io, socket.data, payload, callback),
        );

        socket.on('seen', ({ chatId }: { chatId: string }, callback) =>
            SeenMessageHandlers(io, chatId, socket.data, callback),
        );

        socket.on('send_message', (payload, callback) =>
            sendMessage(io, payload, socket.data, callback),
        );

        // single unified event, matches frontend's { chatId, isTyping } payload
        socket.on('typing', ({ chatId, isTyping }: { chatId: string; isTyping: boolean }) =>
            handleTyping(io, socket, chatId, isTyping).catch((err) =>
                console.error('typing error:', err),
            ),
        );

        socket.on('disconnect', () => {
            const uid = getUserIdBySocketId(socket.id);
            if (uid) {
                removeUserSocket(uid, socket.id);
                broadcastOnlineUsers(io); // also update everyone when someone goes offline
                // console.log(`❌ Disconnected: userId=${uid} socketId=${socket.id}`);
            }
        });
    });

    return io;
};

export default initializeSocket;