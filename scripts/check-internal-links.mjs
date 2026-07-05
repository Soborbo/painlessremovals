#!/usr/bin/env node
/**
 * Internal-link hygiene gate.
 *
 * Scans every dist/client/**\/*.html page and asserts:
 *   - no internal <a href> missing the trailing slash (trailingSlash:
 *     'always' means each one costs a 308 hop; on the packing-guide it
 *     caused Google to index both URL variants)
 *   - no internal href pointing at a redirect source (src/data/redirects.ts)
 *   - every canonical matches the page's served URL exactly
 *
 * These leaked in through component props and template literals, which a
 * source-level `href="` grep can't see — so this gate checks the built
 * output instead. Exits non-zero on any violation to gate the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'client');
const SITE = 'https://painlessremovals.com';

if (!fs.existsSync(DIST)) {
  console.error('check-internal-links: dist/client not found — run `astro build` first.');
  process.exit(1);
}

const redirectsSrc = fs.readFileSync(path.join(ROOT, 'src/data/redirects.ts'), 'utf8');
const redirectSources = new Set(
  [...redirectsSrc.matchAll(/\[\s*'(\/[^']*)'\s*,/g)].map((m) => m[1].replace(/\/+$/, '')),
);

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_astro') yield* htmlFiles(p); }
    else if (e.name.endsWith('.html')) yield p;
  }
}

const errors = [];
let pages = 0;
let links = 0;

for (const file of htmlFiles(DIST)) {
  const html = fs.readFileSync(file, 'utf8');
  // Skip build-time redirect stubs (meta refresh pages Astro emits).
  if (/http-equiv="refresh"/i.test(html) && html.length < 2000) continue;
  pages++;

  const pageUrl =
    '/' + path.relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '/');

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical && canonical !== SITE + pageUrl) {
    errors.push(`${pageUrl} canonical mismatch: ${canonical}`);
  }

  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) {
    let href = m[1];
    if (href.startsWith(SITE)) href = href.slice(SITE.length) || '/';
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    links++;
    const pathname = href.split('#')[0].split('?')[0];
    if (pathname === '' || pathname === '/') continue;
    // Real files (xml, pdf, images…) legitimately have no trailing slash.
    if (/\.[a-z0-9]+$/i.test(pathname)) continue;
    if (!pathname.endsWith('/')) errors.push(`${pageUrl} → non-slash link: ${href}`);
    if (redirectSources.has(pathname.replace(/\/+$/, ''))) {
      errors.push(`${pageUrl} → link to redirect source: ${href}`);
    }
  }
}

if (errors.length) {
  const shown = errors.slice(0, 50);
  console.error(`check-internal-links: ${errors.length} problem(s) across ${pages} pages:`);
  for (const e of shown) console.error(`  ✗ ${e}`);
  if (errors.length > shown.length) console.error(`  … and ${errors.length - shown.length} more`);
  process.exit(1);
}
console.log(
  `check-internal-links: OK — ${links} internal links on ${pages} pages, all slashed, no redirect targets, canonicals match.`,
);
