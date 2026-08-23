/**
 * Complaints → Soborbo-CRM bridge (server-side only).
 *
 * The complaint form on /complaints/ posts to `/api/complaint`, which emails
 * hello@ (the delivery guarantee) and then mirrors the complaint into the CRM,
 * where it lands in the complaints list, gets a 24h first-response SLA and
 * notifies the admins. A forward failure is logged and swallowed — exactly like
 * `careers/crm.ts`: the email path must never be degraded by the CRM being down.
 *
 * Why the signed headers: the CRM rate-limits `/api/public/complaint` per IP,
 * and we forward SERVER-SIDE, so every complainant arrives on the same Worker
 * egress IP. Without proof of identity the strict lane would drop everyone after
 * the third complaint — the same bug that ate 29 of 33 job applications on
 * 2026-08-17. The signature buys the forwarder lane; per-user protection stays
 * here (Turnstile + our own rate limit).
 */

import { env } from 'cloudflare:workers';
import { logger } from '@/lib/utils/logger';

const FORWARD_RETRY_DELAYS_MS = [400, 1200];

export interface ComplaintForwardInput {
  name: string;
  email: string | null;
  phone: string | null;
  jobNumber: string | null;
  description: string;
  /** A bejelentohoz csatolt fotok, valtozatlanul tovabbitva. A CRM ujrakodolja oket. */
  photos?: File[];
  /** A CRM packjebol valasztott panasz-tipus kulcsa (a lista is onnan jott). */
  type?: string | null;
  /** A tipus extra mezoinek valaszai; a semat a CRM sajat packje adja, ujra validalva. */
  answers?: Record<string, unknown>;
}

function crmBase(): string | null {
  const base = env.SOBORBO_CRM_URL ?? env.CRM_BASE_URL_2;
  return base ? base.replace(/\/+$/, '') : null;
}

/**
 * Identifies this website to the CRM so it gets the forwarder rate-limit lane.
 * Signed over `${timestamp}.complaint-submit` — deliberately a different base
 * from the recruitment one, so a captured header can't be replayed across
 * endpoints. Without a shared secret we simply send nothing and fall back to
 * the strict per-IP lane (missing config must not open a door).
 */
async function forwardAuthHeaders(): Promise<Record<string, string>> {
  const secret = env.CRM_WEBHOOK_SECRET_2 ?? env.CRM_WEBHOOK_SECRET;
  if (!secret) return {};
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.complaint-submit`));
  let hex = '';
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
  return { 'x-forward-signature': `sha256=${hex}`, 'x-forward-timestamp': timestamp };
}

/** Mirrors a validated complaint into the CRM. Never throws. */
export async function forwardComplaint(input: ComplaintForwardInput): Promise<boolean> {
  const base = crmBase();
  if (!base) return false;

  // Fotoval multipart, nelkule JSON. A `buildBody` ujra fut minden probalkozasnal: egy
  // mar elolvasott File-stream nem jatszhato ujra, es a FormData ujraepitese olcso.
  const hasPhotos = (input.photos?.length ?? 0) > 0;
  const buildBody = (): BodyInit => {
    if (!hasPhotos) {
      return JSON.stringify({
        name: input.name,
        email: input.email,
        phone: input.phone,
        job_number: input.jobNumber,
        description: input.description,
        type: input.type ?? null,
        answers: input.answers ?? {},
        consent: true,
      });
    }
    const form = new FormData();
    form.set('name', input.name);
    if (input.email) form.set('email', input.email);
    if (input.phone) form.set('phone', input.phone);
    if (input.jobNumber) form.set('job_number', input.jobNumber);
    form.set('description', input.description);
    if (input.type) form.set('type', input.type);
    form.set('answers', JSON.stringify(input.answers ?? {}));
    form.set('consent', 'true');
    for (const photo of input.photos ?? []) form.append('photos', photo);
    return form;
  };

  let lastError = 'unknown';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${base}/api/public/complaint`, {
        method: 'POST',
        // Re-signed per attempt: the CRM only accepts a ±300s timestamp.
        // Multipart eseten a boundary-t a runtime teszi ra — content-type-ot NEM allitunk.
        headers: hasPhotos
          ? await forwardAuthHeaders()
          : { 'content-type': 'application/json', ...(await forwardAuthHeaders()) },
        body: buildBody(),
      });
      if (res.ok) return true;
      lastError = `http_${res.status}`;
      // A 4xx other than 429 is our bug or the reporter's data — retrying an
      // invalid_input just burns the same error three times.
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= FORWARD_RETRY_DELAYS_MS.length) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt >= FORWARD_RETRY_DELAYS_MS.length) break;
    }
    await new Promise((resolve) => setTimeout(resolve, FORWARD_RETRY_DELAYS_MS[attempt]));
  }

  logger.error('Complaints', 'CRM complaint forward FAILED — complaint exists only in email', {
    error: lastError,
  });
  return false;
}
