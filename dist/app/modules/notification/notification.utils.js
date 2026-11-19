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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationMessage = void 0;
const firebase_1 = require("../../utils/firebase");
const notification_model_1 = require("./notification.model");
const sendNotificationMessage = (_a) => __awaiter(void 0, [_a], void 0, function* ({ message, description, userId, fcmToken, link }) {
    const notificationPayload = {
        message,
        description,
    };
    if (link) {
        notificationPayload.link = link;
    }
    yield notification_model_1.Notification.create(Object.assign(Object.assign({}, notificationPayload), { receiver: userId }));
    const token = fcmToken === null || fcmToken === void 0 ? void 0 : fcmToken.trim();
    if (!token) {
        console.warn(`Firebase notification skipped: user ${userId} has no fcmToken`);
        return;
    }
    yield (0, firebase_1.sendNotification)([token], Object.assign(Object.assign({}, notificationPayload), { userId: userId }));
});
exports.sendNotificationMessage = sendNotificationMessage;
