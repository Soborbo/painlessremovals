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
  // The calculator captures a single Google-formatted string + postcode rather
  // than structured line1/city, so `line1`/`city` are optional and `formatted`
  // carries the full string. The CRM derives line1/city defensively on insert.
  formatted: z.string().max(300).optional(),
  line1: z.string().min(1).max(160).optional(),
  line2: z.string().max(160).optional(),
  city: z.string().min(1).max(80).optional(),
  postcode: postcodeField,
  // Optional access metadata captured by the calculator. All additive — older
  // payloads that omit these still validate. Maps to CRM job_addresses columns.
  floor: z.number().int().min(-2).max(100).optional(),
  has_lift: z.boolean().optional(),
  property_type: z.string().max(40).optional(),
  access_notes: z.string().max(2000).optional(),
});
export type Address = z.infer<typeof addressSchema>;

// ---------------------------------------------------------------------------
// Rich intake blocks (all OPTIONAL, additive) — carry the full calculator
// state to the CRM so no entered item is lost. Kept byte-aligned with the
// CRM's IncomingQuoteSchema in painless-crm/src/lib/webhooks/quote.ts.
// ---------------------------------------------------------------------------

/** Depth-bounded JSON value, so freeform blocks (extras) can't DoS via nesting. */
const boundedJson = (depth = 4): z.ZodType<unknown> =>
  depth <= 0
    ? z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])
    : z.union([
        z.string().max(2000),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(z.lazy(() => boundedJson(depth - 1))).max(200),
        z.record(z.string().max(80), z.lazy(() => boundedJson(depth - 1))),
      ]);

export const moveDetailsSchema = z.object({
  date: z.string().max(40).optional(),
  flexibility: z.enum(['fixed', 'flexible', 'unknown']).optional(),
});

export const serviceMetaSchema = z.object({
  type: z.enum(['home', 'office', 'clearance']).optional(),
  property_size: z.string().max(40).optional(),
  office_size: z.string().max(40).optional(),
  slider_position: z.string().max(40).optional(),
});

export const resourcesSchema = z.object({
  men: z.number().int().min(0).max(100).optional(),
  vans: z.number().int().min(0).max(100).optional(),
  cubic_ft: z.number().min(0).optional(),
  service_duration_hours: z.number().min(0).optional(),
  manual_override: z.boolean().optional(),
});

export const flagsSchema = z.object({
  property_chain: z.boolean().optional(),
  key_wait_waiver: z.boolean().optional(),
});

export const consentSchema = z.object({
  gdpr: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

/** Line-item breakdown: label → amount (calculator emits a {string: number} map). */
export const breakdownSchema = z.record(z.string().max(80), z.number());

/** Freeform extras (packing/disassembly/cleaning/storage/assembly/clearance). */
export const extrasSchema = z.record(z.string().max(80), boundedJson());

/** Marketing attribution carried with the quote (superset of affiliate's). */
export const intakeAttributionSchema = z.object({
  source: z.string().max(120).optional(),
  /**
   * The post-calculation "how did you find us?" answer (one of the
   * QuoteLoadingScreen AttributionIds: google|friend|estate_agent|van|social|
   * returning, or a free string). Distinct from utm_source — this is the
   * customer's self-reported channel.
   */
  heard_about: z.string().max(120).optional(),
  utm_source: z.string().max(120).optional(),
  utm_medium: z.string().max(120).optional(),
  utm_campaign: z.string().max(160).optional(),
  gclid: z.string().max(200).optional(),
  landing_page: z.string().max(500).optional(),
  session_id: z.string().max(120).optional(),
});

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
  // --- Rich intake blocks (all optional, additive) -------------------------
  move: moveDetailsSchema.optional(),
  service: serviceMetaSchema.optional(),
  resources: resourcesSchema.optional(),
  flags: flagsSchema.optional(),
  consent: consentSchema.optional(),
  breakdown: breakdownSchema.optional(),
  extras: extrasSchema.optional(),
  attribution: intakeAttributionSchema.optional(),
});
export type QuoteWebhookPayload = z.infer<typeof quoteWebhookSchema>;

// ---------------------------------------------------------------------------
// 2) /api/webhooks/contact
// ---------------------------------------------------------------------------

export const contactWebhookSchema = z.object({
  customer: contactDetailsSchema,
  message: z.string().max(4000).optional(),
  preferred_contact: z.enum(['email', 'phone', 'whatsapp']).optional(),
  attribution: intakeAttributionSchema.optional(),
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
  attribution: intakeAttributionSchema.optional(),
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
