import admin from 'firebase-admin';
import httpStatus from 'http-status';
import file from '../firebase/firebase.json';
import AppError from '../error/AppError';

admin.initializeApp({
  credential: admin.credential.cert(file as any),
});

type NotificationPayload = {
  message: string;
  description: string;
  data?: { [key: string]: string };
  link?: string;
  userId: string;
  time?: string;
};

export const sendNotification = async (
  fcmToken: string[],
  payload: NotificationPayload,
): Promise<any> => {
  const tokens = [...new Set(fcmToken.map((token) => token.trim()).filter(Boolean))];
  if (!tokens.length) {
    console.warn('Firebase notification skipped: no device token');
    return null;
  }

  const data: Record<string, string> = {
    message: payload.message,
    description: payload.description,
    userId: payload.userId,
    title: payload.message,
    body: payload.description,
  };
  if (payload.link) data.link = payload.link;
  if (payload.time) data.time = payload.time;
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      if (value != null) data[key] = String(value);
    }
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
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
        console.error(
          'Firebase notification failed:',
          item.error?.code,
          item.error?.message,
        );
      });
    } else {
      console.log(`Firebase notification delivered to ${response.successCount} device(s)`);
    }

    return response;
  } catch (error: any) {
    console.error('Error sending message:', error?.code, error?.message);
    if (error?.code === 'messaging/third-party-auth-error') {
      return null;
    }
    throw new AppError(
      httpStatus.NOT_IMPLEMENTED,
      error.message || 'Failed to send notification',
    );
  }
};
