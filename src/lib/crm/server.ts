/**
 * Server-side CRM lead delivery helpers for the calculator chokepoints
 * (`save-quote.ts` and `callbacks.ts`). These backends are hit from several
 * client surfaces (Step12 + ResultPage + standalone callback form, each with
 * retries), so firing the CRM webhook here — rather than from each client —
 * guarantees exactly one signed delivery per logical submission and keeps the
 * secret server-side.
 *
 * Delivery + retry runs in the background via `ctx.waitUntil()`; callers never
 * block their primary response (email/Resend) on CRM availability.
 */

import { logger } from '@/lib/utils/logger';
import { sendToCRM, isCRMConfigured, newEventId, type CRMClientEnv } from './client';
import {
  quoteWebhookSchema,
  callbackWebhookSchema,
  type CallbackWebhookPayload,
} from './schemas';
import { normalizeUKPhoneForCRM } from './format';
import { mapSubmissionToQuotePayload } from './quote-mapper';

interface CRMServerEnv extends CRMClientEnv {
  CRM_PRICING_VERSION_ID?: string;
}

/** A bound `waitUntil` that keeps the Worker alive through background work. */
export type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Safely extract a `waitUntil` from Astro locals. In Astro 6 the execution
 * context lives at `locals.cfContext` — `locals.runtime.ctx` was REMOVED and
 * its getter THROWS, so never touch it. Returns undefined off-Workers.
 */
export function getWaitUntil(locals: App.Locals | undefined): WaitUntil | undefined {
  const cf = (locals as unknown as { cfContext?: { waitUntil?: WaitUntil } } | undefined)?.cfContext;
  if (cf && typeof cf.waitUntil === 'function') {
    return cf.waitUntil.bind(cf);
  }
  return undefined;
}

/** Backgrounds a signed CRM delivery; safe no-op when CRM is unconfigured. */
function deliver(
  env: CRMServerEnv,
  waitUntil: WaitUntil | undefined,
  surface: 'quote' | 'callback',
  payload: Record<string, unknown>,
  eventId: string,
): void {
  if (!isCRMConfigured(env)) {
    logger.error('CRM', 'Lead not delivered — CRM not configured', { surface, eventId });
    return;
  }
  const promise = sendToCRM(env, surface, payload, { eventId })
    .then((res) => {
      if (!res.ok) {
        logger.error('CRM', 'Server-side delivery failed', {
          surface,
          eventId,
          status: res.status,
          retriable: res.retriable,
        });
      }
      return res;
    })
    .catch((err) => {
      logger.error('CRM', 'Server-side delivery threw', {
        surface,
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  if (waitUntil) {
    waitUntil(promise as Promise<unknown>);
  } else {
    // No execution context — fire and forget (best-effort, may be cut short).
    void promise;
  }
}

export interface QuoteLeadInput {
  fullName?: string;
  email?: string;
  phone?: string;
  postcode?: string;
  totalPence?: number;
  eventId?: string;
  /**
   * The FULL calculator submission map (`save-quote`'s `validated.data`). The
   * mapper lifts every entered item out of this into the rich webhook payload,
   * so nothing the customer entered is dropped on the way to the CRM.
   */
  data?: Record<string, unknown>;
  /** Top-level price breakdown (label → amount) from the save-quote body. */
  breakdown?: Record<string, number>;
  /** Top-level tracking from the save-quote body. */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
}

/**
 * Mirror a completed calculator quote to the CRM. Skips silently if the
 * required ContactDetails (name/email/phone) or the /quote-required postcode
 * are missing — better no lead than a guaranteed 400.
 */
export function deliverQuoteLead(
  env: CRMServerEnv,
  waitUntil: WaitUntil | undefined,
  input: QuoteLeadInput,
): void {
  const eventId = input.eventId || newEventId();

  const payload = mapSubmissionToQuotePayload({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    postcode: input.postcode,
    totalPence: input.totalPence,
    data: input.data,
    breakdown: input.breakdown,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    gclid: input.gclid,
    // The client can't know the CRM pricing-version uuid; inject from env.
    pricingVersionId: env.CRM_PRICING_VERSION_ID,
  });

  if (!payload) {
    logger.warn('CRM', 'Skipping quote lead — incomplete customer/postcode', { eventId });
    return;
  }

  // Validate before sending so a builder bug fails fast in logs, not silently
  // at the CRM.
  const parsed = quoteWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logger.error('CRM', 'Quote lead failed local validation', {
      eventId,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  deliver(env, waitUntil, 'quote', parsed.data, eventId);
}

export interface CallbackLeadInput {
  fullName?: string;
  email?: string;
  phone?: string;
  message?: string;
  propertyPostcode?: string;
  eventId?: string;
  /** Marketing attribution (gclid/utm/landing) captured on the site. */
  attribution?: CallbackWebhookPayload['attribution'];
}

/**
 * Mirror a calculator callback request to the CRM. Skips silently if the
 * required ContactDetails are missing.
 */
export function deliverCallbackLead(
  env: CRMServerEnv,
  waitUntil: WaitUntil | undefined,
  input: CallbackLeadInput,
): void {
  const eventId = input.eventId || newEventId();
  if (!input.fullName || !input.email || !input.phone) {
    logger.warn('CRM', 'Skipping callback lead — incomplete customer', { eventId });
    return;
  }

  const payload: CallbackWebhookPayload = {
    customer: {
      full_name: input.fullName.slice(0, 160),
      email: input.email,
      phone: normalizeUKPhoneForCRM(input.phone),
    },
    ...(input.propertyPostcode ? { property_postcode: input.propertyPostcode } : {}),
    ...(input.message ? { message: input.message.slice(0, 2000) } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
  };

  const parsed = callbackWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logger.error('CRM', 'Callback lead failed local validation', {
      eventId,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  deliver(env, waitUntil, 'callback', parsed.data, eventId);
}
