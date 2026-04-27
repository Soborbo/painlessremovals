/**
 * TOAST COMPONENT
 *
 * Simple toast notification system using nanostores
 */

import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import * as React from 'react';
import { cn } from '@/lib/utils';

// ===================
// TOAST TYPES
// ===================

export type ToastVariant = 'default' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  dismissing?: boolean;
}

// ===================
// TOAST STORE
// ===================

export const toastsStore = atom<Toast[]>([]);

let toastIdCounter = 0;

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  variant: ToastVariant = 'default',
  duration: number = 4000
) {
  const id = `toast-${++toastIdCounter}`;
  const toast: Toast = { id, message, variant, duration };

  toastsStore.set([...toastsStore.get(), toast]);

  // Auto-dismiss after duration
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

/**
 * Dismiss a toast with animation
 */
export function dismissToast(id: string) {
  const toasts = toastsStore.get();
  const toastIndex = toasts.findIndex((t) => t.id === id);

  if (toastIndex === -1) return;

  // Mark as dismissing (triggers exit animation)
  const updatedToasts = [...toasts];
  updatedToasts[toastIndex] = { ...updatedToasts[toastIndex]!, dismissing: true };
  toastsStore.set(updatedToasts);

  // Remove after animation
  setTimeout(() => {
    toastsStore.set(toastsStore.get().filter((t) => t.id !== id));
  }, 300);
}

/**
 * Clear all toasts
 */
export function clearToasts() {
  toastsStore.set([]);
}

// Convenience functions
export const toast = {
  show: showToast,
  success: (message: string, duration?: number) =>
    showToast(message, 'success', duration),
  warning: (message: string, duration?: number) =>
    showToast(message, 'warning', duration),
  error: (message: string, duration?: number) =>
    showToast(message, 'error', duration),
  dismiss: dismissToast,
  clear: clearToasts,
};

// ===================
// TOAST COMPONENTS
// ===================

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-foreground text-background',
  success: 'bg-emerald-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-destructive text-destructive-foreground',
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

interface ToastItemProps {
  toast: Toast;
}

function ToastItem({ toast: t }: ToastItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg',
        'max-w-sm w-full pointer-events-auto',
        variantStyles[t.variant],
        t.dismissing ? 'animate-slide-out-right' : 'animate-slide-in-right'
      )}
      role="alert"
    >
      <span className="flex-shrink-0">{variantIcons[t.variant]}</span>
      <p className="flex-1 text-sm font-medium">{t.message}</p>
      <button
        onClick={() => dismissToast(t.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Toast container - render this once at the app level
 */
export function ToastContainer() {
  const toasts = useStore(toastsStore);

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'flex flex-col gap-2',
        'pointer-events-none'
      )}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

export { ToastItem };
