// Machine-readable notification categories. Older notifications have no type.
export const NOTIFICATION_TYPE = {
  property_under_contract: 'PROPERTY_UNDER_CONTRACT',
} as const;

export type TNotificationTypeValue =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const messages = {
  booking: 'You have successfully booked a table',
  bookingForOwner: 'An user booked a table',
  cancelled: 'Your Booking has been cancelled',
  payment:
    'You have received a payment from the admin. Please check your payment history page for details.',
};
