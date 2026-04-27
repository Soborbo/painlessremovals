# Schema Audit — Painless Removals 2026

Generated: 2026-03-19 (updated)

## Entity Architecture

All schemas follow an entity-linked @id pattern. No duplicate entities.

```
painlessremovals.com/#business         → MovingCompany  (Layout.astro — global)
painlessremovals.com/#website          → WebSite        (index.astro — homepage)
painlessremovals.com/#logo             → ImageObject    (Layout.astro — global)
painlessremovals.com/about/jay-newton#person → Person   (jay-newton.astro)
```

Every page inherits the global MovingCompany from Layout.astro. Page-specific schemas reference it via `@id` only.

---

## GLOBAL SCHEMA (every page)

### MovingCompany `@id: /#business`
```json
{
  "@type": "MovingCompany",
  "@id": "https://painlessremovals.com/#business",
  "name": "Painless Removals",
  "legalName": "Painless Removals Ltd",
  "alternateName": "Painless Removals",
  "url": "https://painlessremovals.com",
  "slogan": "Just be excited for your move. We'll handle everything else.",
  "foundingDate": "1978",
  "priceRange": "££-£££",
  "isicV4": "4942",
  "currenciesAccepted": "GBP",
  "paymentAccepted": "Cash, Credit Card, Debit Card, Bank Transfer",
  "knowsAbout": ["Home Removals", "Long Distance Removals", "Office Removals", "Packing Services", "Storage Solutions", "House Clearance", "End of Tenancy Cleaning", "Chain Moves", "Property Chain Coordination"],
  "knowsLanguage": ["en", "es", "fr"],
  "logo": { "@type": "ImageObject", "@id": "/#logo", "url": ".../images/logo.svg", "width": "1440", "height": "460" },
  "image": ".../img/homepage/painless-removals-team-1200w.webp",
  "address": { "@type": "PostalAddress", "streetAddress": "290-294 Southmead Rd", "addressLocality": "Bristol", "addressRegion": "Bristol", "postalCode": "BS10 5EN", "addressCountry": "GB" },
  "geo": { "@type": "GeoCoordinates", "latitude": 51.4977, "longitude": -2.5959 },
  "hasMap": "https://g.page/painlessremovals",
  "telephone": "+44-117-287-0082",
  "email": "hello@painlessremovals.com",
  "contactPoint": [
    { "@type": "ContactPoint", "telephone": "+44-117-287-0082", "contactType": "customer service", "areaServed": "GB", "availableLanguage": ["English", "Spanish", "French"], "hoursAvailable": { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "09:00", "closes": "17:00" } },
    { "@type": "ContactPoint", "telephone": "+447565772430", "contactType": "customer service", "contactOption": "TollFree", "areaServed": "GB", "availableLanguage": ["English"] }
  ],
  "areaServed": [
    { "@type": "City", "name": "Bristol", "sameAs": "https://en.wikipedia.org/wiki/Bristol" },
    { "@type": "City", "name": "Bath", "sameAs": "https://en.wikipedia.org/wiki/Bath,_Somerset" },
    { "@type": "City", "name": "Weston-super-Mare", "sameAs": "https://en.wikipedia.org/wiki/Weston-super-Mare" },
    { "@type": "AdministrativeArea", "name": "South West England" },
    { "@type": "Country", "name": "United Kingdom", "sameAs": "https://en.wikipedia.org/wiki/United_Kingdom" }
  ],
  "openingHoursSpecification": { "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "opens": "09:00", "closes": "17:00" },
  "founder": { "@type": "Person", "name": "Steve Fanger" },
  "employee": { "@type": "Person", "@id": "/about/jay-newton#person", "name": "Jay Newton", "jobTitle": "Director" },
  "numberOfEmployees": { "@type": "QuantitativeValue", "minValue": 5, "maxValue": 10 },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": 122, "bestRating": "5", "worstRating": "1" },
  "hasOfferCatalog": {
    "@type": "OfferCatalog", "name": "Removal & Moving Services",
    "itemListElement": [
      { "@type": "OfferCatalog", "name": "Home Removals", "itemListElement": [
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Local Home Removals" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Long Distance Removals" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Chain Move Coordination" } }
      ]},
      { "@type": "OfferCatalog", "name": "Additional Services", "itemListElement": [
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Professional Packing Service" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Office Removals" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Secure Storage" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "House & Waste Clearance" } },
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "End of Tenancy Cleaning" } }
      ]}
    ]
  },
  "sameAs": [
    "https://www.google.com/maps?cid=10222747834737099273",
    "https://www.facebook.com/painlessremovals",
    "https://www.linkedin.com/company/painless-removals",
    "https://www.youtube.com/@painlessremovals",
    "https://www.instagram.com/painless_removals/",
    "https://uk.trustpilot.com/review/painlessremovals.com",
    "https://www.yelp.co.uk/biz/painless-removals-bristol-3",
    "https://find-and-update.company-information.service.gov.uk/company/13774359",
    "https://www.yell.com/biz/painless-removals-bristol-7066268/",
    "https://www.moveassured.com/member/new-member-27",
    "https://www.aimovers.org.uk/united-kingdom/westbury-on-trym/mover/painless-removals-ltd",
    "https://www.autismcentral.org.uk/directory/service/painless-removals-autism-friendly-home-removals-packing-service-bristol"
  ]
}
```

---

## PAGE-BY-PAGE SCHEMA REPORT

---

### / (Homepage)

| Schema | Details |
|--------|---------|
| **WebSite** | @id: `/#website`, name: "Painless Removals", publisher: ref `/#business`, potentialAction: SearchAction, inLanguage: "en-GB" |
| **FAQPage** | 8 questions: pricing, booking, insurance, key delays, inclusions, packing, duration, storage |

---

### /about/

| Schema | Details |
|--------|---------|
| **AboutPage** | name: "About Painless Removals", mainEntity: ref `/#business` |
| **BreadcrumbList** | Home > About Us |

---

### /about/jay-newton/

| Schema | Details |
|--------|---------|
| **ProfilePage** | dateCreated: 2026-01-15, dateModified: 2026-03-10 |
| **Person** (mainEntity) | @id: `/about/jay-newton#person`, name: "Jay Newton", jobTitle: "Director", description: "Director of Painless Removals since 2019...", worksFor: ref `/#business`, hasOccupation: Occupation (name: "Removal Company Director", occupationalCategory: "4942", occupationLocation: City "Bristol"), image: ImageObject (800x800), knowsAbout: [Home Removals, Long Distance Removals, Packing Services, Chain Move Coordination, Property Chain Coordination, Office Relocations, Furniture Protection, Storage Solutions], knowsLanguage: ["en", "es"], sameAs: [LinkedIn (jay-newton-72632223), Companies House officer] |
| **BreadcrumbList** | Home > About > Jay Newton |

---

### /reviews/

| Schema | Details |
|--------|---------|
| **MovingCompany** | @id: `/#business` — 10 Review objects attached: Christopher Nelson (Google, 2024-11-15), James Collard (Google, 2024-09-20), Sarah-Jane Liddington (Trustpilot, 2024-08-10), Sibi Catley-Chandar (Google, 2024-07-05), Adrian Place (Trustpilot, 2024-10-28), Laura Pepworth (Google, 2024-06-18), Claire G. (Google, 2024-05-22), Marco Balvin Ortega (Google, 2024-04-12), Geoff Barnes (Google, 2024-03-08), Jeremy Vize (Google, 2025-01-14). All 5/5 stars. |
| **FAQPage** | 6 questions: review authenticity, rating maintenance, leaving reviews, damage handling, long-distance reviews, move count |
| **BreadcrumbList** | Home > Reviews |

---

### /contact/

| Schema | Details |
|--------|---------|
| **ContactPage** | name: "Contact Painless Removals Bristol", mainEntity: ref `/#business` |
| **FAQPage** | 5 questions: postcode coverage, depot location, quote process, hours, response time |
| **BreadcrumbList** | Home > Contact |

---

### /faq/

| Schema | Details |
|--------|---------|
| **WebPage** | name, description, isPartOf: WebSite, mainEntity: ref `/#business` |
| **FAQPage** | 60 questions across 8 categories: Before You Move (7), Pricing (6), Moving Day (8), Packing (7), Tricky Items (8), Insurance (5), Storage (5), About Us (6) |
| **BreadcrumbList** | Home > FAQ |

---

### /pricing/

| Schema | Details |
|--------|---------|
| **Service** | name: "House Removals Pricing", provider: ref `/#business`, areaServed: Bristol, hasOfferCatalog: 21 offers with price ranges (Studio £350-£490 to 5+ bed custom survey) |
| **FAQPage** | 10 questions: pricing factors, surveys, quote changes, installments, comparison, weekend rates, permits, piggyback, chains, packing ROI |
| **BreadcrumbList** | Home > Pricing |

---

### /jobs/

| Schema | Details |
|--------|---------|
| **WebPage** | name: "Jobs – Join the Painless Removals Team", publisher: ref `/#business` |
| **BreadcrumbList** | Home > Jobs |

---

### /home-removals-bristol/

| Schema | Details |
|--------|---------|
| **Service** | name: "Home Removals Bristol", serviceType: "Home Removals", provider: ref `/#business`, areaServed: Bristol |
| **FAQPage** | 12 questions on home removals |
| **BreadcrumbList** | Home > Home Removals |

---

### /home-packing-service/

| Schema | Details |
|--------|---------|
| **Service** | name: "Professional Packing Service", serviceType: "Packing Service", provider: ref `/#business`, areaServed: Bristol, offers: Offer (£580, "Full packing from £580 for a 2-3 bed") |
| **FAQPage** | 12 questions on packing |
| **BreadcrumbList** | Home > Packing Service |

---

### /office-removals/

| Schema | Details |
|--------|---------|
| **Service** | name: "Office Removals Bristol", serviceType: "Office Removals", provider: ref `/#business`, areaServed: Bristol |
| **FAQPage** | 12 questions on office moves |
| **BreadcrumbList** | Home > Office Removals |

---

### /storage-service/

| Schema | Details |
|--------|---------|
| **Service** | name: "Secure Storage Bristol", serviceType: "Storage Service", provider: ref `/#business`, areaServed: Bristol, offers: Offer (£41, "Secure storage from £41/month for 25 sq ft") |
| **FAQPage** | 10 questions on storage |
| **BreadcrumbList** | Home > Storage |

---

### /cleaning-service/

| Schema | Details |
|--------|---------|
| **Service** | name: "Moving House Cleaning Services Bristol", serviceType: "Cleaning Service", provider: ref `/#business`, areaServed: Bristol |
| **FAQPage** | 8 questions on cleaning |
| **BreadcrumbList** | Home > Cleaning Service |

---

### /house-and-waste-clearance/

| Schema | Details |
|--------|---------|
| **Service** | name: "House & Waste Clearance Bristol", serviceType: "House Clearance", provider: ref `/#business`, areaServed: [Bristol, Bath] |
| **FAQPage** | 10 questions on clearance |
| **BreadcrumbList** | Home > House Clearance |

---

### /concierge-service/

| Schema | Details |
|--------|---------|
| **Service** | name: "Moving House Concierge Service Bristol", serviceType: "Moving Concierge Service", provider: ref `/#business`, areaServed: Bristol, hasOfferCatalog: 5 packages (Admin Blitz £149, Settling In £199, New Home Ready £249, Digital Life Setup £179, Curtain & Blind Fitting £129) + 3 bundles (Essentials £299, Complete £499, VIP £749) |
| **FAQPage** | 8 questions on concierge |
| **BreadcrumbList** | Home > Concierge Service |

---

### /free-home-survey/

| Schema | Details |
|--------|---------|
| **Service** | name: "Free Home Survey & Removal Assessment", serviceType: "Home Survey", provider: ref `/#business`, areaServed: [Bristol, South West], offers: Offer (£0, "Free with no obligation") |
| **FAQPage** | FAQ questions on surveys |
| **BreadcrumbList** | Home > Free Home Survey |

---

### /removal-cost-calculator/

| Schema | Details |
|--------|---------|
| **WebApplication** | name: "Removal Cost Calculator", applicationCategory: "UtilityApplication", provider: ref `/#business`, offers: Offer (£0) |
| **FAQPage** | 4 questions on calculator accuracy, payment, booking |
| **BreadcrumbList** | Home > Removal Cost Calculator |

---

### /send-survey-video/

| Schema | Details |
|--------|---------|
| **BreadcrumbList** | Home > Free Home Survey > Send Survey Video |

---

### /moving-advice/ (Hub)

| Schema | Details |
|--------|---------|
| **CollectionPage** | name: "Moving Advice", publisher: ref `/#business` |
| **BreadcrumbList** | Home > Moving Advice |

---

### /moving-house-checklist/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished, dateModified, inLanguage: "en-GB" |
| **FAQPage** | Checklist-related FAQs |
| **BreadcrumbList** | Home > Moving Advice > Moving House Checklist |

---

### /packing-guide-home-removal/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished, dateModified, inLanguage: "en-GB" |
| **FAQPage** | Packing guide FAQs |
| **BreadcrumbList** | Home > Moving Advice > Packing Guide |

---

### /how-much-does-a-home-removal-company-cost-in-bristol/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished: 2026-02-14, dateModified: 2026-02-14, inLanguage: "en-GB" |
| **FAQPage** | 8 questions on removal costs |
| **BreadcrumbList** | Home > Moving Advice > Removal Costs Bristol |

---

### /home-removals-guide-bristol-bath/

| Schema | Details |
|--------|---------|
| **Article** | headline: "Home Removals Guide for Bristol & Bath", author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished: 2023-01-15, dateModified: 2026-03-12, inLanguage: "en-GB" |
| **FAQPage** | Bristol & Bath moving FAQs |
| **BreadcrumbList** | Home > Moving Advice > Bristol & Bath Guide |

---

### /moving-with-children/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished: 2026-02-26, inLanguage: "en-GB" |
| **FAQPage** | Children-specific moving FAQs |
| **BreadcrumbList** | Home > Moving Advice > Moving with Children |

---

### /home-removals-with-autism/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished, dateModified, inLanguage: "en-GB" |
| **FAQPage** | Autism-specific moving FAQs |
| **BreadcrumbList** | Home > Moving Advice > Moving with Autism |

---

### /later-life-moving-guide/

| Schema | Details |
|--------|---------|
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished: 2026-03-18, inLanguage: "en-GB" |
| **FAQPage** | Later-life moving FAQs |
| **BreadcrumbList** | Home > Moving Advice > Later Life Moving |

---

### /packing-guide/ (Hub)

| Schema | Details |
|--------|---------|
| **Course** | name: "The Complete Packing Guide", provider: ref `/#business`, author: ref `/about/jay-newton#person`, isAccessibleForFree: true, numberOfLessons: 11, timeRequired: dynamic |
| **ItemList** | 11 lessons with VideoObject per lesson (YouTube thumbnails + embed URLs) |
| **HowTo** | name: "How to Pack Your Entire Home for a Move", steps: 11 (with VideoObject per step), totalTime: dynamic |
| **FAQPage** | 6 questions: advance packing, pro packers, box count, room order, materials, DIY packing |
| **BreadcrumbList** | Home > Packing Guide |

---

### /packing-guide/[lesson-slug]/ (11 dynamic pages)

| Schema | Details |
|--------|---------|
| **VideoObject** | name: lesson title, thumbnailUrl: YouTube, embedUrl: YouTube, duration: dynamic, author: ref `/about/jay-newton#person`, publisher: ref `/#business` |
| **Article** | headline: lesson title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished: 2026-02-14, dateModified: 2026-03-12, video: nested VideoObject, inLanguage: "en-GB" |
| **BreadcrumbList** | Home > Packing Guide > [Lesson Title] |

---

### /areas/

| Schema | Details |
|--------|---------|
| **FAQPage** | 4 questions on areas |
| **BreadcrumbList** | Home > Areas |

---

### /partners/

| Schema | Details |
|--------|---------|
| **Service** | name: "Trade Partnership Programme", serviceType: "Trade Partnership Programme", provider: ref `/#business`, areaServed: [Bristol, South West] |
| **FAQPage** | 6 questions on partnerships |
| **BreadcrumbList** | Home > Partners |

---

### Area Pages — Bristol Neighbourhoods (20 pages)

All follow the same pattern:

| Page | Service Name | Area | Postcode |
|------|-------------|------|----------|
| /removals-bristol/bedminster/ | Bedminster Removal Services | Bedminster, Bristol | BS3 |
| /removals-bristol/bishopston/ | Bishopston Removal Services | Bishopston, Bristol | BS7 |
| /removals-bristol/brislington/ | Brislington Removal Services | Brislington, Bristol | BS4 |
| /removals-bristol/clifton/ | Clifton Removal Services | Clifton, Bristol | BS8 |
| /removals-bristol/cotham/ | Cotham Removal Services | Cotham, Bristol | BS6 |
| /removals-bristol/filton/ | Filton Removal Services | Filton, Bristol | BS34 |
| /removals-bristol/fishponds/ | Fishponds Removal Services | Fishponds, Bristol | BS16 |
| /removals-bristol/henleaze/ | Henleaze Removal Services | Henleaze, Bristol | BS9 |
| /removals-bristol/horfield/ | Horfield Removal Services | Horfield, Bristol | BS7 |
| /removals-bristol/hotwells/ | Hotwells Removal Services | Hotwells, Bristol | BS8 |
| /removals-bristol/knowle/ | Knowle Removal Services | Knowle, Bristol | BS4 |
| /removals-bristol/montpelier/ | Montpelier Removal Services | Montpelier, Bristol | BS6 |
| /removals-bristol/patchway/ | Patchway Removal Services | Patchway, Bristol | BS34 |
| /removals-bristol/redland/ | Redland Removal Services | Redland, Bristol | BS6 |
| /removals-bristol/southville/ | Southville Removal Services | Southville, Bristol | BS3 |
| /removals-bristol/st-george/ | St George Removal Services | St George, Bristol | BS5 |
| /removals-bristol/stoke-bishop/ | Stoke Bishop Removal Services | Stoke Bishop, Bristol | BS9 |
| /removals-bristol/stoke-gifford/ | Stoke Gifford Removal Services | Stoke Gifford, Bristol | BS34 |
| /removals-bristol/totterdown/ | Totterdown Removal Services | Totterdown, Bristol | BS4 |
| /removals-bristol/westbury-on-trym/ | Westbury-on-Trym Removal Services | Westbury-on-Trym, Bristol | BS9 |

**Schema per page:**
| Schema | Details |
|--------|---------|
| **Service** | name: "[Area] Removal Services", provider: ref `/#business`, areaServed: Place (name, postcode, addressLocality: Bristol) |
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished, dateModified |
| **BreadcrumbList** | Home > Areas > [Area Name] |

---

### Route Pages — Long Distance (13 pages)

All follow the same pattern:

| Page | Service Name | Cities |
|------|-------------|--------|
| /removals-bristol-to-birmingham/ | Removals Bristol to Birmingham | Bristol, Birmingham |
| /removals-bristol-to-cardiff/ | Removals Bristol to Cardiff | Bristol, Cardiff |
| /removals-bristol-to-cornwall/ | Removals Bristol to Cornwall | Bristol, Cornwall |
| /removals-bristol-to-devon/ | Removals Bristol to Devon | Bristol, Devon |
| /removals-bristol-to-edinburgh/ | Removals Bristol to Edinburgh | Bristol, Edinburgh |
| /removals-bristol-to-exeter/ | Removals Bristol to Exeter | Bristol, Exeter |
| /removals-bristol-to-glasgow/ | Removals Bristol to Glasgow | Bristol, Glasgow |
| /removals-bristol-to-leeds/ | Removals Bristol to Leeds | Bristol, Leeds |
| /removals-bristol-to-london/ | Removals Bristol to London | Bristol, London |
| /removals-bristol-to-manchester/ | Removals Bristol to Manchester | Bristol, Manchester |
| /removals-bristol-to-oxford/ | Removals Bristol to Oxford | Bristol, Oxford |
| /removals-bristol-to-southampton/ | Removals Bristol to Southampton | Bristol, Southampton |
| /removals-bristol-to-swindon/ | Removals Bristol to Swindon | Bristol, Swindon |

**Schema per page:**
| Schema | Details |
|--------|---------|
| **Service** | name: "Removals Bristol to [City]", provider: ref `/#business`, areaServed: [City: Bristol, City: destination] |
| **Article** | headline: title, author: ref `/about/jay-newton#person`, publisher: ref `/#business`, datePublished, dateModified |
| **BreadcrumbList** | Home > Home Removals > Bristol to [City] |

---

### Other/Utility Pages

| Page | Schemas |
|------|---------|
| /affiliate-form/ | WebPage (publisher: ref `/#business`). noindex. |
| /vehicle-check/ | WebPage (publisher: ref `/#business`). noindex. |
| /jobs/thank-you/ | No page-specific schema. noindex. |
| /contact/thank-you/ | No page-specific schema. noindex. |
| /house-and-waste-clearance/thank-you/ | No page-specific schema. noindex. |

---

## Schema Coverage Summary

| Schema Type | Count | Where Used |
|-------------|-------|------------|
| MovingCompany | 1 (global) + 1 (reviews with Review[]) | Layout.astro, reviews.astro |
| Person | 1 (canonical) | jay-newton.astro |
| Occupation | 1 (nested in Person) | jay-newton.astro |
| WebSite | 1 | index.astro |
| ImageObject | 1 (logo) + per lesson | Layout.astro, packing lessons |
| AboutPage | 1 | about.astro |
| ProfilePage | 1 | jay-newton.astro |
| ContactPage | 1 | contact.astro |
| Service | ~25 | All service + area + route pages |
| Article | ~25 | All guide + area + route pages |
| FAQPage | ~25 | Most content pages |
| BreadcrumbList | ~65 | All pages except homepage |
| WebPage | ~5 | faq, jobs, vehicle-check, affiliate-form |
| WebApplication | 1 | removal-cost-calculator |
| Course | 1 | packing-guide/index |
| HowTo | 1 | packing-guide/index |
| VideoObject | ~12 | packing-guide lessons |
| ItemList | 1 | packing-guide/index |
| CollectionPage | 1 | moving-advice |
| Review | 10 | reviews.astro |
| AggregateRating | 1 (global) | Layout.astro |
| Offer/OfferCatalog | ~10 | Service pages with pricing |
| SearchAction | 1 | index.astro |

**Total unique schema types used: 23**
**Total pages with schemas: 95+**
**Breadcrumb coverage: 100% (except homepage)**
**Entity linking: 100% (no duplicate entities)**
**Speakable: removed (not applicable to non-news publishers)**
