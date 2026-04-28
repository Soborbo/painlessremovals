# Phase 6 — Production rollout runbook

This is the active, live rollout. Everything below assumes Phase 5
(`STAGING_SMOKE_TEST.md`) is fully green.

## 6.1 Choose rollout strategy

Two options:

**Option A — single deploy, full atomic switch.**
Faster (one cutover), riskier (tracking change + URL change land
together; if conversion data drops, can't isolate cause for 24-48h).

**Option B — tracking-first, then URL.**
First push the tracking changes (Phase 4 commits) to the EXISTING
`painlessremovals2026` Pages project for 48h of observation. Once
conversion volume is stable on the new pattern, do the Worker
cutover (Phase 6.2).

**Choose**: Option B is recommended unless there's business pressure
for a single short maintenance window. If choosing B, branch off a
`tracking-only` feature branch that omits the calculator pages and
deploys onto the existing Pages project; once stable, merge
`feat/merge-calculator` and do the Worker cutover.

Document the choice in this file:
- [ ] Choice: **A** / **B** = `<chosen>`
- [ ] Rationale:

## 6.2 Custom domain cutover (atomic)

This is the moment when production traffic moves to the new Worker.

- [ ] Cloudflare dashboard → Workers & Pages → `painlessremovals-worker`
      → Custom Domains → Add Domain:
  - `painlessremovals.com`
  - `www.painlessremovals.com`
- [ ] At the same time, Cloudflare dashboard → `painlessremovals2026`
      Pages project → Custom Domains → Remove the same two domains.

CF processes this in seconds. There is a brief window (~5-10 sec)
where one or the other gets the request; both serve compatible HTML
so users see no error.

## 6.3 Old calculator subdomain redirect

Set up `calc.painlessremovals.com` to 301 to the new path on the
main domain. The old `painlessv3` Pages project keeps running as a
pure redirect host.

In the `painless-calculator` repo (separate from this one), update
`public/_redirects` to add at the bottom:

```
/calculator/* https://painlessremovals.com/instantquote/:splat 301
/your-quote https://painlessremovals.com/instantquote/your-quote/ 301
/* https://painlessremovals.com/:splat 301
```

The catch-all `/*` last keeps any other URL pointing back to the
main domain. Push and let Cloudflare Pages redeploy the old project.

- [ ] `_redirects` updated in painless-calculator repo
- [ ] Pushed and Cloudflare Pages deployed
- [ ] `curl -I https://calc.painlessremovals.com/calculator/step-01`
      → 301 → `https://painlessremovals.com/instantquote/step-01/`
- [ ] `curl -I https://calc.painlessremovals.com/your-quote`
      → 301 → `https://painlessremovals.com/instantquote/your-quote/`
- [ ] `curl -I https://calc.painlessremovals.com/`
      → 301 → `https://painlessremovals.com/`

## 6.4 GTM container publish

If audit checklist (`GTM_AUDIT_CHECKLIST.md`) is complete:

- [ ] Workspace `merge-calculator-audit` published to live container.
- [ ] Version notes mention the new event taxonomy and the merge.

## 6.5 24-48 hour observation window

GA4 / Google Ads attribution has a 24-48h delay; conversion drops
may not be visible immediately. Watch:

- [ ] Cloudflare Workers Analytics: 5xx rate < 0.1%, p95 latency
      under baseline + 20%.
- [ ] GA4 Real-time: PageViews to `/instantquote/`, not `/calculator/`.
- [ ] GA4 Events tab (after ~6h): `contact_form_conversion`,
      `phone_conversion`, `email_conversion`, `whatsapp_conversion`,
      `quote_calculator_conversion` all present with non-zero counts.
- [ ] Google Ads Conversions report (after 24h): per-conversion
      volume within ±15% of the prior-week baseline.
- [ ] Meta Events Manager: events received via both Browser and
      Conversions API; deduplication > 90% (event_id wiring works).
- [ ] Error sheet (`ERROR_SHEETS_ID`): no new error categories with
      high frequency.

## 6.6 Rollback triggers

Roll back to old Pages project if any of these fire within 6h:

- 5xx rate > 1% sustained for >5 min.
- Form submissions failing (Resend errors > 5/hour).
- Conversion volume drops > 50% in real-time GA4.
- Any user-reported broken page that we can't fix within an hour.

Rollback procedure:
1. Cloudflare dashboard → `painlessremovals-worker` → Custom Domains
   → Remove `painlessremovals.com` and `www.painlessremovals.com`.
2. `painlessremovals2026` Pages project → Custom Domains → Add the
   same two back.
3. CF DNS propagates instantly. Old site is back live within ~30s.
4. Open an incident note documenting what failed; come back to fix.

## 6.7 Done criteria

- 48h of observation post-cutover.
- Conversion volumes within ±15% of baseline.
- 5xx rate stable.
- No P0 / P1 issues open.

Then proceed to `PHASE_7_CLEANUP.md`.
