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
  // console.log("notification sending ...")
  try {

    const response = await admin.messaging().sendEachForMulticast({
      tokens: fcmToken,
      notification: {
        title: payload.message,
        body: payload.description,
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
      },
      },
    });
    return response;
  } catch (error: any) {
    console.error('Error sending message:', error);
    if (error?.code === 'messaging/third-party-auth-error') {
      return null;
    } else {
      console.error('Error sending message:', error);
      throw new AppError(
        httpStatus.NOT_IMPLEMENTED,
        error.message || 'Failed to send notification',
      );
    }
  }
};
