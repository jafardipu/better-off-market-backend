import { STATUS } from '../properties/properties.constants';
import { USER_ROLE } from '../user/user.constants';

// Property statuses from which a seller may mark the listing Under Contract.
export const CONTRACT_ALLOWED_FROM_STATUSES: string[] = [
  STATUS.active,
  STATUS.pending,
];

// NEW FLOW: the seller's answer to "How did the buyer first initiate contact
// with you regarding this specific property?"
export const BUYER_CONTACT_SOURCE = {
  betteroffmarket: 'betteroffmarket',
  independent: 'independent',
  unsure: 'unsure',
} as const;

export const BUYER_CONTACT_SOURCES: string[] = Object.values(BUYER_CONTACT_SOURCE);

// Full sentences shown to admins for each answer.
export const BUYER_CONTACT_SOURCE_LABELS: Record<string, string> = {
  [BUYER_CONTACT_SOURCE.betteroffmarket]:
    'The buyer first contacted me about this property through BetterOffMarket.',
  [BUYER_CONTACT_SOURCE.independent]:
    'The buyer first contacted me about this property through another source, independently of BetterOffMarket.',
  [BUYER_CONTACT_SOURCE.unsure]: 'I am unsure / unable to determine.',
};

// Answers that need an admin review when the buyer also has BetterOffMarket
// activity on the listing.
export const NEEDS_REVIEW_CONTACT_SOURCES: string[] = [
  BUYER_CONTACT_SOURCE.independent,
  BUYER_CONTACT_SOURCE.unsure,
];

export const CONTRACT_SOURCE = {
  offer_accepted: 'offer_accepted',
  manual: 'manual',
} as const;

export const CONTRACT_SOURCES: string[] = Object.values(CONTRACT_SOURCE);

export const BUYER_CONTACT_SOURCE_REQUIRED_MESSAGE =
  'Please select how the buyer first contacted you';
export const CERTIFICATION_REQUIRED_MESSAGE = 'Please confirm the certification';
export const CONTRACT_ALREADY_SUBMITTED_MESSAGE =
  'Contract details were already submitted for this offer.';

export const NEEDS_REVIEW_MESSAGE =
  'Needs review: the buyer has BetterOffMarket activity on this listing.';

export const BUYER_NAME_MAX_LENGTH = 120;
export const TITLE_COMPANY_MAX_LENGTH = 150;

export const PROPERTY_CONTRACT_ADMIN_ROLES = [
  USER_ROLE.admin,
  USER_ROLE.sub_admin,
  USER_ROLE.super_admin,
];

// Accepted `sortBy` values for GET /property-contracts → field path in the
// aggregated document.
export const PROPERTY_CONTRACT_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  closingDate: 'closingDate',
  buyerName: 'buyerName',
  titleCompany: 'titleCompany',
  previousStatus: 'previousStatus',
  status: 'property.status',
  listingPrice: 'property.listingPrice',
  streetAddress: 'property.streetAddress',
  city: 'property.city',
  sellerName: 'seller.name',
  // NEW FLOW: contract details from accepted offers
  certifiedAt: 'certifiedAt',
  buyerContactSource: 'buyerContactSource',
  source: 'source',
};

export const PROPERTY_CONTRACT_DEFAULT_LIMIT = 10;
export const PROPERTY_CONTRACT_MAX_LIMIT = 100;

// Admin dashboard route for the Property Contracts page.
export const PROPERTY_CONTRACTS_DASHBOARD_PATH = '/property-contracts';

// Timezone used for the "submitted at" timestamp in the admin email.
export const ADMIN_EMAIL_TIMEZONE = 'America/New_York';

export const NOT_PROVIDED = 'Not provided';
