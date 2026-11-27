import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { socketAuthMiddleware } from './middleware/auth.socket';
import { broadcastOnlineUsers } from './handlers/onlineUser.handlers';
import MessagePageHandlers from './handlers/massagePage.handlers';
import getChatList from './handlers/chatList.handlers';
import SeenMessageHandlers from './handlers/seenMessages.handlers';
import sendMessage from './handlers/sendMessage.handlers';
import getReceiverId from './services/getReceiverId';
import { addUserSocket, removeUserSocket } from './utils/onlineUsers';
import { setIO } from './utils/io';

const handleTyping = async (
    io: Server,
    socket: Socket,
    chatId: string,
    isTyping: boolean,
) => {
    if (!chatId) return;
    const receiverId = await getReceiverId(chatId, socket.data.userId);
    if (!receiverId) return;

    // namespaced per-chat, matches frontend's `typing::${chatId}` listener;
    // the receiver's room reaches all their tabs/devices
    io.to(receiverId).emit(`typing::${chatId}`, {
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

        // Every push to a user goes to the room named after their userId, which
        // holds all their sockets; socket.io removes the socket on disconnect.
        socket.join(userId);
        addUserSocket(userId, socket.id);
        broadcastOnlineUsers(io); // auto-broadcast — frontend never asks explicitly

        socket.on('message_page', (payload, callback) =>
            MessagePageHandlers(socket, payload, userId, callback),
        );

        socket.on('my_chat_list', (payload, callback) =>
            getChatList(socket, payload, callback),
        );

        socket.on('seen', (payload: { chatId?: string } | undefined, callback) =>
            SeenMessageHandlers(io, payload?.chatId, socket.data, callback),
        );

        socket.on('send_message', (payload, callback) =>
            sendMessage(io, payload, socket.data, callback),
        );

        // single unified event, matches frontend's { chatId, isTyping } payload
        socket.on('typing', (payload: { chatId?: string; isTyping?: boolean } | undefined) =>
            handleTyping(io, socket, payload?.chatId as string, Boolean(payload?.isTyping)).catch((err) =>
                console.error('typing error:', err),
            ),
        );

        socket.on('disconnect', () => {
            // Only this socket goes; the user stays online while another remains.
            removeUserSocket(userId, socket.id);
            broadcastOnlineUsers(io); // also update everyone when someone goes offline
        });
    });

    return io;
};

export default initializeSocket;
