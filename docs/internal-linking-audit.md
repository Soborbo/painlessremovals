# Internal Linking SEO Audit

**Date:** 2026-07-05 · **Method:** full `astro build`, link graph extracted from
all 115 generated HTML pages (nav/footer/mobile-menu links separated from
in-`<main>` contextual links), cross-referenced with Google Search Console
(sc-domain:painlessremovals.com, last 90 days).

> **Remediation status (2026-07-05):** All three P1 issues below are fixed on
> this branch — packing-guide canonicals (+ matching JSON-LD URLs), every
> non-slash internal link in `.astro`/`.md` sources (95 codemod replacements
> plus `LessonNav`, query-string CTAs like `/instantquote?service=…`, and the
> markdown links), and all three orphan pages now have contextual inlinks
> (`/moving-advice/` cards for the later-life guide + cost calculator,
> `/pricing/` → cost calculator, `/care-home-removals/` → later-life guide,
> `/partners/` hub card + `/office-removals/` paragraph → office-space).
> A new build gate, `scripts/check-internal-links.mjs`, now fails the build
> on any non-slash internal link, link to a redirect source, or canonical
> mismatch in the built HTML. P2 anchor-text/linking opportunities (§4–5)
> remain open.

## Verdict

The link architecture is fundamentally healthy: **zero broken internal links,
zero internal links pointing at redirected URLs**, descriptive (not
over-optimised) anchor text, a site-wide services nav that gives every money
page ~114 inlinks, and a well cross-linked geo cluster (neighbourhood pages
carry 4–18 contextual inlinks each via the nearby-areas modules). The issues
below are fixable in source and mostly concentrated in three places.

---

## P1 — Bugs to fix

### 1. Packing-guide canonicals contradict the trailing-slash policy (11 pages)

The site is `trailingSlash: 'always'`, but every packing-guide chapter emits a
canonical **without** the trailing slash:

- Source: `src/pages/packing-guide/[...slug].astro:166` —
  `const canonical = `${domain}/packing-guide/${slug}`;`
- Result: `/packing-guide/how-to-pack-kitchen/` declares
  `https://painlessremovals.com/packing-guide/how-to-pack-kitchen` as canonical,
  a URL that itself redirects back to the slash version.

**GSC confirms real damage:** Google currently indexes *both* variants of these
pages and splits impressions between them — e.g. `how-to-pack-kitchen` (402
impressions with slash / 174 without), `dismantling-furniture` (110 / 120),
`materials-and-equipment` (150 / 97), `planning-and-preparation` (176 / 57).
Eleven pages ranking positions 7–20 are competing with themselves.

**Fix:** append `/` in the canonical at `[...slug].astro:166`.

### 2. ~350 internal links missing the trailing slash (one 308 hop each)

Every non-slash internal link costs a 308 redirect at the edge on both crawls
and clicks. Main sources:

| Source | Links |
|---|---|
| `src/pages/packing-guide/[...slug].astro:253,262,272` + `index.astro:239` (chapter prev/next/related/hub cards) | ~170 in output |
| Component prop defaults: `'/instantquote'` in `HowItWorks.astro:35`, `AreaFinalCTA.astro:23`, `QuoteTeaser.astro:22`, `areas/SidebarCTA.astro:19`, `HowItWorksHome.astro:41,81` | 175 in output |
| Page-level prop values across ~30 pages: `buttonHref="/instantquote"`, `primaryHref="/contact"`, `primaryHref="/free-home-survey"`, `learnMoreHref="/about"`, `captionHref="/about/jay-newton"` (`ProblemSolution.astro:49`), `href: '/home-packing-service'` (`office-removals.astro:137`), etc. | ~60 in output |
| `src/pages/jobs.astro:325` — `href="/privacy-policy"` | 1 |
| `src/content/packing-guide/you-can-always-ask-for-help.md` — 4 markdown links | 4 |

The `/instantquote` ones are noindex so the SEO cost is nil, but the CTA click
takes a redirect hop on the highest-intent action on the site. The
packing-guide ones compound issue #1.

**Fix:** add trailing slashes at the listed sources. Consider a build check in
`scripts/` (grep the dist for `href="/[^"]*[^/"]"` patterns) to stop
regressions — the same class of bug has clearly been fixed before in `.astro`
templates but re-entered through props and template literals, which a source
grep for `href="` doesn't catch.

### 3. Three indexable pages are complete orphans (zero internal links, only in sitemap)

| Page | Notes |
|---|---|
| `/removal-cost-calculator/` | Target of **10** legacy redirects (`/online-quote`, `/calculation-result-*`, …) — accumulated equity flows in and dead-ends. Natural link spots: `/pricing/`, `/how-much-does-a-home-removal-company-cost-in-bristol/`, `/moving-advice/` resource grid. |
| `/later-life-moving-guide/` | Target of 2 redirects. Not listed on `/moving-advice/` (its sibling guides all are). Natural links: moving-advice grid, `/care-home-removals/`, `/partners/care-homes/`. |
| `/partners/office-space/` | Not linked from the `/partners/` hub, unlike its siblings. Natural links: `/partners/`, `/office-removals/`. |

Sitemap-only discovery keeps them indexed but Google treats internally
unlinked pages as unimportant; all three currently get near-zero impressions.
Either link them in or (if intentionally hidden) add them to the noindex set —
the current state is the worst of both.

---

## P2 — High-value linking opportunities (GSC-informed)

### 4. Near-orphaned guides that already rank page 1–2

These get 1–2 contextual inlinks yet rank well — the cheapest wins available:

| Page | Contextual inlinks | GSC (90d) |
|---|---|---|
| `/how-to-pack-a-van-for-moving-house/` | 1 | 1,103 imp, **pos 9.6**, 5 clicks |
| `/how-much-does-a-home-removal-company-cost-in-bristol/` | 2 | 20 imp, pos 11.8 |
| `/moving-house-checklist/` | 4 | 64 imp, pos 9.2 |
| `/care-home-removals/` | 1 | pos 24 |
| `/clearance-guide/` | 1 | pos 37 |
| `/home-removals-with-autism/` | 1 | pos 20.7 |

Good link sources: the packing-guide chapters (13 well-linked pages about
packing that never mention the van-packing guide), `/pricing/` → cost guide,
neighbourhood pages → checklist.

### 5. Money pages stuck at positions 25–45 with thin *contextual* support

Nav links are site-wide boilerplate; Google weights in-content links more.
Current contextual inlink counts vs. rankings:

| Page | Contextual inlinks | GSC position | Impressions |
|---|---|---|---|
| `/office-removals/` | 22 | 44.8 | 1,068 |
| `/house-and-waste-clearance/` | 31 | 39.6 | 544 |
| `/home-packing-service/` | 79 | 34.5 | 6,040 |
| `/home-removals-bristol/` | 71 | 28.9 | 894 |
| `/removals-bath/` | **7** | 37.8 | 628 |
| `/removals-weston-super-mare/` | **4** | ~28–31 | see caveat |

`/removals-bath/` stands out: Bath is named in the site title on every page,
but only 7 pages link to it contextually and 5 of those use the bare anchor
"Bath". Route pages (`removals-bristol-to-*`), `/removals-keynsham/`,
`/removals-radstock/`, `/removals-chew-valley/` and the guides are natural
linkers with anchors like "removals in Bath".

⚠️ Caveat on Weston-super-Mare: its headline 21,968 impressions are mostly
rank-tracker bot queries (the GSC query strings carry campaign-label
formatting like "movers & removals,cheap house removals weston super mare -
exact,…"). Real demand is smaller — but the page does rank ~28–31 for genuine
"removals weston super mare" terms with only 4 inlinks, so it's still worth
strengthening from `/removals-clevedon/`, `/removals-portishead/`,
`/removals-nailsea/` and `/areas/`.

For `/office-removals/` (position 45): 20 of its 23 body anchors are the
identical "office removals" from the same boilerplate paragraph on
neighbourhood pages. Varied, sentence-level links from `/partners/office-space/`
(currently an orphan — see #3), `/partners/estate-agents/`, `/storage-service/`
and `/cleaning-service/` would help more than another templated module.

### 6. Minor equity leaks into noindex pages

Five indexable pages contextually link to noindex pages
(`/man-with-a-van-near-bristol/`, `/later-life-moves/`, `/partners/solicitors/`,
`/partners/relocation-agents/`, `/partners/home-staging/`) — one link each.
Low impact; worth a look only if those pages stay noindex long-term. The
noindex pages themselves use `noindex, nofollow`, so any equity they receive
dead-ends (deliberate for the quote funnel; incidental for the partner pages).

---

## What's already good (don't touch)

- **No broken links, no redirect-chasing links** anywhere in the build.
- **Canonicals** correct on all 104 non-packing-guide pages.
- **Sitemap** correctly excludes the 17 noindex pages; `lastmod` only set when
  tracked (per the deliberate config comment).
- **Geo cluster**: `/areas/` hub links every town + neighbourhood; every
  neighbourhood links 3 nearby neighbourhoods + hub + 5 services via
  `NearbyAndServices`; towns cross-link routes and other towns. Depth ≤ 2
  clicks from home for the whole cluster.
- **Anchor text**: descriptive and naturally varied on all key pages; no
  over-optimisation patterns.
- **Guide ↔ hub linking**: all guides breadcrumb back to `/moving-advice/`;
  packing-guide chapters link prev/next/related + hub (fix slashes, keep
  structure).
