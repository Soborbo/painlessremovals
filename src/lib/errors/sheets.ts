// src/lib/errors/sheets.ts
// Google Sheets API kliens — CF Workers kompatibilis (0 npm dependency)
// JWT auth service account-tal, Sheets v4 append endpoint.

/**
 * Config a Sheets API-hoz
 */
export interface SheetsConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  serviceAccountKey: string; // PEM private key
  sheetName?: string;        // default: 'errors'
}

/**
 * Sor hozzáfűzése a Google Sheets-hez a Sheets API v4-gyel.
 * JWT service account auth — nincs googleapis npm dependency.
 */
export async function appendToSheet(
  config: SheetsConfig,
  row: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { spreadsheetId, serviceAccountEmail, serviceAccountKey, sheetName = 'errors' } = config;

  if (!spreadsheetId || !serviceAccountEmail || !serviceAccountKey) {
    return { ok: false, error: 'missing_config' };
  }

  try {
    // 1. JWT token generalas
    const token = await getAccessToken(serviceAccountEmail, serviceAccountKey);

    // 2. Append row — values a Sheet header sorrendjében
    const values = [
      row.timestamp,
      row.siteId,
      row.deployId,
      row.env,
      row.code,
      row.severity,
      row.message,
      row.url,
      row.source,
      row.sessionId ?? '',
      row.requestId ?? '',
      row.journeyId ?? '',
      typeof row.context === 'string' ? row.context : JSON.stringify(row.context ?? {}),
      row.stack ?? '',
      row.viewport ?? '',
      row.connection ?? '',
      row.userAgent ?? '',
      row.fingerprint ?? '',
      row.retryable ?? false,
      row.userImpact ?? '',
      row.ip ?? '',
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:U:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [values],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, status: resp.status, error: body.substring(0, 200) };
    }

    return { ok: true, status: resp.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// JWT Token Generation (CF Workers kompatibilis)
// ============================================================

// Token cache — access tokenek ~1 oraig ervenyesek
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Cache check — 5 perc marggal a lejarat elott uj tokent kerunk
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signingInput = `${encodedHeader}.${encodedClaim}`;

  const signature = await signRS256(signingInput, privateKeyPem);
  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text().catch(() => '');
    throw new Error(`Google OAuth failed: ${tokenResp.status} ${errBody.substring(0, 200)}`);
  }

  const data = await tokenResp.json() as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}

/**
 * Base64url encoding (RFC 4648)
 */
function base64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * RS256 signing with Web Crypto API (CF Workers native)
 */
async function signRS256(input: string, pemKey: string): Promise<string> {
  // PEM → DER. Secrets pasted via the CF dashboard arrive in many shapes:
  // real newlines, literal `\n` / `\r\n` escape sequences, surrounding JSON
  // quotes, BOM, etc. Strip the PEM markers, unescape, then keep only the
  // base64 alphabet so any stray byte (quotes, backslashes, BOM) is dropped
  // before atob — atob rejects anything outside [A-Za-z0-9+/=].
  const pemBody = pemKey
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  if (!pemBody) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY: empty after PEM strip (check secret value)');
  }
  if (pemBody.length % 4 !== 0) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY: base64 length ${pemBody.length} not divisible by 4 (truncated or malformed)`);
  }

  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY: atob failed (${msg}); first 12 chars="${pemBody.substring(0, 12)}", last 4="${pemBody.substring(pemBody.length - 4)}"`);
  }

  // Import key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  );

  return base64urlFromBuffer(signature);
}
