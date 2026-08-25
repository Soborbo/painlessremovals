/**
 * Astro client-lib: server-side tracking dispatch a Soborbo Worker-hez.
 *
 * Forrás: D:/Serverside/client-lib/worker-tracking.ts — copy-paste az Astro
 * site src/lib/-jébe. Astro env: PUBLIC_TURNSTILE_SITE_KEY publikus változó kell.
 *
 * Sprint 9 spec a 09-sprint-astro-painless.md-ben.
 *
 * Painless-adaptáció: a `declare global` Window-blokkból kivettük a `dataLayer`
 * és `fbq` deklarációkat — azokat a meglévő `src/lib/tracking/tracking.ts`
 * deklarálja, a duplikált (eltérő típusú) augmentáció TS-hibát adna. A futási
 * logika változatlan.
 */

import { generateUUID } from './uuid';
import { trackError } from './errors/tracker';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId?: string) => void;
      execute: (container?: string | HTMLElement) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  // `size` no longer has an 'invisible' member — Turnstile removed it and now
  // THROWS on an unknown value. Deferred execution is expressed by
  // `execution: 'execute'` + `appearance: 'interaction-only'` instead.
  size?: 'normal' | 'compact' | 'flexible';
  execution?: 'render' | 'execute';
  appearance?: 'always' | 'execute' | 'interaction-only';
}

// A TÍPUSOK is a kanonikus csomagból jönnek (F9/3.4). Korábban itt SAJÁT,
// szó szerint azonos deklarációk álltak — két helyen ugyanaz a szerződés, ami
// pont úgy tud némán szétcsúszni, ahogy az implementációk tették. A site
// hívási pontjai változatlanul innen importálhatják őket.
export type {
  UserData,
  ConsentSignal,
  ConsentState,
  AttributionParams,
  ConversionPayload,
} from '@/lib/soborbo-tracking/gateway';

let cachedTurnstileToken: string | undefined;
let cachedTokenExpiresAt = 0;
let turnstileWidgetId: string | undefined;
// A single widget is rendered once. Subsequent calls reset it and route the
// resolution through this pending pointer, so the original callbacks (which
// closed over the first call) can still resolve later promises.
let pendingResolver:
  | { resolve: (v: string | undefined) => void; timeout: ReturnType<typeof setTimeout> }
  | undefined;

export async function getTurnstileToken(): Promise<string | undefined> {
  if (cachedTurnstileToken && Date.now() < cachedTokenExpiresAt) {
    return cachedTurnstileToken;
  }

  if (!window.turnstile) {
    console.warn('[tracking] Turnstile not loaded');
    trackError('TURN-LOAD-001', undefined, { page: location.pathname }, 'worker-tracking/getTurnstileToken');
    return undefined;
  }

  // A missing baked sitekey renders the widget with `sitekey: undefined` and
  // every token acquisition fails — that silently killed ALL server-side
  // conversions between 2026-06-28 and 2026-07-13. Report it loudly.
  if (!import.meta.env.PUBLIC_TURNSTILE_SITE_KEY) {
    console.error('[tracking] PUBLIC_TURNSTILE_SITE_KEY missing from build — server-side dispatch disabled');
    trackError('TURN-KEY-001', undefined, { keyPrefix: 'MISSING_AT_BUILD' }, 'worker-tracking/getTurnstileToken');
    return undefined;
  }

  return new Promise((resolve) => {
    const container = document.getElementById('cf-turnstile-invisible');
    if (!container) {
      console.warn('[tracking] Turnstile container not found');
      trackError('TURN-LOAD-002', undefined, { containerId: 'cf-turnstile-invisible' }, 'worker-tracking/getTurnstileToken');
      resolve(undefined);
      return;
    }

    // If a previous request is still pending, resolve it as undefined
    // (we'll start a fresh challenge).
    if (pendingResolver) {
      clearTimeout(pendingResolver.timeout);
      pendingResolver.resolve(undefined);
    }

    const timeout = setTimeout(() => {
      if (pendingResolver) {
        const r = pendingResolver;
        pendingResolver = undefined;
        console.warn('[tracking] Turnstile timeout');
        trackError('TURN-TOKEN-001', undefined, { waitedMs: 10000, reason: 'timeout' }, 'worker-tracking/getTurnstileToken');
        r.resolve(undefined);
      }
    }, 10000);
    pendingResolver = { resolve, timeout };

    const onCallback = (token: string) => {
      if (!pendingResolver) return;
      const r = pendingResolver;
      pendingResolver = undefined;
      clearTimeout(r.timeout);
      cachedTurnstileToken = token;
      cachedTokenExpiresAt = Date.now() + 4 * 60 * 1000;
      r.resolve(token);
    };
    const onError = () => {
      if (!pendingResolver) return;
      const r = pendingResolver;
      pendingResolver = undefined;
      clearTimeout(r.timeout);
      trackError('TURN-TOKEN-001', undefined, { waitedMs: 0, reason: 'error-callback' }, 'worker-tracking/getTurnstileToken');
      r.resolve(undefined);
    };

    // Turnstile's render() validates its options and THROWS on an unknown
    // value. That throw escapes this Promise executor and REJECTS the token
    // promise — which is how `size: 'invisible'` (a value Turnstile removed)
    // silently killed the Meta CAPI leg site-wide. Contain it: a widget that
    // cannot initialise degrades to "no token", exactly like a timeout.
    try {
      if (turnstileWidgetId !== undefined) {
        // Subsequent calls — reset and re-execute the existing widget.
        // The original callbacks delegate to the current pendingResolver above.
        window.turnstile!.reset(turnstileWidgetId);
        window.turnstile!.execute(container);
      } else {
        // Deferred, non-interactive execution: `execution: 'execute'` defers the
        // challenge until execute() is called, `interaction-only` keeps the
        // widget invisible unless the user actually has to solve something.
        turnstileWidgetId = window.turnstile!.render(container, {
          sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: onCallback,
          'error-callback': onError
        });
        window.turnstile!.execute(container);
      }
    } catch (err) {
      turnstileWidgetId = undefined;
      console.error('[tracking] Turnstile render/execute failed', err);
      trackError('TURN-LOAD-001', undefined, { page: 'worker-tracking' }, 'worker-tracking/getTurnstileToken');
      onError();
    }
  });
}

/**
 * Előmelegíti a Turnstile-tokent oldalbetöltéskor, hogy az ELSŐ valódi
 * konverzió-dispatch ne a mint körútjával kezdjen (300ms–1,5s), miközben
 * egy navigáció versenyez vele. A token 4 percig cache-elődik. Némán
 * no-op, ha a script/konténer nincs az oldalon.
 */
export function prewarmTurnstileToken(): void {
  if (typeof window === 'undefined') return;
  const deadline = Date.now() + 15_000;
  const iv = setInterval(() => {
    if (window.turnstile && document.getElementById('cf-turnstile-invisible')) {
      clearInterval(iv);
      void getTurnstileToken().catch(() => undefined);
    } else if (Date.now() > deadline) {
      clearInterval(iv);
    }
  }, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSZPORT — a KANONIKUS csomagra delegálva (F9/3.4)
// ─────────────────────────────────────────────────────────────────────────────
//
// Ez a szakasz korábban ~270 sor SAJÁT implementáció volt: süti-olvasás,
// GA client/session id, consent-állapot, attribúció-tár, klikk-ID kezelés és a
// beacon/fetch küldés. Mindegyiknek volt kanonikus párja a
// `soborbo-tracking` csomagban — vagyis a site MÁSODIK transport authority-t
// tartott fenn ugyanarra a feladatra. Pontosan ez a forkolódás forrása: két
// implementáció ugyanarra a szabályra előbb-utóbb két igazságot mond.
//
// Amit a csere HOZ (a kanonikus payload a mai SZUPERHALMAZA):
//   · `consent_sources` — a böngésző-láb is jelenti a kliens-verziót, tehát a
//     ledgerben látszani fog, hogy ez a láb már a kanonikus 6.4.0-t futtatja;
//   · `consent_id` (saját CMP alatt), `storage_read_blocked*` telemetria;
//   · a `_fbp`/`_fbc` olvasás a marketing-consent kapun megy (PECR), nem egy
//     második, kapuzatlan `getCookie` úton;
//   · a Google klikk-ID-k kölcsönös kizárása (csomag 6.4.0 — ezt a fork már
//     tudta, és a delegálás ELŐTT vittük fel a kanonikusba, hogy a csere ne
//     legyen regresszió).
//
// Amit a csere NEM változtat: az `event_id`, az esemény-nevek, a szerver-only
// némítás és a `ConversionPayload` szerződés (a két interfész bitre azonos volt).
//
// A Turnstile-blokk FENT SZÁNDÉKOSAN MARAD: az a site SAJÁT `/api/contact/`
// végpontjának bot-védelme, NEM a gateway törölt Turnstile-kapuja.

export { collectAttribution, sendToWorker } from '@/lib/soborbo-tracking/gateway';
