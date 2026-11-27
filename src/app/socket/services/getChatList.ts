import { Types } from 'mongoose';
import { Chat } from '../../modules/chat/chat.model';

export const getMyChatList = async (
    userId: string,
    page: number = 1,
    limit: number = 10,
) => {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    // Sort and page first, then look up messages only for this page's chats.
    // send_message bumps Chat.updatedAt on every message, so updatedAt is the
    // last-activity time ({ participants: 1, updatedAt: -1 } index).
    // The lookups use localField/foreignField + pipeline (MongoDB 5.0+), so the
    // messages indexes { chatId: 1, createdAt: -1 } and
    // { chatId: 1, receiverId: 1, seen: 1 } are used.
    const chatsPromise = Chat.aggregate([
        { $match: { participants: userObjectId } },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
            $lookup: {
                from: 'messages',
                localField: '_id',
                foreignField: 'chatId',
                pipeline: [{ $sort: { createdAt: -1 } }, { $limit: 1 }],
                as: 'lastMessage',
            },
        },
        { $addFields: { lastMessage: { $arrayElemAt: ['$lastMessage', 0] } } },
        {
            $lookup: {
                from: 'messages',
                localField: '_id',
                foreignField: 'chatId',
                pipeline: [
                    { $match: { receiverId: userObjectId, seen: false } },
                    { $count: 'count' },
                ],
                as: 'unread',
            },
        },
        {
            $addFields: {
                unreadMessageCount: { $ifNull: [{ $arrayElemAt: ['$unread.count', 0] }, 0] },
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'participants',
                foreignField: '_id',
                as: 'participantDetails',
            },
        },
        {
            $project: {
                lastMessage: 1,
                unreadMessageCount: 1,
                participants: {
                    $filter: {
                        input: '$participantDetails',
                        as: 'p',
                        cond: { $ne: ['$$p._id', userObjectId] },
                    },
                },
            },
        },
        {
            $project: {
                lastMessage: 1,
                unreadMessageCount: 1,
                'participants._id': 1,
                'participants.name': 1,
                'participants.profile': 1,
            },
        },
    ]);

    const [chats, totalCount] = await Promise.all([
        chatsPromise,
        Chat.countDocuments({ participants: userObjectId }),
    ]);

    // reshape into the exact ChatListItem contract the frontend expects
    const data = chats.map((c) => ({
        chat: {
            _id: c._id.toString(),
            participants: c.participants.map((p: any) => ({
                _id: p._id.toString(),
                name: p.name,
                profile: p.profile ?? null,
            })),
        },
        message: c.lastMessage
            ? {
                text: c.lastMessage.text ?? '',
                imageUrl: (c.lastMessage.images ?? []).map((img: any) => img.url),
                sender: c.lastMessage.senderId.toString(),
                createdAt: c.lastMessage.createdAt,
                seen: c.lastMessage.seen,
            }
            : null,
        unreadMessageCount: c.unreadMessageCount,
    }));

    return {
        chats: data,
        pagination: {
            page,
            limit,
            total: totalCount,
            totalPage: Math.ceil(totalCount / limit),
            hasMore: skip + data.length < totalCount,
        },
    };
};