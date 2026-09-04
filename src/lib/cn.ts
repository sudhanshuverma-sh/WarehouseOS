import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine conditional class names and resolve Tailwind conflicts (e.g. two different
 * `rounded-*` or `p-*` values passed at once keep only the last one, instead of both
 * landing in the DOM and fighting on specificity).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
