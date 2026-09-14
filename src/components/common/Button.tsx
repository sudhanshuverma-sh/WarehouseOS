import React from 'react';
import { Loader2, Check } from 'lucide-react';

/**
 * The button primitive.
 *
 * The app currently carries 58 distinct hand-written `inline-flex
 * items-center …` class strings, and exactly one file uses the design
 * system's `.soft-button`. This is that primitive made usable, so the next
 * button written is consistent by default rather than by care.
 *
 * The interesting part is `loading` and `success`. A save that just goes
 * quiet gets clicked twice; a save that reports success in a paragraph
 * somewhere else gets missed. Reporting both on the control that was
 * pressed keeps cause and effect in one place — and the width is held
 * steady while the label swaps, so the row of buttons does not jump.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  /** Spinner, and the button stops accepting clicks. */
  loading?: boolean;
  /** Briefly swaps the label for a tick. The caller clears it. */
  success?: boolean;
  successLabel?: string;
  fullWidth?: boolean;
  className?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'text-white bg-slate-900 hover:bg-slate-800 border border-transparent',
  secondary: 'text-slate-700 bg-white hover:bg-slate-50 border border-slate-300',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent',
  danger: 'text-white bg-rose-600 hover:bg-rose-700 border border-transparent',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-[11px] gap-1.5',
  md: 'px-3.5 py-2 text-xs gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  success = false,
  successLabel,
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...rest
}) => {
  const busy = loading || success;

  return (
    <button
      type="button"
      // Not just visually busy: a second click during a save is the most
      // common way to create a duplicate record.
      disabled={disabled || busy}
      aria-busy={loading || undefined}
      {...rest}
      className={`
        inline-flex items-center justify-center rounded-xl font-bold
        ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''}
        transition-[background-color,border-color,color,box-shadow] duration-(--motion-fast) ease-(--ease-standard)
        active:scale-[0.98] active:duration-(--motion-instant)
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        cursor-pointer ${className}
      `}
    >
      {/* The icon slot keeps its width through all three states, so the
          label does not shuffle sideways when a spinner appears. */}
      {(icon || loading || success) && (
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 shrink-0">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : success ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            icon
          )}
        </span>
      )}
      <span>{success && successLabel ? successLabel : children}</span>
    </button>
  );
};
