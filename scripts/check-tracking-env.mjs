#!/usr/bin/env node
/**
 * Tracking env bake gate.
 *
 * Asserts the built client bundles actually contain the non-secret tracking
 * identifiers that client code reads from import.meta.env at BUILD time:
 *   - PUBLIC_TURNSTILE_SITE_KEY (worker-tracking.ts — gates the server-side
 *     conversion leg; a missing key bakes `sitekey: void 0` and silently
 *     drops EVERY server-side conversion, see 2026-07-13 incident)
 *   - GTM_ID (GTMHead/GTMBody — same failure class, see PR #23)
 *
 * Exits non-zero on any violation so it can gate the deploy, exactly like
 * check-sitemap.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'client');

if (!fs.existsSync(DIST)) {
  console.error('check-tracking-env: dist/client not found — run `astro build` first.');
  process.exit(1);
}

// Both values are public by design (they ship in every page's HTML/JS).
const TURNSTILE_SITE_KEY = '0x4AAAAAACs7GfndiZsA_2c4';
const GTM_ID = 'GTM-PXTH5JJK';

/** Recursively collect built .js/.html files under dist/client. */
function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    else if (/\.(js|mjs|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = collectFiles(DIST);
const errors = [];

// 1) The Turnstile render call must carry a real sitekey. `sitekey: void 0`
//    (or a missing key literal anywhere in the bundles) means the build env
//    was not baked and the server-side conversion leg is dead.
let sitekeyFound = false;
let gtmFound = false;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes('sitekey:void 0') || src.includes('sitekey: void 0')) {
    errors.push(`${path.relative(ROOT, f)}: Turnstile rendered with sitekey:void 0 — PUBLIC_TURNSTILE_SITE_KEY was not baked into the build.`);
  }
  if (src.includes(TURNSTILE_SITE_KEY)) sitekeyFound = true;
  if (src.includes(GTM_ID)) gtmFound = true;
}
if (!sitekeyFound) {
  errors.push(`Turnstile sitekey ${TURNSTILE_SITE_KEY} not found in any built client asset — the server-side conversion leg would silently drop everything.`);
}
if (!gtmFound) {
  errors.push(`GTM container id ${GTM_ID} not found in any built client asset — GTM loader would be silently dropped (PR #23 regression).`);
}

if (errors.length > 0) {
  console.error(`check-tracking-env: FAILED (${errors.length} violation(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`check-tracking-env: OK — sitekey + GTM id baked into ${files.length} scanned assets.`);
