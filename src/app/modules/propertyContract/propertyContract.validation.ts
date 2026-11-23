import { z } from 'zod';
import {
  BUYER_NAME_MAX_LENGTH,
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
  }),
});

export const propertyContractValidation = {
  createPropertyContractValidationSchema,
};
