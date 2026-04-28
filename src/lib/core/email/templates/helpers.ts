/**
 * EMAIL TEMPLATE HELPERS
 *
 * Shared utilities for email template generation
 */

import { formatPrice } from '@/lib/utils';

/**
 * Escape HTML special characters to prevent XSS in email templates
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate and sanitize a URL for use in href attributes
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '#';
    }
    return parsed.toString();
  } catch {
    return '#';
  }
}

/** Common table cell style */
const cellStyle = 'padding: 11px 14px; border-bottom: 1px solid #eeeeee; font-family: -apple-system, BlinkMacSystemFont, sans-serif;';
const labelStyle = `${cellStyle} background: #f8f8f8; font-weight: 600; color: #444444; font-size: 14px; width: 38%;`;
const valueStyle = `${cellStyle} color: #333333; font-size: 14px;`;

/**
 * Render a single table row
 */
export function row(label: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<tr><td style="${labelStyle}">${escapeHtml(String(label))}</td><td style="${valueStyle}">${escapeHtml(String(value))}</td></tr>`;
}

/**
 * Render a section header row
 */
export function sectionHeader(title: string): string {
  return `<tr><td colspan="2" style="padding: 10px 14px 8px; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #005349; background: #f0f7f6; border-bottom: 1px solid #ddecea; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">${escapeHtml(title)}</td></tr>`;
}

/** Human-readable labels for service types */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  home: 'Home Removal',
  office: 'Office Removal',
  clearance: 'Clearance Service',
};

/** Human-readable labels for property sizes */
const PROPERTY_SIZE_LABELS: Record<string, string> = {
  studio: 'Studio',
  '1bed': '1 Bedroom',
  '2bed': '2 Bedrooms',
  '3bed-small': '3 Bedrooms (Small)',
  '3bed-large': '3 Bedrooms (Large)',
  '4bed': '4 Bedrooms',
  '5bed': '5 Bedrooms',
  '5bed-plus': '5+ Bedrooms',
  furniture: 'Furniture Only',
};

/** Human-readable labels for office sizes */
const OFFICE_SIZE_LABELS: Record<string, string> = {
  small: 'Small (1-5 desks)',
  medium: 'Medium (6-15 desks)',
  large: 'Large (16+ desks)',
};

/** Human-readable labels for complications */
const COMPLICATION_LABELS: Record<string, string> = {
  largeFragile: 'Large/Fragile Items',
  over2000: 'Items Over 2000 lbs',
  stairs: 'Narrow Staircase',
  elevator: 'No Elevator',
  restrictedAccess: 'Limited Access',
  attic: 'Attic Items',
  plants: 'Large Plant Collection',
};

/** Human-readable labels for packing tiers */
const PACKING_LABELS: Record<string, string> = {
  materials: 'Materials Only',
  fragile: 'Fragile Items Packing',
  fullService: 'Full Packing Service',
};

/** Human-readable labels for cleaning types */
const CLEANING_LABELS: Record<string, string> = {
  quick: 'Quick Clean',
  deep: 'Deep Clean',
};

/** Human-readable labels for date flexibility */
const DATE_FLEXIBILITY_LABELS: Record<string, string> = {
  fixed: 'Fixed Date',
  flexible: 'Flexible Dates',
  unknown: 'Unknown / Exploring',
};

/**
 * Extract and format all customer selections from calculatorData into table rows
 */
export function buildSelectionRows(data: Record<string, unknown>): string {
  let html = '';

  // --- Move Details ---
  html += sectionHeader('Move Details');
  html += row('Service Type', SERVICE_TYPE_LABELS[data.serviceType as string] || (data.serviceType as string));

  if (data.propertySize) {
    html += row('Property Size', PROPERTY_SIZE_LABELS[data.propertySize as string] || (data.propertySize as string));
  }
  if (data.officeSize) {
    html += row('Office Size', OFFICE_SIZE_LABELS[data.officeSize as string] || (data.officeSize as string));
  }

  const furnitureOnly = data.furnitureOnly as Record<string, unknown> | undefined;
  if (furnitureOnly) {
    html += row('Furniture Items', furnitureOnly.itemCount as number);
    if (furnitureOnly.needs2Person) html += row('2-Person Items', 'Yes');
    if (furnitureOnly.over40kg) html += row('Over 40kg Items', 'Yes');
    const specialistItems = furnitureOnly.specialistItems as string[] | undefined;
    if (specialistItems?.length) {
      html += row('Specialist Items', specialistItems.join(', '));
    }
  }

  // Slider position
  const sliderLabels: Record<number, string> = { 1: 'Minimalist', 2: 'Light', 3: 'Average', 4: 'Full', 5: 'Packed' };
  if (data.sliderPosition) {
    html += row('Belongings Level', sliderLabels[data.sliderPosition as number] || String(data.sliderPosition));
  }

  // --- Addresses ---
  const fromAddr = data.fromAddress as Record<string, unknown> | undefined;
  const toAddr = data.toAddress as Record<string, unknown> | undefined;
  if (fromAddr || toAddr) {
    html += sectionHeader('Addresses');
    if (fromAddr) {
      html += row('From', fromAddr.formatted as string);
      if (fromAddr.floorLevel !== undefined && fromAddr.floorLevel !== null) {
        const floor = fromAddr.floorLevel as number;
        html += row('From Floor', floor === -1 ? 'Basement' : floor === 0 ? 'Ground' : `Floor ${floor}`);
      }
    }
    if (toAddr) {
      html += row('To', toAddr.formatted as string);
      if (toAddr.floorLevel !== undefined && toAddr.floorLevel !== null) {
        const floor = toAddr.floorLevel as number;
        html += row('To Floor', floor === -1 ? 'Basement' : floor === 0 ? 'Ground' : `Floor ${floor}`);
      }
    }
  }

  // Distance
  const distances = data.distances as Record<string, number> | undefined;
  if (distances) {
    if (distances.customerDistance != null) html += row('Distance', `${Math.round(distances.customerDistance)} miles`);
    if (distances.customerDriveMinutes != null) html += row('Drive Time', `${Math.round(distances.customerDriveMinutes)} min`);
  }

  // --- Date ---
  if (data.dateFlexibility || data.selectedDate) {
    html += sectionHeader('Date');
    if (data.dateFlexibility) {
      html += row('Flexibility', DATE_FLEXIBILITY_LABELS[data.dateFlexibility as string] || (data.dateFlexibility as string));
    }
    if (data.selectedDate) {
      html += row('Selected Date', data.selectedDate as string);
    }
  }

  // --- Complications ---
  const complications = data.complications as string[] | undefined;
  if (complications?.length) {
    html += sectionHeader('Complications');
    for (const c of complications) {
      html += row(COMPLICATION_LABELS[c] || c, 'Yes');
    }
  }

  // Property chain
  if (data.propertyChain) {
    html += row('Property Chain', 'Yes');
  }

  // Key Wait Waiver
  if (data.keyWaitWaiver) {
    html += row('Key Wait Waiver', 'Yes');
  }

  // --- Extras ---
  const extras = data.extras as Record<string, unknown> | undefined;
  if (extras) {
    const hasExtras = extras.gateway && (extras.gateway as string[]).length > 0;
    if (hasExtras) {
      html += sectionHeader('Extra Services');

      if (extras.packingTier) {
        html += row('Packing', PACKING_LABELS[extras.packingTier as string] || (extras.packingTier as string));
      }

      const disassemblyItems = extras.disassemblyItems as Array<Record<string, unknown>> | undefined;
      if (disassemblyItems?.length) {
        const itemsList = disassemblyItems.map(i => `${i.category} x${i.quantity}`).join(', ');
        html += row('Disassembly/Assembly', itemsList);
      }

      if (extras.cleaningRooms) {
        const cleanType = extras.cleaningType ? CLEANING_LABELS[extras.cleaningType as string] || (extras.cleaningType as string) : '';
        html += row('Cleaning', `${extras.cleaningRooms} rooms${cleanType ? ` (${cleanType})` : ''}`);
      }

      if (extras.storageSize) {
        const weeks = extras.storageWeeks ? ` for ${extras.storageWeeks} weeks` : '';
        html += row('Storage', `${extras.storageSize}${weeks}`);
      }
    }
  }

  // --- Quote resources ---
  const quote = data.quote as Record<string, unknown> | undefined;
  if (quote) {
    html += sectionHeader('Resources');
    html += row('Movers', quote.men as number);
    html += row('Vans', quote.vans as number);
    if (quote.serviceDuration) html += row('Duration', quote.serviceDuration as string);
  }

  return html;
}

/**
 * Build a customer-facing price summary (service-level lines, no internal cost components)
 */
export function buildCustomerPriceSummary(breakdown: Record<string, number>, currency: string): string {
  let html = sectionHeader('Price Summary');

  const removalCost = (breakdown.marginedTotal ?? 0) + (breakdown.mileageCost ?? 0);
  const accommodationCost = breakdown.accommodationCost ?? 0;
  const keyWaitCost = breakdown.keyWaitWaiverCost ?? 0;
  const extrasCost = breakdown.extrasCost ?? 0;
  const totalPrice = removalCost + accommodationCost + keyWaitCost + extrasCost;

  html += row('Removal Service', formatPrice(removalCost, currency));
  if (accommodationCost > 0) html += row('Accommodation', formatPrice(accommodationCost, currency));
  if (keyWaitCost > 0) html += row('Key Wait Waiver', formatPrice(keyWaitCost, currency));
  if (extrasCost > 0) html += row('Additional Services', formatPrice(extrasCost, currency));

  html += `<tr style="border-top: 2px solid #005349;"><td style="${labelStyle} font-weight: 700; color: #005349; background: #f0f7f6;">Total excl. VAT</td><td style="${valueStyle} font-weight: 700; color: #005349; background: #f0f7f6;">${escapeHtml(formatPrice(totalPrice, currency))}</td></tr>`;

  return html;
}

/**
 * Build price breakdown rows from the breakdown object
 */
export function buildBreakdownRows(breakdown: Record<string, number>, currency: string): string {
  let html = sectionHeader('Price Breakdown');

  const labels: Record<string, string> = {
    vansCost: 'Van Costs',
    moversCost: 'Movers',
    crewCost: 'Crew',
    mileageCost: 'Mileage',
    accommodationCost: 'Accommodation',
    keyWaitWaiverCost: 'Key Wait Waiver',
    extrasCost: 'Extras',
    complicationMultiplier: 'Complications Adjustment',
    subtotal: 'Subtotal',
    margin: 'Service & Insurance',
  };

  // Internal calculation fields — never show to customer
  const internalFields = new Set([
    'controllableCost',
    'surchargeCost',
    'marginMultiplier',
    'marginedTotal',
    'passThroughCost',
    'complicationExtraCrew',
  ]);

  for (const [key, value] of Object.entries(breakdown)) {
    if (internalFields.has(key)) continue;
    if (value === 0 && key !== 'subtotal') continue;
    if (key === 'complicationMultiplier' && value === 1) continue;

    const label = labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');

    if (key === 'complicationMultiplier') {
      html += row(label, `x${value.toFixed(2)}`);
    } else {
      html += row(label, formatPrice(value, currency));
    }
  }

  return html;
}

/**
 * Shared email base styles (Painless Removals brand)
 */
export const EMAIL_STYLES = `
  body { margin: 0; padding: 0; background-color: #f4f4f4; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { max-width: 100%; height: auto; display: block; border: 0; outline: none; }
  a { color: inherit; }
  table { border-spacing: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  td { padding: 0; }
  @media only screen and (max-width: 620px) {
    .email-container { width: 100% !important; }
    .email-body { padding: 20px 16px 8px !important; }
    .email-header { padding: 22px 16px !important; }
    .email-footer { padding: 14px 16px 18px !important; }
  }
`;
