/**
 * CHECK ICON COMPONENT
 *
 * Reusable checkmark icon for selected states
 */

import { cn } from '@/lib/utils';

interface CheckIconProps {
  className?: string;
  strokeWidth?: number;
}

export function CheckIcon({ className, strokeWidth = 3 }: CheckIconProps) {
  return (
    <svg
      className={cn('h-3.5 w-3.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

/**
 * Check icon in a circular badge
 */
interface CheckBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  visible?: boolean;
}

export function CheckBadge({ className, size = 'md', visible = true }: CheckBadgeProps) {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full',
        'bg-primary text-primary-foreground font-bold shadow-md',
        'transition-all duration-300',
        sizeClasses[size],
        visible ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
        className
      )}
    >
      <CheckIcon className={iconSizes[size]} />
    </div>
  );
}

export default CheckIcon;
