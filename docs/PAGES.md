# Pages Documentation

## Overview

All pages follow a consistent structure and use Astro's file-based routing.

---

## Page Structure

### Home Page (`/`)

Landing page with:
- Hero section
- Features showcase
- How it works
- CTA sections

**File:** `src/pages/index.astro`

---

### Calculator Pages (`/calculator/[step]`)

Dynamic routes for calculator steps:
- `/calculator/step-01` - First step
- `/calculator/step-02` - Second step (if configured)
- `/calculator/summary` - Final summary

**File:** `src/pages/calculator/[step].astro`

**Config:** Steps defined in `src/lib/core/calculator/config.ts`

---

### Thank You Page (`/thank-you`)

Shown after successful quote submission.

**Query Params:**
- `id` - Quote ID (optional)

**Example:** `/thank-you?id=123`

**File:** `src/pages/thank-you.astro`

---

### Error Pages

**404 Not Found** (`/404`)
- Shown when page doesn't exist
- File: `src/pages/404.astro`

**500 Server Error** (`/500`)
- Shown on internal errors
- File: `src/pages/500.astro`

---

## Adding New Pages

1. Create `.astro` file in `src/pages/`
2. Use layout components for consistency
3. Add to sitemap if needed
4. Update navigation if applicable

Example:

```astro
---
// src/pages/new-page.astro
import '@/styles/global.css';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>New Page</title>
  </head>
  <body>
    <h1>New Page</h1>
  </body>
</html>
```

---

## SEO Best Practices

Each page should have:
- Unique `<title>` tag
- Meta description
- Proper heading hierarchy
- Alt text for images
- Canonical URL (if needed)

---

## Performance

- Images optimized with `@unpic/astro`
- Critical CSS inlined
- JavaScript lazy loaded
- Static generation where possible
