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
 * Phone validation (UK)
 *
 * Mirrors the calculator's client-side regex
 * (`Step11Contact.tsx:PHONE_REGEX`) so that a value passing the client
 * also passes the server. Any whitespace is stripped before the regex
 * runs so paste-with-spaces still validates. Calculator + callbacks
 * are UK-only flows; if a non-UK endpoint is added, define a
 * separate schema rather than loosening this one.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Phone number too short')
  .max(20, 'Phone number too long')
  .transform((v) => v.replace(/\s/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+44|0)\d{9,10}$/,
        'Please enter a valid UK phone number'
      )
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

  // Quote URL payload (for email link-back). The CLIENT sends the
  // urlsafe-base64 encoded payload only; the SERVER signs it with
  // HMAC and assembles the full URL. This keeps the secret server-side
  // and prevents a hostile client from crafting a URL that points off-
  // domain or with arbitrary content.
  quoteUrlPayload: z.string().max(4096).regex(/^[A-Za-z0-9_-]+$/, 'Invalid encoded payload').optional(),

  // Tracking — the client-side `event_id` for the quote conversion.
  // Optional: if present, the server-side GA4 MP mirror tags its event
  // with the same id so downstream BigQuery joins can correlate
  // browser + server hits for the same conversion.
  event_id: z.string().max(200).optional(),
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
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
