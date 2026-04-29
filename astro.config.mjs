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
  adapter: cloudflare({
    platformProxy: { enabled: true },
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
    },
    build: { sourcemap: 'hidden' },
  },
});
