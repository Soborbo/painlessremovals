# Google Tag Gateway (GTG) — first-party tagging

> Status as of **2026-06-30**: loader is first-party ✅, but measurement is
> **still third-party** ⏳ (GTG activation pending on Google's side). Read the
> "Current status & open issue" section before changing anything.

## What this is

[Google Tag Gateway for advertisers](https://developers.cloudflare.com/google-tag-gateway/)
serves the Google tag from **our own domain** instead of `googletagmanager.com`
/ `google-analytics.com`, so ad-blockers and browser tracking-prevention
(ITP) can't drop the tag or its measurement hits as easily. It's a
**Cloudflare zone-level** feature, enabled 2026-06-29.

Key identifiers:

| Thing | Value |
|---|---|
| Cloudflare zone id | `58b2f402437a783381bce44da27b07bb` (painlessremovals.com) |
| GTG first-party measurement path | **`/f807/`** |
| GTM container | `GTM-PXTH5JJK` |
| GA4 measurement id | `G-05GFQ1XQFH` |
| Google Ads conversion id | `AW-11462492788` |
| First-party container URL (works) | `https://painlessremovals.com/f807/gtm.js?id=GTM-PXTH5JJK` → 200, ~501 KB |
| `/f807/ns.html` (noscript) | **404** — GTG serves `gtm.js` only, NOT `ns.html` |

## Why there is code for this (the non-obvious part)

The marketing pages are **statically prerendered** and served by a **Cloudflare
Worker**. Cloudflare's GTG **auto-injection rewrites the on-page `gtm.js`
loader to the first-party path only when it processes the HTML response** — and
it does **not** do that for our Worker-served HTML. Result: with GTG enabled
but no code change, the page still loaded `gtm.js` from `www.googletagmanager.com`
and a *separate* GTG gtag got injected at `/f807/…` alongside it.

So we point the loader at the first-party path **ourselves**:

- `astro.config.mjs` → `vite.define` bakes `import.meta.env.GTG_PATH` (default
  `'f807'`, empty disables → falls back to `googletagmanager.com`).
- `src/components/GTMHead.astro` → builds the loader `src` from `GTG_PATH`
  (`/f807/gtm.js`) with a **runtime `onerror` fallback**: if `/f807/gtm.js`
  ever 404s (e.g. GTG turned off in Cloudflare), it re-injects from
  `googletagmanager.com`, so the container — and ALL tracking — can never
  silently fail to load.
- `src/components/GTMBody.astro` (noscript `ns.html`) is **left on
  `googletagmanager.com`** because GTG 404s `ns.html`.

## ⚠️ Current status & open issue (the thing a future AI must understand)

**Loading the container first-party did NOT make measurement first-party.**

After the deploy, verified live in a browser:
- ✅ `gtm.js` loads from `painlessremovals.com/f807/gtm.js` (loader is first-party).
- ✅ no duplicate `page_view`.
- ❌ GA4 `g/collect` still POSTs to **`region1.analytics.google.com`**.
- ❌ Google Ads `/ccm/collect` still POSTs to **`google.com`** /
  `googleads.g.doubleclick.net` / `stats.g.doubleclick.net`.
- The `gtm.js?...gtg_health=1` health-check was still running ~23 h after enable.

**Why:** the GA4/Ads measurement transport URL (`/g/collect` host) is **not**
controlled by where `gtm.js` loads from. It is flipped to first-party by **GTG
activation on Google's side**, which was still **pending ~23–24 h** after
enabling (low-traffic site → diagnostic data accumulates slowly; Google quotes
"up to 24 h", in practice 24–48 h for low traffic). The GTM "Google tag
gateway" panel showed the domain as **"Incomplete"** (apex = "First-party",
`crm.` subdomain = "Not started" — `crm.` is internal, intentionally left off).

So the remaining work is **not code** — it is waiting for / completing GTG
activation. The code change here is a correct **prerequisite + loader-resilience
win**, nothing more.

## How to verify (do this, don't trust shortcuts)

**Definitive check = browser network panel** (e.g. chrome-devtools MCP):
load `https://painlessremovals.com/?x=1`, accept cookies, and inspect requests:

- **SUCCESS** = `g/collect` and `/ccm/collect` go to
  `painlessremovals.com/f807/…` (first-party).
- **NOT YET** = they go to `region1.analytics.google.com` / `google.com` /
  `doubleclick.net`.

Also valid: Google **Tag Assistant** → Summary → Output → "Hits Sent" → confirm
hits route to the measurement path.

**Do NOT rely on a curl/HTML-only check.** The HTML now contains `/f807/gtm.js`
because *we hardcoded it*, not because GTG activated — so "HTML contains /f807/"
is a **false-positive** signal for first-party *measurement*. (A scheduled
curl-based re-check, trigger `trig_01CDYwEuostzo6EXHXVnzbsQ`, was set up before
this deploy and is now confounded for exactly this reason.)

## If measurement is STILL third-party after ~48 h

1. Check the GTM **Admin → Google tag gateway** panel: is `painlessremovals.com`
   **"Active"** or still "Pending/Incomplete"? Pending → needs more diagnostic
   traffic / time, or the Cloudflare side needs re-validating.
2. Confirm the Cloudflare zone GTG config is enabled (zone
   `58b2f402437a783381bce44da27b07bb`, setting `google-tag-gateway/config`).
3. Confirm `https://painlessremovals.com/f807/gtm.js?id=GTM-PXTH5JJK` still
   returns 200 (the path is alive).
4. Run Google Tag Assistant for the live site and read the "Hits Sent" routing.
5. Only then consider whether the Google-side tag config (GA4 data stream /
   Google tag first-party setting) needs completing.

## Rollback

Set build env `GTG_PATH=""` (empty) and rebuild+deploy → loader reverts to
`googletagmanager.com` everywhere. Or revert the `fix/gtg-first-party-loader`
changes to `astro.config.mjs` + `GTMHead.astro`. The runtime `onerror` fallback
means even a live GTG outage degrades gracefully without a redeploy.

## Related

- `docs/tracking.md` — overall tracking architecture.
- Server leg (Soborbo Worker) = **Meta CAPI only**; GA4/Ads are browser-only.
  GTG only affects the Google (browser) side, never Meta.
