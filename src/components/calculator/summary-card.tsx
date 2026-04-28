/**
 * SUMMARY CARD
 * 
 * Displays calculator input summary
 */

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SummaryItem {
  label: string;
  value: string | number;
}

interface SummaryCardProps {
  title?: string;
  items: SummaryItem[];
  className?: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title = 'Summary',
  items,
  className,
}) => {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex justify-between items-center py-2 border-b last:border-b-0"
            >
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
};
