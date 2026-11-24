import { USER_ROLE } from '../user/user.constants';

// The "first time the buyer did X on this listing" timestamps.
export const BUYER_ACTIVITY_FIELDS = [
  'firstViewedAt',
  'firstSavedAt',
  'firstRsvpAt',
  'firstMessagedSellerAt',
  'firstOfferSubmittedAt',
  'firstNegotiationAt',
] as const;

export const BUYER_ACTIVITY_ADMIN_ROLES = [
  USER_ROLE.admin,
  USER_ROLE.sub_admin,
  USER_ROLE.super_admin,
];

// Accepted `sortBy` values for GET /buyer-activities → field path in the
// aggregated document.
export const BUYER_ACTIVITY_SORT_FIELDS: Record<string, string> = {
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
  firstViewedAt: 'firstViewedAt',
  firstSavedAt: 'firstSavedAt',
  firstRsvpAt: 'firstRsvpAt',
  firstMessagedSellerAt: 'firstMessagedSellerAt',
  firstOfferSubmittedAt: 'firstOfferSubmittedAt',
  firstNegotiationAt: 'firstNegotiationAt',
  buyerName: 'buyer.name',
  sellerName: 'seller.name',
  streetAddress: 'property.streetAddress',
  city: 'property.city',
};

export const BUYER_ACTIVITY_SEARCHABLE_FIELDS = [
  'buyer.name',
  'buyer.email',
  'property.streetAddress',
  'property.city',
  'property.zipCode',
  'seller.name',
  'seller.email',
];

export const BUYER_ACTIVITY_DEFAULT_LIMIT = 10;
export const BUYER_ACTIVITY_MAX_LIMIT = 100;

// Text of the chat message the server sends on the buyer's behalf when they
// RSVP to an open house (see increaseRSVPCount in properties.service.ts).
// It is not the buyer messaging the seller, so the backfill skips it.
export const OPEN_HOUSE_RSVP_MESSAGE_TEXT = 'I plan to attend this open house.';
