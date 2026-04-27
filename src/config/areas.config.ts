/**
 * Areas Configuration
 *
 * Shared data for area/location pages — neighbourhoods, towns, routes.
 */

export interface Neighbourhood {
  name: string;
  slug: string;
  postcode: string;
}

export interface Town {
  name: string;
  slug: string;
  path: string;
  miles: number;
  direction: string;
}

export interface LongDistanceRoute {
  from: string;
  to: string;
  slug: string;
  miles: number;
  drive: string;
  via: string;
  days: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Bristol Neighbourhoods (20)
// ---------------------------------------------------------------------------
export const bristolNeighbourhoods: Neighbourhood[] = [
  { name: 'Clifton', slug: 'clifton', postcode: 'BS8' },
  { name: 'Hotwells', slug: 'hotwells', postcode: 'BS8' },
  { name: 'Redland', slug: 'redland', postcode: 'BS6' },
  { name: 'Southville', slug: 'southville', postcode: 'BS3' },
  { name: 'Bedminster', slug: 'bedminster', postcode: 'BS3' },
  { name: 'Henleaze', slug: 'henleaze', postcode: 'BS9' },
  { name: 'Westbury-on-Trym', slug: 'westbury-on-trym', postcode: 'BS9' },
  { name: 'Bishopston', slug: 'bishopston', postcode: 'BS7' },
  { name: 'Stoke Bishop', slug: 'stoke-bishop', postcode: 'BS9' },
  { name: 'Cotham', slug: 'cotham', postcode: 'BS6' },
  { name: 'Montpelier', slug: 'montpelier', postcode: 'BS6' },
  { name: 'Fishponds', slug: 'fishponds', postcode: 'BS16' },
  { name: 'Horfield', slug: 'horfield', postcode: 'BS7' },
  { name: 'Knowle', slug: 'knowle', postcode: 'BS4' },
  { name: 'Totterdown', slug: 'totterdown', postcode: 'BS4' },
  { name: 'Patchway', slug: 'patchway', postcode: 'BS34' },
  { name: 'Filton', slug: 'filton', postcode: 'BS34' },
  { name: 'Stoke Gifford', slug: 'stoke-gifford', postcode: 'BS34' },
  { name: 'St George', slug: 'st-george', postcode: 'BS5' },
  { name: 'Brislington', slug: 'brislington', postcode: 'BS4' },
];

// ---------------------------------------------------------------------------
// Surrounding Towns (12)
// ---------------------------------------------------------------------------
export const surroundingTowns: Town[] = [
  { name: 'Clevedon', slug: 'clevedon', path: '/removals-clevedon/', miles: 13, direction: 'south-west' },
  { name: 'Portishead', slug: 'portishead', path: '/removals-portishead/', miles: 11, direction: 'west' },
  { name: 'Yate', slug: 'yate', path: '/removals-yate/', miles: 12, direction: 'north-east' },
  { name: 'Thornbury', slug: 'thornbury', path: '/removals-thornbury/', miles: 14, direction: 'north' },
  { name: 'Keynsham', slug: 'keynsham', path: '/removals-keynsham/', miles: 6, direction: 'south-east' },
  { name: 'Nailsea', slug: 'nailsea', path: '/removals-nailsea/', miles: 10, direction: 'south-west' },
  { name: 'Chepstow', slug: 'chepstow', path: '/removals-chepstow/', miles: 17, direction: 'north-west' },
  { name: 'Long Ashton', slug: 'long-ashton', path: '/removals-long-ashton/', miles: 4, direction: 'south-west' },
  { name: 'Pill', slug: 'pill', path: '/removals-pill/', miles: 7, direction: 'west' },
  { name: 'Chew Valley', slug: 'chew-valley', path: '/removals-chew-valley/', miles: 10, direction: 'south' },
  { name: 'Cotswolds', slug: 'cotswolds', path: '/removals-cotswolds/', miles: 30, direction: 'north-east' },
  { name: 'Radstock', slug: 'radstock', path: '/removals-radstock/', miles: 14, direction: 'south' },
];

// ---------------------------------------------------------------------------
// Long-distance Routes (popular corridors from Bristol)
// ---------------------------------------------------------------------------
export const longDistanceRoutes: LongDistanceRoute[] = [
  { from: 'Bristol', to: 'London', slug: 'london', miles: 120, drive: '~2 hours', via: 'M4', days: '1–2 days', href: '/removals-bristol-to-london/' },
  { from: 'Bristol', to: 'Birmingham', slug: 'birmingham', miles: 90, drive: '~1 hr 45 min', via: 'M5', days: '1 day', href: '/removals-bristol-to-birmingham/' },
  { from: 'Bristol', to: 'Manchester', slug: 'manchester', miles: 170, drive: '~3 hours', via: 'M5 / M6', days: '1–2 days', href: '/removals-bristol-to-manchester/' },
  { from: 'Bristol', to: 'Edinburgh', slug: 'edinburgh', miles: 380, drive: '~6 hours', via: 'M5 / M6 / M74', days: '2–3 days', href: '/removals-bristol-to-edinburgh/' },
  { from: 'Bristol', to: 'Cardiff', slug: 'cardiff', miles: 45, drive: '~50 min', via: 'M4 / M48', days: '1 day', href: '/removals-bristol-to-cardiff/' },
  { from: 'Bristol', to: 'Exeter', slug: 'exeter', miles: 80, drive: '~1 hr 30 min', via: 'M5', days: '1 day', href: '/removals-bristol-to-exeter/' },
  { from: 'Bristol', to: 'Oxford', slug: 'oxford', miles: 75, drive: '~1 hr 30 min', via: 'M4 / A34', days: '1 day', href: '/removals-bristol-to-oxford/' },
  { from: 'Bristol', to: 'Southampton', slug: 'southampton', miles: 80, drive: '~1 hr 40 min', via: 'M4 / M3', days: '1–2 days', href: '/removals-bristol-to-southampton/' },
  { from: 'Bristol', to: 'Leeds', slug: 'leeds', miles: 200, drive: '~3 hr 30 min', via: 'M5 / M42 / M1', days: '2 days', href: '/removals-bristol-to-leeds/' },
  { from: 'Bristol', to: 'Glasgow', slug: 'glasgow', miles: 390, drive: '~6 hours', via: 'M5 / M6 / M74', days: '2–3 days', href: '/removals-bristol-to-glasgow/' },
  { from: 'Bristol', to: 'Devon', slug: 'devon', miles: 130, drive: '~2 hours', via: 'M5', days: '1–2 days', href: '/removals-bristol-to-devon/' },
  { from: 'Bristol', to: 'Cornwall', slug: 'cornwall', miles: 250, drive: '~3 hr 30 min', via: 'M5 / A30', days: '1–2 days', href: '/removals-bristol-to-cornwall/' },
  { from: 'Bristol', to: 'Swindon', slug: 'swindon', miles: 40, drive: '~45 min', via: 'M4', days: '1 day', href: '/removals-bristol-to-swindon/' },
];

// ---------------------------------------------------------------------------
// Hub Cities
// ---------------------------------------------------------------------------
export const hubCities = [
  { name: 'Bristol', slug: 'bristol', path: '/areas/' },
  { name: 'Bath', slug: 'bath', path: '/removals-bath/' },
  { name: 'Weston-super-Mare', slug: 'weston-super-mare', path: '/removals-weston-super-mare/' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function neighbourhoodUrl(slug: string): string {
  return `/removals-bristol/${slug}/`;
}

// Hand-curated geographic adjacency map. Each key lists neighbouring slugs in
// rough priority order (closest / most natural pairings first). Used to suggest
// truly nearby areas on neighbourhood pages — not just list-adjacent ones.
const neighbourhoodAdjacency: Record<string, string[]> = {
  'clifton': ['hotwells', 'cotham', 'redland', 'stoke-bishop'],
  'hotwells': ['clifton', 'southville', 'cotham'],
  'redland': ['cotham', 'bishopston', 'henleaze', 'clifton'],
  'southville': ['bedminster', 'hotwells', 'totterdown'],
  'bedminster': ['southville', 'totterdown', 'knowle'],
  'henleaze': ['westbury-on-trym', 'stoke-bishop', 'bishopston', 'horfield'],
  'westbury-on-trym': ['henleaze', 'stoke-bishop', 'horfield', 'filton'],
  'bishopston': ['redland', 'horfield', 'montpelier', 'cotham'],
  'stoke-bishop': ['westbury-on-trym', 'henleaze', 'clifton'],
  'cotham': ['redland', 'clifton', 'montpelier', 'bishopston'],
  'montpelier': ['cotham', 'bishopston', 'redland', 'st-george'],
  'fishponds': ['st-george', 'horfield', 'stoke-gifford', 'filton'],
  'horfield': ['bishopston', 'filton', 'westbury-on-trym', 'henleaze'],
  'knowle': ['totterdown', 'brislington', 'bedminster'],
  'totterdown': ['knowle', 'bedminster', 'brislington', 'southville'],
  'patchway': ['stoke-gifford', 'filton'],
  'filton': ['patchway', 'stoke-gifford', 'horfield', 'westbury-on-trym'],
  'stoke-gifford': ['patchway', 'filton', 'fishponds'],
  'st-george': ['fishponds', 'brislington', 'montpelier'],
  'brislington': ['knowle', 'totterdown', 'st-george'],
};

export function getNearbyNeighbourhoods(currentSlug: string, count = 3): Neighbourhood[] {
  const lookup = new Map(bristolNeighbourhoods.map((n) => [n.slug, n]));
  const adjacentSlugs = neighbourhoodAdjacency[currentSlug];
  const result: Neighbourhood[] = [];

  if (adjacentSlugs) {
    for (const slug of adjacentSlugs) {
      const n = lookup.get(slug);
      if (n) result.push(n);
      if (result.length >= count) return result;
    }
  }

  // Fallback: fill remaining slots with same-postcode-area matches, then by list order
  if (result.length < count) {
    const current = lookup.get(currentSlug);
    const picked = new Set([currentSlug, ...result.map((n) => n.slug)]);
    const postcodeArea = current ? current.postcode.replace(/\d+$/, '') : '';

    const samePostcode = current
      ? bristolNeighbourhoods.filter(
          (n) => !picked.has(n.slug) && n.postcode.replace(/\d+$/, '') === postcodeArea,
        )
      : [];
    for (const n of samePostcode) {
      result.push(n);
      picked.add(n.slug);
      if (result.length >= count) return result;
    }

    for (const n of bristolNeighbourhoods) {
      if (picked.has(n.slug)) continue;
      result.push(n);
      if (result.length >= count) return result;
    }
  }

  return result;
}
