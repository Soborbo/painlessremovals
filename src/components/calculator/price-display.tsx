/**
 * PRICE DISPLAY
 * 
 * Shows calculated price with animation
 */

import * as React from 'react';
import { formatPrice } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  amount: number;
  currency?: string;
  label?: string;
  breakdown?: Record<string, number>;
  className?: string;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  amount,
  currency = 'HUF',
  label = 'Total Price',
  breakdown,
  className,
}) => {
  const [displayAmount, setDisplayAmount] = React.useState(0);

  // Animate number change
  React.useEffect(() => {
    const duration = 500; // ms
    const steps = 30;
    const stepValue = amount / steps;
    let current = 0;

    const interval = setInterval(() => {
      current += stepValue;
      if (current >= amount) {
        setDisplayAmount(amount);
        clearInterval(interval);
      } else {
        setDisplayAmount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [amount]);

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      {/* Main Price */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">{label}</p>
        <p className="text-4xl font-bold text-primary">{formatPrice(displayAmount, currency)}</p>
      </div>

      {/* Breakdown */}
      {breakdown && Object.keys(breakdown).length > 0 && (
        <div className="mt-6 pt-6 border-t space-y-2">
          <p className="text-sm font-medium mb-4">Price Breakdown:</p>
          {Object.entries(breakdown).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="font-medium">{formatPrice(value, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
