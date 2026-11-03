import { z } from 'zod';
import {
    PROPERTY_TYPES,
    BASIC_INFO_CONFIG,
    CLOSING_DATE_OPTIONS,
    USE_TYPE_OPTIONS,
} from './properties.constants';


const locationSchema = z.object({
    type: z.literal('Point'),

    coordinates: z
        .array(z.number())
        .length(2, 'Coordinates must contain [longitude, latitude]'),
});

// Files arrive as uploaded S3 URLs by the time they hit validation
// (multer + your upload-to-S3 middleware runs first), so these are strings.
const createPropertyValidationSchema = z
    .object({
        body: z.object({
            propertyType: z.enum(PROPERTY_TYPES).refine(
                (val) => val,
                { message: 'Property type is required' }
            ),

            useType: z.string().optional(),
            useTypeOther: z.string().optional(),

            // Ownership
            ownership: z.enum(['own', 'assignable'], {
                message: 'Select an ownership type',
            }),


            // Location
            location: locationSchema,

            // Basic Information
            streetAddress: z.string().min(1, 'Street address is required'),
            state: z.string().min(1, 'State is required'),
            city: z.string().min(1, 'City is required'),
            zipCode: z.string().min(5, 'Enter a valid ZIP code'),
            county: z.string().min(1, 'County is required'),
            parcelIds: z.string().optional(),
            listingPrice: z.coerce
                .number({ invalid_type_error: 'Enter a valid amount' })
                .positive('Listing price is required'),
            buyItNowPrice: z.coerce.number().optional(),
            arv: z.coerce.number().optional(),
            marketingDescription: z
                .string()
                .min(1, 'Marketing description is required')
                .max(3000),
            utilities: z.string().optional(),

            specifications: z
                .record(z.string(), z.union([z.string(), z.number()]).optional())
                .default({})
                .transform((obj) => {
                    // drop keys with undefined values so downstream code doesn't have to deal with them
                    return Object.fromEntries(
                        Object.entries(obj).filter(([, v]) => v !== undefined),
                    ) as Record<string, string | number>;
                }),

            // Major Components & Ages
            roofMaterial: z.string().optional(),
            roofAge: z.coerce.number().optional(),
            heatingSystem: z.string().optional(),
            heatingAge: z.coerce.number().optional(),
            cooling: z.string().optional(),
            coolingAge: z.coerce.number().optional(),
            waterHeating: z.string().optional(),
            waterHeatingAge: z.coerce.number().optional(),
            water: z.string().optional(),
            sewer: z.string().optional(),
            foundation: z.string().optional(),
            otherUpdates: z.string().optional(),
            roofMaterialOther: z.string().optional(),
            heatingSystemOther: z.string().optional(),
            coolingOther: z.string().optional(),
            waterHeatingOther: z.string().optional(),
            waterOther: z.string().optional(),
            sewerOther: z.string().optional(),
            foundationOther: z.string().optional(),

            // HOA
            hasHoa: z.enum(['yes', 'no']).default('no'),
            hoaAmount: z.coerce.number().optional(),
            hoaFrequency: z.enum(['Monthly', 'Quarterly', 'Annually']).optional(),
            hoaIncludes: z.string().optional(),

            // Closing
            titleCompany: z.string().optional(),
            closingDate: z.string(),

            // Files — arrays of S3 URLs from upload middleware
            photos: z
                .array(z.string())
                .min(5, 'Minimum 5 high-res photos required'),

            documents: z
                .array(
                    z.object({
                        name: z.string(),
                        size: z.string(),
                        updated: z.string(),
                        url: z.string(),
                    }),
                )
                .optional(),

            openHouse: z.object({
                date: z.string(),
                startTime: z.string(),
                endTime: z.string(),
            }).optional(),
        }),
    })
    .superRefine((data, ctx) => {
        const body = data.body;
        const config = BASIC_INFO_CONFIG[body.propertyType];

        if (config?.showParcelId && !body.parcelIds?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['body', 'parcelIds'],
                message: 'Parcel ID(s) are required for this property type',
            });
        }
        if (config?.showBuyItNowPrice && !body.buyItNowPrice) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['body', 'buyItNowPrice'],
                message: 'Buy it now price is required',
            });
        }
        if (body.hasHoa === 'yes' && !body.hoaAmount) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['body', 'hoaAmount'],
                message: 'HOA amount is required',
            });
        }
    });

const updatePropertyValidationSchema = z.object({
    body: z.object({
        propertyType: z.enum(PROPERTY_TYPES, {
            required_error: 'Property type is required',
        }).optional(),
        useType: z.enum(USE_TYPE_OPTIONS).optional(),
        useTypeOther: z.string().optional(),
        ownership: z.enum(['own', 'assignable']).optional(),
        location: locationSchema.optional(),
        streetAddress: z.string().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        zipCode: z.string().optional(),
        county: z.string().optional(),
        parcelIds: z.string().optional(),
        listingPrice: z.coerce.number().positive().optional(),
        oldListingPrice: z.coerce.number().positive().optional(),
        buyItNowPrice: z.coerce.number().optional(),
        arv: z.coerce.number().optional(),
        marketingDescription: z.string().max(3000).optional(),
        utilities: z.string().optional(),
        specifications: z
            .record(z.string(), z.union([z.string(), z.number()]))
            .optional(),
        hasHoa: z.enum(['yes', 'no']).optional(),
        hoaAmount: z.coerce.number().optional(),
        hoaFrequency: z.enum(['Monthly', 'Quarterly', 'Annually']).optional(),
        hoaIncludes: z.string().optional(),
        titleCompany: z.string().optional(),
        closingDate: z.string().optional(),
        photos: z.array(z.string()).optional(),
        documents: z
            .array(
                z.object({
                    name: z.string(),
                    size: z.string(),
                    updated: z.string(),
                    url: z.string(),
                }),
            )
            .optional(),
        openHouse: z.object({
            date: z.string(),
            startTime: z.string(),
            endTime: z.string(),
        }).optional(),
        status: z.string().optional(),
    }),
});

export const propertyValidation = {
    createPropertyValidationSchema,
    updatePropertyValidationSchema,
};