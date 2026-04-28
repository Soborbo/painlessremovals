/**
 * SLIDER COMPONENT
 *
 * shadcn/ui style range slider
 */

import { cn } from '@/lib/utils';
import * as React from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value = [0], onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
    const currentValue = value[0] ?? 0;
    const percentage = ((currentValue - min) / (max - min)) * 100;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      onValueChange?.([newValue]);
    };

    return (
      <div className={cn('relative flex w-full items-center h-10', className)}>
        {/* Native range input - positioned first for proper layering */}
        <input
          type="range"
          ref={ref}
          value={currentValue}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className="absolute inset-0 w-full h-full cursor-pointer z-30"
          style={{
            opacity: 0,
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
          {...props}
        />

        {/* Track background */}
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary pointer-events-none">
          {/* Filled track */}
          <div
            className="absolute h-full bg-primary transition-all duration-75"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Thumb (visual only) */}
        <div
          className={cn(
            'absolute h-6 w-6 rounded-full border-2 border-primary bg-background',
            'shadow-md pointer-events-none transition-all duration-75'
          )}
          style={{
            left: `calc(${percentage}% - 12px)`,
          }}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
