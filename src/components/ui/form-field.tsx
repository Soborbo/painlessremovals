/**
 * FORM FIELD COMPONENT
 *
 * Wrapper for form inputs with label and error
 */

import { cn } from '@/lib/utils';
import type * as React from 'react';
import { Label } from './label';

export interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
  className,
  hint,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label {...(required !== undefined && { required })}>{label}</Label>}

      {children}

      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

export { FormField };
