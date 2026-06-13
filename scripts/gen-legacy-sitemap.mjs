#!/usr/bin/env node
/**
 * Legacy sitemap generator (Phase D4).
 *
 * Emits an XML sitemap of the now-301'd old WordPress URLs (slashed), to
 * invite Google to recrawl them and pick up the redirects faster. Submit it
 * in GSC, then delete after ~6 weeks.
 *
 *   node scripts/gen-legacy-sitemap.mjs > public/legacy-sitemap.xml
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'src/data/redirects.ts'), 'utf8');

const keys = [...src.matchAll(/\[\s*'(\/[^']*)'\s*,/g)].map((m) => m[1]);
const urls = [...new Set(keys.map((k) => (k.endsWith('/') ? k : `${k}/`)))]
  .sort()
  .map((p) => `  <url><loc>https://painlessremovals.com${p}</loc></url>`)
  .join('\n');

process.stdout.write(
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
