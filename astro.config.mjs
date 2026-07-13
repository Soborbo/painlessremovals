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

// Pages marked noindex — must not appear in sitemap
const noindexPages = [
  '/affiliate-form/',
  '/affiliate-form/thank-you/',
  '/concierge-service/',
  '/contact/thank-you/',
  '/house-and-waste-clearance/thank-you/',
  '/jobs/thank-you/',
  '/later-life-moves/',
  '/man-with-a-van-near-bristol/',
  '/partners/agent-referral/',
  '/partners/home-staging/',
  '/partners/knight-frank/',
  '/partners/relocation-agents/',
  '/partners/solicitors/',
  '/partners/thank-you/',
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
];

// Build a Set of normalized pathnames for stricter matching than
// `endsWith` — that matched by suffix, so a future `/foo/contact/` would
// have been silently excluded.
const noindexSet = new Set(noindexPages);

export default defineConfig({
  site: 'https://painlessremovals.com',
  output: 'static',
  trailingSlash: 'always',
  build: {
    // Inline ALL stylesheets into <head>. Layout.css is ~24 KB gzipped; inlining
    // shifts this onto the HTML stream so the browser doesn't need a separate
    // render-blocking CSS request. Trade-off: HTML grows by the same gzipped
    // amount, but eliminates 1 RTT on slow networks.
    inlineStylesheets: 'always',
  },
  // Pin the build-time image service to Sharp explicitly (astro-images v3.1
  // §cloudflare-adapter-config). Pairs with the adapter's imageService:'compile'
  // so astro:assets images are optimised by Sharp at build, never at runtime.
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  adapter: cloudflare({
    platformProxy: { enabled: true },
    // Optimise astro:assets images (e.g. the home-packing-service hero) with
    // Sharp at build time, emitting static avif/webp into _astro/. Without
    // this the adapter defaults to 'cloudflare-binding', which defers to a
    // runtime /_image endpoint backed by the Cloudflare Images product —
    // a runtime dependency at odds with this site's pre-generated, static
    // image strategy (OptimizedPicture + public/img).
    imageService: 'compile',
  }),
  redirects: {
    '/senior-removals-bristol/': '/later-life-moves/',
    ...staticRedirects,
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        try { return !noindexSet.has(new URL(page).pathname); }
        catch { return true; }
      },
      serialize(item) {
        const path = new URL(item.url).pathname;
        // Only set lastmod if we have a tracked value. Falling back to
        // `new Date().toISOString()` made every page report a fresh
        // lastmod every build, which Google penalises as a low-trust
        // crawl signal.
        const known = lastmod[path];
        if (known) item.lastmod = known;
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.PUBLIC_DEPLOY_ID': JSON.stringify(
        process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA || 'local'
      ),
      'import.meta.env.PUBLIC_SITE_ID': JSON.stringify('painless-removals'),
      // GTM_ID is read by GTMHead/GTMBody. The marketing pages are
      // statically prerendered, so the Cloudflare *runtime* var never
      // reaches their HTML — and Astro only auto-exposes PUBLIC_-prefixed
      // vars to import.meta.env. Bake the (non-secret) container id in at
      // build time so the GTM loader actually ships on static pages.
      // Prefers the build env var if present (e.g. per-environment override),
      // and falls back to the production container id so the loader is never
      // silently dropped just because the build var wasn't set. The id is
      // public by design (it appears in every page's HTML).
      'import.meta.env.GTM_ID': JSON.stringify(
        process.env.GTM_ID || 'GTM-PXTH5JJK'
      ),
      // Google Tag Gateway (first-party) measurement path. Cloudflare's
      // auto-injection does NOT rewrite the gtm.js loader in our
      // Worker-served HTML, so we load the container from the first-party
      // path ourselves (https://<host>/<GTG_PATH>/gtm.js) — same-origin, so
      // GA4/Ads measurement then routes first-party too. Empty string falls
      // back to www.googletagmanager.com (GTMHead), so disabling GTG can't
      // silently break tracking. Path is public (it's in every page's HTML).
      'import.meta.env.GTG_PATH': JSON.stringify(
        process.env.GTG_PATH ?? 'f807'
      ),
      // Turnstile sitekey for the invisible widget that gates the
      // server-side conversion leg (worker-tracking.ts getTurnstileToken).
      // Same failure class as GTM_ID above: client code reads
      // import.meta.env.PUBLIC_TURNSTILE_SITE_KEY at BUILD time, so a deploy
      // from a machine without the env var baked `sitekey: void 0` into the
      // live bundle — every token acquisition failed and sendToWorker
      // silently dropped ALL server-side conversions (found 2026-07-13, dead
      // since the 2026-06-28 go-live tests). The sitekey is public by design;
      // bake the production value as fallback so it can never be dropped.
      'import.meta.env.PUBLIC_TURNSTILE_SITE_KEY': JSON.stringify(
        process.env.PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAACs7GfndiZsA_2c4'
      ),
    },
    build: { sourcemap: 'hidden' },
  },
});
