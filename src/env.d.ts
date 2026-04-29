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
