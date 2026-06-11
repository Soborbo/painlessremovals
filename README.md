# Painless Removals

Main website + instant-quote calculator for painlessremovals.com.
Astro 6 + React 19 on Cloudflare Workers.

- Calculator pages live under `/instantquote/`; everything else is the public
  marketing site.
- See [`CLAUDE.md`](./CLAUDE.md) for project rules (especially the tracking
  system) and [`docs/`](./docs) for detailed docs.

## Develop

```bash
npm install
npm run dev          # astro dev
npm run build        # astro check && astro build
npm test             # vitest
npm run preview      # build + wrangler dev (uses .dev.vars)
```

## CRM webhooks (lead delivery)

Every lead form and the calculator POST a **signed** webhook to the
Painless-CRM. The HMAC secret never reaches the browser — all signing happens
server-side in the Worker:

```
browser form ──POST──▶ same-origin /api/leads/* (signs) ──POST──▶ CRM
```

Required env (Cloudflare Worker vars/secrets; locally `.dev.vars`, see
[`.dev.vars.example`](./.dev.vars.example)):

| Key | Kind | Notes |
|---|---|---|
| `CRM_WEBHOOK_SECRET` | **secret** | Shared HMAC secret, 32+ chars; byte-identical to the CRM. `wrangler secret put CRM_WEBHOOK_SECRET` |
| `CRM_BASE_URL` | var | e.g. `https://crm.painless.example` (no trailing slash) |
| `CRM_COMPANY_ID` | var | CRM tenant uuid (sent as `company_id`) |
| `CRM_WEBHOOK_SOURCE` | var (optional) | Envelope `source` override (default `website`) |
| `CRM_PRICING_VERSION_ID` | var (optional) | uuid for the `/quote` webhook's `quote.pricing_version_id` |

**Full documentation:** [`docs/crm-webhooks.md`](./docs/crm-webhooks.md) — wire
contract, retry/idempotency semantics, the six receiver payloads, how each form
is wired, and how to verify end-to-end against CRM staging.
