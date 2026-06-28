/**
 * Pure mapper: full calculator submission (`save-quote` `data` + breakdown +
 * tracking) → the rich `quoteWebhookSchema` payload.
 *
 * The calculator persists ~40 fields of state; historically only
 * name/email/phone/postcode + a 4-field quote summary reached the CRM. This
 * mapper lifts EVERY entered item the server receives into the webhook payload
 * so nothing is silently dropped. All blocks are optional — a sparse session
 * (e.g. abandoned before extras) simply omits them.
 *
 * No I/O, no secrets — safe to unit-test. `server.ts` calls this then attaches
 * the env-injected `pricing_version_id` to the quote block.
 */

import { getExtrasBreakdown } from '@/lib/calculator-logic';
import { normalizeUKPhoneForCRM } from './format';
import type { QuoteWebhookPayload } from './schemas';

/** A loose view of the calculator address shape from `getSubmissionData()`. */
interface CalcAddress {
  formatted?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  floorLevel?: number;
}

export interface SubmissionMapInput {
  fullName?: string;
  email?: string;
  phone?: string;
  /** Resolved customer postcode (from/to fallback already applied by caller). */
  postcode?: string;
  totalPence?: number;
  /** The full calculator submission map (`validated.data`). */
  data?: Record<string, unknown>;
  /** Top-level price breakdown from the save-quote body (label → amount). */
  breakdown?: Record<string, number>;
  /** Top-level tracking from the save-quote body. */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
  /** Pricing-version uuid injected from env; without it the quote block drops. */
  pricingVersionId?: string;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Strip undefined keys so we emit clean, minimal blocks. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return Object.keys(out).length > 0 ? (out as Partial<T>) : undefined;
}

type WebhookAddress = NonNullable<QuoteWebhookPayload['addresses']>['from'];

/** Map one calculator address into the webhook address block (postcode required). */
function mapAddress(raw: unknown): WebhookAddress | undefined {
  const a = raw as CalcAddress | undefined;
  const postcode = a?.postcode?.trim();
  if (!a || !postcode || postcode.length < 2) return undefined;
  return compact({
    formatted: asString(a.formatted),
    postcode,
    floor: typeof a.floorLevel === 'number' ? Math.trunc(a.floorLevel) : undefined,
  }) as WebhookAddress;
}

/**
 * Build the rich quote webhook payload from a full submission. Returns null if
 * the mandatory ContactDetails (name/email/phone) or customer postcode are
 * missing — better no lead than a guaranteed 400 at the CRM.
 */
export function mapSubmissionToQuotePayload(
  input: SubmissionMapInput,
): QuoteWebhookPayload | null {
  if (!input.fullName || !input.email || !input.phone || !input.postcode) {
    return null;
  }
  const data = input.data ?? {};
  const contact = (data.contact as Record<string, unknown> | undefined) ?? {};
  const calcQuote = (data.quote as Record<string, unknown> | undefined) ?? {};
  const distances = data.distances as Record<string, unknown> | undefined;

  const payload: QuoteWebhookPayload = {
    customer: {
      full_name: input.fullName.slice(0, 160),
      email: input.email,
      phone: normalizeUKPhoneForCRM(input.phone),
      postcode: input.postcode,
    },
  };

  // --- Quote summary (only with a pricing-version uuid) ---------------------
  if (input.pricingVersionId && typeof input.totalPence === 'number') {
    const complications = Array.isArray(data.complications)
      ? (data.complications as unknown[]).map(String)
      : [];
    const sizeCode =
      asString(data.propertySize) ||
      asString(data.officeSize) ||
      asString(data.serviceType) ||
      'custom';
    const distanceMiles =
      asNumber(distances?.customerDistance) ?? asNumber(distances?.fromToTo) ?? 0;
    payload.quote = {
      pricing_version_id: input.pricingVersionId,
      size_code: sizeCode.slice(0, 40),
      distance_miles: Math.max(0, distanceMiles),
      complications,
      total_pence: Math.max(0, Math.round(input.totalPence)),
    };
  }

  // --- Addresses (from/to) — only when BOTH have a usable postcode ----------
  const from = mapAddress(data.fromAddress);
  const to = mapAddress(data.toAddress);
  if (from && to) {
    payload.addresses = { from, to } as QuoteWebhookPayload['addresses'];
  }

  // --- Move date + flexibility ---------------------------------------------
  const move = compact({
    date: asString(data.selectedDate),
    flexibility: ((): 'fixed' | 'flexible' | 'unknown' | undefined => {
      const f = asString(data.dateFlexibility);
      return f === 'fixed' || f === 'flexible' || f === 'unknown' ? f : undefined;
    })(),
  });
  if (move) payload.move = move as QuoteWebhookPayload['move'];

  // --- Service meta ---------------------------------------------------------
  const service = compact({
    type: ((): 'home' | 'office' | 'clearance' | undefined => {
      const t = asString(data.serviceType);
      return t === 'home' || t === 'office' || t === 'clearance' ? t : undefined;
    })(),
    property_size: asString(data.propertySize),
    office_size: asString(data.officeSize),
    slider_position:
      data.sliderPosition != null ? String(data.sliderPosition).slice(0, 40) : undefined,
  });
  if (service) payload.service = service as QuoteWebhookPayload['service'];

  // --- Resources (men/vans/volume/duration) from the computed quote ---------
  const resources = compact({
    men: asNumber(calcQuote.men),
    vans: asNumber(calcQuote.vans),
    cubic_ft: asNumber(calcQuote.cubes),
    service_duration_hours: asNumber(calcQuote.serviceDuration),
  });
  if (resources) payload.resources = resources as QuoteWebhookPayload['resources'];

  // --- Flags ----------------------------------------------------------------
  const flags = compact({
    property_chain: asBool(data.propertyChain),
    key_wait_waiver: asBool(data.keyWaitWaiver),
  });
  if (flags) payload.flags = flags as QuoteWebhookPayload['flags'];

  // --- Consent --------------------------------------------------------------
  const consent = compact({
    gdpr: asBool(contact.gdprConsent),
    marketing: asBool(contact.marketingConsent),
  });
  if (consent) payload.consent = consent as QuoteWebhookPayload['consent'];

  // --- Price breakdown (line items) ----------------------------------------
  const breakdown = input.breakdown ?? (calcQuote.breakdown as Record<string, number> | undefined);
  if (breakdown && typeof breakdown === 'object') {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(breakdown)) {
      if (typeof v === 'number' && Number.isFinite(v)) clean[k.slice(0, 80)] = v;
    }

    // Split the lumped `extrasCost` into per-extra lines (packing / cleaning /
    // storage / assembly) so the CRM renders a real cost sheet. Only when the
    // parts reconcile to the lump (±£1) — otherwise keep the lump rather than
    // surface itemisation that doesn't add up.
    const cubes = asNumber(calcQuote.cubes) ?? 0;
    const items = getExtrasBreakdown(
      (data.extras ?? {}) as Parameters<typeof getExtrasBreakdown>[0],
      cubes,
    );
    const itemSum = Object.values(items).reduce((sum, n) => sum + n, 0);
    const lump = clean.extrasCost;
    if (lump !== undefined && itemSum > 0 && Math.abs(itemSum - lump) <= 1) {
      delete clean.extrasCost;
      for (const [k, v] of Object.entries(items)) {
        if (typeof v === 'number' && Number.isFinite(v) && v !== 0) clean[k] = Math.round(v);
      }
    }

    // The authoritative customer total (pounds) — gives the cost sheet its Total
    // line. totalPence is pence (pounds × 100 at the call site).
    if (typeof input.totalPence === 'number' && Number.isFinite(input.totalPence)) {
      clean.total = Math.round(input.totalPence / 100);
    }

    if (Object.keys(clean).length > 0) payload.breakdown = clean;
  }

  // --- Extras (packing/disassembly/cleaning/storage/assembly) ---------------
  // Forward only KNOWN extra keys. `data` is client-supplied (calculator
  // sessionStorage), so copying it wholesale (Object.assign) would let any
  // arbitrary field a client injects ride through to the CRM. Pin to the
  // ExtrasData contract instead.
  const EXTRA_KEYS = [
    'gateway',
    'packingTier',
    'disassemblyItems',
    'cleaningRooms',
    'cleaningType',
    'storageSize',
    'storageWeeks',
    'assembly',
  ] as const;
  const extrasOut: Record<string, unknown> = {};
  if (data.extras && typeof data.extras === 'object') {
    const src = data.extras as Record<string, unknown>;
    for (const k of EXTRA_KEYS) {
      if (src[k] !== undefined) extrasOut[k] = src[k];
    }
  }
  if (data.furnitureOnly && typeof data.furnitureOnly === 'object') {
    extrasOut.furnitureOnly = data.furnitureOnly;
  }
  if (Object.keys(extrasOut).length > 0) {
    payload.extras = extrasOut as QuoteWebhookPayload['extras'];
  }

  // --- Attribution ----------------------------------------------------------
  // `data.attribution` is the post-calculation "how did you find us?" answer
  // (QuoteLoadingScreen) — carried as `heard_about`, distinct from utm_source.
  const attribution = compact({
    heard_about: asString(data.attribution),
    utm_source: input.utmSource || asString(data.utmSource),
    utm_medium: input.utmMedium || asString(data.utmMedium),
    utm_campaign: input.utmCampaign || asString(data.utmCampaign),
    gclid: input.gclid || asString(data.gclid),
    landing_page: asString(data.landingPage),
    session_id: asString(data.sessionId),
  });
  if (attribution) payload.attribution = attribution as QuoteWebhookPayload['attribution'];

  return payload;
}
