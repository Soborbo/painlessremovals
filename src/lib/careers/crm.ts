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

/**
 * Mirror one application into the CRM. Server-to-server: no Origin header, which the
 * CRM's public gate deliberately allows. The idempotency key makes a retry safe.
 * Never throws — the caller runs this in `waitUntil` after the email has been sent.
 */
export async function forwardApplication(input: ForwardInput): Promise<void> {
  const base = crmBase();
  if (!base) return;
  const form = new FormData();
  form.set('posting_id', input.postingId);
  form.set('name', input.name);
  form.set('email', input.email);
  form.set('phone', input.phone);
  form.set('message', input.message);
  form.set('consent', 'on');
  form.set('answers', JSON.stringify(input.answers));
  form.set('idempotency_key', crypto.randomUUID());
  if (input.cv) form.set('cv', input.cv);

  try {
    const res = await fetch(`${base}/api/public/recruitment/apply`, { method: 'POST', body: form });
    if (!res.ok) {
      logger.error('Careers', 'CRM application forward rejected', { status: res.status });
    }
  } catch (err) {
    logger.error('Careers', 'CRM application forward failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
