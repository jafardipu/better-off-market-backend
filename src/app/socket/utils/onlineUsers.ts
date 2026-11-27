// userId → ids of all that user's connected sockets (tabs, devices, reconnects).
// Only used for presence; messages to a user go to the room named after their
// userId, which socket.io keeps up to date on its own.
const userSockets = new Map<string, Set<string>>();

export const addUserSocket = (userId: string, socketId: string) => {
    let sockets = userSockets.get(userId);
    if (!sockets) {
        sockets = new Set();
        userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
};

// Removes only this socket. The user goes offline when their last socket is gone,
// so a late disconnect of an old socket never affects a newer one.
export const removeUserSocket = (userId: string, socketId: string) => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSockets.delete(userId);
    }
};

export const getAllOnlineUserIds = () =>
    Array.from(userSockets.entries())
        .filter(([, sockets]) => sockets.size > 0)
        .map(([userId]) => userId);
