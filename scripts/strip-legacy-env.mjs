#!/usr/bin/env node
/**
 * Remove the unsupported `legacy_env` field from the adapter-generated
 * Worker config.
 *
 * The @astrojs/cloudflare adapter writes `"legacy_env": true` into
 * dist/server/wrangler.json, but wrangler (>= 4.x) has removed support for the
 * field and aborts `wrangler deploy` with:
 *
 *   The "legacy_env" field is no longer supported, so please remove it from
 *   your configuration file.
 *
 * Per wrangler's own guidance, removing the field does NOT change how the
 * Worker is deployed — `legacy_env = true` was the historical default. So this
 * strip is a safe no-op that keeps the generated config deploy-valid.
 *
 * Run after `astro build`, before any `wrangler` command.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'dist', 'server', 'wrangler.json');

if (!fs.existsSync(CONFIG)) {
  console.error('strip-legacy-env: dist/server/wrangler.json not found — run `astro build` first.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

if ('legacy_env' in config) {
  delete config.legacy_env;
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  console.log('strip-legacy-env: removed unsupported `legacy_env` field from dist/server/wrangler.json.');
} else {
  console.log('strip-legacy-env: no `legacy_env` field present — nothing to do.');
}
