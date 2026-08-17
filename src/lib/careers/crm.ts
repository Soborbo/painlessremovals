/**
 * Careers ↔ Soborbo-CRM bridge.
 *
 * Two directions, both server-side only:
 *  1. `fetchPostings()` — the /jobs page renders the vacancies the CRM publishes,
 *     so adding or editing a role no longer needs a code deploy.
 *  2. `forwardApplication()` — after the existing Turnstile + Resend flow has run,
 *     the validated application (incl. CV) is mirrored into the CRM so it lands in
 *     a real applications list with a downloadable CV instead of only Jay's inbox.
 *
 * Neither direction may degrade the applicant experience: a fetch failure falls back
 * to the hardcoded roles, and a forward failure is logged and swallowed — the email
 * path stays the delivery guarantee.
 */

import { env } from 'cloudflare:workers';
import { logger } from '@/lib/utils/logger';

/** SSR must not hang on a slow CRM — the page has to render regardless. */
const FETCH_TIMEOUT_MS = 3000;

export interface CrmQuestion {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  options?: string[];
  required: boolean;
}

export interface CrmPosting {
  id: string;
  slug: string;
  title: string;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'temporary';
  description: string;
  requirements: string[];
  questions: CrmQuestion[];
  /** Fallback-only: preserves a label the CRM enum can't express ("Full-Time / Part-Time"). */
  typeLabel?: string;
  /**
   * Optional SEO metadata — present on the fallback postings, absent from the CRM payload
   * today. The JobPosting structured data on /jobs/[slug] only emits what exists, so a
   * CRM posting without these still gets valid (if less rich) schema.
   */
  datePosted?: string; // ISO date
  salary?: { min: number; max: number; unit: 'YEAR' | 'HOUR' };
  /** Fully-remote role → JobPosting jobLocationType TELECOMMUTE. */
  remote?: boolean;
}

/**
 * The recruitment module lives on the Soborbo CRM. `CRM_BASE_URL` still points at the
 * legacy Painless CRM (no recruitment endpoints), so we resolve the Soborbo instance
 * explicitly — `SOBORBO_CRM_URL`, falling back to the parallel-run mirror URL.
 */
function crmBase(): string | null {
  const base = env.SOBORBO_CRM_URL ?? env.CRM_BASE_URL_2;
  return base ? base.replace(/\/+$/, '') : null;
}

/** Published vacancies, or `null` if the CRM is unreachable/disabled (caller falls back). */
export async function fetchPostings(): Promise<CrmPosting[] | null> {
  const base = crmBase();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/public/recruitment/postings`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { postings?: CrmPosting[] };
    // An empty list means "the CRM has nothing published" — that is not a failure, but
    // an empty careers page would be worse than the fallback, so treat it as no data.
    return body.postings?.length ? body.postings : null;
  } catch (err) {
    logger.warn('Careers', 'CRM postings fetch failed, using fallback roles', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ForwardInput {
  postingId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  answers: Record<string, string>;
  cv: File | null;
}

/** Retry backoff for the forward. Short — this runs inside `waitUntil`. */
const FORWARD_RETRY_DELAYS_MS = [500, 2000, 5000];

/**
 * Proves to the CRM that this forward came from us, so it applies the trusted
 * forwarder rate-limit band instead of the strict per-IP one.
 *
 * WHY THIS EXISTS: the CRM limited `/apply` to 5/hour per IP, but every
 * applicant reaches it over ONE server-to-server connection, so they all share
 * the site Worker's egress IP. On 2026-08-17 a job ad went live and 29 of 33
 * applications were rejected — invisibly, because the failure is swallowed here.
 *
 * The signature covers `${timestamp}.recruit-apply`, NOT the body: the body is
 * multipart with a CV stream, and the CRM checks this before buffering it.
 * Identity is all the rate-limit decision needs; the payload is validated by the
 * CRM's own schema and CV gate.
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
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.recruit-apply`));
  let hex = '';
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
  return { 'x-forward-signature': `sha256=${hex}`, 'x-forward-timestamp': timestamp };
}

/**
 * Mirror one application into the CRM. Server-to-server: no Origin header, which the
 * CRM's public gate deliberately allows. The idempotency key makes a retry safe.
 * Never throws — the caller runs this in `waitUntil` after the email has been sent.
 *
 * The email remains the delivery guarantee, so a failure here never fails the
 * applicant. It must NOT be silent though: a swallowed 429 is exactly how 29
 * applications went missing from the CRM without anyone noticing, so a final
 * failure is escalated as a CRITICAL pipeline event carrying enough identity to
 * reconcile the application against Jay's inbox by hand.
 */
export async function forwardApplication(input: ForwardInput): Promise<void> {
  const base = crmBase();
  if (!base) return;
  // The idempotency key is generated ONCE and reused across retries — that is
  // what makes a retry after an ambiguous failure safe (the CRM replays the
  // original response instead of creating a second application).
  const idempotencyKey = crypto.randomUUID();

  const buildForm = () => {
    const form = new FormData();
    form.set('posting_id', input.postingId);
    form.set('name', input.name);
    form.set('email', input.email);
    form.set('phone', input.phone);
    form.set('message', input.message);
    form.set('consent', 'on');
    form.set('answers', JSON.stringify(input.answers));
    form.set('idempotency_key', idempotencyKey);
    if (input.cv) form.set('cv', input.cv);
    return form;
  };

  let lastError = 'unknown';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${base}/api/public/recruitment/apply`, {
        method: 'POST',
        body: buildForm(),
        // Re-signed per attempt: the CRM only accepts a ±300s timestamp.
        headers: await forwardAuthHeaders(),
      });
      if (res.ok) return;
      lastError = `http_${res.status}`;
      // 4xx other than 429 is our bug or the applicant's data — retrying an
      // unknown_posting or invalid_input just burns the same error three times.
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= FORWARD_RETRY_DELAYS_MS.length) break;
      logger.warn('Careers', 'CRM application forward retrying', {
        status: res.status,
        attempt: attempt + 1,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt >= FORWARD_RETRY_DELAYS_MS.length) break;
    }
    await new Promise((resolve) => setTimeout(resolve, FORWARD_RETRY_DELAYS_MS[attempt]));
  }

  logger.error('Careers', 'CRM application forward FAILED — application exists only in email', {
    error: lastError,
    postingId: input.postingId,
    email: input.email,
  });
  // Structured escalation, matching the `CRM-CONFIG-001` shape the log pipeline
  // already scrapes. Without this the loss stays invisible until someone counts
  // the CRM against the inbox — which is how it went unnoticed for a full day.
  console.error(JSON.stringify({
    __pipeline: 'error',
    code: 'CRM-FORWARD-001',
    severity: 'CRITICAL',
    message: 'Job application not mirrored to CRM — recover it from the notification email',
    source: 'careers/crm',
    context: { postingId: input.postingId, reason: lastError },
    ts: new Date().toISOString(),
  }));
}
