import { Types } from 'mongoose';
import { Chat } from './chat.model';
import { Message } from '../message/message.model';
import QueryBuilder from '../../class/builder/QueryBuilder';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import { User } from '../user/user.models';
import { USER_ROLE } from '../user/user.constants';

// Every role other than a regular user is an admin role.
const ADMIN_ROLES = Object.values(USER_ROLE).filter((role) => role !== USER_ROLE.user);

// Admin "Conversations" page: only chats between two regular users. An admin's
// own direct chats belong to the dashboard's Messages page (socket events).
const getAllConversations = async (query: Record<string, unknown>) => {
    // Ids of every account with an admin role. Read from the raw collection so
    // soft-deleted admins are included too (User's find hook would hide them).
    const adminIds = await User.collection.distinct('_id', {
        role: { $in: ADMIN_ROLES },
    });

    // The filter is part of the query itself, so pagination and countTotal()
    // (which reuses the query's filter) only ever see user-to-user chats.
    const chatQuery = new QueryBuilder(
        Chat.find({ participants: { $nin: adminIds } }).populate(
            'participants',
            'name profile',
        ),
        query,
    )
        .paginate()
        .sort()
        .fields();

    const chats = await chatQuery.modelQuery;
    const meta = await chatQuery.countTotal();

    const chatIds = chats.map((c) => c._id);

    const messageStats: {
        _id: Types.ObjectId;
        messageCount: number;
        lastActivity: Date;
    }[] = await Message.aggregate([
        { $match: { chatId: { $in: chatIds } } },
        {
            $group: {
                _id: '$chatId',
                messageCount: { $sum: 1 },
                lastActivity: { $max: '$createdAt' },
            },
        },
    ]);

    const statsMap = new Map(
        messageStats.map((s) => [s._id.toString(), s]),
    );

    const data = chats.map((chat) => {
        const stats = statsMap.get(chat._id.toString());
        const [partyA, partyB] = chat.participants as unknown as {
            _id: Types.ObjectId;
            name: string;
            profile?: string;
        }[];

        return {
            id: chat._id.toString(),
            partyA: partyA ? { id: partyA._id.toString(), name: partyA.name, profile: partyA.profile ?? null } : null,
            partyB: partyB ? { id: partyB._id.toString(), name: partyB.name, profile: partyB.profile ?? null } : null,
            messageCount: stats?.messageCount || 0,
            lastActivity: stats?.lastActivity || chat.createdAt,
        };
    });

    return { data, meta };
};

const getConversationById = async (chatId: string) => {
    const chat = await Chat.findById(chatId).populate(
        'participants',
        'name profile',
    );

    if (!chat) {
        throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });

    const [partyA, partyB] = chat.participants as unknown as {
        _id: Types.ObjectId;
        name: string;
        profile?: string;
    }[];

    return {
        contact: {
            id: chat._id.toString(),
            partyA: partyA ? { id: partyA._id.toString(), name: partyA.name, profile: partyA.profile ?? null } : null,
            partyB: partyB ? { id: partyB._id.toString(), name: partyB.name, profile: partyB.profile ?? null } : null,
        },
        messages: messages.map((m) => ({
            id: m._id.toString(),
            sender: m.senderId.toString(),
            receiver: m.receiverId.toString(),
            text: m.text ?? '',
            images: (m.images ?? []).map((img) => img.url), // included whenever present
            seen: m.seen,
            createdAt: m.createdAt,
        })),
    };
};

export const chatService = { getAllConversations, getConversationById };