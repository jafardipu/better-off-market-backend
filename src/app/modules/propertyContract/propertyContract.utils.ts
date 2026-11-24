import fs from 'fs';
import path from 'path';
import config from '../../config';
import { sendEmail } from '../../utils/mailSender';
import { User } from '../user/user.models';
import { IProperty } from '../properties/properties.interface';
import { STATUS } from '../properties/properties.constants';
import { sendNotificationMessage } from '../notification/notification.utils';
import { NOTIFICATION_TYPE } from '../notification/notification.constant';
// NEW FLOW: buyer activity (needs-review check)
import { BuyerActivity } from '../buyerActivity/buyerActivity.models';
import { hasAnyBuyerActivity } from '../buyerActivity/buyerActivity.utils';
import { IPropertyContract } from './propertyContract.interface';
import {
  ADMIN_EMAIL_TIMEZONE,
  BUYER_CONTACT_SOURCE_LABELS,
  NEEDS_REVIEW_CONTACT_SOURCES,
  NEEDS_REVIEW_MESSAGE,
  NOT_PROVIDED,
  PROPERTY_CONTRACTS_DASHBOARD_PATH,
} from './propertyContract.constants';

// ============================== input helpers ==============================

// Strict 24-hex check; mongoose's isValid() also accepts any 12-char string.
export const isObjectIdString = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

// Empty / whitespace-only strings count as "not provided" (null).
export const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Trimmed string, or null when missing, blank or not a string.
export const cleanOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Parses "YYYY-MM-DD" into a Date at UTC midnight. Returns null for anything
// else, including impossible dates like 2026-02-30.
export const parseDateOnly = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ============================== formatting ==============================

const pad2 = (n: number) => String(n).padStart(2, '0');

// closingDate is stored as UTC midnight, so read it back in UTC.
export const formatDateMMDDYYYY = (date: Date) =>
  `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}-${date.getUTCFullYear()}`;

export const formatSubmittedAt = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_EMAIL_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';

  return `${get('month')}-${get('day')}-${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`;
};

export const formatCurrency = (amount: unknown) => {
  // Number(undefined) is NaN; null needs its own check because Number(null) is 0.
  const value = Number(amount);
  if (amount === null || !Number.isFinite(value)) {
    return NOT_PROVIDED;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const orNotProvided = (value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : NOT_PROVIDED;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

// ============================== admin alerts ==============================

const templatePath = path.join(
  __dirname,
  '../../../../public/view/property_under_contract.html',
);

type TAlertUser = {
  _id?: { toString(): string };
  name?: string;
  email?: string;
  phoneNumber?: string;
  fcmToken?: string;
};

type TContractAlertInput = {
  contract: IPropertyContract;
  property: IProperty;
  sellerId: string;
};

// NEW FLOW: extra facts for the admin alerts.
type TContractAlertExtras = {
  // The answer was "independent"/"unsure" and the buyer has activity on this listing.
  needsReview: boolean;
};

// NEW FLOW: from an accepted offer the property may already have been Under
// Contract, in which case its status did not change.
const statusWasUnchanged = (contract: IPropertyContract) =>
  contract.previousStatus === STATUS.under_contact;

// Inserted into the email as raw HTML (fixed text, no user input).
const NEEDS_REVIEW_NOTICE_HTML = `<p style="margin: 16px 0 0; padding: 12px 16px; border-radius: 8px; background: #fff4e5; color: #8a4b00; font-weight: 600;">${NEEDS_REVIEW_MESSAGE}</p>`;

const fullAddress = (property: IProperty) =>
  [
    property.streetAddress,
    property.city,
    [property.state, property.zipCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

const sendAdminContractEmail = async (
  admin: TAlertUser,
  seller: TAlertUser | null,
  { contract, property }: TContractAlertInput,
  { needsReview }: TContractAlertExtras,
) => {
  const to = admin.email?.trim();
  if (!to) {
    console.warn('Property contract email skipped: admin user has no email');
    return;
  }

  const contractId = contract._id?.toString() ?? '';
  const dashboardBase = (config.admin_dashboard_url ?? '').replace(/\/+$/, '');
  const submittedAt = contract.createdAt
    ? new Date(contract.createdAt)
    : new Date();

  const unchanged = statusWasUnchanged(contract);

  const replacements: Record<string, string> = {
    title: 'Property Under Contract',
    userName: admin.name?.trim() || 'Admin',
    // NEW FLOW: wording for a property that was already Under Contract
    intro: unchanged
      ? 'A seller has submitted contract details for a property that was already Under Contract.'
      : 'A seller has marked their property as Under Contract.',
    propertyAddress: orNotProvided(fullAddress(property)),
    listingPrice: formatCurrency(property.listingPrice),
    statusChange: unchanged
      ? `${STATUS.under_contact} (unchanged)`
      : `${contract.previousStatus} → ${STATUS.under_contact}`,
    sellerName: orNotProvided(seller?.name),
    sellerEmail: orNotProvided(seller?.email),
    sellerPhone: orNotProvided(seller?.phoneNumber),
    buyerName: orNotProvided(contract.buyerName),
    closingDate: contract.closingDate
      ? formatDateMMDDYYYY(new Date(contract.closingDate))
      : NOT_PROVIDED,
    titleCompany: orNotProvided(contract.titleCompany),
    submittedAt: formatSubmittedAt(submittedAt),
    // NEW FLOW: contact source, certification and offer link
    buyerContactSource: contract.buyerContactSource
      ? (BUYER_CONTACT_SOURCE_LABELS[contract.buyerContactSource] ?? NOT_PROVIDED)
      : NOT_PROVIDED,
    certifiedAt: contract.certifiedAt
      ? formatSubmittedAt(new Date(contract.certifiedAt))
      : NOT_PROVIDED,
    fromAcceptedOffer: contract.offer ? 'Yes' : 'No',
    actionUrl: `${dashboardBase}${PROPERTY_CONTRACTS_DASHBOARD_PATH}?contractId=${encodeURIComponent(contractId)}`,
    year: new Date().getFullYear().toString(),
  };

  // Every value is HTML-escaped, including actionUrl (valid inside href).
  // The replacer function stops `$` in user input being read as a pattern.
  const html = Object.entries(replacements)
    .reduce(
      (content, [placeholder, value]) => {
        const safeValue = escapeHtml(value);
        return content.replace(new RegExp(`{{${placeholder}}}`, 'g'), () => safeValue);
      },
      fs.readFileSync(templatePath, 'utf8'),
    )
    // NEW FLOW: fixed HTML, so it is inserted unescaped.
    .replace(/{{needsReviewNotice}}/g, () =>
      needsReview ? NEEDS_REVIEW_NOTICE_HTML : '',
    );

  const subject = `Property Under Contract: ${[property.streetAddress, property.city]
    .filter(Boolean)
    .join(', ')}`;

  await sendEmail(to, subject, html);
};

const sendAdminContractNotification = async (
  admin: TAlertUser,
  seller: TAlertUser | null,
  { contract, property }: TContractAlertInput,
  { needsReview }: TContractAlertExtras,
) => {
  const contractId = contract._id?.toString() ?? '';
  const propertyId = property._id?.toString() ?? '';
  const sellerName = seller?.name?.trim() || 'A seller';
  const shortAddress = [property.streetAddress, property.city]
    .filter(Boolean)
    .join(', ');

  // NEW FLOW: already-Under-Contract wording and the needs-review flag.
  const description = [
    statusWasUnchanged(contract)
      ? `Status was already ${STATUS.under_contact}.`
      : `Status changed from ${contract.previousStatus} to ${STATUS.under_contact}.`,
    needsReview ? NEEDS_REVIEW_MESSAGE : '',
  ]
    .filter(Boolean)
    .join(' ');

  await sendNotificationMessage({
    type: NOTIFICATION_TYPE.property_under_contract,
    title: 'Property under contract',
    message: `${sellerName} marked ${shortAddress} as Under Contract`,
    description,
    userId: admin._id!.toString(),
    fcmToken: admin.fcmToken,
    link: `${PROPERTY_CONTRACTS_DASHBOARD_PATH}?contractId=${contractId}`,
    metadata: { contractId, propertyId },
  });
};

// NEW FLOW: true when the seller answered "independent" or "unsure" AND the
// buyer has BetterOffMarket activity on this listing. Only offer-flow
// contracts have a linked buyer. A failed lookup is logged and counts as false.
const contractNeedsReview = async (contract: IPropertyContract) => {
  if (
    !contract.buyer ||
    !contract.buyerContactSource ||
    !NEEDS_REVIEW_CONTACT_SOURCES.includes(contract.buyerContactSource)
  ) {
    return false;
  }
  try {
    const activity = await BuyerActivity.findOne({
      buyer: contract.buyer,
      property: contract.property,
    }).lean();
    return hasAnyBuyerActivity(activity);
  } catch (error) {
    console.error(
      `Property contract ${contract._id?.toString()}: buyer activity lookup failed:`,
      error,
    );
    return false;
  }
};

// Sends the admin email and the admin dashboard notification. Each failure is
// logged on its own and never thrown, so callers can fire-and-forget safely.
export const notifyAdminsOfPropertyContract = async (
  input: TContractAlertInput,
) => {
  const contractId = input.contract._id?.toString();

  try {
    const [admin, seller] = await Promise.all([
      User.GetAdminUser(),
      User.GetUserById(input.sellerId),
    ]);

    if (!admin?._id) {
      console.warn(
        `Property contract ${contractId}: no admin user found, alerts skipped`,
      );
      return;
    }

    // NEW FLOW: needs-review check for the admin alerts.
    const extras: TContractAlertExtras = {
      needsReview: await contractNeedsReview(input.contract),
    };

    const [emailResult, notificationResult] = await Promise.allSettled([
      sendAdminContractEmail(admin, seller, input, extras),
      sendAdminContractNotification(admin, seller, input, extras),
    ]);

    if (emailResult.status === 'rejected') {
      console.error(
        `Property contract ${contractId}: admin email failed:`,
        emailResult.reason,
      );
    }
    if (notificationResult.status === 'rejected') {
      console.error(
        `Property contract ${contractId}: admin notification failed:`,
        notificationResult.reason,
      );
    }
  } catch (error) {
    console.error(
      `Property contract ${contractId}: admin alerts failed:`,
      error,
    );
  }
};
