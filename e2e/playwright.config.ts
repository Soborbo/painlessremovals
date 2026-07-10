/**
 * Playwright config for the conversion-funnel e2e layer.
 *
 * Server strategy:
 *   - VERIFY_BASE_URL set → run against that URL, no local server.
 *   - Otherwise boot `wrangler dev` on the EXISTING dist build at
 *     127.0.0.1:4321 (reused if already running).
 *
 *     Deliberately NOT `npm run preview`: that script is
 *     `astro build && wrangler dev --config ./dist/server/wrangler.json`,
 *     which (a) rebuilds the whole site first (minutes) and (b) serves on
 *     wrangler's default port 8787, not the 4321 this suite targets. Run
 *     `npx astro build` yourself when dist is stale.
 *
 * The runner needs @playwright/test resolvable — it is intentionally NOT
 * a package.json dependency; `npm i --no-save @playwright/test` (matching
 * the globally installed playwright / preinstalled browsers version).
 */

import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.VERIFY_BASE_URL;

export default defineConfig({
  testDir: '.',
  // Only the funnel spec — seed drift-guarding is vitest's job
  // (src/lib/e2e-seed.test.ts), not Playwright's.
  testMatch: /funnel\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  fullyParallel: false,
  workers: 1,
  // The factory polls the dataLayer with default expect timeouts; give
  // slow local SSR (wrangler dev cold isolate) headroom.
  expect: { timeout: 15_000 },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command:
            'npx wrangler dev --config dist/server/wrangler.json --port 4321 --ip 127.0.0.1',
          url: 'http://127.0.0.1:4321/',
          reuseExistingServer: true,
          timeout: 120_000,
          // Config lives in e2e/; wrangler must run from the repo root.
          cwd: '..',
        },
      }),
});
