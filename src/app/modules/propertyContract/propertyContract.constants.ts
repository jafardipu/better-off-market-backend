import { STATUS } from '../properties/properties.constants';
import { USER_ROLE } from '../user/user.constants';

// Property statuses from which a seller may mark the listing Under Contract.
export const CONTRACT_ALLOWED_FROM_STATUSES: string[] = [
  STATUS.active,
  STATUS.pending,
];

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
};

export const PROPERTY_CONTRACT_DEFAULT_LIMIT = 10;
export const PROPERTY_CONTRACT_MAX_LIMIT = 100;

// Admin dashboard route for the Property Contracts page.
export const PROPERTY_CONTRACTS_DASHBOARD_PATH = '/property-contracts';

// Timezone used for the "submitted at" timestamp in the admin email.
export const ADMIN_EMAIL_TIMEZONE = 'America/New_York';

export const NOT_PROVIDED = 'Not provided';
