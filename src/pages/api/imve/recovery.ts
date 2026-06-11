/**
 * i-mve RECOVERY / DIAGNOSTICS ENDPOINT (ops only)
 *
 * Built for the June 2026 incident where i-mve stopped responding to
 * requests from Cloudflare Workers (silent drop → 10s timeouts) while every
 * other outbound integration from the same Worker kept working.
 *
 * GET  /api/imve/recovery           → config + dead-letter queue status
 * GET  /api/imve/recovery?probe=1   → + live reachability probe FROM the
 *                                      production Worker (the only vantage
 *                                      point that matters for this bug)
 * POST /api/imve/recovery           → replay parked leads to i-mve
 *
 * All verbs require `Authorization: Bearer <HEALTH_CHECK_TOKEN>`.
 * The probe uses GET so it can never create a lead in i-mve.
 */

import { getRuntimeConfig } from '@/lib/config';
import { countImveDeadLetters, replayImveDeadLetters } from '@/lib/features/imve';
import { isValidAdminToken } from '@/lib/utils/admin-auth';
import { safeKV } from '@/lib/utils/kv';
import { logger } from '@/lib/utils/logger';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

const PROBE_TIMEOUT_MS = 8000;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface ProbeResult {
  reachable: boolean;
  /** HTTP status when the origin answered at all (any status = network OK). */
  status?: number;
  durationMs: number;
  error?: string;
}

/**
 * GET-probe the configured i-mve URL. Distinguishes the failure classes that
 * matter: fast HTTP response (network path fine, look at auth/payload),
 * connection error (DNS/TLS/refused) and timeout (firewall silently
 * dropping us — the June 2026 signature).
 */
async function probeImve(apiUrl: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(apiUrl, { method: 'GET', signal: controller.signal });
    // Drain the body so the connection is released.
    await response.text().catch(() => '');
    return { reachable: true, status: response.status, durationMs: Date.now() - startedAt };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        reachable: false,
        durationMs,
        error: `Timeout after ${PROBE_TIMEOUT_MS}ms — request silently dropped (firewall DROP signature)`,
      };
    }
    return {
      reachable: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isValidAdminToken(request.headers.get('Authorization'), env.HEALTH_CHECK_TOKEN)) {
    return unauthorized();
  }

  const runtimeConfig = getRuntimeConfig(env);
  const kv = safeKV(env, 'RATE_LIMITER');
  const deadLetters = await countImveDeadLetters(kv);

  const body: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    imve: {
      enabled: runtimeConfig.imve.enabled,
      apiKeyConfigured: !!runtimeConfig.imve.apiKey,
      timeoutMs: runtimeConfig.imve.timeoutMs,
    },
    deadLetterQueue: deadLetters,
  };

  if (url.searchParams.get('probe') === '1') {
    if (!runtimeConfig.imve.enabled) {
      body.probe = { skipped: true, reason: 'IMVE_API_URL not configured' };
    } else {
      const probe = await probeImve(runtimeConfig.imve.apiUrl);
      logger.info('i-mve', 'Recovery probe executed', { ...probe });
      body.probe = probe;
    }
  }

  return json(body);
};

export const POST: APIRoute = async ({ request }) => {
  if (!isValidAdminToken(request.headers.get('Authorization'), env.HEALTH_CHECK_TOKEN)) {
    return unauthorized();
  }

  const runtimeConfig = getRuntimeConfig(env);
  if (!runtimeConfig.imve.enabled) {
    return json({ error: 'IMVE_API_URL not configured — nothing to replay to' }, 409);
  }

  const kv = safeKV(env, 'RATE_LIMITER');
  const summary = await replayImveDeadLetters(kv, runtimeConfig.imve);
  logger.info('i-mve', 'Dead-letter replay finished', {
    scanned: summary.scanned,
    replayed: summary.replayed.length,
    failed: summary.failed.length,
    hasMore: summary.hasMore,
  });

  return json(summary);
};
