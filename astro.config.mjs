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
    platformProxy: { enabled: true },
  }),
  redirects: {
    '/senior-removals-bristol/': '/later-life-moves/',
    ...staticRedirects,
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        !noindexPages.some((p) => page.endsWith(p)),
      serialize(item) {
        const path = new URL(item.url).pathname;
        item.lastmod = lastmod[path] ?? new Date().toISOString();
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
