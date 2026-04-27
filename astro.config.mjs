import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { redirectMap } from './src/data/redirects.ts';
import { lastmod } from './src/data/lastmod.ts';

// Build Astro redirects object from the redirect map.
// Keys use trailing slashes to match trailingSlash: 'always'.
// Astro generates real HTML redirect pages — no CF _redirects limit.
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
];

export default defineConfig({
  site: 'https://painlessremovals.com',
  output: 'static',
  trailingSlash: 'always',
  redirects: {
    '/senior-removals-bristol/': '/later-life-moves/',
    ...staticRedirects,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
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
});
