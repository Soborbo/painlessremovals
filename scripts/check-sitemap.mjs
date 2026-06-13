#!/usr/bin/env node
/**
 * Sitemap hygiene gate (Phase D4).
 *
 * Asserts dist/client/sitemap-*.xml contains:
 *   - no non-slashed URLs (trailingSlash: 'always')
 *   - no redirect-source URLs (from src/data/redirects.ts)
 *   - no noindexed URLs (detected from the rendered robots meta)
 *
 * Exits non-zero on any violation so it can gate the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'client');

if (!fs.existsSync(DIST)) {
  console.error('check-sitemap: dist/client not found — run `astro build` first.');
  process.exit(1);
}

// Redirect sources, parsed from redirects.ts as text (no TS execution needed).
const redirectsSrc = fs.readFileSync(path.join(ROOT, 'src/data/redirects.ts'), 'utf8');
const redirectSources = new Set(
  [...redirectsSrc.matchAll(/\[\s*'(\/[^']*)'\s*,/g)].map((m) => m[1].replace(/\/+$/, '')),
);

const sitemapFiles = fs.readdirSync(DIST).filter((f) => /^sitemap-\d+\.xml$/.test(f));
if (sitemapFiles.length === 0) {
  console.error('check-sitemap: no sitemap-N.xml in dist/client.');
  process.exit(1);
}

const errors = [];
let total = 0;
for (const sf of sitemapFiles) {
  const xml = fs.readFileSync(path.join(DIST, sf), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    total++;
    let pathname;
    try { pathname = new URL(m[1]).pathname; } catch { errors.push(`malformed URL: ${m[1]}`); continue; }

    if (pathname !== '/' && !pathname.endsWith('/')) errors.push(`non-slash URL: ${pathname}`);
    if (redirectSources.has(pathname.replace(/\/+$/, ''))) errors.push(`redirect-source URL: ${pathname}`);

    const htmlPath = path.join(DIST, pathname, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      if (/<meta\s+name="robots"\s+content="noindex/i.test(html)) errors.push(`noindex URL: ${pathname}`);
    }
  }
}

if (errors.length) {
  console.error(`check-sitemap: ${errors.length} problem(s) across ${total} sitemap URLs:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`check-sitemap: OK — ${total} URLs, all slashed, none noindex, none redirect sources.`);
