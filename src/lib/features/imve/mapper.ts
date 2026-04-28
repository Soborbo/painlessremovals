/**
 * i-mve CRM DATA MAPPER
 *
 * Maps calculator quote data to the i-mve API payload format.
 * See references/I-mve.csv for the API field specification.
 */

import { logger } from '@/lib/utils/logger';

export interface ImvePayload {
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  move_date: string;
  mf_add1: string;
  mf_add2: string;
  mf_city: string;
  mf_postcode: string;
  mfproptype: string;
  mf_floornumber: string;
  mf_bedroom: string;
  mf_lift: string;
  mt_lift: string;
  mt_add1: string;
  mt_add2: string;
  mt_city: string;
  mt_postcode: string;
  mtproptype: string;
  mt_floornumber: string;
  mt_bedroom: string;
  comments: string;
}

interface AddressData {
  formatted?: string;
  postcode?: string;
  floorLevel?: number;
}

/**
 * Convert a stored move date to DD-MM-YYYY format for i-mve.
 *
 * The calculator stores selectedDate as a local calendar date string
 * (YYYY-MM-DD) — no time, no timezone — so the customer's chosen day is
 * preserved regardless of where the server runs. We also tolerate legacy
 * full ISO strings ("YYYY-MM-DDTHH:mm:ss.sssZ") from quotes saved before
 * the fix; for those we take the date portion as-is rather than letting
 * UTC conversion shift the day.
 */
function formatDateForImve(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

/**
 * Parse a formatted address string into line1, line2, and city.
 * Google Places formatted addresses are typically: "123 Street, City, Postcode, Country"
 */
function parseAddress(formatted: string | undefined): { line1: string; line2: string; city: string } {
  if (!formatted) return { line1: '', line2: '', city: '' };

  const parts = formatted.split(',').map(p => p.trim());

  if (parts.length >= 3) {
    return {
      line1: parts[0] ?? '',
      line2: parts.length > 3 ? (parts[1] ?? '') : '',
      city: parts.length > 3 ? (parts[2] ?? '') : (parts[1] ?? ''),
    };
  }

  if (parts.length === 2) {
    return { line1: parts[0] ?? '', line2: '', city: parts[1] ?? '' };
  }

  return { line1: formatted, line2: '', city: '' };
}

/**
 * Map serviceType + propertySize to i-mve property type.
 * Valid values: House, Apartment, Studio, Maisonette, Storage, Bungalow, Office, Industrial
 */
function mapPropertyType(serviceType: string | null, propertySize: string | null): string {
  if (serviceType === 'office') return 'Office';
  if (serviceType === 'clearance') return 'House';

  if (!propertySize) return 'House';

  switch (propertySize) {
    case 'studio':
      return 'Studio';
    case 'furniture':
      return 'House';
    default:
      return 'House';
  }
}

/**
 * Extract bedroom count from propertySize string.
 * Examples: '1bed' -> '1', '2bed' -> '2', '3bed-small' -> '3', '5bed-plus' -> '5'
 */
function extractBedroomCount(propertySize: string | null): string {
  if (!propertySize) return '';

  const match = propertySize.match(/^(\d+)bed/);
  if (match?.[1]) return match[1];

  if (propertySize === 'studio') return '1';

  return '';
}

/**
 * Map floor level number to i-mve floor number string.
 */
function mapFloorNumber(floorLevel: number | undefined | null): string {
  if (floorLevel === undefined || floorLevel === null) return '';
  if (floorLevel <= 0) return '1'; // ground floor or basement
  if (floorLevel >= 10) return '10+';
  return String(floorLevel);
}

/**
 * Determine lift availability from complications array.
 * 'noLift' or 'stairs2ndNoLift' means no lift access.
 */
function hasLift(complications: string[] | null | undefined): string {
  if (!complications) return 'Yes';
  return (complications.includes('noLift') || complications.includes('stairs2ndNoLift')) ? 'No' : 'Yes';
}

/** Human-readable labels for complication IDs */
const COMPLICATION_LABELS: Record<string, string> = {
  stairs2ndNoLift: 'Stairs (2nd+ floor, no lift)',
  restrictedAccess: 'Restricted access',
  narrowDoors: 'Narrow doors/hallways',
  noLift: 'No lift available',
  heavyItems: 'Heavy/oversize items',
  plants: 'Large plant collection (20+)',
};

/**
 * Build a comments string summarizing the quote details.
 */
function buildComments(data: Record<string, unknown>, totalPrice?: number): string {
  const parts: string[] = [];

  // Service type
  const serviceType = data.serviceType as string | undefined;
  if (serviceType) {
    parts.push(`Service: ${serviceType}`);
  }

  // Property size + bedrooms
  const propertySize = data.propertySize as string | undefined;
  if (propertySize) {
    const bedrooms = extractBedroomCount(propertySize);
    parts.push(`Property: ${propertySize}${bedrooms ? ` (${bedrooms} bed)` : ''}`);
  }

  // Office size
  const officeSize = data.officeSize as string | undefined;
  if (officeSize) {
    parts.push(`Office size: ${officeSize}`);
  }

  // Complications with human-readable labels
  const complications = data.complications as string[] | undefined;
  if (complications?.length) {
    const labels = complications.map(c => COMPLICATION_LABELS[c] || c);
    parts.push(`Complications: ${labels.join(', ')}`);
  }

  // Quote price and cubic feet
  const quote = data.quote as Record<string, unknown> | undefined;
  if (totalPrice) {
    parts.push(`Quote: £${totalPrice}`);
  }
  if (quote?.cubes) {
    parts.push(`Volume: ${quote.cubes} cu ft`);
  }

  // Extras with pricing from breakdown
  const extras = data.extras as Record<string, unknown> | undefined;
  const breakdown = quote?.breakdown as Record<string, number> | undefined;
  if (extras) {
    const gateway = extras.gateway as string[] | undefined;
    if (gateway?.length) {
      const extraDetails = gateway.map(g => {
        const cost = breakdown?.[g];
        return cost ? `${g} (£${cost})` : g;
      });
      parts.push(`Extras: ${extraDetails.join(', ')}`);
    }
    const packingTier = extras.packingTier as string | undefined;
    if (packingTier) {
      const packingCost = breakdown?.packing;
      parts.push(`Packing: ${packingTier}${packingCost ? ` (£${packingCost})` : ''}`);
    }
    const storageWeeks = extras.storageWeeks as number | undefined;
    if (storageWeeks) {
      const storageCost = breakdown?.storage;
      parts.push(`Storage: ${storageWeeks} weeks${storageCost ? ` (£${storageCost})` : ''}`);
    }
  }

  // Date flexibility
  const dateFlexibility = data.dateFlexibility as string | undefined;
  if (dateFlexibility) {
    parts.push(`Date flexibility: ${dateFlexibility}`);
  }

  // Property chain
  if (data.propertyChain === true) {
    parts.push('Property chain: Yes');
  }

  // Key wait
  if (data.keyWaitWaiver === true) {
    parts.push('Key wait service requested');
  }

  // Attribution ("how did you find us")
  const attribution = data.attribution as string | undefined;
  if (attribution) {
    const ATTRIBUTION_LABELS: Record<string, string> = {
      google: 'Google search',
      friend: 'Recommendation',
      estate_agent: 'Estate agent',
      van: 'Saw our van',
      social: 'Social media',
      returning: 'Returning customer',
    };
    parts.push(`Found us via: ${ATTRIBUTION_LABELS[attribution] || attribution}`);
  }

  // UTM / source tracking
  const utmSource = data.utmSource as string | undefined;
  const utmMedium = data.utmMedium as string | undefined;
  const utmCampaign = data.utmCampaign as string | undefined;
  const gclid = data.gclid as string | undefined;
  if (utmSource || utmMedium || utmCampaign) {
    const utmParts = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ');
    parts.push(`UTM: ${utmParts}`);
  }
  if (gclid) {
    parts.push('Google Ads click');
  }

  // Source label
  parts.push('Source: Painless Removals online calculator');

  return parts.join(' | ');
}

/**
 * Map a saved quote and its calculator data to the i-mve API payload.
 */
export function mapQuoteToImvePayload(
  quote: { name?: string | null; email?: string | null; phone?: string | null; totalPrice?: number },
  calculatorData: Record<string, unknown>
): ImvePayload {
  const contact = calculatorData.contact as Record<string, string> | undefined;
  const fromAddress = calculatorData.fromAddress as AddressData | undefined;
  const toAddress = calculatorData.toAddress as AddressData | undefined;
  const complications = calculatorData.complications as string[] | undefined;
  const selectedDate = calculatorData.selectedDate as string | undefined;
  const serviceType = calculatorData.serviceType as string | null;
  const propertySize = calculatorData.propertySize as string | null;

  const parsedFrom = parseAddress(fromAddress?.formatted);
  const parsedTo = parseAddress(toAddress?.formatted);
  const bedroomCount = extractBedroomCount(propertySize);
  const propType = mapPropertyType(serviceType, propertySize);

  // For office removals, populate company_name from contact or mark as office lead
  const companyName = serviceType === 'office'
    ? (contact?.companyName || 'Office Removal')
    : '';

  const payload: ImvePayload = {
    first_name: contact?.firstName || quote.name?.split(' ')[0] || '',
    last_name: contact?.lastName || quote.name?.split(' ').slice(1).join(' ') || '',
    company_name: companyName,
    email: contact?.email || quote.email || '',
    phone: contact?.phone || quote.phone || '',
    alt_phone: '',
    move_date: formatDateForImve(selectedDate),
    mf_add1: parsedFrom.line1,
    mf_add2: parsedFrom.line2,
    mf_city: parsedFrom.city,
    mf_postcode: fromAddress?.postcode || '',
    mfproptype: propType,
    mf_floornumber: mapFloorNumber(fromAddress?.floorLevel),
    mf_bedroom: bedroomCount,
    mf_lift: hasLift(complications),
    mt_lift: hasLift(complications),
    mt_add1: parsedTo.line1,
    mt_add2: parsedTo.line2,
    mt_city: parsedTo.city,
    mt_postcode: toAddress?.postcode || '',
    mtproptype: propType,
    mt_floornumber: mapFloorNumber(toAddress?.floorLevel),
    mt_bedroom: bedroomCount,
    comments: buildComments(calculatorData, quote.totalPrice),
  };

  logger.debug('i-mve', 'Payload mapped', {
    hasFirstName: !!payload.first_name,
    hasEmail: !!payload.email,
    hasFromAddress: !!payload.mf_postcode,
    hasToAddress: !!payload.mt_postcode,
  });

  return payload;
}
