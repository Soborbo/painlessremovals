/**
 * CALENDAR COMPONENT
 *
 * Simple date picker calendar
 */

import { cn } from '@/lib/utils';
import * as React from 'react';
import { Button } from './button';

export interface CalendarProps {
  mode?: 'single';
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  initialFocus?: boolean;
  className?: string;
}

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function Calendar({
  selected,
  onSelect,
  disabled,
  className,
}: CalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = React.useState(selected || today);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Get first day of month (0 = Sunday, convert to Monday-first)
  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6; // Sunday becomes 6

  // Get days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Generate calendar grid
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const goToPrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const date = new Date(year, month, day);
    if (disabled?.(date)) return;
    onSelect?.(date);
  };

  const isSelected = (day: number) => {
    if (!selected) return false;
    return (
      selected.getDate() === day &&
      selected.getMonth() === month &&
      selected.getFullYear() === year
    );
  };

  const isToday = (day: number) => {
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
  };

  const isDisabled = (day: number) => {
    const date = new Date(year, month, day);
    return disabled?.(date) ?? false;
  };

  return (
    <div className={cn('p-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevMonth}
          className="h-8 w-8"
        >
          <span className="sr-only">Previous month</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </Button>

        <div className="font-semibold text-foreground">
          {MONTHS[month]} {year}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextMonth}
          className="h-8 w-8"
        >
          <span className="sr-only">Next month</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS.map((day) => (
          <div
            key={day}
            className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="h-9 flex items-center justify-center">
            {day !== null && (
              <button
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={isDisabled(day)}
                className={cn(
                  'h-9 w-9 rounded-md text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'disabled:pointer-events-none disabled:opacity-30',
                  isSelected(day) && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  isToday(day) && !isSelected(day) && 'bg-accent text-accent-foreground',
                )}
              >
                {day}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Calendar;
