# Session Changes — 2026-03-19

## Summary

5 commits, 72 files changed, ~1,186 insertions, ~1,220 deletions

---

## Commit 1: GTM + Conversion Tracking

### Google Tag Manager (GTM-PXTH5JJK)
- **Layout.astro**: Added GTM container snippet to `<head>` and noscript fallback to `<body>`
- Container ID: `GTM-PXTH5JJK` (Google Tag Gateway)

### UTM & Click ID Tracking (Layout.astro)
- Captures from URL params on every page load: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`
- Stores in `sessionStorage` under key `pr_tracking` (with landing page + timestamp)
- Pushes `tracking_params` event to `dataLayer` for GTM access

### Conversion Tracking (form_submission event)
All 5 form endpoints now push `form_submission` to dataLayer on success:

| Form | File | form_name |
|------|------|-----------|
| Contact | `contact.astro` | `contact` |
| Affiliate referral | `affiliate-form.astro` | `affiliate` |
| Partner register | `partners/index.astro` | `partner_register` |
| Job application | `jobs.astro` | `job_application` |
| Clearance callback | `ClearanceCalculator.astro` | `clearance_callback` |

Each event includes: `form_name`, `form_source`, `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`

---

## Commit 2: Pro-Level Entity-Linked Schema Architecture Rebuild

### New file: `src/utils/schema.ts`
Schema utility with canonical @id anchors and builder functions:

**Entity anchors:**
- `ENTITY.business` → `https://painlessremovals.com/#business`
- `ENTITY.website` → `https://painlessremovals.com/#website`
- `ENTITY.logo` → `https://painlessremovals.com/#logo`
- `ENTITY.person` → `https://painlessremovals.com/about/jay-newton#person`

**Reference helpers:**
- `ref.business()` → `{ "@id": ".../#business" }`
- `ref.person()` → `{ "@id": ".../about/jay-newton#person" }`
- `ref.website()` → `{ "@id": ".../#website" }`
- `ref.logo()` → `{ "@id": ".../#logo" }`

**Builder functions:**
- `breadcrumbs(items)` — BreadcrumbList
- `service(opts)` — Service with provider ref
- `offer(opts)` — Offer object
- `faqPage(faqs)` — FAQPage from array
- `article(opts)` — Article with author/publisher refs
- `howTo(opts)` — HowTo with steps
- `video(opts)` — VideoObject

**Area helpers:**
- `areas.bristol`, `areas.bath`, `areas.weston`, `areas.southWest`, `areas.uk`
- `areas.place(name, postcode)`, `areas.city(name, sameAs?)`

### Layout.astro — Enhanced Global MovingCompany Entity
Added/enhanced properties on the canonical `/#business` entity:
- `legalName`, `alternateName`, `slogan`
- `isicV4: "4942"` (moving industry code)
- `currenciesAccepted: "GBP"`
- `paymentAccepted: "Cash, Credit Card, Debit Card, Bank Transfer"`
- `knowsAbout`: 9 topics (Home Removals, Long Distance, Office, Packing, Storage, Clearance, Cleaning, Chain Moves, Property Chain Coordination)
- `knowsLanguage: ["en", "es", "fr"]`
- `logo`: Full ImageObject with @id `/#logo`, width, height, caption
- `image`: Team photo URL
- `contactPoint[]`: Phone (with hours, languages) + WhatsApp
- `hasMap`: Google Business URL
- `founder`: Person (Steve)
- `employee`: Person (@id `/#person`, Jay Newton)
- `numberOfEmployees`: QuantitativeValue (5-10)
- `hasOfferCatalog`: Nested OfferCatalog with 8 service offerings

### Pages Updated (67 files)

**Homepage (index.astro):**
- WebSite schema: added `@id`, `publisher` ref, `SearchAction`, `inLanguage`
- FAQPage: now uses `faqPage()` helper
- Removed all microdata attributes (`itemscope`, `itemprop`, etc.) from Find Us section

**About (about.astro):**
- Replaced full inline MovingCompany definition with `ref.business()` (one line)
- Added BreadcrumbList, Speakable
- 60+ lines of duplicate entity removed

**Jay Newton (about/jay-newton.astro):**
- Enhanced Person entity: ImageObject, knowsAbout (8 topics), knowsLanguage, memberOf
- Added BreadcrumbList
- Added `dateCreated`, `dateModified` to ProfilePage

**Reviews (reviews.astro):**
- Reviews now attached to `@id: /#business` via thin reference (no full MovingCompany redefinition)
- Added `publisher` per review (Google / Trustpilot)
- Replaced inline FAQ with `faqPage()` helper
- Replaced inline breadcrumbs with `breadcrumbs()` helper

**Service pages (6 files):**
- home-packing-service, cleaning-service, concierge-service, storage-service, office-removals, house-and-waste-clearance
- All now use `service()` helper with `ref.business()` provider
- All now use `faqPage()` helper
- All now have BreadcrumbList

**Article/guide pages (8 files):**
- moving-house-checklist, packing-guide-home-removal, home-removals-guide-bristol-bath, moving-with-children, home-removals-with-autism, later-life-moving-guide, moving-advice, home-removals-bristol
- All now use `article()` helper (auto-sets author + publisher refs)
- All now have BreadcrumbList + Speakable

**Packing guide (3 files):**
- index.astro: Added HowTo schema (step-by-step with VideoObject per lesson), Course entity-linked, BreadcrumbList
- [...slug].astro: Entity-linked VideoObject + Article, BreadcrumbList per lesson

**Area pages (20 files):**
- All 20 neighbourhood pages: added BreadcrumbList

**Route pages (13 files):**
- All 13 long-distance route pages: added BreadcrumbList

**Contact/FAQ/Pricing/etc.:**
- contact.astro: `ref.business()` instead of full entity, added BreadcrumbList
- faq.astro: `faqPage()` + `breadcrumbs()` helpers
- pricing.astro: added BreadcrumbList
- areas/index.astro: added BreadcrumbList
- partners/index.astro: `ref.business()` provider, added BreadcrumbList
- removal-cost-calculator.astro: `ref.business()` provider, added BreadcrumbList
- free-home-survey.astro: `service()` helper, added BreadcrumbList
- send-survey-video.astro: `breadcrumbs()` helper
- how-much-does-a-home-removal-company-cost-in-bristol.astro: `article()` + `faqPage()` + `breadcrumbs()` helpers
- jobs.astro: `ref.business()` publisher, added BreadcrumbList
- vehicle-check.astro: `ref.business()` publisher
- affiliate-form.astro: `ref.business()` reference

---

## Commit 3: Mobile Header Fix

### `src/styles/global.css`
- Added `body { overflow-x: hidden; }` — html alone is insufficient on mobile Chrome (Galaxy S24). Both html and body need overflow-x hidden to prevent horizontal scrolling that pushes the fixed header off-viewport.

### `src/layouts/Layout.astro`
- Added "Online Quote" CTA button to mobile header (next to hamburger icon)
- Previously the CTA button was only visible on `lg+` (desktop) breakpoint
- Now shows a compact version (`!py-1.5 !px-3 !text-[11px]`) on mobile
- Wrapped hamburger + CTA in a flex container with `lg:hidden`

---

## Commit 4: Dropbox File Request Link

### `src/components/SurveyOptions.astro`
- "Dropbox upload" text in the "Send Us a Video" card is now a clickable link to `https://www.dropbox.com/request/c7s2YBgAkZSXw9eCATzK`
- Previously was a plain `<span>`, now an `<a>` with `target="_blank"` and blue hover styling

### `src/pages/send-survey-video.astro`
- Replaced the single "Email us the link" card with a dedicated Dropbox upload card
- Primary CTA: **UPLOAD TO DROPBOX** → direct link to Dropbox file request
- Secondary link: "or email us the link" → existing mailto link preserved as fallback
- Added "No account needed — just drag & drop" subtitle

---

## Commit 5: Schema.org Entity Graph Fixes (Audit)

### `src/utils/schema.ts`
- **Person @id trailing slash fix**: `/about/jay-newton#person` → `/about/jay-newton/#person`
- Without the trailing slash, the @id resolved incorrectly on non-root pages (e.g. on `/pricing/` it became `https://painlessremovals.com/pricing/about/jay-newton#person`)
- This was the only **FAIL** in the schema audit — it broke the entire Person entity chain across all Article author refs and the Layout employee ref

### `src/config/site.config.ts`
- **hasMap**: Changed from `https://g.page/painlessremovals` (redirect) to `https://www.google.com/maps?cid=10222747834737099273` (canonical CID URL that Google uses in Knowledge Graph)

### `src/layouts/Layout.astro`
- **WhatsApp ContactPoint**: Removed `"contactOption": "https://schema.org/TollFree"` — a mobile WhatsApp number is not toll-free
- **hasOfferCatalog**: Replaced 5 anonymous `{ "@type": "Service", "name": "..." }` entries with `@id` references to actual service page schemas:
  - Local Home Removals → `@id: .../home-removals-bristol/#service`
  - Professional Packing → `@id: .../home-packing-service/#service`
  - Office Removals → `@id: .../office-removals/#service`
  - Secure Storage → `@id: .../storage-service/#service`
  - House & Waste Clearance → `@id: .../house-and-waste-clearance/#service`
  - End of Tenancy Cleaning → `@id: .../cleaning-service/#service`
  - Long Distance Removals & Chain Move Coordination kept as anonymous (no dedicated service pages)
