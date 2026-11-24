import { z } from 'zod';
import {
  BUYER_CONTACT_SOURCE_REQUIRED_MESSAGE,
  BUYER_CONTACT_SOURCES,
  BUYER_NAME_MAX_LENGTH,
  CERTIFICATION_REQUIRED_MESSAGE,
  TITLE_COMPANY_MAX_LENGTH,
} from './propertyContract.constants';
import {
  blankToNull,
  isObjectIdString,
  parseDateOnly,
} from './propertyContract.utils';

// Missing, null, empty and whitespace-only values are all "not provided".
const optionalText = (label: string, max: number) =>
  z.preprocess(
    blankToNull,
    z
      .string({ invalid_type_error: `${label} must be text` })
      .trim()
      .max(max, `${label} must be ${max} characters or fewer`)
      .nullish(),
  );

const createPropertyContractValidationSchema = z.object({
  body: z.object({
    propertyId: z
      .string({
        required_error: 'propertyId is required',
        invalid_type_error: 'propertyId must be a string',
      })
      .trim()
      .refine(isObjectIdString, 'propertyId is not a valid id'),
    buyerName: optionalText('Buyer name', BUYER_NAME_MAX_LENGTH),
    closingDate: z.preprocess(
      blankToNull,
      z
        .string({
          invalid_type_error: 'Anticipated closing date must be a date (YYYY-MM-DD)',
        })
        .trim()
        .refine(
          value => parseDateOnly(value) !== null,
          'Anticipated closing date must be a valid date (YYYY-MM-DD)',
        )
        .nullish(),
    ),
    titleCompany: optionalText('Title company', TITLE_COMPANY_MAX_LENGTH),

    // NEW FLOW: sent when the pop-up is opened from an accepted offer.
    offerId: z.preprocess(
      blankToNull,
      z
        .string({ invalid_type_error: 'offerId must be a string' })
        .trim()
        .refine(isObjectIdString, 'offerId is not a valid id')
        .nullish(),
    ),
    // NEW FLOW: required answer and certification (manual and offer flows).
    buyerContactSource: z.enum(
      BUYER_CONTACT_SOURCES as [string, ...string[]],
      { errorMap: () => ({ message: BUYER_CONTACT_SOURCE_REQUIRED_MESSAGE }) },
    ),
    certified: z.literal(true, {
      errorMap: () => ({ message: CERTIFICATION_REQUIRED_MESSAGE }),
    }),
  }),
});

export const propertyContractValidation = {
  createPropertyContractValidationSchema,
};
