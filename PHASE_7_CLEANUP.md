# Phase 7 — Cleanup

Run **2-4 weeks after** Phase 6 production cutover. The waiting period
exists so:
- Search engines re-index the new URLs.
- Email-link clicks from old campaigns settle to near-zero on the
  legacy subdomain.
- The merge proves itself in production (conversion data has
  stabilised).

## 7.1 Verify the legacy subdomain is dead

- [ ] `curl -I https://calc.painlessremovals.com/calculator/step-01`
      still 301s correctly (sanity check the redirect is in place).
- [ ] Cloudflare → `painlessv3` Pages project → Analytics:
      Daily request count is approximately zero (single digits).

## 7.2 Redirect map cleanup

In this repo:

- [ ] `src/data/redirects.ts` line ~76: keep `'/instant-quote'` →
      `'/instantquote/'` (still useful as a typo-friendly shortcut).
- [ ] `src/data/redirects.ts` line ~80: verify
      `'/calculation-result-general'` → `'/instantquote/your-quote/'`
      points at a real page (not `/calculator/calculation-result/`
      that doesn't exist).

In `src/pages/removal-cost-calculator.astro`:

- [ ] Line 17: `const calculatorUrl = "/instantquote";` →
      `const calculatorUrl = "/instantquote/";` (trailing slash for
      consistency with `trailingSlash: 'always'`).

## 7.3 DNS and infrastructure cleanup

- [ ] Cloudflare DNS: remove the `calc.painlessremovals.com` A/CNAME
      record. **Only do this once 7.1 confirms zero traffic for 7
      consecutive days.**
- [ ] Cloudflare → `painlessv3` Pages project → Settings → Pause
      builds (don't delete yet — keeps history).
- [ ] Cloudflare → `painlessremovals2026` Pages project (the old
      static-only website project) → Settings → Pause builds.

After another 30 days of no incidents:

- [ ] Cloudflare → delete `painlessv3` Pages project.
- [ ] Cloudflare → delete `painlessremovals2026` Pages project.

## 7.4 Repository archival

- [ ] GitHub `Soborbo/painless-calculator` repo → Settings → Archive.
- [ ] Update its README first to add at the top:
      ```
      # Archived
      The calculator now lives in
      [Soborbo/painlessremovals](https://github.com/Soborbo/painlessremovals)
      under `/instantquote/`.
      ```

## 7.5 Migration artifact cleanup

These files served the merge and can be removed once stable:

- [ ] `MIGRATION_PLAN.md` — keep as historical record OR move to
      `docs/archive/`.
- [ ] `STAGING_SMOKE_TEST.md` — same.
- [ ] `PRODUCTION_ROLLOUT.md` — same.
- [ ] `GTM_AUDIT_CHECKLIST.md` — same.
- [ ] `PHASE_7_CLEANUP.md` (this file) — same.
- [ ] `old-calc-redirects.txt` — delete (was a one-shot snippet).
- [ ] `GTM-PXTH5JJK_workspace_v2.json` — keep, it's a backup of the
      live container and useful for disaster recovery.
- [ ] `SESSION-CHANGES.md` — keep, historical website context.

Decision rule: anything with phase-specific content moves to
`docs/archive/`; anything still useful as reference (CLAUDE.md,
docs/tracking.md, GTM container backup) stays where it is.

## 7.6 Done criteria

- All 5 Pages/DNS resources cleaned up.
- Repository archived with new home documented.
- Phase docs moved or kept per the rule above.
- No remaining references to `calc.painlessremovals.com` in code or
  configs (`grep -r "calc.painlessremovals" .` returns nothing).
