"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const callbackFn_1 = __importDefault(require("../utils/callbackFn"));
const chat_model_1 = require("../../modules/chat/chat.model");
const message_model_1 = require("../../modules/message/message.model");
const serializeMessage_1 = require("../utils/serializeMessage");
const chatList_handlers_1 = __importDefault(require("./chatList.handlers"));
const onlineUsers_1 = require("../utils/onlineUsers");
const user_models_1 = require("../../modules/user/user.models");
const activityEmail_1 = require("../../utils/activityEmail");
const config_1 = __importDefault(require("../../config"));
const sendMessage = (io, payload, user, callback) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        let chatId = payload.chatId;
        if (!chatId) {
            let chat = yield chat_model_1.Chat.findOne({
                participants: { $all: [user.userId, payload.receiver], $size: 2 },
            });
            if (!chat) {
                chat = yield chat_model_1.Chat.create({
                    status: 'accepted',
                    participants: [user.userId, payload.receiver],
                });
            }
            chatId = chat._id.toString();
        }
        const message = yield message_model_1.Message.create({
            chatId,
            senderId: user.userId,
            receiverId: payload.receiver,
            text: (_a = payload.text) !== null && _a !== void 0 ? _a : null,
            images: ((_b = payload.imageUrl) === null || _b === void 0 ? void 0 : _b.length)
                ? payload.imageUrl.map((url) => ({ url }))
                : [],
        });
        yield chat_model_1.Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
        const serialized = (0, serializeMessage_1.serializeMessage)(message);
        const senderSocketId = (0, onlineUsers_1.getSocketIdByUserId)(user.userId);
        const receiverSocketId = (0, onlineUsers_1.getSocketIdByUserId)(payload.receiver);
        // namespaced event, raw message object — matches frontend exactly
        const eventName = `new-message::${chatId}`;
        if (senderSocketId)
            io.to(senderSocketId).emit(eventName, serialized);
        if (receiverSocketId)
            io.to(receiverSocketId).emit(eventName, serialized);
        yield (0, chatList_handlers_1.default)(io, { userId: user.userId }, {}, () => { });
        yield (0, chatList_handlers_1.default)(io, { userId: payload.receiver }, {}, () => { });
        if (payload.receiver && payload.receiver !== user.userId) {
            const [sender, receiverUser] = yield Promise.all([
                user_models_1.User.findById(user.userId).select('name'),
                user_models_1.User.findById(payload.receiver).select('name email'),
            ]);
            const preview = ((_c = payload.text) === null || _c === void 0 ? void 0 : _c.trim())
                ? payload.text.trim().slice(0, 180)
                : ((_d = payload.imageUrl) === null || _d === void 0 ? void 0 : _d.length)
                    ? 'Sent you an image'
                    : 'Sent you a message';
            (0, activityEmail_1.sendActivityEmail)({
                to: receiverUser === null || receiverUser === void 0 ? void 0 : receiverUser.email,
                userName: receiverUser === null || receiverUser === void 0 ? void 0 : receiverUser.name,
                subject: 'You received a new message',
                title: 'New Message',
                body: `${(sender === null || sender === void 0 ? void 0 : sender.name) || 'Someone'} sent you a message.`,
                detailLabel: 'Message',
                detailValue: preview,
                actionUrl: `${config_1.default.client_Url}/messages`,
                actionLabel: 'Open Messages',
            });
        }
        (0, callbackFn_1.default)(callback, {
            success: true,
            message: 'Message sent successfully',
            data: serialized,
        });
    }
    catch (error) {
        (0, callbackFn_1.default)(callback, { success: false, message: error === null || error === void 0 ? void 0 : error.message });
    }
});
exports.default = sendMessage;
