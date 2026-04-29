// src/pages/api/error-report.ts
// CF Pages Function — error report fogadó
//
// Hardened:
// - Strict payload validation (code format, field lengths, context limits)
// - Per-IP rate limiting (reuses RATE_LIMITER KV with err_rate: prefix)
// - Max body size enforcement
// - Context key whitelist pattern

import type { APIRoute } from 'astro';
import { ALL_CODES } from '@/lib/errors/codes';
import { sanitizeContext } from '@/lib/errors/sanitize';
import { appendToSheet } from '@/lib/errors/sheets';
import type { Severity } from '@/lib/errors/types';
import { getCORSHeaders } from '@/lib/utils/cors';
import { requireAllowedOrigin } from '@/lib/forms/utils';
import { env } from 'cloudflare:workers';

export const prerender = false;

// --- Constraints ---
const CODE_PATTERN = /^[A-Z]{2,6}-[A-Z]{2,8}-\d{3}$/;
const MAX_BODY_BYTES = 8192;
const MAX_STRING_FIELD = 500;
const MAX_CONTEXT_KEYS = 10;
const MAX_CONTEXT_VALUE_LEN = 500;
const RATE_LIMIT_PER_IP = 30;         // /perc
const CONTEXT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;

// --- IP hash (SHA-256 based, consistent with rate-limit.ts) ---
async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return `ip_${hex.substring(0, 16)}`;
}

// --- Truncate helper ---
function trunc(val: unknown, max: number): string {
  const s = String(val || '');
  return s.length > max ? s.substring(0, max) : s;
}

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('Origin');
  return new Response(null, { status: 204, headers: getCORSHeaders(origin) });
};

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Origin fail-closed. Error reports are not driven by humans, so a
  // missing Origin from a real browser is a sign of a non-browser client
  // — those should not be allowed to drive Sheets quota / alert emails.
  if (!requireAllowedOrigin(request)) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }

  try {
    // --- 1. Body size check ---
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, reason: 'body_too_large' }, 413);
    }

    // --- 2. Rate limit (IP) ---
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const ipHash = await hashIP(ip);
    const rateLimiter = (env as any).RATE_LIMITER as KVNamespace | undefined;

    if (rateLimiter) {
      try {
        const ipKey = `err_rate:${ipHash}`;
        const ipCount = parseInt(await rateLimiter.get(ipKey) || '0');
        if (ipCount > RATE_LIMIT_PER_IP) {
          return json({ ok: false, reason: 'rate_limited' }, 429);
        }
        await rateLimiter.put(ipKey, String(ipCount + 1), { expirationTtl: 60 });
      } catch {
        // KV fail → don't block
      }
    }

    // --- 3. Parse ---
    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return json({ ok: false, reason: 'body_too_large' }, 413);
      }
      body = JSON.parse(text);
    } catch {
      return json({ ok: false, reason: 'invalid_json' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return json({ ok: false, reason: 'invalid_payload' }, 400);
    }

    // --- 4. Strict field validation ---
    const code = String(body.code || '');
    if (!code || !CODE_PATTERN.test(code)) {
      return json({ ok: false, reason: 'invalid_code' }, 400);
    }

    const url = trunc(body.url, MAX_STRING_FIELD);
    const siteId = trunc(body.siteId, 50);
    if (!url || !siteId) {
      return json({ ok: false, reason: 'missing_required' }, 400);
    }

    // --- 5. Validate + sanitize context ---
    let context: Record<string, string | number | boolean> = {};
    if (body.context && typeof body.context === 'object') {
      const raw = body.context as Record<string, unknown>;
      let keyCount = 0;
      for (const [k, v] of Object.entries(raw)) {
        if (keyCount >= MAX_CONTEXT_KEYS) break;
        if (!CONTEXT_KEY_PATTERN.test(k)) continue;
        const type = typeof v;
        if (type === 'string') {
          context[k] = String(v).substring(0, MAX_CONTEXT_VALUE_LEN);
        } else if (type === 'number' || type === 'boolean') {
          context[k] = v as number | boolean;
        }
        keyCount++;
      }
    }
    context = sanitizeContext(context);

    // --- 6. Resolve severity ---
    const codeDef = ALL_CODES[code];
    const severity: Severity = codeDef?.severity || 'ERROR';

    // --- 7. Build sanitized row ---
    const row = {
      timestamp: trunc(body.timestamp, 30) || new Date().toISOString(),
      siteId,
      deployId: trunc(body.deployId, 50),
      env: trunc(body.env, 20),
      code,
      severity,
      message: trunc(body.message || codeDef?.message || 'Unknown', MAX_STRING_FIELD),
      url,
      source: trunc(body.source, 200),
      sessionId: trunc(body.sessionId, 20),
      requestId: trunc(body.requestId, 20),
      journeyId: trunc(body.journeyId, 50),
      context: JSON.stringify(context),
      stack: trunc(body.stack, 1000),
      viewport: trunc(body.viewport, 20),
      connection: trunc(body.connection, 20),
      userAgent: trunc(body.userAgent, 200),
      fingerprint: trunc(body.fingerprint, 100),
      retryable: codeDef?.retryable ?? false,
      userImpact: codeDef?.userImpact ?? 'degraded',
      ip: ipHash,
    };

    // --- 8. Log to Google Sheets (API v4) ---
    const sheetsId = (env as any).ERROR_SHEETS_ID as string | undefined;
    const saEmail = (env as any).GOOGLE_SERVICE_ACCOUNT_EMAIL as string | undefined;
    const saKey = (env as any).GOOGLE_SERVICE_ACCOUNT_KEY as string | undefined;

    if (sheetsId && saEmail && saKey && severity !== 'INFO') {
      try {
        const result = await appendToSheet(
          { spreadsheetId: sheetsId, serviceAccountEmail: saEmail, serviceAccountKey: saKey },
          row,
        );
        if (!result.ok) console.error('SHEETS_APPEND_FAILED', result.status, result.error);
      } catch (e) {
        console.error('SHEETS_FAILED', e);
      }
    }

    // --- 9. CRITICAL → email ---
    const alertFrom = (env as any).ERROR_ALERT_FROM as string | undefined;
    const alertTo = (env as any).ERROR_EMAIL_TO as string | undefined;
    const resendKey = (env as any).RESEND_API_KEY as string | undefined;

    // Client-reported CRITICAL events do NOT trigger alert emails — only
    // server-detected critical codes (prefix SRV-) are escalated. Without
    // this gate, a hostile client can spam the alert mailbox by sending
    // any HTTP-5xx-coded payload (rate-limited at 30/min/IP, but easily
    // amplified by a botnet).
    const isServerOriginatedCritical = code.startsWith('SRV-');
    if (severity === 'CRITICAL' && isServerOriginatedCritical && alertFrom && alertTo && resendKey) {
      const subject = `🚨 [${row.siteId}] ${row.code}: ${row.message.substring(0, 60)}`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;">
          <h2 style="color:#dc2626;">Critical Error</h2>
          <table style="border-collapse:collapse;width:100%;">
            ${(['code','severity','message','url','source','siteId','deployId','env','sessionId','context','stack'] as const).map(k =>
              `<tr>
                <td style="padding:6px 12px;font-weight:bold;border-bottom:1px solid #eee;vertical-align:top;">${k}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #eee;word-break:break-all;">${
                  k === 'severity' ? `<span style="color:#dc2626;font-weight:bold;">${row[k]}</span>` : row[k]
                }</td>
              </tr>`
            ).join('')}
          </table>
        </div>
      `;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: alertFrom,
            to: [alertTo],
            subject,
            html,
          }),
        });
      } catch {
        console.error('ALERT_EMAIL_FAILED', code);
      }
    }

    return json({ ok: true }, 200);

  } catch (e) {
    console.error('ERROR_ENDPOINT_CRASHED', e);
    return json({ ok: false }, 500);
  }
};
