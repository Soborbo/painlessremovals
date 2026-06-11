# Painless-CRM signed webhooks (sender)

This site is the **sender** half of the Painless-CRM webhook integration. Every
lead-generating form and the instant-quote calculator POSTs a signed event to
the CRM's hardened inbound receivers, so a customer + lead appears in the CRM
for each submission.

## Security model (read first)

The HMAC secret **never reaches the browser**. All signing happens server-side
in the Cloudflare Worker:

```
browser form ──POST──▶ same-origin Astro endpoint (signs) ──POST──▶ CRM
```

- `CRM_WEBHOOK_SECRET` is read only in server code (`src/lib/crm/signer.ts`,
  `client.ts`, `server.ts`, `endpoint.ts`) via `cloudflare:workers` env.
- It is **never** exposed via a `PUBLIC_` var or `import.meta.env` that reaches
  the client. The build is verified: `dist/client` contains no secret, no
  `x-webhook-signature`, and no signing primitives.
- The only client-side CRM code is `src/lib/crm/push-lead.ts`, which just POSTs
  to the same-origin `/api/leads/*` endpoint.

## Environment / secrets

Set these as Cloudflare Worker vars/secrets (see `wrangler.toml` notes). Locally,
copy `.dev.vars.example` → `.dev.vars` (gitignored).

| Key | Kind | Notes |
|---|---|---|
| `CRM_WEBHOOK_SECRET` | **secret** | Shared HMAC secret, 32+ chars. MUST be byte-identical to the CRM's value. `wrangler secret put CRM_WEBHOOK_SECRET` |
| `CRM_BASE_URL` | var | e.g. `https://crm.painless.example` (no trailing slash) |
| `CRM_COMPANY_ID` | var | CRM tenant uuid; sent as `company_id` in every body |
| `CRM_WEBHOOK_SOURCE` | var (optional) | Overrides the envelope `source` (default `website`) |
| `CRM_PRICING_VERSION_ID` | var (optional) | uuid injected into the `/quote` webhook's `quote.pricing_version_id`. If unset, the optional `quote` block is dropped |

## Wire contract

```
POST <CRM_BASE_URL><receiver path>
Content-Type: application/json
x-webhook-signature: sha256=<lowercase hex HMAC-SHA256>
x-webhook-timestamp: <unix seconds, within ±300s of CRM clock>
x-webhook-version:   1.0
```

Canonical signature base = `` `${timestamp}.${version}.${rawBody}` ``, where
`rawBody` is the exact JSON string sent (serialized once, signed, then sent —
never re-stringified). See `signer.ts` and the known-vector test
`signer.test.ts`.

Body envelope (all events):

```jsonc
{
  "event_id":   "…",   // 8–120 chars; STABLE uuid per submission (idempotency key)
  "source":     "website",
  "company_id": "<uuid>",
  // …event-specific fields
}
```

## Response / retry / idempotency

| Response | Meaning | Action |
|---|---|---|
| `200 { ok: true }` | delivered | done |
| `200 { ok: true, duplicate: true }` | already received | treat as success |
| `400 invalid_payload` / `unsupported_schema_version` | our bug | **no retry**, log + alert |
| `401 invalid_signature` / `stale_timestamp` | auth/clock bug | **no retry**, log + alert |
| `5xx` / network | transient | retry 3× with **1s, 5s, 30s** backoff |

The same `event_id` is reused across retries (it lives in the signed body), so
redelivery is idempotent on the CRM side. Implemented in `client.ts`
(`sendToCRM`).

## Files

| File | Role |
|---|---|
| `src/lib/crm/signer.ts` | WebCrypto HMAC-SHA256, returns the header set |
| `src/lib/crm/client.ts` | `sendToCRM` — envelope, serialize-once, sign, POST, retry |
| `src/lib/crm/schemas.ts` | Zod schemas for all six payloads + inferred types |
| `src/lib/crm/endpoint.ts` | Factory for the `/api/leads/*` server endpoints |
| `src/lib/crm/server.ts` | Server-side `deliverQuoteLead` / `deliverCallbackLead` (calculator chokepoints) |
| `src/lib/crm/push-lead.ts` | Browser helper that POSTs to `/api/leads/*` (no secret) |
| `src/lib/crm/format.ts` | UK phone normalization + affiliate-code slug (client-safe) |
| `src/pages/api/leads/*.ts` | The six Astro server endpoints (`prerender = false`) |

## The six receivers / payloads

Shared `customer` (`ContactDetails`): `full_name` (1–160), `email` (≤160),
`phone` (7–20, `^[+0-9 ()-]+$`), `postcode` (2–12, optional **except** `/quote`).

1. `POST /api/webhooks/quote` — calculator quote. `customer` (postcode
   required), optional `addresses {from,to}`, optional `quote
   {pricing_version_id, size_code, distance_miles, complications[], total_pence}`.
2. `POST /api/webhooks/contact` — contact form. `customer`, `message?`,
   `preferred_contact?` (`email|phone|whatsapp`).
3. `POST /api/webhooks/callback` — callback request. `customer`,
   `preferred_window?`, `property_postcode?`, `message?`.
4. `POST /api/webhooks/clearance-callback` — same body as `/callback`; the CRM
   stamps `kind=clearance_callback`.
5. `POST /api/webhooks/affiliate` — `affiliate_code` (required), `customer`,
   `message?`, `attribution?` (utm/gclid/fbclid/landing_page…).
6. `POST /api/webhooks/partner-register` — `partner {name, type, contact_name,
   contact_email, contact_phone, website?, notes?}`, `proposed_commission?`.

## How each surface is wired

| Surface | How it reaches the CRM |
|---|---|
| Contact (`/contact`, care-home, later-life equity calc) | client → `/api/leads/contact` via `window.PR_pushLead` / `pushLeadToCRM` |
| Affiliate (`/affiliate-form`, partner agent-referral, knight-frank) | client → `/api/leads/affiliate`; `affiliate_code` from `?ref=` cookie or a slug of the referring agent; `attribution` from captured UTMs |
| Partner register (`/partners`, estate-agents, office-space) | client → `/api/leads/partner-register` |
| Clearance callback (`ClearanceCalculator`) | client → `/api/leads/clearance-callback` |
| **Calculator quote** (Step12 + `/your-quote` ResultPage) | **server-side** from `save-quote.ts` via `deliverQuoteLead` — single chokepoint, idempotent on the quote `event_id` |
| **Calculator callback** (SimpleCallbackForm + Step12 + ResultPage) | **server-side** from `callbacks.ts` via `deliverCallbackLead` — content-derived `event_id` dedupes client retries |

The calculator's quote/callback go server-side because those backends
(`save-quote.ts`, `callbacks.ts` — both already CRM-sync sites) are hit from
several client surfaces *with retries*; firing once at the chokepoint avoids
duplicate leads. Forms with client-only context (affiliate `?ref=`/attribution)
push from the browser.

> **Not wired:** the later-life lead-magnet and final-callback forms send
> placeholder `phone: "N/A"` / `email: "N/A"`, which cannot satisfy the CRM's
> `ContactDetails` (valid email **and** phone required), so they are
> intentionally skipped rather than guaranteed to 400.

Forms show success to the user even while CRM delivery is still retrying
(delivery is backgrounded via `ctx.waitUntil` server-side, or fire-and-forget on
the client). Zod validation errors from `/api/leads/*` are returned as
`400 { ok:false, error:'invalid_payload', issues:[…] }`.

## Tests

```bash
npm test                     # signer (known vector), client (retry/idempotency), schemas
```

Live staging round-trip (skipped in CI unless enabled):

```bash
RUN_CRM_STAGING_TEST=1 \
CRM_WEBHOOK_SECRET=… CRM_BASE_URL=https://crm.staging… CRM_COMPANY_ID=<uuid> \
npx vitest run roundtrip.staging
```

## Verifying end-to-end

```bash
cp .dev.vars.example .dev.vars   # fill in staging values
npm run preview                  # astro build + wrangler dev with .dev.vars
```

Submit each surface and confirm the matching customer + lead appears in the CRM
(or `duplicate:true` on a resend of the same `event_id`).
