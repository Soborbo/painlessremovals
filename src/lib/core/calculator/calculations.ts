/**
 * CALCULATOR LOGIC
 *
 * Price calculations and business logic
 */

import { logger } from '@/lib/utils/logger';
import type { CalculatorData, CalculatorResult, PriceItem } from './types';

/**
 * Calculate total price
 *
 * CUSTOMIZE THIS BASED ON YOUR BUSINESS LOGIC
 */
export function calculateTotal(data: CalculatorData): CalculatorResult {
  try {
    logger.debug('Calculator', 'Calculating total', { data });

    // Example calculation logic - customize based on your needs
    const items: PriceItem[] = [];
    let total = 0;

    // Base price (example)
    const basePrice = 10000;
    items.push({
      id: 'base',
      label: 'Base Price',
      amount: basePrice,
    });
    total += basePrice;

    // Additional features (example)
    if (data.premium === true) {
      const premiumPrice = 5000;
      items.push({
        id: 'premium',
        label: 'Premium Features',
        amount: premiumPrice,
      });
      total += premiumPrice;
    }

    // Quantity multiplier (example)
    if (typeof data.quantity === 'number' && data.quantity > 1) {
      const multiplier = data.quantity;
      total *= multiplier;
    }

    // Discount (example)
    if (data.discountCode === 'SAVE10') {
      const discount = total * 0.1;
      items.push({
        id: 'discount',
        label: 'Discount (10%)',
        amount: -discount,
      });
      total -= discount;
    }

    const breakdown: Record<string, number> = {};
    for (const item of items) {
      breakdown[item.id] = item.amount;
    }

    const result: CalculatorResult = {
      totalPrice: Math.round(total),
      currency: 'GBP',
      breakdown,
      details: {
        items,
      },
    };

    logger.info('Calculator', 'Calculation complete', { total: result.totalPrice });

    return result;
  } catch (error) {
    logger.error('Calculator', 'Calculation failed', { error });

    // Return fallback result
    return {
      totalPrice: 0,
      currency: 'GBP',
      breakdown: {},
    };
  }
}

/**
 * Validate calculator data
 */
export function validateCalculatorData(data: CalculatorData): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Example validations - customize based on your needs
  if (!data.projectType) {
    errors.projectType = 'Project type is required';
  }

  if (typeof data.quantity === 'number' && data.quantity < 1) {
    errors.quantity = 'Quantity must be at least 1';
  }

  if (typeof data.quantity === 'number' && data.quantity > 100) {
    errors.quantity = 'Quantity cannot exceed 100';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Format price for display
 */
export function formatCalculatedPrice(result: CalculatorResult): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: result.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(result.totalPrice);
}

/**
 * Get price breakdown as items
 */
export function getPriceItems(result: CalculatorResult): PriceItem[] {
  if (result.details?.items) {
    return result.details.items as PriceItem[];
  }

  // Fallback: convert breakdown to items
  return Object.entries(result.breakdown || {}).map(([id, amount]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    amount,
  }));
}
