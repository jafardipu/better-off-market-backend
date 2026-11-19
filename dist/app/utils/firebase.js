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
exports.sendNotification = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const http_status_1 = __importDefault(require("http-status"));
const firebase_json_1 = __importDefault(require("../firebase/firebase.json"));
const AppError_1 = __importDefault(require("../error/AppError"));
firebase_admin_1.default.initializeApp({
    credential: firebase_admin_1.default.credential.cert(firebase_json_1.default),
});
const sendNotification = (fcmToken, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const tokens = [...new Set(fcmToken.map((token) => token.trim()).filter(Boolean))];
    if (!tokens.length) {
        console.warn('Firebase notification skipped: no device token');
        return null;
    }
    const data = {
        message: payload.message,
        description: payload.description,
        userId: payload.userId,
        title: payload.message,
        body: payload.description,
    };
    if (payload.link)
        data.link = payload.link;
    if (payload.time)
        data.time = payload.time;
    if (payload.data) {
        for (const [key, value] of Object.entries(payload.data)) {
            if (value != null)
                data[key] = String(value);
        }
    }
    try {
        const response = yield firebase_admin_1.default.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title: payload.message,
                body: payload.description,
            },
            data,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    priority: 'high',
                },
            },
            apns: {
                headers: {
                    'apns-push-type': 'alert',
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        alert: {
                            title: payload.message,
                            body: payload.description,
                        },
                        badge: 1,
                        sound: 'default',
                    },
                },
            },
            webpush: {
                headers: {
                    Urgency: 'high',
                },
            },
        });
        const failures = response.responses.filter((item) => !item.success);
        if (failures.length) {
            failures.forEach((item) => {
                var _a, _b;
                console.error('Firebase notification failed:', (_a = item.error) === null || _a === void 0 ? void 0 : _a.code, (_b = item.error) === null || _b === void 0 ? void 0 : _b.message);
            });
        }
        else {
            console.log(`Firebase notification delivered to ${response.successCount} device(s)`);
        }
        return response;
    }
    catch (error) {
        console.error('Error sending message:', error === null || error === void 0 ? void 0 : error.code, error === null || error === void 0 ? void 0 : error.message);
        if ((error === null || error === void 0 ? void 0 : error.code) === 'messaging/third-party-auth-error') {
            return null;
        }
        throw new AppError_1.default(http_status_1.default.NOT_IMPLEMENTED, error.message || 'Failed to send notification');
    }
});
exports.sendNotification = sendNotification;
