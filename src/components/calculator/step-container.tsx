/**
 * STEP CONTAINER
 * 
 * Wrapper for calculator step content
 */

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StepContainerProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const StepContainer: React.FC<StepContainerProps> = ({
  title,
  description,
  children,
  className,
}) => {
  return (
    <Card className={cn('w-full max-w-[796px] mx-auto', className)}>
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription className="text-base">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
};
