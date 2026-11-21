import { z } from 'zod';
const createFaqsValidationSchema = z.object({
    body: z.object({
        question: z.string({ required_error: 'Question is required' }),
        answer: z.string({ required_error: 'Answer is required' }),
    }),
});

const updateFaqsValidationSchema = z.object({
    body: z.object({
        question: z.string({ required_error: 'Question is required' }).optional(),
        answer: z.string({ required_error: 'Answer is required' }).optional(),
    }),
});

const reorderFaqsValidationSchema = z.object({
    body: z.object({
        orders: z
            .array(
                z.object({
                    id: z.string({ required_error: 'FAQ id is required' }),
                    order: z.coerce.number({
                        required_error: 'order is required',
                        invalid_type_error: 'order must be a number',
                    }),
                }),
            )
            .min(1, 'orders must include at least one FAQ'),
    }),
});

export const faqsValidation = {
    createFaqsValidationSchema,
    updateFaqsValidationSchema,
    reorderFaqsValidationSchema,
};