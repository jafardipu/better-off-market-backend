import { sendNotification } from "../../utils/firebase";
import { Notification } from "./notification.model";

type TNotificationType = {
    message: string;
    description: string;
    userId: string;
    fcmToken?: string
    link?: string
    // Optional typed-notification fields; existing callers don't set them.
    type?: string;
    title?: string;
    metadata?: Record<string, string>;
}

export const sendNotificationMessage = async ({ message, description, userId, fcmToken, link, type, title, metadata }: TNotificationType) => {
    const notificationPayload: { message: string; description: string; link?: string } = {
        message,
        description,
    };

    if (link) {
        notificationPayload.link = link;
    }

    await Notification.create({
        ...notificationPayload,
        ...(type ? { type } : {}),
        ...(title ? { title } : {}),
        ...(metadata ? { metadata } : {}),
        receiver: userId,
    });

    const token = fcmToken?.trim();
    if (!token) {
        console.warn(`Firebase notification skipped: user ${userId} has no fcmToken`);
        return;
    }

    await sendNotification([token], {
        ...notificationPayload,
        userId: userId,
        ...(type || metadata ? { data: { ...(type ? { type } : {}), ...(metadata ?? {}) } } : {}),
    });

};
