/**
 * Shared Astro server-endpoint factory for the `/api/leads/*` surfaces.
 *
 * Each lead endpoint: validates the inbound (same-origin) body with the
 * surface's Zod schema, then signs and forwards a webhook to the CRM. The
 * actual CRM delivery + retry loop runs in the background via
 * `ctx.waitUntil()`, so the browser gets an immediate response and form UX
 * is NEVER blocked on CRM availability. Zod validation, however, is
 * synchronous, so genuinely bad input still returns a 400 the form can
 * surface inline.
 *
 * SERVER-SIDE ONLY (`prerender = false` in each route).
 */

import type { APIRoute } from 'astro';
import type { z } from 'zod';
import { env } from 'cloudflare:workers';
import { requireAllowedOrigin, json } from '@/lib/forms/utils';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { generateErrorId } from '@/lib/utils/error';
import { logger } from '@/lib/utils/logger';
import { sendToCRM, isCRMConfigured, newEventId } from './client';
import { webhookEnvelopeSchema, type WebhookSurface } from './schemas';

/** A client-supplied event_id must satisfy the envelope's 8–120 char bound. */
function coerceEventId(raw: unknown): string {
  if (typeof raw === 'string') {
    const parsed = webhookEnvelopeSchema.shape.event_id.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return newEventId();
}

interface LeadHandlerOptions<TSchema extends z.ZodType> {
  surface: WebhookSurface;
  schema: TSchema;
  /**
   * Optional server-side mutation of the validated-shape input BEFORE schema
   * validation runs — e.g. injecting `pricing_version_id` from env on /quote.
   */
  transform?: (input: Record<string, unknown>, env: Cloudflare.Env) => Record<string, unknown>;
}

export function createLeadHandler<TSchema extends z.ZodType>(
  options: LeadHandlerOptions<TSchema>,
): APIRoute {
  const { surface, schema, transform } = options;

  return async (context) => {
    const { request } = context;

    // Same-origin guard — fail closed (mirrors the other form endpoints).
    if (!requireAllowedOrigin(request)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const rateLimitOk = await checkRateLimit(context);
    if (!rateLimitOk) {
      return createRateLimitResponse(generateErrorId());
    }

    const ctype = request.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      return json({ ok: false, error: 'invalid_content_type' }, 415);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    // Pull the envelope idempotency key out; everything else is the payload.
    const { event_id: rawEventId, ...rest } = body;
    const eventInput = transform ? transform(rest, env) : rest;

    const parsed = schema.safeParse(eventInput);
    if (!parsed.success) {
      // Surface field-level errors so the form can show them inline.
      return json(
        {
          ok: false,
          error: 'invalid_payload',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400,
      );
    }

    const eventId = coerceEventId(rawEventId);

    // If the CRM isn't configured (e.g. preview env without secrets), don't
    // fail the user — accept the lead, log, and move on. The primary form
    // path (email/Resend) still ran on its own endpoint.
    if (!isCRMConfigured(env)) {
      logger.error('CRM', 'Lead accepted but CRM not configured', { surface, eventId });
      return json({ ok: true, event_id: eventId, queued: false }, 200);
    }

    // Background the signed delivery + retry loop. waitUntil keeps the Worker
    // alive through the 1s/5s/30s backoff without blocking the response.
    const delivery = sendToCRM(env, surface, parsed.data as Record<string, unknown>, { eventId })
      .then((result) => {
        if (!result.ok) {
          logger.error('CRM', 'Background delivery failed', {
            surface,
            eventId,
            status: result.status,
            retriable: result.retriable,
          });
        }
        return result;
      })
      .catch((err) => {
        logger.error('CRM', 'Background delivery threw', {
          surface,
          eventId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    const waitUntil = context.locals?.runtime?.ctx?.waitUntil;
    if (typeof waitUntil === 'function') {
      waitUntil(delivery as Promise<unknown>);
    } else {
      // No execution context (e.g. local non-worker run) — await inline so
      // the delivery still happens, at the cost of a slower response.
      await delivery;
    }

    return json({ ok: true, event_id: eventId, queued: true }, 200);
  };
}
