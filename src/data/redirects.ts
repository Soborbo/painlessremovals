/**
 * Redirect map for old WordPress URLs → new Astro pages.
 *
 * Keys are lowercase paths WITHOUT trailing slashes.
 * Astro config imports this map and generates HTML redirect pages at build time.
 *
 * Splat/wildcard redirects stay in public/_redirects (edge-level).
 */
export const redirectMap = new Map<string, string>([
  // ── Feed URLs → homepage ───────────────────────────────────
  ['/feed', '/'],

  // ── FAQ ──────────────────────────────────────────────────────
  ['/frequently-asked-questions', '/faq/'],

  // ── Category pages ───────────────────────────────────────────
  ['/category/uncategorized', '/'],
  ['/category/moving-home', '/'],
  ['/category/packing', '/home-packing-service/'],
  ['/category/moving-tips', '/faq/'],
  ['/category/commercial-removals', '/office-removals/'],

  // ── Old blog posts → packing / office / checklist ────────────
  ['/moving-home-10-tips-for-stress-free-packing', '/packing-guide-home-removal/'],
  ['/home-packing-tips-how-to-pack-for-your-house-move', '/packing-guide-home-removal/'],
  ['/making-moving-day-painless-with-your-moving-day-survival-kit', '/packing-guide-home-removal/'],
  ['/how-to-pack-up-your-kitchen-in-10-steps', '/packing-guide-home-removal/'],
  ['/packing-books-for-moving-or-storage', '/packing-guide-home-removal/'],
  ['/moving-your-business-tips-for-a-smooth-office-relocation', '/office-removals/'],
  ['/leaving-your-house-clean-when-you-move-out-a-step-by-step-guide', '/moving-house-checklist/'],

  // ── Old blog posts → Bristol & Bath guide (25 posts) ─────────
  ['/11-spring-cleaning-tips-for-moving-house', '/home-removals-guide-bristol-bath/'],
  ['/6-tips-to-deal-with-house-move-stress', '/home-removals-guide-bristol-bath/'],
  ['/hot-summer-moving-tips', '/home-removals-guide-bristol-bath/'],
  ['/navigating-the-uncertainty-and-stress-of-moving-what-makes-painless-removals-different', '/home-removals-guide-bristol-bath/'],
  ['/painless-removals-guide-to-moving-home-during-the-summer-holidays', '/home-removals-guide-bristol-bath/'],
  ['/when-is-the-best-time-to-move', '/home-removals-guide-bristol-bath/'],
  ['/tips-for-moving-home', '/home-removals-guide-bristol-bath/'],
  ['/preparing-for-university-moving-tips-for-students', '/home-removals-guide-bristol-bath/'],
  ['/a-moving-companies-guide-for-landlords', '/home-removals-guide-bristol-bath/'],
  ['/how-to-move-house-safely', '/home-removals-guide-bristol-bath/'],
  ['/tips-for-lifting-the-heavy-stuff-in-your-home', '/home-removals-guide-bristol-bath/'],
  ['/a-removals-company-top-tips-on-dismantling-and-transporting-furniture-when-moving-home', '/home-removals-guide-bristol-bath/'],
  ['/making-moving-painless-a-guide-to-planning-your-2024-relocation', '/home-removals-guide-bristol-bath/'],
  ['/our-ultimate-guide-to-moving-house-during-the-summer-in-the-uk', '/home-removals-guide-bristol-bath/'],
  ['/navigating-moving-house-in-the-winter-months', '/home-removals-guide-bristol-bath/'],
  ['/the-dos-and-donts-of-moving-house', '/home-removals-guide-bristol-bath/'],
  ['/5-tips-to-help-make-moving-less-stressful-in-2023', '/home-removals-guide-bristol-bath/'],
  ['/7-tips-for-moving-house-in-the-autumn', '/home-removals-guide-bristol-bath/'],
  ['/how-to-plan-a-painless-house-move', '/home-removals-guide-bristol-bath/'],
  ['/smooth-moves-the-benefits-and-tips-for-hiring-a-van-from-bristol-car-and-van-hire-for-your-house-move', '/home-removals-guide-bristol-bath/'],
  ['/moving-house-with-pet-dogs', '/home-removals-guide-bristol-bath/'],
  ['/tips-for-moving-house-with-cats', '/home-removals-guide-bristol-bath/'],
  ['/5-mistakes-to-avoid-when-moving-house', '/home-removals-guide-bristol-bath/'],
  ['/save-money-on-your-house-move', '/home-removals-guide-bristol-bath/'],
  ['/how-to-prepare-for-a-long-distance-move-advice-from-a-removals-company', '/home-removals-guide-bristol-bath/'],

  // ── WordPress blog posts → consolidated pages ────────────────
  ['/a-moving-companies-guide-to-packing-a-van', '/packing-guide-home-removal/'],
  ['/a-moving-companies-guide-to-self-storage', '/storage-service/'],
  ['/storage-options-for-homeowners-in-the-uk', '/storage-service/'],
  ['/moving-checklist-for-home-removals', '/moving-house-checklist/'],
  ['/everything-you-need-to-know-about-moving-with-a-toddler', '/moving-with-children/'],
  ['/moving-with-a-toddler', '/moving-with-children/'],

  // ── Elderly guide → later-life moving guide ─────────────────
  ['/moving-home-in-later-life-how-can-you-make-the-process-less-problematic', '/later-life-moving-guide/'],
  ['/moving-guide-for-the-elderly', '/later-life-moving-guide/'],

  // ── Office relocation guide → office removals ────────────────
  ['/tips-for-a-stress-free-office-relocation', '/office-removals/'],
  ['/comprehensive-business-and-office-relocation-guide-for-bristol-and-bath', '/office-removals/'],

  // ── Page renames / URL changes ───────────────────────────────
  ['/instant-quote', '/instantquote/'],
  ['/contact-us', '/contact/'],
  ['/flat-removals-bristol', '/home-removals-bristol/'],
  ['/updates-and-info', '/about/'],
  ['/calculation-result-general', '/instantquote/your-quote/'],
  ['/home-removals-bath', '/removals-bath/'],

  // ── Old review hub pages (root-level, not under /reviews/) ───
  ['/bristol-removal-company-reviews', '/reviews/'],
  ['/bristol-removal-company-reviews-bath', '/reviews/'],
  ['/bristol-removals-ratings-reviews', '/reviews/'],
  ['/bristol-reviews-removals-company', '/reviews/'],
  ['/review-bristol-removal-company', '/reviews/'],

  // ── Partial / broken URLs ────────────────────────────────────
  ['/making-moving-day-', '/packing-guide-home-removal/'],

  // ── Old quote / survey forms → cost calculator ──────────────
  ['/online-self-survey', '/removal-cost-calculator/'],
  ['/online-quote', '/removal-cost-calculator/'],
  ['/online-quote-business', '/removal-cost-calculator/'],

  // ── Old instantquote video upload → new upload page ────────
  ['/instantquote/self-survey-video-upload', '/send-survey-video/'],
  ['/upload', '/send-survey-video/'],

  // ── Pages that escaped the calculator path → top-level ──────
  ['/instantquote/vehicle-check', '/vehicle-check/'],
  ['/instantquote/affiliate-form', '/affiliate-form/'],

  // ── New page redirects ─────────────────────────────────────
  ['/self-survey', '/free-home-survey/'],
  ['/home-removal-checklist-in-2025', '/moving-house-checklist/'],
  ['/blog', '/moving-advice/'],
  ['/man-with-a-van-bristol', '/man-with-a-van-near-bristol/'],
  ['/terms', '/terms-conditions/'],
  ['/cookie-policy', '/privacy-policy/'],
  ['/jobs-old', '/jobs/'],

  // ── Partner pages ──────────────────────────────────────────
  ['/partnerships', '/partners/'],

  // ── Removed hub pages (merged into /areas/) ───────────────
  ['/removals-bristol', '/areas/'],

  // ── Old calculator result pages → cost calculator ─────────
  ['/calculation-result', '/removal-cost-calculator/'],
  ['/calculation-result-single-furniture-fix', '/removal-cost-calculator/'],
  ['/calculation-result-single-furniture', '/removal-cost-calculator/'],
  ['/calculation-result-long-distance', '/removal-cost-calculator/'],
  ['/calculation-result-free-kitchen-packing', '/removal-cost-calculator/'],
  ['/calculation-result-man-van', '/removal-cost-calculator/'],

  // ── Old form confirmation pages → contact ─────────────────
  ['/clearancecallback', '/house-and-waste-clearance/'],
  ['/working-on-quote', '/removal-cost-calculator/'],
  ['/thank-you-we-have-received-your-message', '/contact/'],
  ['/inquiry-received', '/contact/'],
  ['/wecallyouback', '/contact/'],
  ['/wecallyouback-sf', '/contact/'],
]);
