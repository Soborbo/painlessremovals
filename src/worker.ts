/**
 * Egyedi Worker-entry (@astrojs/cloudflare v14 custom entrypoint): az Astro
 * SSR-handler mellé a napi synthetic-lead füstteszt `scheduled()` handlerét
 * exportálja. A wrangler.toml `main` erre a fájlra mutat; a cron a
 * `[triggers]` blokkban van. Lásd src/lib/tracking/smoke.ts.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { runDailySmokeLead } from '@/lib/tracking/smoke';
import type { GatewayEnv } from '@/lib/tracking/gateway-dispatch';

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    return handle(request as never, env as never, ctx as never);
  },
  async scheduled(_event: ScheduledController, env: GatewayEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailySmokeLead(env));
  },
};
