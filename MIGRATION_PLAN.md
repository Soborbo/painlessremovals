# Painless Removals — Calculator merge migration plan

**Cél**: A `painless-calculator` repó tartalmát beolvasztani a `PainlessRemovals2026` repóba úgy, hogy a kalkulátor a `/instantquote/` URL alatt elérhető legyen ugyanazon a domainen, és minden tracking/CTA/conversion logika a kalkulátor (kiérleltebb) pattern-jét kövesse a teljes site-on. Cloudflare Workers-re deployolunk.

---

## Architektúra végállapot

- **Egy repo**: `PainlessRemovals2026` (a calculator beolvad, a `painless-calculator` repó archiválható).
- **Astro 6** + Tailwind 4, `output: 'static'` (default), per-page `prerender = false` opt-out a kalkulátor route-okra és API endpointokra.
- **`@astrojs/cloudflare` adapter Workers módban**, `wrangler.toml` az egyetlen igazságforrás (deploy: `wrangler deploy`).
- **Statikus assetek**: Workers Static Assets binding (`assets` direktíva a `wrangler.toml`-ban), `_redirects` és `_headers` támogatva.
- **API**: minden API route Astro `src/pages/api/*` alatt — a régi `functions/` mappa megszűnik.
- **URL-ek**: `/instantquote/` a kalkulátor belépő, `/instantquote/step-01/`...`/instantquote/step-12/`, `/instantquote/your-quote/`, `/instantquote/thank-you/`, `/instantquote/simple-callback/`, `/instantquote/thank-you-callback/`, `/instantquote/dev-preview/`. Trailing slash mindenhol.
- **Tracking**: kalkulátor pattern (Consent Mode v2, server-side GA4 MP + Meta CAPI, event_id dedup, error tracking, web vitals, form abandonment).
- **Konverzió**: contact form (server-side, Turnstile + Resend success után), `tel:` / `mailto:` / WhatsApp click, `quote_calculator_conversion` (kalkulátor meglévő).
- **Nem-konverzió, csak analytics**: jobs / affiliate / partner_register / clearance_callback form submit.
- **Régi `calc.painlessremovals.com`**: 301-gyel ráirányítva az új domain `/instantquote/`-ra, majd 2-4 hét múlva DNS-ből törölve.

---

## Repo helye

A munka a `d:\painlessmerged\PainlessRemovals2026\` mappában történik. A forráskód-másolásokhoz a `d:\painlessmerged\painless-calculator\` szolgál (ezt **NEM** módosítjuk, csak olvassuk).

A migration egy feature branchen történik:
```
git checkout -b feat/merge-calculator
```

---

## Fázisok és sorrend

| # | Fázis | Idő | Élesre hat? |
|---|---|---|---|
| 0 | Felkészülés: env audit, KV, branch | 1 nap | nem |
| 1 | Workers config: adapter, wrangler, astro config | 1 nap | nem |
| 2 | Pages Functions → Astro API routes | fél nap | nem |
| 3 | Kalkulátor kód átemelése | 1-2 nap | nem |
| 4 | Tracking egységesítés | 2-3 nap | nem |
| 5 | Staging + smoke tests | 1 nap | nem |
| 6 | Production rollout + régi subdomain redirect | 1 nap aktív + 1-2 hét passzív | igen |
| 7 | Cleanup | fél nap | minimális |

---

# 0. fázis — Felkészülés

## 0.1 Branch létrehozás

- [ ] `cd d:\painlessmerged\PainlessRemovals2026`
- [ ] `git checkout -b feat/merge-calculator`
- [ ] Commit a jelenlegi tiszta állapotot egy üres commit-tal: `git commit --allow-empty -m "chore: start calculator merge"`

## 0.2 Env / secret audit

A kalkulátor `src/env.d.ts` alapján a következő env varok / secret-ek kellenek élesben. Ezek nagy része már létezik a `painlessv3` Cloudflare Pages projektben — onnan kell kiolvasni az értékeket.

**Szükséges secret-ek (Cloudflare dashboardon `wrangler secret put`):**
- [ ] `RESEND_API_KEY`
- [ ] `TURNSTILE_SECRET_KEY` (jelenleg a `painlessremovals2026` projekten van — átemelni az új worker-projektre)
- [ ] `GA4_API_SECRET`
- [ ] `META_CAPI_ACCESS_TOKEN`
- [ ] `GOOGLE_MAPS_API_KEY`
- [ ] `GOOGLE_SERVICE_ACCOUNT_KEY` (error tracking sheet)
- [ ] `IMVE_API_KEY` (ha van)
- [ ] `HEALTH_CHECK_TOKEN`
- [ ] `IP_HASH_SALT`

**Plain env varok (`wrangler.toml` `[vars]` blokkban):**
- [ ] `SITE_URL = "https://painlessremovals.com"`
- [ ] `ENVIRONMENT = "production"`
- [ ] `GTM_ID = "GTM-PXTH5JJK"`
- [ ] `GA4_MEASUREMENT_ID = "G-..."`
- [ ] `META_PIXEL_ID = "..."`
- [ ] `META_CAPI_TEST_EVENT_CODE = ""` (production-ban üres)
- [ ] `ERROR_SHEETS_ID = "..."`
- [ ] `GOOGLE_SERVICE_ACCOUNT_EMAIL = "..."`
- [ ] `ERROR_EMAIL_TO = "..."`
- [ ] `ERROR_ALERT_FROM = "..."`
- [ ] `IMVE_API_URL = "..."` (ha van)
- [ ] `PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAACs7GfndiZsA_2c4"` (már a meglévő website wrangler.toml-jában)

**Ellenőrzés**: a `painless-calculator/src/lib/config.ts` és `painless-calculator/scripts/health-check.ts` áttekintése — minden env név egyezzen.

## 0.3 KV namespace-ek

A kalkulátor két KV namespace-t használ. Két opció:

**A) Új KV namespace-eket hozunk létre az új worker projektnek** (tisztább, de a meglévő rate-limit / session adatok elvesznek — nem gond, ezek rövid TTL-űek):
```bash
wrangler kv namespace create "RATE_LIMITER"
wrangler kv namespace create "SESSIONS"
```
A visszakapott `id`-ket beírjuk a `wrangler.toml`-ba (1.2 lépés).

**B) Reuse**: a meglévő `painlessv3` projektből kiolvassuk a KV namespace ID-kat (`wrangler kv namespace list` vagy a CF dashboardon) és azokat használjuk.

- [ ] **Választás**: A) opció (új namespace-ek), kivéve ha üzleti indok van a B-re.
- [ ] KV namespace ID-k feljegyezve egy temporary fájlba (lokálisan, NEM commit-olva).

## 0.4 Cloudflare Worker projekt előkészítés

- [ ] Új Worker projekt a CF dashboardon, név: `painlessremovals` (vagy `painlessremovals2026`, ízlés szerint — a régi Pages projekt neve `painlessremovals2026`, ütközne, ha névben kollidáljon → `painlessremovals-worker` vagy `painlessremovals2026-worker`).
- [ ] Custom domain később (a 6. fázisban): `painlessremovals.com` és `www.painlessremovals.com`.
- [ ] **A régi `painlessremovals2026` Pages projekt nem törlendő ebben a fázisban** — végig fut, amíg az új Worker élesedik.

## 0.5 Acceptance

- Branch létezik, üres commit a HEAD-en.
- Env-vars / secret-ek listája dokumentálva, értékek elérhetők egy biztonságos helyen.
- KV namespace ID-k megvannak.
- Új CF Worker projekt létezik (üres), nincs még custom domain.

---

# 1. fázis — Workers config

## 1.1 Dependencies hozzáadása

- [ ] `cd d:\painlessmerged\PainlessRemovals2026`
- [ ] `npm install --save @astrojs/cloudflare @astrojs/react react react-dom @nanostores/react nanostores resend zod clsx tailwind-merge @noble/hashes`
- [ ] `npm install --save-dev @types/react @types/react-dom @types/google.maps tsx`
- [ ] Vitest / Playwright **nem most** kerül be — a 4. fázis után, ha tesztelni akarjuk az új tracking-pattern-t.

**Ellenőrzés**: `npm ls @astrojs/cloudflare @astrojs/react react` — egyik sem peer-warning-ol.

## 1.2 wrangler.toml átírása

A jelenlegi `wrangler.toml` Pages-szintű, át kell írni Workers Static Assets módra.

`PainlessRemovals2026/wrangler.toml` cseréje az alábbira:

```toml
name = "painlessremovals-worker"
main = "./dist/_worker.js/index.js"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]

# Static assets binding — Workers Static Assets
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "404-page"
html_handling = "auto-trailing-slash"

# KV namespaces
[[kv_namespaces]]
binding = "RATE_LIMITER"
id = "<RATE_LIMITER_KV_ID_FROM_0.3>"

[[kv_namespaces]]
binding = "SESSIONS"
id = "<SESSIONS_KV_ID_FROM_0.3>"

# Plain env vars (non-secret)
[vars]
PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAACs7GfndiZsA_2c4"
SITE_URL = "https://painlessremovals.com"
ENVIRONMENT = "production"
GTM_ID = "GTM-PXTH5JJK"
GA4_MEASUREMENT_ID = "<G-... from audit>"
META_PIXEL_ID = "<from audit>"
META_CAPI_TEST_EVENT_CODE = ""
ERROR_SHEETS_ID = "<from audit>"
GOOGLE_SERVICE_ACCOUNT_EMAIL = "<from audit>"
ERROR_EMAIL_TO = "<from audit>"
ERROR_ALERT_FROM = "<from audit>"
IMVE_API_URL = "<from audit, ha van>"
```

A `<...>` placeholder-eket a 0.2 audit alapján töltsd ki. Secret-ek (RESEND_API_KEY stb.) **nem** kerülnek a wrangler.toml-ba — azokat `wrangler secret put <NAME>` parancsokkal állítjuk be a 6. fázis előtt.

- [ ] Fájl átírva, helyérzékeny placeholder-ek kitöltve.
- [ ] **Ellenőrzés**: `wrangler config validate` (ha létezik), vagy próba `wrangler deploy --dry-run`.

## 1.3 astro.config.mjs átírása

A meglévő `PainlessRemovals2026/astro.config.mjs`-be be kell illeszteni a Cloudflare adapter-t és a React integration-t. A meglévő sitemap + redirects logika MARAD.

A módosított fájl tartalma:

```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { redirectMap } from './src/data/redirects.ts';
import { lastmod } from './src/data/lastmod.ts';

const staticRedirects = Object.fromEntries(
  [...redirectMap].map(([from, to]) => {
    const key = from.endsWith('/') ? from : `${from}/`;
    return [key, { status: 301, destination: to }];
  }),
);

const noindexPages = [
  '/affiliate-form/',
  '/concierge-service/',
  '/contact/thank-you/',
  '/house-and-waste-clearance/thank-you/',
  '/jobs/thank-you/',
  '/later-life-moves/',
  '/man-with-a-van-near-bristol/',
  '/partners/home-staging/',
  '/partners/relocation-agents/',
  '/partners/solicitors/',
  '/student-removals-bristol/',
  '/vehicle-check/',
  // Calculator routes — noindex
  '/instantquote/',
  '/instantquote/step-01/',
  '/instantquote/step-02/',
  '/instantquote/step-03/',
  '/instantquote/step-04/',
  '/instantquote/step-05/',
  '/instantquote/step-06/',
  '/instantquote/step-07/',
  '/instantquote/step-08/',
  '/instantquote/step-09/',
  '/instantquote/step-10/',
  '/instantquote/step-11/',
  '/instantquote/your-quote/',
  '/instantquote/thank-you/',
  '/instantquote/simple-callback/',
  '/instantquote/thank-you-callback/',
  '/instantquote/dev-preview/',
];

export default defineConfig({
  site: 'https://painlessremovals.com',
  output: 'static',
  trailingSlash: 'always',
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: { enabled: true },
  }),
  redirects: {
    '/senior-removals-bristol/': '/later-life-moves/',
    ...staticRedirects,
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !noindexPages.some((p) => page.endsWith(p)),
      serialize(item) {
        const path = new URL(item.url).pathname;
        item.lastmod = lastmod[path] ?? new Date().toISOString();
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['nanostores', 'resend'],
      external: [
        'node:stream', 'stream',
        'node:events', 'events',
        'node:url', 'url',
        'node:zlib', 'zlib',
        'node:buffer', 'buffer',
      ],
    },
    define: {
      'import.meta.env.PUBLIC_DEPLOY_ID': JSON.stringify(process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA || 'local'),
      'import.meta.env.PUBLIC_SITE_ID': JSON.stringify('painless-removals'),
    },
    build: { sourcemap: 'hidden' },
  },
});
```

Változások:
- `adapter: cloudflare(...)` hozzáadva.
- `integrations` listához `react()` hozzáadva.
- `vite.ssr` blokk a kalkulátor configból átemelve.
- `vite.define` a kalkulátor environment-injection-ja, **assetsPrefix ELTÁVOLÍTVA**.
- `noindexPages` listához hozzáadva minden kalkulátor URL.

- [ ] Fájl mentve.
- [ ] **Ellenőrzés**: `npx astro check` — nem dob TypeScript hibát az új import-ok miatt.

## 1.4 src/env.d.ts kibővítése

A jelenlegi website-on lehet hogy nincs `env.d.ts`, ellenőrizd: `ls PainlessRemovals2026/src/env.d.ts`. Ha nincs, hozd létre. Ha van, bővítsd.

A teljes tartalom (a kalkulátor `src/env.d.ts`-ből másolva, kiegészítve a website-specifikus var-okkal):

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    // Email
    RESEND_API_KEY: string;

    // Site
    SITE_URL: string;
    ENVIRONMENT: string;

    // Security
    HEALTH_CHECK_TOKEN?: string;
    IP_HASH_SALT?: string;

    // Forms (website)
    TURNSTILE_SECRET_KEY: string;
    PUBLIC_TURNSTILE_SITE_KEY: string;

    // KV Namespaces
    RATE_LIMITER?: KVNamespace;
    SESSIONS?: KVNamespace;

    // Static assets (Workers binding)
    ASSETS: Fetcher;

    // Analytics
    GTM_ID?: string;
    GA4_MEASUREMENT_ID?: string;
    GA4_API_SECRET?: string;
    META_PIXEL_ID?: string;
    META_CAPI_ACCESS_TOKEN?: string;
    META_CAPI_TEST_EVENT_CODE?: string;

    // Error tracking
    ERROR_SHEETS_ID?: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_KEY?: string;
    ERROR_EMAIL_TO?: string;
    ERROR_ALERT_FROM?: string;

    // External APIs
    GOOGLE_MAPS_API_KEY?: string;

    // i-mve
    IMVE_API_URL?: string;
    IMVE_API_KEY?: string;
  }
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Cloudflare.Env;
      ctx: ExecutionContext;
    };
  }
}
```

- [ ] `PainlessRemovals2026/src/env.d.ts` létrehozva / felülírva ezzel a tartalommal.

## 1.5 tsconfig.json — path aliasok ellenőrzése

A kalkulátor `@/*` aliast használ. Ellenőrizd, hogy a website `tsconfig.json`-jában létezik-e:

- [ ] `cat PainlessRemovals2026/tsconfig.json` — ha hiányzik a `compilerOptions.paths."@/*"` mapping, add hozzá:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

A `extends` és többi opció maradjon meg.

## 1.6 package.json scripts frissítése

A `scripts` blokkot bővítsd:

```json
{
  "scripts": {
    "images": "node scripts/optimize-images.mjs",
    "images:force": "node scripts/optimize-images.mjs --force",
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro check && astro build",
    "build:prod": "astro check && astro build && wrangler deploy --dry-run",
    "preview": "astro build && wrangler dev",
    "deploy": "astro check && astro build && wrangler deploy",
    "astro": "astro",
    "check": "astro check",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] `package.json` frissítve.

## 1.7 Acceptance

- `npm run build` lokálisan végigmegy, generál egy `dist/_worker.js/` és `dist/` (statikus assetek) struktúrát.
- `wrangler dev` (vagy `npm run preview`) lokálisan elindul a 8787-es porton, a homepage betölt.
- A 60+ statikus oldal mind ott van a `dist/`-ben mint `<page>/index.html`.
- A `/api/*` még nem létezik (2. fázisban jön), a `/instantquote/*` sem (3. fázisban).

---

# 2. fázis — Pages Functions → Astro API routes

A jelenlegi `PainlessRemovals2026/functions/api/*.ts` fájlokat át kell írni Astro API route-okká. A `functions/` mappa Workers módban **nem fut**.

## 2.1 Forrás-célhely mapping

| Jelenlegi (Pages Function) | Új (Astro API route) |
|---|---|
| `functions/api/contact.ts` | `src/pages/api/contact.ts` |
| `functions/api/jobs.ts` | `src/pages/api/jobs.ts` |
| `functions/api/affiliate.ts` | `src/pages/api/affiliate.ts` |
| `functions/api/partner-register.ts` | `src/pages/api/partner-register.ts` |
| `functions/api/clearance-callback.ts` | `src/pages/api/clearance-callback.ts` |
| `functions/api/vehicle-check.ts` | `src/pages/api/vehicle-check.ts` |
| `functions/_shared/utils.ts` | `src/lib/forms/utils.ts` |

- [ ] `mkdir -p src/pages/api src/lib/forms`
- [ ] Másold át a `_shared/utils.ts`-t `src/lib/forms/utils.ts`-be (változatlanul vagy a Pages-specifikus típuskvetkesztetést a 2.2-es pattern szerint korrigálva).

## 2.2 Átírási pattern

Minden Pages Function átírása ugyanazt a sémát követi.

**Régi (Pages Function pattern)**:
```ts
interface Env { ... }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request.json();
  // ...
  return new Response(JSON.stringify({...}), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

**Új (Astro API route pattern)**:
```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  // 'env' globally available, with all bindings from wrangler.toml
  // ...
  return new Response(JSON.stringify({...}), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

Változások file-ról file-ra:

1. **Felső import**: `import type { APIRoute } from 'astro';` és `import { env } from 'cloudflare:workers';`.
2. **Belső `Env` interface törölve** — a globális `Cloudflare.Env`-et használjuk (1.4-ben definiálva).
3. **`export const prerender = false;`** — ez kritikus, különben az Astro statikus oldalként próbálná pre-renderelni.
4. **`export const onRequestPost`** → **`export const POST: APIRoute`**.
5. **Destructuring**: `({ request, env })` → `({ request })` — az `env`-et globálisan importáljuk.
6. **Origin check** maradjon (Turnstile, ALLOWED_ORIGINS), csak a regex-ben a `painlessremovals2026.pages.dev` mintát ki kell egészíteni a Worker preview URL-jével (`*.painlessremovals-worker.<account>.workers.dev`).

- [ ] **6 fájl átírva** a fenti pattern szerint.
- [ ] **Belső import a `_shared/utils.ts`-re**: az új helye `@/lib/forms/utils.ts`.
- [ ] `functions/` mappa **TÖRÖLVE** (`rm -rf functions`).

## 2.3 Smoke test

- [ ] `npm run preview` lokálisan.
- [ ] `curl -X POST http://localhost:8787/api/contact -H "Content-Type: application/json" -d '{"name":"Test","phone":"1234","email":"t@t.com","honeypot":"","turnstileToken":"dev-bypass","source":"test"}'` — vár vagy 400-at (Turnstile fail) vagy 200-at (ha bypass-ban van), de **nem 404-et** és nem 500-at SyntaxError-rel.
- [ ] Hasonló smoke test a többi 5 endpointra.

## 2.4 Acceptance

- A `functions/` mappa törölve.
- 6 új Astro API route létezik `src/pages/api/` alatt.
- Lokálisan minden endpoint válaszol (akár 4xx-szel is — a lényeg hogy elérhetők).
- A meglévő website form-ok (contact.astro stb.) kódja **még nem változott**, ezek továbbra is `/api/contact`-ra POST-olnak — ez stimmel az új helyzettel.

---

# 3. fázis — Kalkulátor kód átemelése

Ez a fázis fizikailag áthelyezi a kalkulátor forrásfájljait a website repóba, és átnevezi a route-okat `/calculator/` → `/instantquote/`-ra.

## 3.1 Fájl-szintű másolások

A `painless-calculator/` repóból a `PainlessRemovals2026/` repóba a következőket másolod át (cp -r vagy file-by-file, ahogy kényelmes):

| Forrás | Cél | Megjegyzés |
|---|---|---|
| `painless-calculator/src/lib/` | `PainlessRemovals2026/src/lib/` | A website-on nincs `lib/` még → nincs ütközés |
| `painless-calculator/src/components/calculator/` | `PainlessRemovals2026/src/components/calculator/` | Új komponens-mappa |
| `painless-calculator/src/components/icons/` | `PainlessRemovals2026/src/components/icons/` | Új |
| `painless-calculator/src/components/ui/` | `PainlessRemovals2026/src/components/ui/` | shadcn-style UI komponensek |
| `painless-calculator/src/components/ErrorBoundary.astro` | `PainlessRemovals2026/src/components/ErrorBoundary.astro` | Új |
| `painless-calculator/src/components/ErrorBoundary.tsx` | `PainlessRemovals2026/src/components/ErrorBoundary.tsx` | Új |
| `painless-calculator/src/components/GTMHead.astro` | `PainlessRemovals2026/src/components/GTMHead.astro` | Új — a 4. fázisban használjuk |
| `painless-calculator/src/components/GTMBody.astro` | `PainlessRemovals2026/src/components/GTMBody.astro` | Új — a 4. fázisban használjuk |
| `painless-calculator/src/middleware/index.ts` | `PainlessRemovals2026/src/middleware/index.ts` | Új |
| `painless-calculator/scripts/fetch-reviews.ts` | `PainlessRemovals2026/scripts/fetch-reviews.ts` | Új |
| `painless-calculator/scripts/health-check.ts` | `PainlessRemovals2026/scripts/health-check.ts` | Új |
| `painless-calculator/scripts/build-gtm-container.mjs` | `PainlessRemovals2026/scripts/build-gtm-container.mjs` | Új |
| `painless-calculator/scripts/gtm-templates.json` | `PainlessRemovals2026/scripts/gtm-templates.json` | Új |
| `painless-calculator/GTM-PXTH5JJK_workspace_v2.json` | `PainlessRemovals2026/GTM-PXTH5JJK_workspace_v2.json` | A GTM container backup |
| `painless-calculator/docs/tracking.md` | `PainlessRemovals2026/docs/tracking.md` | Dokumentáció |
| `painless-calculator/CLAUDE.md` | (merge a website CLAUDE.md-jébe, ha van; ha nincs, másold át) | Tracking szabályok |

- [ ] **MINDEN fenti másolás kész**.
- [ ] **Public assetek** (3.4 lépés alatt).

## 3.2 Pages átemelése + URL átnevezés

A kalkulátor pages-eit nem direkt átmásoljuk, hanem **átnevezve**, hogy a `/instantquote/` URL prefix érvényesüljön.

| Forrás | Cél |
|---|---|
| `painless-calculator/src/pages/index.astro` | **NEM másolandó** (a website-nak van saját index-e) — viszont a logikáját át kell írni az új index.astro-nak: lásd 3.7 |
| `painless-calculator/src/pages/calculator/index.astro` | `PainlessRemovals2026/src/pages/instantquote/index.astro` |
| `painless-calculator/src/pages/calculator/[step].astro` | `PainlessRemovals2026/src/pages/instantquote/[step].astro` |
| `painless-calculator/src/pages/calculator/_app.tsx` | `PainlessRemovals2026/src/pages/instantquote/_app.tsx` |
| `painless-calculator/src/pages/calculator/simple-callback.astro` | `PainlessRemovals2026/src/pages/instantquote/simple-callback.astro` |
| `painless-calculator/src/pages/calculator/thank-you.astro` | `PainlessRemovals2026/src/pages/instantquote/thank-you.astro` |
| `painless-calculator/src/pages/calculator/thank-you-callback.astro` | `PainlessRemovals2026/src/pages/instantquote/thank-you-callback.astro` |
| `painless-calculator/src/pages/your-quote.astro` | `PainlessRemovals2026/src/pages/instantquote/your-quote.astro` |
| `painless-calculator/src/pages/dev-preview.astro` | `PainlessRemovals2026/src/pages/instantquote/dev-preview.astro` |
| `painless-calculator/src/pages/404.astro` | **NEM másolandó** (a website-nak van saját 404-e) |
| `painless-calculator/src/pages/500.astro` | `PainlessRemovals2026/src/pages/500.astro` (ha a website-on nincs) |
| `painless-calculator/src/pages/api/calculate.ts` | `PainlessRemovals2026/src/pages/api/calculate.ts` |
| `painless-calculator/src/pages/api/callbacks.ts` | `PainlessRemovals2026/src/pages/api/callbacks.ts` |
| `painless-calculator/src/pages/api/error-report.ts` | `PainlessRemovals2026/src/pages/api/error-report.ts` |
| `painless-calculator/src/pages/api/health.ts` | `PainlessRemovals2026/src/pages/api/health.ts` |
| `painless-calculator/src/pages/api/save-quote.ts` | `PainlessRemovals2026/src/pages/api/save-quote.ts` |
| `painless-calculator/src/pages/api/validate.ts` | `PainlessRemovals2026/src/pages/api/validate.ts` |
| `painless-calculator/src/pages/api/meta/` | `PainlessRemovals2026/src/pages/api/meta/` |
| `painless-calculator/src/pages/api/track/` | `PainlessRemovals2026/src/pages/api/track/` |

- [ ] **MINDEN page és API route átmásolva** a fenti táblázat szerint.
- [ ] **A 6 áthelyezett kalkulátor API route mindegyikében**: `export const prerender = false;` benne van-e? Ha nem, **add hozzá**. Ezek SSR-ezni fognak.
- [ ] **A 8 áthelyezett kalkulátor `.astro` page mindegyikében**: `export const prerender = false;` benne van-e? Ha nem, **add hozzá**. Ezek is SSR-ezni fognak (mert a `layout-calculator.astro` `import { env } from 'cloudflare:workers'`-t használ).

## 3.3 Public assetek átmásolása

| Forrás | Cél |
|---|---|
| `painless-calculator/public/images/calculator/` | `PainlessRemovals2026/public/images/calculator/` |
| `painless-calculator/public/images/email/` | `PainlessRemovals2026/public/images/email/` |
| `painless-calculator/public/images/howknow/` | `PainlessRemovals2026/public/images/howknow/` |
| `painless-calculator/public/images/reviews/` | `PainlessRemovals2026/public/images/calculator-reviews/` ← **átnevezve** ütközés-elkerülés miatt |

- [ ] Fenti másolások kész.
- [ ] **A kalkulátor kódjában** keresd `images/reviews/` előfordulásokat (`grep -r "images/reviews/" PainlessRemovals2026/src/lib PainlessRemovals2026/src/components/calculator`) és írd át `images/calculator-reviews/`-re. **Vigyázat**: a website-on is van `images/reviews/`, az nem érintett.

## 3.4 URL search-and-replace

A kalkulátor kódbázisában minden `/calculator/` URL-t át kell írni `/instantquote/`-ra.

**Search target paths**: csak a most átemelt fájlokon dolgozunk:
- `PainlessRemovals2026/src/lib/`
- `PainlessRemovals2026/src/components/calculator/`
- `PainlessRemovals2026/src/components/icons/`
- `PainlessRemovals2026/src/components/ui/`
- `PainlessRemovals2026/src/middleware/`
- `PainlessRemovals2026/src/pages/instantquote/`
- `PainlessRemovals2026/src/pages/api/calculate.ts`, `callbacks.ts`, `error-report.ts`, `health.ts`, `save-quote.ts`, `validate.ts`, `meta/*`, `track/*`

**Csere-lépések**:

- [ ] `/calculator/step-` → `/instantquote/step-` (mind a 12 step-ID).
- [ ] `/calculator/thank-you` → `/instantquote/thank-you`.
- [ ] `/calculator/thank-you-callback` → `/instantquote/thank-you-callback`.
- [ ] `/calculator/simple-callback` → `/instantquote/simple-callback`.
- [ ] `/calculator/your-quote` (ha létezik valahol) → `/instantquote/your-quote`.
- [ ] `/your-quote` (a calc kódjában a quote URL) → `/instantquote/your-quote`. **Vigyázat**: csak akkor csere, ha az nem string vagy URL keletkezik a website root-ján — `grep -rn "'/your-quote'" src/` és kézi áttekintés.
- [ ] `'/calculator'` (önmagában, redirect target-ként) → `'/instantquote'`.
- [ ] **Trailing slash konzisztencia**: minden Astro `redirect()` és belső link `/`-re végződjön.

**Email template URL-ek** (kézi átnézés szükséges):
- [ ] `src/lib/core/email/templates/customer-confirmation.ts` — minden `https://calc.painlessremovals.com/...` átírva `https://painlessremovals.com/...`-ra. Ezen belül a quote-link-ek `/calculator/` → `/instantquote/`.
- [ ] `src/lib/core/email/templates/admin-notification.ts` — ugyanez.
- [ ] `src/pages/api/callbacks.ts` (és más email-küldő API-k) — same.

**Dev hivatkozások** (cleanup, de nem kritikus):
- [ ] `painless-calculator-prompt.txt` — **ne másold át**, ez fejlesztői belső fájl.

## 3.5 calc.painlessremovals.com referenciák tisztítása

Minden hivatkozást a régi subdomainre tisztítunk:

- [ ] `src/lib/config.ts` — keresd `calc.painlessremovals.com` előfordulásokat:
  - `assetBaseUrl` mezőt írd át üresre (`''`) production-ban is, mert most ugyanazon a domainen futunk.
  - A `https://calc.painlessremovals.com` literált cseréld `https://painlessremovals.com`-ra.
- [ ] `src/pages/api/callbacks.ts` 50. sor — `const IMG = 'https://calc.painlessremovals.com/images/email'` → `'https://painlessremovals.com/images/email'`.
- [ ] `src/lib/core/email/templates/customer-confirmation.ts` 12. sor — same.
- [ ] **Email preview HTML fájlok** (`email-preview.html`, `email-previews/*`): NEM másolandók át a website repóba — fejlesztői preview-k, csak a calc repóban legyenek.

## 3.6 Layout-egyesítés

A kalkulátor saját `LayoutCalculator.astro`-t használ, a website saját `Layout.astro`-t. **Egységesítjük**:

**Döntés**: a kalkulátor pages-ei a `Layout.astro`-t használják (website-os fejléccel + lábléccel), DE egy speciális prop-pal (`variant="calculator"`), ami:
- elrejti a fő navigációt és a CTA-bart (a kalkulátorban nem kell `/instantquote/` CTA gomb a header-ben).
- elrejti a footer hosszú részét (csak minimalista copyright marad).
- megengedi a `/instantquote/` route-okra a saját `prerender = false` opt-out-ot.

**Lépések**:

- [ ] `src/layouts/Layout.astro` Props interface bővítése: `variant?: 'default' | 'calculator'`. Default: `'default'`.
- [ ] A header/footer markupban conditional render: `{variant !== 'calculator' && <header>...</header>}` — vagy egyszerűbb verzió, ahol a CTA gomb csak default variant-ban jelenik meg.
- [ ] A kalkulátor `LayoutCalculator.astro` által betöltött scripteket (Maps API, tracking boot, error tracking, web vitals) **a fő `Layout.astro`-ba** is be kell tenni, hogy minden oldal egységes legyen — **DE** a tracking-init a 4. fázis része, itt csak a Maps API kerül be feltételesen:
  ```astro
  {googleMapsApiKey && variant === 'calculator' && (
    <script async defer src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places,routes&loading=async`} />
  )}
  ```
- [ ] Az `instantquote/`-on belüli minden `.astro` page-en cseréld a `import LayoutCalculator from '@/components/calculator/layout-calculator.astro';` import-ot `import Layout from '@/layouts/Layout.astro';`-ra, és a `<LayoutCalculator>` JSX tag-et `<Layout variant="calculator">`-ra.
- [ ] Az ősi `src/components/calculator/layout-calculator.astro` fájl **TÖRÖLHETŐ**.

## 3.7 Index page logika

A kalkulátor `painless-calculator/src/pages/index.astro` egy `Astro.redirect('/calculator/step-01')` volt — a website index-e már létezik és teljesen más tartalmú. **Marad a website index.astro változatlanul.**

A `/instantquote/` (mint belépő URL) viszont a `/instantquote/step-01/`-re kell redirecteljen. A `painless-calculator/src/pages/calculator/index.astro` ezt csinálja — átmásolva `PainlessRemovals2026/src/pages/instantquote/index.astro`-ba a 3.2 lépésben, ott csak a redirect target kell hogy `/instantquote/step-01/` legyen (3.4 csere már megcsinálta).

- [ ] **Smoke**: `npm run preview` után `/instantquote/` → 301/302 redirect a `/instantquote/step-01/`-re.

## 3.8 Style integráció

A kalkulátor `src/styles/global.css`-ét **NEM merge-eljük** a website `src/styles/global.css`-ébe (vizuális különbség OK, lásd korábbi döntés).

**Megoldás**: A kalkulátor saját `global.css`-ét hozzuk át és **csak a kalkulátor pages-eken importáljuk** — ez a jelenlegi `LayoutCalculator.astro` viselkedés volt (`import '@/styles/global.css';`). Mivel most a `Layout.astro`-t használjuk a `variant="calculator"`-ral, és a `Layout.astro` a website `global.css`-ét tölti, a kalkulátor stílusait konditionálisan kell betölteni.

- [ ] Másold `painless-calculator/src/styles/global.css` → `PainlessRemovals2026/src/styles/calculator.css`.
- [ ] A `Layout.astro`-ban:
  ```astro
  ---
  import '@/styles/global.css';
  if (Astro.props.variant === 'calculator') {
    // import nem feltételes — a Tailwind 4-ben a CSS-fájlok import-jai build-time-ban resolvolódnak
    // Helyette: külön CSS-fájlt link-elünk
  }
  ---
  ```
- [ ] **Inkább**: a `Layout.astro` head-jében:
  ```astro
  {variant === 'calculator' && (
    <link rel="stylesheet" href="/styles/calculator.css" />
  )}
  ```
  És a `calculator.css`-t **átmásolod** a `public/styles/calculator.css` alá (build-folyamat nélkül), VAGY használj `astro:assets` import-ot egy közbülső komponensben.

  **Egyszerűbb pattern**: csinálj egy `src/components/CalculatorStyleScope.astro` komponenst, ami `import '@/styles/calculator.css';` egyetlen sort tartalmaz, és **csak a `instantquote/` pages-eken** használod. A Tailwind 4 build így csak ott húzza be.

- [ ] Választott megoldás dokumentálva a commit message-ben.
- [ ] Az `instantquote/` pages-ek mind importálják a `CalculatorStyleScope`-ot vagy az `<link>`-et a Layout `head` slot-ján át.

## 3.9 Acceptance

- `npm run dev` lokálisan elindul, a website index betölthető.
- `/instantquote/` → redirect `/instantquote/step-01/`-re.
- `/instantquote/step-01/` betölt, a kalkulátor első lépése látható.
- Kalkulátor a kalkulátor saját stílusával jelenik meg.
- Website oldalak (`/`, `/about/`, `/pricing/` stb.) **változatlanul** működnek és néznek ki.
- `npm run check` (`astro check`) **0 hibát** ad — minden import resolve-olódik.
- `dist/` build-ben látszik mindkét világ (statikus HTML-ek a 60+ SEO oldalra, és `_worker.js` a kalkulátor + API SSR-re).
- A régi `functions/` mappa nem létezik, és a régi `LayoutCalculator.astro` nem létezik.

---

# 4. fázis — Tracking egységesítés

Ez a leghosszabb és legmagasabb-kockázatú fázis. A 4a-4e szakaszokat **külön commit-okra** bontjuk, hogy szükség esetén szelektíven revertálhassunk.

## 4a. Régi website tracking eltávolítása

**Commit message**: `chore(tracking): remove legacy GTM bootstrap and per-form dataLayer pushes`

- [ ] **`src/layouts/Layout.astro`** — töröld:
  - 272-279. sor: a GTM bootstrap inline `<script>` blokkot.
  - 282-303. sor: az UTM/click ID capture inline `<script>` blokkot.
  - 308-309. sor: a `<noscript>` GTM iframe-et.
- [ ] **`src/pages/contact.astro`** — töröld a 480-487 körüli `dataLayer.push({ event: 'form_submission' ... })` blokkot. (A 4c-ben új tracking pattern kerül helyére.)
- [ ] **`src/pages/affiliate-form.astro`** — töröld a 236-237 körüli dataLayer push-t.
- [ ] **`src/pages/jobs.astro`** — töröld a 529-530 körüli dataLayer push-t.
- [ ] **`src/pages/partners/index.astro`** — keresd `form_submission` előfordulást, töröld.
- [ ] **`src/components/ClearanceCalculator.astro`** — töröld a 547-548 körüli dataLayer push-t.

**Ellenőrzés**: `grep -rn "dataLayer\|GTM-PXTH5JJK\|googletagmanager\|gtm\.js" src/` — **0 találat** a `src/` alatt (a ki nem vett `SESSION-CHANGES.md`-ben még maradhat találat, az dokumentum).

## 4b. Kalkulátor tracking infra felhúzása

**Commit message**: `feat(tracking): install calculator tracking system site-wide`

A kalkulátor tracking már be lett másolva a 3. fázisban (`src/lib/tracking/`, `src/lib/errors/`, `GTMHead.astro`, `GTMBody.astro`). Most ezeket aktiváljuk a teljes site-on.

### 4b.1 Layout.astro — tracking init

**`src/layouts/Layout.astro`** módosítások:

- [ ] **A `<head>` ELEJÉN** (még a font-preload-ok ELŐTT — a Consent Mode default kritikusan a legelső kell hogy legyen):
  ```astro
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- TRACKING: Consent Mode v2 default + GTM bootstrap.
         MUST be the first scripts in <head>. See docs/tracking.md rule #5. -->
    <GTMHead />

    <!-- ... existing head content ... -->
  </head>
  ```
  Az `import GTMHead from '@/components/GTMHead.astro';` import a frontmatter-be.

- [ ] **A `<body>` legelején** (a noscript skip-link előtt is):
  ```astro
  <body class="bg-warm-white antialiased">
    <GTMBody />
    <!-- ... existing body content ... -->
  </body>
  ```
  Az `import GTMBody from '@/components/GTMBody.astro';` import a frontmatter-be.

- [ ] **A `<body>` ALJÁN** (a record-záró markup után, közvetlenül a `</body>` előtt):
  ```astro
    <!-- TRACKING: bootstrap. Resumes quote timer, installs click + scroll listeners. -->
    <script>
      import '@/lib/tracking/boot';
    </script>

    <!-- ERROR TRACKING: must be last script before </body> -->
    <script>
      import { initGlobalCatcher } from '@/lib/errors/client-catcher';
      import { initWebVitals } from '@/lib/errors/web-vitals';
      initGlobalCatcher({
        endpoint: '/api/error-report',
        siteId: import.meta.env.PUBLIC_SITE_ID || 'painless-removals',
        deployId: import.meta.env.PUBLIC_DEPLOY_ID || '',
        isDev: import.meta.env.DEV,
      });
      initWebVitals();
    </script>
  </body>
  ```

### 4b.2 UTM capture pattern egyesítés

A kalkulátor tracking system már tartalmaz UTM capture-t a `lib/tracking/boot.ts`-ben (vagy `lib/tracking/tracking.ts`-ben — ellenőrizd). Ha nem, a kalkulátorban implicit volt mert ott a `tracking.ts` modulnak ez része volt.

- [ ] **Ellenőrzés**: `grep -rn "utm_source\|gclid\|fbclid\|pr_tracking\|sessionStorage" src/lib/tracking/` — kell hogy legyen egy modul, ami megfogja a URL paramétereket és sessionStorage-be teszi.
- [ ] Ha **nincs**: portolj a website régi Layout.astro 282-303. soraiból egy `src/lib/tracking/utm-capture.ts` modult, és a `lib/tracking/boot.ts`-ből hívd meg az init-et.

### 4b.3 Acceptance

- [ ] `npm run dev` után a homepage-en a böngésző DevTools console-ban: `window.dataLayer` definiálva, első item a `gtag('consent', 'default', {...})`, második item a `'gtm.js'` event.
- [ ] Network tab: `gtm.js?id=GTM-PXTH5JJK` betöltődik.
- [ ] `?utm_source=test&utm_medium=cpc` URL paraméterrel a homepage-en: `sessionStorage.getItem('pr_tracking')` JSON-ként tartalmazza.
- [ ] DevTools console-ban a `window` objektumon: `window.gtag`, `window.trackEvent` (ha exportálva van) elérhető.

## 4c. Form-szintű tracking migráció

**Commit message**: `feat(tracking): migrate website forms to calculator tracking pattern`

A 4 nem-konverziós form (`jobs`, `affiliate`, `partner_register`, `clearance_callback`) és az 1 konverziós form (`contact`) különböző bánásmódot kap.

### 4c.1 Nem-konverziós form-ok

Pattern minden formhoz: a sikeres response branch-ben **client-side** `trackEvent('form_submission', { form_name, ... })` hívás, server-side mirror **NEM** kell.

A kalkulátor `lib/tracking/tracking.ts` API-ja: `trackEvent(eventName: string, params?: Record<string, unknown>)`. Ez auto-generál `event_id`-t és push-ol a dataLayer-be.

**`src/pages/jobs.astro`** sikeres submit branch-ében (oda, ahol a régi `dataLayer.push` volt):

```ts
import { trackEvent } from '@/lib/tracking/tracking';
// ...
// On success response from /api/jobs:
trackEvent('form_submission', {
  form_name: 'job_application',
  form_source: 'jobs_page',
});
```

- [ ] `src/pages/jobs.astro` átírva.
- [ ] `src/pages/affiliate-form.astro`: `trackEvent('form_submission', { form_name: 'affiliate', form_source: 'affiliate_page' })`.
- [ ] `src/pages/partners/index.astro`: `trackEvent('form_submission', { form_name: 'partner_register', form_source: 'partners_page' })`.
- [ ] `src/components/ClearanceCalculator.astro`: `trackEvent('form_submission', { form_name: 'clearance_callback', form_source: 'house_clearance_page' })`.

**Megjegyzés**: ha a `trackEvent` ESM import-ja inline scriptbe nem fér be (mert a régi inline scriptek `<script is:inline>`-ben voltak), akkor a `<script>` tag-eket inline-ról cseréld le sima `<script>`-re, így az Astro a Vite-en át bundlolja.

### 4c.2 Contact form — konverzió, server-side fire

Ez a komplex eset. A pattern:

1. Kliens generál `event_id`-t (uuid).
2. POST `/api/contact` body-jához hozzáteszi: `{ ..., event_id, user_data: { email, phone, name } }`.
3. Server `/api/contact` route:
   - Validate: input + Turnstile token.
   - Send email via Resend.
   - **Csak ha mindkettő success**: GA4 MP fire + Meta CAPI fire (azonos `event_id`-vel, hashed user_data-val).
   - Return `{ success: true, event_id }`.
4. Kliens success branch:
   - `trackEvent('contact_conversion', { event_id, form_source: ... })` — browser-side fire.
   - **Plusz** a sima `trackEvent('form_submission', { form_name: 'contact', ... })` analytics-célra.

**`src/pages/api/contact.ts`** (a 2.2-ben átírt fájl) bővítése a sikeres branch-ben:

```ts
import { trackServerConversion } from '@/lib/tracking/server';

// ... after Turnstile validation passes and Resend email send succeeds ...

const { event_id, user_data } = body;

// Only fire conversion if event_id is present (i.e., from our own front-end).
// Skip server-side fire if event_id is missing — fall back to client-side only.
if (event_id && typeof event_id === 'string') {
  await trackServerConversion({
    eventName: 'contact_form_conversion',
    eventId: event_id,
    userData: user_data,  // server hashes via @noble/hashes
    customData: {
      form_source: body.source ?? 'contact_form',
    },
    request,
  });
}

return json({ success: true, event_id });
```

A `trackServerConversion` egy új helper, amit a `src/lib/tracking/server.ts`-ben kell felvenni — vagy ha már létezik `serverTrack` / `mirrorToGA4MP` / `mirrorToMetaCAPI` függvények, használd azokat. **Ellenőrizd a `painless-calculator/src/lib/tracking/server.ts`-t és a `meta-mirror.ts`-t a meglévő API-ért.**

- [ ] `src/pages/api/contact.ts` átírva.
- [ ] `src/lib/tracking/server.ts` exportálja a `trackServerConversion` (vagy ekvivalens) függvényt.

**`src/pages/contact.astro`** kliens kód:

```ts
import { trackEvent } from '@/lib/tracking/tracking';
import { setUserDataOnDOM } from '@/lib/tracking/tracking';
import { generateEventId } from '@/lib/tracking/uuid';

// On form submit:
const event_id = generateEventId();

// PII goes to hidden DOM element (NOT to dataLayer) — see tracking rule #1.
setUserDataOnDOM({
  email: form.email,
  phone: form.phone,
  name: form.name,
});

const response = await fetch('/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...form,
    event_id,
    user_data: { email: form.email, phone: form.phone, name: form.name },
  }),
});

const data = await response.json();
if (data.success) {
  // Analytics event
  trackEvent('form_submission', {
    form_name: 'contact',
    form_source: 'contact_page',
    event_id,
  });
  // Conversion event (browser-side, deduped with server fire by event_id)
  trackEvent('contact_form_conversion', {
    form_source: 'contact_page',
    event_id,
  });
  // Redirect to thank-you page
  window.location.href = '/contact/thank-you/';
}
```

- [ ] `src/pages/contact.astro` kliens kód átírva ezzel a pattern-rel.

### 4c.3 Acceptance

- [ ] Lokális smoke test: contact formot kitöltve, DevTools Network: a `/api/contact` POST body tartalmaz `event_id`-t és `user_data`-t.
- [ ] DevTools dataLayer (`window.dataLayer`): a sikeres submit után 2 új event van push-olva, mindkettő ugyanazzal az `event_id`-vel.
- [ ] Hidden DOM element (`<input type="hidden" id="user_data_email">` vagy hasonló — a kalkulátor pattern-je) értéket kap, **DE** az `dataLayer`-ben **NINCS** PII (rule #1).
- [ ] A többi 4 form: dataLayer push `form_submission` event-tel, **NEM** kerül conversion fire-re.

## 4d. CTA-konverziók (phone, email, WhatsApp clicks)

**Commit message**: `feat(tracking): add CTA conversion tracking for tel/mailto/whatsapp`

A kalkulátor `src/lib/tracking/global-listeners.ts`-ében már van click listener — ezt bővítjük (vagy ha nem létezik, hozzuk létre).

**`src/lib/tracking/global-listeners.ts`** módosítás (vagy létrehozás):

```ts
import { trackEvent } from './tracking';
import { markQuoteUpgraded } from './conversion-state';

function getSourcePage(): string {
  return window.location.pathname;
}

function isWhatsAppLink(href: string): boolean {
  return /^https:\/\/(wa\.me|api\.whatsapp\.com|whatsapp\.com\/send)/.test(href);
}

export function installCtaListeners() {
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a');
    if (!target) return;
    const href = target.getAttribute('href') ?? '';

    // Phone click conversion
    if (href.startsWith('tel:')) {
      // If user has an active quote state from calculator, mark as upgrade;
      // otherwise fire stand-alone phone_click_conversion.
      if (!markQuoteUpgraded('phone_click')) {
        trackEvent('phone_click_conversion', { source_page: getSourcePage() });
      }
      return;
    }

    // Email click conversion
    if (href.startsWith('mailto:')) {
      if (!markQuoteUpgraded('email_click')) {
        trackEvent('email_click_conversion', { source_page: getSourcePage() });
      }
      return;
    }

    // WhatsApp click conversion
    if (isWhatsAppLink(href)) {
      if (!markQuoteUpgraded('whatsapp_click')) {
        trackEvent('whatsapp_click_conversion', { source_page: getSourcePage() });
      }
      return;
    }

    // Instant Quote CTA click — analytics only, NOT a conversion
    if (href === '/instantquote/' || href.startsWith('/instantquote/?') || href.startsWith('/instantquote?')) {
      trackEvent('instant_quote_cta_click', { source_page: getSourcePage() });
      return;
    }
  }, { capture: true });
}
```

A `markQuoteUpgraded(action)` a kalkulátor `lib/tracking/conversion-state.ts`-ben definiált függvény. Ellenőrizd a return type-ot:
- Ha visszatér `true`-val → volt aktív quote, fire-olta a `quote_calculator_conversion`-t, ne fire-oljuk a stand-alone conversion-t.
- Ha visszatér `false`-szal → nem volt aktív quote, fire-oljunk stand-alone `*_click_conversion`-t.

**Ha a jelenlegi `markQuoteUpgraded` `void`-ot ad vissza**, akkor módosítsd, hogy `boolean`-t adjon vissza a fenti pattern-hez.

- [ ] `src/lib/tracking/global-listeners.ts` módosítva / létrehozva.
- [ ] **`src/lib/tracking/boot.ts`** hívja meg az `installCtaListeners()`-t — ellenőrizd, és add hozzá ha hiányzik.

### Acceptance

- [ ] Lokális teszt: kattints a `<a href="tel:01172870082">` linkre a homepage-en. DevTools dataLayer: új event `phone_click_conversion`-nel, `source_page: '/'`-vel.
- [ ] Mailto link: ugyanígy `email_click_conversion`.
- [ ] WhatsApp link (ha van a layoutban): `whatsapp_click_conversion`.
- [ ] `/instantquote/` CTA gomb (Layout-ban a desktop és mobile header): `instant_quote_cta_click`.
- [ ] Nincs duplikált event a `/calculator/step-XX/` (most már `/instantquote/step-XX/`) oldalakon — a markQuoteUpgraded fallback-je megfogja.

## 4e. GTM container audit

**Commit message**: `docs(tracking): audit GTM container against new event taxonomy`

A `GTM-PXTH5JJK` container backup-ja a `GTM-PXTH5JJK_workspace_v2.json` fájl (3.1-ben átmásolva). Ezt **manuálisan** át kell vizsgálni, vagy beimport-álni egy GTM staging workspace-be és ellenőrizni a tag/trigger lefedettséget.

**Ellenőrzendő events (ezekre kell legyen Tag a containerben):**

| Event név | Cél tag | Konverzió? |
|---|---|---|
| `gtm.js` | (built-in) | – |
| `gtm.dom`, `gtm.load` | (built-in) | – |
| `tracking_params` (régi) | törölhető tag — nem használjuk az új pattern-ben | – |
| `form_submission` | GA4 Event tag — analytics only | nem |
| `contact_form_conversion` | GA4 Event + Google Ads Conversion + Meta Custom Event | **igen** |
| `phone_click_conversion` | GA4 Event + Google Ads Conversion | **igen** |
| `email_click_conversion` | GA4 Event + Google Ads Conversion | **igen** |
| `whatsapp_click_conversion` | GA4 Event + Google Ads Conversion | **igen** |
| `instant_quote_cta_click` | GA4 Event — analytics only | nem |
| `quote_calculator_complete` | GA4 Event — funnel step | nem |
| `quote_calculator_conversion` | GA4 Event + Google Ads Conversion + Meta Custom Event | **igen** |
| `form_abandonment` | GA4 Event — best-effort | nem |
| `web_vitals` | GA4 Event — perf monitoring | nem |
| `error_report` (vagy hasonló) | GA4 Event vagy custom | nem |

**Lépések:**

- [ ] GTM UI-ban login a `GTM-PXTH5JJK` container-be.
- [ ] Új workspace: `merge-calculator-audit`.
- [ ] Importáld be a `GTM-PXTH5JJK_workspace_v2.json` fájlt egy backup-workspace-be (csak referenciaként).
- [ ] A fenti táblázat alapján ellenőrizd minden event-re: van-e trigger, van-e tag, milyen target.
- [ ] **Hiányzó tag-ek** létrehozása:
  - `phone_click_conversion`, `email_click_conversion`, `whatsapp_click_conversion` mind külön Google Ads Conversion + GA4 Event tag-gel.
  - `contact_form_conversion`: Google Ads Conversion + Meta Custom Event (a Meta CAPI dedupe-hoz `event_id` paramétert is forward-olni).
- [ ] **Tag-ek a `tracking_params` event-re**: töröld vagy disabled-re, mert az új pattern nem használja.
- [ ] **Tag-ek a régi `form_submission` Google Ads Conversion-re** (ha volt — pl. a website jelenleg feltehetően erre konvertált): töröld vagy módosítsd, hogy csak a `contact_form_conversion`-re tüzeljen (ne minden form-ra).
- [ ] **Consent Mode**: ellenőrizd hogy a `Consent Initialization - All Pages` triggeren van-e CookieYes CMP loader tag.
- [ ] **Preview mode** a workspace-en: lokálisan az új pattern-rel végigfuttatva (form submit, CTA click, kalkulátor), minden tag tüzel-e.
- [ ] Ha rendben: publish workspace-t **élesbe**.

**Megjegyzés**: ezt a lépést **nem Claude Code csinálja**, hanem ember a GTM UI-ban. De a `MIGRATION_PLAN.md`-ben explicit checkbox-ként szerepel.

## 4f. Acceptance az egész 4. fázisra

- DevTools dataLayer-ben minden várt event látszik (4c és 4d acceptance test-ek).
- GTM Preview mode-ban minden új event-hez van legalább egy tüzelő tag.
- A régi `dataLayer.push` blokkok teljesen eltűntek a `src/`-ből.
- `npm run check` 0 hibát ad.

---

# 5. fázis — Staging + smoke tests

**Commit message**: `chore(deploy): staging deploy of merged repo`

## 5.1 Cloudflare Worker preview deploy

- [ ] `wrangler secret put RESEND_API_KEY` (és minden további secret a 0.2-ből).
- [ ] `npm run build`.
- [ ] `wrangler deploy` — egyelőre custom domain nélkül, csak a default `painlessremovals-worker.<account>.workers.dev` URL-en.

A régi `painlessv3` és `painlessremovals2026` Pages projektek élesben **továbbra is futnak**, ez nem érinti őket.

## 5.2 Smoke test checklist a Worker URL-en

**Statikus oldalak** (mintából 5 db):
- [ ] `/` — homepage betölt, Hero kép, USP bar, navigáció.
- [ ] `/about/` — about oldal, Jay Newton oldal `/about/jay-newton/`.
- [ ] `/pricing/` — pricing.
- [ ] `/removals-bristol-to-london/` — egy long-distance route.
- [ ] `/contact/` — contact form látszik.

**Kalkulátor**:
- [ ] `/instantquote/` → redirect `/instantquote/step-01/`.
- [ ] `/instantquote/step-01/` betölt, a service-type lépés látszik.
- [ ] Végigjárod a 12 lépést egy fake adattal (postcode-ok, méret, dátum, contact info), elmentődik a quote.
- [ ] `/instantquote/your-quote/` betölt a végén, a kvóta látható.
- [ ] Email-küldés: ellenőrzés, hogy a Resend log-ban (vagy a megadott teszt-email-fiókban) megjelenik a customer + admin email.

**Form-ok** (mind az 5):
- [ ] Contact form: Turnstile token-nel sikeres submit, response `{ success: true, event_id: "..." }`.
- [ ] Jobs form: ugyanez.
- [ ] Affiliate form: ugyanez.
- [ ] Partner register: ugyanez.
- [ ] Clearance callback (a ClearanceCalculator komponensen át).

**Tracking validáció (DevTools)**:
- [ ] dataLayer első item: `gtag('consent', 'default', {...})`.
- [ ] `gtm.js?id=GTM-PXTH5JJK` betöltve.
- [ ] Phone link click → `phone_click_conversion` event a dataLayer-ben.
- [ ] Mailto link click → `email_click_conversion`.
- [ ] WhatsApp link click → `whatsapp_click_conversion`.
- [ ] Contact form sikeres submit → 2 event (`form_submission` + `contact_form_conversion`), azonos `event_id`-vel.
- [ ] Network tab: `/api/meta/capi` POST request indult (server-side mirror).
- [ ] Kalkulátor 12. lépés sikeres → `quote_calculator_complete` event.
- [ ] PII (email, phone, name) **NINCS** a dataLayer-ben sehol — csak hidden DOM-elemen át.

**Performance**:
- [ ] Lighthouse audit a homepage-en: Performance ≥ 90, SEO = 100, Best Practices ≥ 95.
- [ ] Lighthouse audit a `/instantquote/step-01/`-en: Performance ≥ 80 (SSR oldal, alacsonyabb cél).
- [ ] Network tab: nincs request a `calc.painlessremovals.com`-ra.

**Error tracking**:
- [ ] Manuálisan dobj egy `throw new Error('test')`-et egy kalkulátor lépésen — a Google Sheet (`ERROR_SHEETS_ID`) megkapja-e.

## 5.3 Acceptance

- Mind az 5.2-es checklist tételei zöldek.
- A Worker preview URL-en 24 órás megfigyelés alatt nincs ismeretlen 500-as response.
- A GTM Preview Mode-ban a worker URL-en végigjárt user-flow-k mind tüzelik a várt tag-eket.

---

# 6. fázis — Production rollout

**Commit message**: `release: merge calculator into main site at /instantquote/`

A rollout-ot szakaszosan csináljuk, hogy bármikor visszafordíthassuk.

## 6.1 Tracking-only rollout (előzetes)

A tracking-átállás (4. fázis) **2-3 nappal előrébb élesedik**, mint az `/instantquote/` route. Logika: a tracking-cserét külön kell figyelni, mert a 24-48 órás GA4/Ads adatok delay-jel jönnek be — ha ütközik a `/instantquote/` rollout-tal, nem tudjuk eldönteni melyik okozta a regresszó-t.

**De**: jelen merge-ben a tracking és az URL-átállás ugyanabban a deploy-ban érkezik a Worker-re. Megoldás:

**Opció A** (egyszerűbb, de kockázatosabb): egyetlen deploy mindennel. Erős staging-tesztre építünk.

**Opció B** (biztonságosabb): először a website-os repón egy **tracking-only PR**-t veszünk élesbe a régi Pages-en (ahol most a `painlessremovals2026` projekt fut), 4a + 4b + 4c + 4d változtatásokkal. 48 óra megfigyelés. Aztán külön PR-rel a Worker-re átállunk.

- [ ] **Választás**: Opció B preferált, ha üzleti idő engedi. Ha nem (pl. 1 héten belül kell éles), Opció A erős staging-gel.
- [ ] Választás dokumentálva.

## 6.2 Custom domain átállítása

- [ ] Cloudflare dashboard → Workers → `painlessremovals-worker` projekt → Custom Domains:
  - Add: `painlessremovals.com`
  - Add: `www.painlessremovals.com`
- [ ] **A régi `painlessremovals2026` Pages projekten** a custom domain-eket **töröld**. A Pages projekt fizikailag még megmarad, csak nincs domain hozzá rendelve.
  - **Vigyázat**: ezt a lépést atomikusan kell csinálni. Ne legyen ablak, amikor egyik se fogadja a `painlessremovals.com`-ra érkező forgalmat. CF-ben gyors a custom domain átkapcsolás (másodperces).

## 6.3 KV namespace migráció (ha A) opciót választottál a 0.3-ban)

- [ ] Az új RATE_LIMITER és SESSIONS namespace-ek tisztán indulnak — nincs adat-migráció szükséges (ezek rövid TTL-űek).

## 6.4 24-48 óra megfigyelés

- [ ] **Real-time GA4**: páran tölt-e be `/instantquote/`-ot, Page Views jönnek-e.
- [ ] **GA4 conversion events**: `contact_form_conversion`, `phone_click_conversion`, stb. — első napon nem feltétlenül látszik (delay), második napon már látszania kell.
- [ ] **Google Ads conversion oszlop**: 24 óra után nem zuhan-e nagyot a baseline-hoz képest.
- [ ] **Meta Events Manager**: Test Events tab-on (TEST_EVENT_CODE-dal kezdetben) — események érkeznek-e.
- [ ] **Cloudflare Workers analytics**: 5xx hiba-ráta, p50/p95 latency.
- [ ] **Sentry / error sheet**: új hibák száma normális tartományban.

## 6.5 Régi calc.painlessremovals.com 301 redirect

A régi `painlessv3` Pages projekten egy `_redirects` fájl módosítással (vagy egy CF Worker route-tal) átirányítjuk az összes URL-t az új domainre.

**A `painlessv3` (azaz `painless-calculator`) repó `public/_redirects` fájljához hozzáadás (vagy létrehozás):**

```
/calculator/* https://painlessremovals.com/instantquote/:splat 301
/your-quote https://painlessremovals.com/instantquote/your-quote/ 301
/* https://painlessremovals.com/:splat 301
```

(A `/*` catch-all utolsó sorként, hogy minden más is átirányítódjon.)

- [ ] `_redirects` módosítva a `painless-calculator` repóban.
- [ ] Push + Pages deploy a `painlessv3` projektre.
- [ ] **Ellenőrzés**: `curl -I https://calc.painlessremovals.com/calculator/step-01` → 301 → `https://painlessremovals.com/instantquote/step-01/`.

## 6.6 Acceptance

- A `painlessremovals.com` domain az új Worker-en fut.
- A `calc.painlessremovals.com` 301-gyel redirectel az új path-okra.
- 48 óra alatt:
  - Conversion adatok ±10%-on belül a baseline-hoz képest.
  - 5xx hiba-ráta < 0.1%.
  - User panaszok / support-ticket-ek száma normális.

---

# 7. fázis — Cleanup

**Commit message**: `chore(cleanup): remove legacy calculator subdomain artifacts`

Ezt a fázist **2-4 héttel az élesítés (6.6) után** kell csinálni. A 2-4 hét célja: keresőmotorok átindexelték az új URL-eket, régi email-linkek elapadnak.

## 7.1 src/data/redirects.ts ellenőrzés

- [ ] `src/data/redirects.ts` 76. sor: `['/instant-quote', '/instantquote/']` — marad, jó.
- [ ] 80. sor: `['/calculation-result-general', '/instantquote/calculation-result/']` — ellenőrizd, hogy a calc kódjában `/instantquote/calculation-result/` valós URL-e (vagy átnevezted-e). Ha nincs ilyen URL, módosítsd a redirect target-et a `/instantquote/your-quote/`-ra.

## 7.2 removal-cost-calculator.astro

- [ ] `src/pages/removal-cost-calculator.astro` 17. sor: `const calculatorUrl = "/instantquote";` → `"/instantquote/"` (trailing slash).

## 7.3 Régi DNS és projekt eltávolítása

- [ ] **Cloudflare DNS**: a `calc.painlessremovals.com` A/CNAME rekord törölhető, MIUTÁN ellenőrizted hogy 7 napon át 0 / pár forgalom volt rajta.
- [ ] **Cloudflare Pages → `painlessv3` projekt**: archiválás (CF-ben nincs explicit "archive", de a custom domain-ek el vannak véve, és a deploy-okat le lehet állítani).
- [ ] **Cloudflare Pages → `painlessremovals2026` projekt** (régi website): ugyanígy.
- [ ] **GitHub `painless-calculator` repó**: archiválás GitHub UI-ban (Settings → Archive). Egy `README.md` update jelezze: "Repository archived. Calculator now lives in [PainlessRemovals2026](...) under /instantquote/."

## 7.4 SESSION-CHANGES.md, EXTRAS_CODE_AUDIT.md, FULL_CODE_AUDIT.md cleanup

- [ ] A `SESSION-CHANGES.md` (website) **ne kerüljön törlésre** — történeti dokumentum.
- [ ] A 3.1-ben átmásolt audit fájlok (`EXTRAS_CODE_AUDIT.md`, `FULL_CODE_AUDIT.md`) — **NEM másoltuk át**, jól tettük.

## 7.5 Acceptance

- A régi subdomain DNS-rekord eltávolítva.
- `painless-calculator` GitHub repó archived state-ben.
- Régi CF Pages projekt(ek) deploy-ja megállítva.
- A merged repo `main` branch-ben tiszta — nincs `functions/` mappa, nincs `LayoutCalculator.astro`, nincs `calc.painlessremovals.com` referencia, a régi tracking patterns mind eltűntek.

---

# Anti-rollback / vészterv

Bármelyik fázisban ha kritikus regresszó:

| Probléma | Visszafordítás |
|---|---|
| 6. fázisban nem érkeznek conversion adatok | Custom domain visszakapcsolva a régi `painlessremovals2026` Pages projektre. Eltelt: <30 perc. |
| 6. fázisban formok nem küldenek email-t | `wrangler rollback` az előző Worker verzióra. Eltelt: <5 perc. |
| 4. fázis tracking buggy | `git revert` az érintett 4a-4e commit(okat), redeploy. Eltelt: <30 perc. |
| Kalkulátor 5xx-et ad | `wrangler rollback`, vagy a `/instantquote/` route-okra `prerender = false`-t felüldefiniálva időleges 503-at adunk vissza, és visszairányítjuk a `calc.painlessremovals.com`-ra. |

A `painless-calculator` GitHub repó **NE legyen archived** a 7. fázis előtt — kell hogy revertálható maradjon a régi calc-stack.

---

# Quick reference: file checklist

A merge után a `PainlessRemovals2026` repóban a következő fájlok ÚJAK (a 3. és 4. fázisok terméke):

```
src/
  components/
    GTMHead.astro                         (új, 4b)
    GTMBody.astro                         (új, 4b)
    ErrorBoundary.astro                   (új, 3.1)
    ErrorBoundary.tsx                     (új, 3.1)
    calculator/                           (új mappa, 3.1)
    icons/                                (új mappa, 3.1)
    ui/                                   (új mappa, 3.1)
  lib/
    boot.ts                               (új, 3.1)
    calculator-config.ts                  (új, 3.1)
    calculator-images.ts                  (új, 3.1)
    calculator-logic.ts                   (új, 3.1)
    calculator-store.ts                   (új, 3.1)
    config.ts                             (új, 3.1)
    constants.ts                          (új, 3.1)
    quote-url.ts                          (új, 3.1)
    review-config.ts                      (új, 3.1)
    core/                                 (új mappa, 3.1)
    errors/                               (új mappa, 3.1)
    features/                             (új mappa, 3.1)
    forms/utils.ts                        (új, 2.1 — _shared/utils.ts onnan ide költözött)
    tracking/                             (új mappa, 3.1)
    utils/                                (új mappa, 3.1)
  middleware/
    index.ts                              (új, 3.1)
  pages/
    api/
      affiliate.ts                        (új, 2.2 — Pages Function átírva)
      calculate.ts                        (új, 3.2 — calc-ból)
      callbacks.ts                        (új, 3.2)
      clearance-callback.ts               (új, 2.2)
      contact.ts                          (új, 2.2)
      error-report.ts                     (új, 3.2)
      health.ts                           (új, 3.2)
      jobs.ts                             (új, 2.2)
      meta/                               (új mappa, 3.2)
      partner-register.ts                 (új, 2.2)
      save-quote.ts                       (új, 3.2)
      track/                              (új mappa, 3.2)
      validate.ts                         (új, 3.2)
      vehicle-check.ts                    (új, 2.2)
    instantquote/
      _app.tsx                            (új, 3.2)
      [step].astro                        (új, 3.2)
      dev-preview.astro                   (új, 3.2)
      index.astro                         (új, 3.2)
      simple-callback.astro               (új, 3.2)
      thank-you-callback.astro            (új, 3.2)
      thank-you.astro                     (új, 3.2)
      your-quote.astro                    (új, 3.2)
    500.astro                             (új, 3.2 — ha nem létezett)
  styles/
    calculator.css                        (új, 3.8 — calc global.css átnevezve)
  env.d.ts                                (új vagy átírva, 1.4)
scripts/
  build-gtm-container.mjs                 (új, 3.1)
  fetch-reviews.ts                        (új, 3.1)
  gtm-templates.json                      (új, 3.1)
  health-check.ts                         (új, 3.1)
public/
  images/
    calculator/                           (új mappa, 3.3)
    calculator-reviews/                   (új mappa, 3.3 — átnevezve)
    email/                                (új mappa, 3.3)
    howknow/                              (új mappa, 3.3)
docs/
  tracking.md                             (új, 3.1)
GTM-PXTH5JJK_workspace_v2.json            (új, 3.1)
CLAUDE.md                                 (frissítve, 3.1 — calc tracking szabályok merge)
wrangler.toml                             (átírva, 1.2)
astro.config.mjs                          (átírva, 1.3)
package.json                              (frissítve, 1.6)
```

**Törölt** fájlok / mappák a merge után:

```
functions/                                (TÖRÖLVE, 2.1)
src/components/calculator/layout-calculator.astro  (TÖRÖLVE, 3.6 — Layout.astro veszi át)
```

---

# Megjegyzések Claude Code számára

1. **Mindig a `feat/merge-calculator` branch-en dolgozz** a `PainlessRemovals2026` repóban.
2. A `painless-calculator` repó **read-only forrás** — ne módosítsd, csak olvasd.
3. Minden fázis végén commit, **konvencionális commit message** (`feat:`, `chore:`, `fix:`, `docs:`).
4. Amikor egy fájlt áthelyezel (3.1, 3.2, 3.3): **ne `git mv`** (a `painless-calculator` egy teljesen külön repó), hanem `cp -r` + új commit a `PainlessRemovals2026`-ban.
5. **Trailing slash**: a `trailingSlash: 'always'` Astro config miatt MINDEN belső link `/`-re végződjön. A search-and-replace lépéseknél (3.4) erre figyelj.
6. **Tracking szabályok** (`docs/tracking.md` és `CLAUDE.md`): mindig idézd vissza, ha tracking-érintett kódot módosítasz. A 8 szabály érvényes az ÚJ form-okra is (4c.2).
7. **PII soha nem megy a dataLayer-be**. Ha tracking pattern bármi miatt PII-t akarna pushol-ni, AZONNAL stop, és kérdezd meg.
8. **`prerender = false`** opt-out kötelező minden olyan oldalra, ami `import { env } from 'cloudflare:workers'`-t használ vagy KV-t olvas vagy bármi run-time logikát futtat. Ha kétséges egy fájlról: add hozzá.
9. **A 4e (GTM container audit) NEM Claude Code feladata** — emberi review GTM UI-ban. Csak a checklistet készítsd elő.
10. **A 6. fázis ROLL-OUT NEM Claude Code feladata** — emberi döntés és deploy. A 6.5 (`_redirects` módosítás a régi calc repóban) is emberi feladat, mert egy másik repót érint.
