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
  type QuoteWebhookPayload,
  type CallbackWebhookPayload,
} from './schemas';
import { normalizeUKPhoneForCRM } from './format';

interface WaitUntilCtx {
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface CRMServerEnv extends CRMClientEnv {
  CRM_PRICING_VERSION_ID?: string;
}

/** Backgrounds a signed CRM delivery; safe no-op when CRM is unconfigured. */
function deliver(
  env: CRMServerEnv,
  ctx: WaitUntilCtx | undefined,
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

  if (ctx?.waitUntil) {
    ctx.waitUntil(promise as Promise<unknown>);
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
  sizeCode?: string;
  distanceMiles?: number;
  complications?: string[];
  totalPence?: number;
  eventId?: string;
}

/**
 * Mirror a completed calculator quote to the CRM. Skips silently if the
 * required ContactDetails (name/email/phone) or the /quote-required postcode
 * are missing — better no lead than a guaranteed 400.
 */
export function deliverQuoteLead(
  env: CRMServerEnv,
  ctx: WaitUntilCtx | undefined,
  input: QuoteLeadInput,
): void {
  const eventId = input.eventId || newEventId();
  if (!input.fullName || !input.email || !input.phone || !input.postcode) {
    logger.warn('CRM', 'Skipping quote lead — incomplete customer/postcode', { eventId });
    return;
  }

  const payload: QuoteWebhookPayload = {
    customer: {
      full_name: input.fullName.slice(0, 160),
      email: input.email,
      phone: normalizeUKPhoneForCRM(input.phone),
      postcode: input.postcode,
    },
  };

  // Only attach the optional quote block when we have a pricing version uuid
  // (the CRM requires a uuid there or nothing).
  if (env.CRM_PRICING_VERSION_ID && typeof input.totalPence === 'number') {
    payload.quote = {
      pricing_version_id: env.CRM_PRICING_VERSION_ID,
      size_code: (input.sizeCode || 'custom').slice(0, 40),
      distance_miles: Math.max(0, input.distanceMiles ?? 0),
      complications: input.complications ?? [],
      total_pence: Math.max(0, Math.round(input.totalPence)),
    };
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
  deliver(env, ctx, 'quote', parsed.data, eventId);
}

export interface CallbackLeadInput {
  fullName?: string;
  email?: string;
  phone?: string;
  message?: string;
  propertyPostcode?: string;
  eventId?: string;
}

/**
 * Mirror a calculator callback request to the CRM. Skips silently if the
 * required ContactDetails are missing.
 */
export function deliverCallbackLead(
  env: CRMServerEnv,
  ctx: WaitUntilCtx | undefined,
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
  };

  const parsed = callbackWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    logger.error('CRM', 'Callback lead failed local validation', {
      eventId,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  deliver(env, ctx, 'callback', parsed.data, eventId);
}
