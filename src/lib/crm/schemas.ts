/**
 * Zod schemas mirroring the Painless-CRM inbound webhook receivers.
 *
 * These mirror the CRM's own Zod constraints so bad input fails fast on our
 * server endpoint with a useful message, instead of bouncing off the CRM as
 * an opaque 400. Keep these byte-aligned with the CRM schemas — a drift here
 * means we ship payloads the CRM silently rejects.
 *
 * Schemas here describe the EVENT-SPECIFIC body only. The transport envelope
 * (`event_id`, `source`, `company_id`) is added by `client.ts` at send time;
 * see `webhookEnvelopeSchema` for its shape.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** CRM phone constraint: 7–20 chars, only +, digits, spaces, (), -. */
const PHONE_REGEX = /^[+0-9 ()-]+$/;

/**
 * Permissive uuid (canonical 8-4-4-4-12 hex). Deliberately NOT Zod 4's
 * `z.uuid()`, which enforces RFC 9562 version/variant nibbles — our sender
 * must not be STRICTER than the CRM's verifier, or we'd reject ids the CRM
 * would happily accept.
 */
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuidField = (msg: string) => z.string().regex(UUID_REGEX, msg);

const phoneField = z
  .string()
  .min(7, 'Phone too short')
  .max(20, 'Phone too long')
  .regex(PHONE_REGEX, 'Phone contains invalid characters');

const postcodeField = z.string().min(2, 'Postcode too short').max(12, 'Postcode too long');

/**
 * Shared customer object. `postcode` is OPTIONAL here and REQUIRED only on
 * the /quote payload (see `quoteWebhookSchema`).
 */
export const contactDetailsSchema = z.object({
  full_name: z.string().min(1, 'Name required').max(160, 'Name too long'),
  email: z.email('Invalid email').max(160, 'Email too long'),
  phone: phoneField,
  postcode: postcodeField.optional(),
});
export type ContactDetails = z.infer<typeof contactDetailsSchema>;

/** Same as `contactDetailsSchema` but with `postcode` required (for /quote). */
export const contactDetailsWithPostcodeSchema = contactDetailsSchema.extend({
  postcode: postcodeField,
});

export const addressSchema = z.object({
  line1: z.string().min(1, 'line1 required').max(160),
  line2: z.string().max(160).optional(),
  city: z.string().min(1, 'city required').max(80),
  postcode: postcodeField,
});
export type Address = z.infer<typeof addressSchema>;

// ---------------------------------------------------------------------------
// 1) /api/webhooks/quote
// ---------------------------------------------------------------------------

export const quoteDetailsSchema = z.object({
  pricing_version_id: uuidField('pricing_version_id must be a uuid'),
  size_code: z.string().min(1).max(40),
  distance_miles: z.number().min(0, 'distance_miles must be >= 0'),
  complications: z.array(z.string()).default([]),
  total_pence: z.int().min(0, 'total_pence must be >= 0'),
});

export const quoteWebhookSchema = z.object({
  customer: contactDetailsWithPostcodeSchema,
  addresses: z
    .object({
      from: addressSchema,
      to: addressSchema,
    })
    .optional(),
  quote: quoteDetailsSchema.optional(),
});
export type QuoteWebhookPayload = z.infer<typeof quoteWebhookSchema>;

// ---------------------------------------------------------------------------
// 2) /api/webhooks/contact
// ---------------------------------------------------------------------------

export const contactWebhookSchema = z.object({
  customer: contactDetailsSchema,
  message: z.string().max(4000).optional(),
  preferred_contact: z.enum(['email', 'phone', 'whatsapp']).optional(),
});
export type ContactWebhookPayload = z.infer<typeof contactWebhookSchema>;

// ---------------------------------------------------------------------------
// 3) /api/webhooks/callback  &  4) /api/webhooks/clearance-callback
//    (identical body — the CRM stamps `kind` server-side)
// ---------------------------------------------------------------------------

export const callbackWebhookSchema = z.object({
  customer: contactDetailsSchema,
  preferred_window: z.string().max(120).optional(),
  property_postcode: postcodeField.optional(),
  message: z.string().max(2000).optional(),
});
export type CallbackWebhookPayload = z.infer<typeof callbackWebhookSchema>;

// ---------------------------------------------------------------------------
// 5) /api/webhooks/affiliate
// ---------------------------------------------------------------------------

export const attributionSchema = z.object({
  source: z.string().max(40).optional(),
  campaign: z.string().max(120).optional(),
  utm_source: z.string().max(80).optional(),
  utm_medium: z.string().max(80).optional(),
  utm_campaign: z.string().max(120).optional(),
  gclid: z.string().max(200).optional(),
  fbclid: z.string().max(200).optional(),
  landing_page: z.string().max(500).optional(),
});
export type Attribution = z.infer<typeof attributionSchema>;

export const affiliateWebhookSchema = z.object({
  affiliate_code: z.string().min(1, 'affiliate_code required').max(80),
  customer: contactDetailsSchema,
  message: z.string().max(2000).optional(),
  attribution: attributionSchema.optional(),
});
export type AffiliateWebhookPayload = z.infer<typeof affiliateWebhookSchema>;

// ---------------------------------------------------------------------------
// 6) /api/webhooks/partner-register
// ---------------------------------------------------------------------------

export const partnerRegisterWebhookSchema = z.object({
  partner: z.object({
    name: z.string().min(1).max(160),
    type: z
      .enum(['estate_agent', 'B2B_partner', 'individual', 'other'])
      .default('B2B_partner'),
    contact_name: z.string().min(1).max(160),
    contact_email: z.email('Invalid email').max(160),
    contact_phone: phoneField,
    website: z.url('Invalid URL').max(500).optional(),
    notes: z.string().max(2000).optional(),
  }),
  proposed_commission: z
    .object({
      type: z.enum(['percent_revenue', 'flat_per_job', 'tiered']),
      value: z.number().min(0).max(10000).optional(),
      currency: z.string().length(3, 'currency must be a 3-letter code').default('GBP'),
    })
    .optional(),
});
export type PartnerRegisterWebhookPayload = z.infer<typeof partnerRegisterWebhookSchema>;

// ---------------------------------------------------------------------------
// Transport envelope (added by client.ts, validated for completeness)
// ---------------------------------------------------------------------------

export const webhookEnvelopeSchema = z.object({
  event_id: z.string().min(8, 'event_id too short').max(120, 'event_id too long'),
  source: z.string().min(1).max(40),
  company_id: uuidField('company_id must be a uuid'),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

/** Maps the logical lead surface to its CRM receiver path + payload schema. */
export const WEBHOOK_ENDPOINTS = {
  quote: { path: '/api/webhooks/quote', schema: quoteWebhookSchema },
  contact: { path: '/api/webhooks/contact', schema: contactWebhookSchema },
  callback: { path: '/api/webhooks/callback', schema: callbackWebhookSchema },
  'clearance-callback': {
    path: '/api/webhooks/clearance-callback',
    schema: callbackWebhookSchema,
  },
  affiliate: { path: '/api/webhooks/affiliate', schema: affiliateWebhookSchema },
  'partner-register': {
    path: '/api/webhooks/partner-register',
    schema: partnerRegisterWebhookSchema,
  },
} as const;

export type WebhookSurface = keyof typeof WEBHOOK_ENDPOINTS;
