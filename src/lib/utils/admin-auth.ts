/**
 * ADMIN TOKEN AUTH
 *
 * Constant-time Bearer-token check against HEALTH_CHECK_TOKEN, shared by the
 * ops endpoints (/api/health, /api/imve/recovery).
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < ab.length; i++) {
    result |= (ab[i] as number) ^ (bb[i] as number);
  }
  return result === 0;
}

/**
 * Validate an `Authorization: Bearer <token>` (or raw token header) value
 * against the expected secret. Returns false when the secret is unset.
 */
export function isValidAdminToken(
  provided: string | null,
  expectedToken: string | undefined,
): boolean {
  if (!provided || !expectedToken) return false;
  const expected = `Bearer ${expectedToken}`;
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
