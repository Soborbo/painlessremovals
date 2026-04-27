/**
 * VALIDATION SCHEMAS
 *
 * Zod schemas for request validation
 */

import { z } from 'zod';

/**
 * Recursion-safe unknown value: allows primitives, arrays, and objects
 * but caps nesting depth to prevent DoS via deeply nested payloads.
 */
function boundedUnknown(maxDepth = 5): z.ZodType<unknown> {
  if (maxDepth <= 0) {
    return z.union([z.string(), z.number(), z.boolean(), z.null()]);
  }
  return z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.lazy(() => boundedUnknown(maxDepth - 1))).max(100),
    z.record(z.string(), z.lazy(() => boundedUnknown(maxDepth - 1))),
  ]);
}

/**
 * Email validation
 *
 * Zod 4's `z.email()` validates its input against the email regex before
 * any chained transforms run, so putting `.trim()`/`.toLowerCase()` after
 * it means a pasted `"  USER@EXAMPLE.COM  "` is rejected before the
 * whitespace is ever stripped. Route the raw string through a string
 * schema first (which does trim/lowercase as transforms), then `.pipe()`
 * into the email validator so the normalized value is what gets checked.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('Invalid email address')
      .min(5, 'Email too short')
      .max(255, 'Email too long')
  );

/**
 * Phone validation (international)
 *
 * Accepts an optional leading +, an optional country-code in parens, and
 * a mix of digits plus standard separators (space, dash, dot, slash).
 * Must contain at least 7 digits in total to catch typos.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Phone number too short')
  .max(20, 'Phone number too long')
  .regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/, 'Invalid phone number')
  .refine(
    (v) => (v.match(/\d/g) ?? []).length >= 7,
    'Phone number must contain at least 7 digits'
  );

/**
 * Name validation
 *
 * Unicode letters + spaces, hyphens, apostrophes and dots are allowed so
 * legitimate names like "O'Brien", "Jean-Luc" and "J. K. Rowling" pass,
 * while control characters, numbers and symbols are rejected — they're
 * typically typos or injection attempts that then land in email
 * subjects / CRM records.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name too short')
  .max(100, 'Name too long')
  .regex(/^[\p{L}][\p{L}\s'.\-]*$/u, 'Name contains invalid characters');

/**
 * Language validation
 */
export const languageSchema = z.enum(['en', 'es', 'fr']);

/**
 * Currency validation
 */
export const currencySchema = z.enum(['HUF', 'EUR', 'USD', 'GBP']);

/**
 * Quote save schema
 */
export const saveQuoteSchema = z.object({
  // Calculator data (depth-limited to prevent DoS)
  data: z.record(z.string(), boundedUnknown()),
  totalPrice: z.number().nonnegative('Price must be zero or positive'),
  breakdown: z.record(z.string(), z.number()).optional(),
  currency: currencySchema.default('GBP'),

  // Contact info (optional)
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),

  // Language
  language: languageSchema.default('en'),

  // Marketing params (optional)
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_term: z.string().max(100).optional(),
  utm_content: z.string().max(100).optional(),
  gclid: z.string().max(200).optional(),

  // Quote URL (for email link-back) — must be from allowed origins
  quoteUrl: z.url().max(2000)
    .refine(
      (u) => {
        try {
          const host = new URL(u).hostname;
          return host === 'localhost' || host.endsWith('painlessremovals.com');
        } catch { return false; }
      },
      'URL must be from an allowed origin'
    ).optional(),

  // Tracking — the client-side `event_id` for the quote conversion.
  // Optional: if present, the server-side GA4 MP mirror tags its event
  // with the same id so downstream BigQuery joins can correlate
  // browser + server hits for the same conversion.
  event_id: z.string().max(200).optional(),
});

/**
 * Calculate schema (for calculation endpoint)
 */
export const calculateSchema = z.object({
  step: z.string().min(1).max(50),
  data: z.record(z.string(), boundedUnknown()),
  language: languageSchema.default('en'),
});

/**
 * Validate step schema (for step validation)
 */
export const validateStepSchema = z.object({
  step: z.string().min(1).max(50),
  data: z.record(z.string(), boundedUnknown()),
});

/**
 * Email send schema
 */
export const sendEmailSchema = z.object({
  to: z.union([emailSchema, z.array(emailSchema)]),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  replyTo: emailSchema.optional(),
});

/**
 * Contact form schema
 */
export const contactFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  message: z.string().min(10, 'Message too short').max(1000, 'Message too long'),
  subject: z.string().max(200).optional(),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

/**
 * Date range schema
 */
export const dateRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

/**
 * ID schema
 */
export const idSchema = z.number().int().positive();

/**
 * UUID schema
 */
export const uuidSchema = z.uuid();

// Type exports
export type SaveQuoteInput = z.infer<typeof saveQuoteSchema>;
export type CalculateInput = z.infer<typeof calculateSchema>;
export type ValidateStepInput = z.infer<typeof validateStepSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
