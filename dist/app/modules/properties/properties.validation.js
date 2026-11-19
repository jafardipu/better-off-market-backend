"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertyValidation = void 0;
const zod_1 = require("zod");
const properties_constants_1 = require("./properties.constants");
const locationSchema = zod_1.z.object({
    type: zod_1.z.literal('Point'),
    coordinates: zod_1.z
        .array(zod_1.z.number())
        .length(2, 'Coordinates must contain [longitude, latitude]'),
});
// Files arrive as uploaded S3 URLs by the time they hit validation
// (multer + your upload-to-S3 middleware runs first), so these are strings.
const createPropertyValidationSchema = zod_1.z
    .object({
    body: zod_1.z.object({
        propertyType: zod_1.z.enum(properties_constants_1.PROPERTY_TYPES).refine((val) => val, { message: 'Property type is required' }),
        useType: zod_1.z.string().optional(),
        useTypeOther: zod_1.z.string().optional(),
        // Ownership
        ownership: zod_1.z.enum(['own', 'assignable'], {
            message: 'Select an ownership type',
        }),
        // Location
        location: locationSchema,
        // Basic Information
        streetAddress: zod_1.z.string().min(1, 'Street address is required'),
        state: zod_1.z.string().min(1, 'State is required'),
        city: zod_1.z.string().min(1, 'City is required'),
        zipCode: zod_1.z.string().min(5, 'Enter a valid ZIP code'),
        county: zod_1.z.string().min(1, 'County is required'),
        parcelIds: zod_1.z.string().nullish(),
        listingPrice: zod_1.z.coerce
            .number({ invalid_type_error: 'Enter a valid amount' })
            .positive('Listing price is required'),
        buyItNowPrice: zod_1.z.coerce.number().optional(),
        arv: zod_1.z.coerce.number().optional(),
        marketingDescription: zod_1.z
            .string()
            .min(1, 'Marketing description is required')
            .max(3000),
        utilities: zod_1.z.string().optional(),
        specifications: zod_1.z
            .record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional())
            .default({})
            .transform((obj) => {
            // drop keys with undefined values so downstream code doesn't have to deal with them
            return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
        }),
        // Major Components & Ages
        roofMaterial: zod_1.z.string().optional(),
        roofAge: zod_1.z.coerce.number().optional(),
        heatingSystem: zod_1.z.string().optional(),
        heatingAge: zod_1.z.coerce.number().optional(),
        cooling: zod_1.z.string().optional(),
        coolingAge: zod_1.z.coerce.number().optional(),
        waterHeating: zod_1.z.string().optional(),
        waterHeatingAge: zod_1.z.coerce.number().optional(),
        water: zod_1.z.string().optional(),
        sewer: zod_1.z.string().optional(),
        foundation: zod_1.z.string().optional(),
        otherUpdates: zod_1.z.string().optional(),
        roofMaterialOther: zod_1.z.string().optional(),
        heatingSystemOther: zod_1.z.string().optional(),
        coolingOther: zod_1.z.string().optional(),
        waterHeatingOther: zod_1.z.string().optional(),
        waterOther: zod_1.z.string().optional(),
        sewerOther: zod_1.z.string().optional(),
        foundationOther: zod_1.z.string().optional(),
        // HOA
        hasHoa: zod_1.z.enum(['yes', 'no']).default('no'),
        hoaAmount: zod_1.z.coerce.number().optional(),
        hoaFrequency: zod_1.z.enum(['Monthly', 'Quarterly', 'Annually']).optional(),
        hoaIncludes: zod_1.z.string().optional(),
        // Closing
        titleCompany: zod_1.z.string().optional(),
        closingDate: zod_1.z.string(),
        // Files — arrays of S3 URLs from upload middleware
        photos: zod_1.z
            .array(zod_1.z.string())
            .min(5, 'Minimum 5 high-res photos required'),
        documents: zod_1.z
            .array(zod_1.z.object({
            name: zod_1.z.string(),
            size: zod_1.z.string(),
            updated: zod_1.z.string(),
            url: zod_1.z.string(),
        }))
            .optional(),
        openHouse: zod_1.z.object({
            date: zod_1.z.string(),
            startTime: zod_1.z.string(),
            endTime: zod_1.z.string(),
        }).optional(),
    }),
})
    .superRefine((data, ctx) => {
    const body = data.body;
    const config = properties_constants_1.BASIC_INFO_CONFIG[body.propertyType];
    if ((config === null || config === void 0 ? void 0 : config.showBuyItNowPrice) && !body.buyItNowPrice) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['body', 'buyItNowPrice'],
            message: 'Buy it now price is required',
        });
    }
    if (body.hasHoa === 'yes' && !body.hoaAmount) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['body', 'hoaAmount'],
            message: 'HOA amount is required',
        });
    }
});
const updatePropertyValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        propertyType: zod_1.z.enum(properties_constants_1.PROPERTY_TYPES, {
            required_error: 'Property type is required',
        }).optional(),
        useType: zod_1.z.string().optional(),
        useTypeOther: zod_1.z.string().optional(),
        ownership: zod_1.z.enum(['own', 'assignable']).optional(),
        location: locationSchema.optional(),
        streetAddress: zod_1.z.string().optional(),
        state: zod_1.z.string().optional(),
        city: zod_1.z.string().optional(),
        zipCode: zod_1.z.string().optional(),
        county: zod_1.z.string().optional(),
        parcelIds: zod_1.z.string().nullish(),
        listingPrice: zod_1.z.coerce.number().positive().optional(),
        oldListingPrice: zod_1.z.coerce.number().positive().optional(),
        buyItNowPrice: zod_1.z.coerce.number().optional(),
        arv: zod_1.z.coerce.number().optional(),
        marketingDescription: zod_1.z.string().max(3000).optional(),
        utilities: zod_1.z.string().optional(),
        specifications: zod_1.z
            .record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number()]))
            .optional(),
        hasHoa: zod_1.z.enum(['yes', 'no']).optional(),
        hoaAmount: zod_1.z.coerce.number().optional(),
        hoaFrequency: zod_1.z.enum(['Monthly', 'Quarterly', 'Annually']).optional(),
        hoaIncludes: zod_1.z.string().optional(),
        titleCompany: zod_1.z.string().optional(),
        closingDate: zod_1.z.string().optional(),
        photos: zod_1.z.array(zod_1.z.string()).optional(),
        documents: zod_1.z
            .array(zod_1.z.object({
            name: zod_1.z.string(),
            size: zod_1.z.string(),
            updated: zod_1.z.string(),
            url: zod_1.z.string(),
        }))
            .optional(),
        openHouse: zod_1.z.object({
            date: zod_1.z.string(),
            startTime: zod_1.z.string(),
            endTime: zod_1.z.string(),
        }).optional(),
        status: zod_1.z.string().optional(),
    }),
});
exports.propertyValidation = {
    createPropertyValidationSchema,
    updatePropertyValidationSchema,
};
