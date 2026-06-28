# Server-side tracking gateway — go-live runbook (painless)

Cutover of painless conversions to the **Soborbo event-gateway** (`Soborbo/Serverside`,
Worker `event-gateway`). The painless client is already built for this gateway
(`src/lib/tracking/worker-tracking.ts` + `gateway.ts`, wired into
`global-listeners.ts` + `conversion-state.ts`), gated by `PUBLIC_GATEWAY_ENABLED`.
Going live = **provision the gateway → flip the flag → verify → remove the old
in-app mirrors**. No client rewrite, no GTM container re-import.

Key facts:
- Astro site: `output: 'static'` + `@astrojs/cloudflare`. `/api/event/*` is NOT an
  app route — a Cloudflare zone route sends it to the gateway Worker (same-origin).
- GTM (`GTM-PXTH5JJK`) already fires the GA4 events browser-side; the gateway is
  additive, server-side only.
- Shared `event_id` → Meta Pixel↔CAPI dedup; Google Ads `order_id`=event_id dedup.

---

## 0. Inputs (provided at go-live)
- **Meta CAPI `access_token`** — pixel `292656820246446`. → gateway KV only.
- GA4 `api_secret` — **only if** we include the gateway `ga4` block (see §1 note).
- Google Ads OAuth consent — customer `4886655031`.

> Secrets go ONLY into the gateway KV (built in a temp dir, never committed).

---

## 1. Build + upload the gateway KV config
Source of truth: `Soborbo/claudeskills` → `soborbo-tracking/server/site-inputs/painless.json`
(pixel id, Ads customer + conversion action ids are pre-filled).

```bash
# in a TEMP dir, not the repo
cp painless.json /tmp/painless.json
#  → fill meta.access_token; fill/clear the ga4 block (see note)
node soborbo-tracking/server/generate-site.mjs --input /tmp/painless.json --out /tmp/painless-out
# emits site-config.json, kv-put.sh, routes.toml, INTEGRATION.md
```
Upload one KV entry **per hostname** into `SITE_CONFIG`
(`edd34e28eee847c09c26f9d9e3ea04ab`): `painlessremovals.com` **and**
`www.painlessremovals.com` (run `kv-put.sh`, or Cloudflare MCP `kv_put`).

> **GA4 decision (migration doctrine).** painless already sends GA4 browser-side
> (GTM). GA4 does NOT dedup browser + Measurement Protocol, so including a gateway
> `ga4` block would **double-count**. Recommended: **omit the `ga4` block** — keep
> GA4 in the browser, run only Meta CAPI + Google Ads through the gateway. If we
> omit it, **no GA4 `api_secret` is needed**. (Revisit only if we later move GA4
> fully server-side.)

---

## 2. Activate the route + deploy the gateway
- Merge **Soborbo/Serverside#13** (uncomments the painless `[[routes]]`) — only
  AFTER §1 KV entries exist, else the route 404s.
- Gate checks on the gateway Worker before deploy:
  - `TURNSTILE_SECRET_KEY` secret set (else every `/api/event/conversion` → 403).
  - Dead-letter R2 bucket in **EU jurisdiction** (`soborbo-tracking-dlq-eu`) — it
    stores raw PII (GDPR P0).
- `wrangler deploy` (gateway).

## 3. Google Ads OAuth (once)
`GET /api/event/oauth-init` with `X-Admin-Token` → populates `OAUTH_TOKENS` KV.
Without it, the Ads upload path fails (Meta + the rest still work).

---

## 4. Flip the flag on the Astro side
Set `PUBLIC_GATEWAY_ENABLED=true` (Worker var / build env for painless), then
`astro build` + `wrangler deploy`. This:
- loads the invisible Turnstile widget (`Layout.astro`, already gated on the flag),
- activates the `sendToGateway()` calls already wired into `global-listeners.ts`
  and `conversion-state.ts`.

---

## 5. Verify (do BEFORE removing the old mirrors)
Trigger each conversion on the live site and confirm:

| Conversion | How to trigger | Expect |
|---|---|---|
| `quote_calculator_conversion` | finish calculator → upgrade or 60 min | gateway POST + Meta `Lead` |
| `callback_conversion` | calculator callback request | gateway POST + Meta `Lead` |
| `phone_conversion` | click a `tel:` link | gateway POST + Meta `Contact` |
| `email_conversion` | click a `mailto:` link | gateway POST |
| `whatsapp_conversion` | click a `wa.me` link | gateway POST |
| `contact_form_submit` | submit `/contact/` form | gateway POST + Meta `Contact` |

Checks:
- **Network**: `POST /api/event/conversion` → 200/202 (not 403/404).
- **Health**: `GET /api/event/health` → 200.
- **Meta Test Events**: each event shows **Browser AND Server**, same `event_id`
  (dedup > 90%). Remove `test_event_code` from KV before real go-live.
- **GA4 DebugView**: browser events present (unchanged); no server MP duplicates.
- **Google Ads** (24h): the 4 actions reach "Recording conversions".
- **Worker logs** clean for 24h.

---

## 6. Cutover cleanup (only after §5 passes)
The gateway now owns server-side delivery. Remove the now-redundant in-app mirrors
(the "full replacement"):
- `src/lib/tracking/meta-mirror.ts` + the `/api/meta/capi` route — old Meta-only CAPI.
  (Until removed it dedups against the gateway by `event_id`, so order is safe.)
- `src/pages/api/save-quote.ts` GA4 MP fire — superseded (GA4 stays browser-side).
- Drop `mirrorMetaCapi(...)` calls from `global-listeners.ts` + `conversion-state.ts`.
- Remove `META_CAPI_ENDPOINT` / `META_GRAPH_API_VERSION` from `lib/tracking/config.ts`
  once nothing references them.
- `npm run typecheck` + `npm test` green; redeploy.

## 7. Optional — email + WhatsApp in Google Ads
The pre-filled config has Ads actions for quote/callback/contact/phone only. To
count email + WhatsApp in Google Ads too, create 2 conversion actions and add their
ids under `gads.conversion_actions` (`email_conversion`, `whatsapp_conversion`) in
the KV config. (Meta CAPI already receives them regardless.)
