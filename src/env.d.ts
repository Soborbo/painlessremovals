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

    // Server-side tracking gateway (event-gateway Worker, /api/event/*).
    // Shadow flag: "true" turns on browser→gateway conversion dispatch.
    // Keep unset/false until the route + KV config + Ads OAuth are live.
    PUBLIC_GATEWAY_ENABLED?: string;

    // Server-to-server conversion dispatch to the event-gateway (see
    // lib/tracking/gateway-dispatch.ts). This is the leg that does NOT depend on
    // the browser winning a Turnstile challenge.
    //
    // TRACKING_GATEWAY_TOKEN — SECRET. Plaintext per-site token; its SHA-256 is
    //   stored in the gateway's SITE_CONFIG KV as `crm_token_sha256`. Per-site by
    //   design: the gateway refuses the global operator token on this route, so a
    //   leak is contained to Painless. NO `PUBLIC_` prefix — never ship it to the
    //   browser. Unset → the dispatch no-ops (and logs), it does not throw.
    // TRACKING_GATEWAY_URL — optional origin override; defaults to SITE_URL. It
    //   MUST be a hostname the gateway has a KV site-config for (it routes by
    //   hostname), i.e. our own apex.
    TRACKING_GATEWAY_TOKEN?: string;
    TRACKING_GATEWAY_URL?: string;

    // KV Namespaces
    RATE_LIMITER?: KVNamespace;

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
    ERROR_SHEETS_TAB?: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_KEY?: string;
    ERROR_EMAIL_TO?: string;
    ERROR_ALERT_FROM?: string;

    // External APIs
    GOOGLE_MAPS_API_KEY?: string;

    // i-mve
    IMVE_API_URL?: string;
    IMVE_API_KEY?: string;

    // Painless-CRM signed webhooks (SERVER-SIDE ONLY — never PUBLIC_).
    // CRM_WEBHOOK_SECRET is the shared HMAC secret and MUST be byte-identical
    // to the CRM's value. Do not expose any of these to the client bundle.
    CRM_WEBHOOK_SECRET?: string;
    CRM_BASE_URL?: string;
    CRM_COMPANY_ID?: string;
    // Optional: overrides the envelope `source` (defaults to "website").
    CRM_WEBHOOK_SOURCE?: string;
    // Optional: pricing version uuid injected into the /quote webhook's
    // `quote.pricing_version_id`. If unset, the optional quote block is
    // dropped rather than sent without a valid uuid.
    CRM_PRICING_VERSION_ID?: string;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY: string;
  /** "true" enables the browser→gateway conversion dispatch (shadow→live). */
  readonly PUBLIC_GATEWAY_ENABLED?: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Cloudflare.Env;
    };
    // Astro 6 + @astrojs/cloudflare: the Worker ExecutionContext lives here.
    // (The old `runtime.ctx` was removed; its getter THROWS — never read it.)
    cfContext: ExecutionContext;
  }
}
