import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short local date for an ISO timestamp or `YYYY-MM-DD`; empty when missing or unreadable. */
export function formatDate(value: string | null): string {
  if (!value) return '';
  // A bare date parses as UTC midnight, which can show as the day before; read it as local.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
