import React from 'react';

/**
 * A real switch, not a restyled checkbox.
 *
 * `role="switch"` with `aria-checked` is what makes a screen reader say
 * "on"/"off" rather than "checked"/"unchecked" — the difference between
 * describing a setting and describing a form field. A `<button>` underneath
 * gets Space and Enter handling from the browser for free, so there is no
 * keydown handler here to get subtly wrong.
 *
 * Colour follows the app's existing status logic: `--color-filed` (the
 * "done" green) when on, a plain border grey when off. It reads as part of
 * the same world as every badge and KPI rather than as a stock control.
 *
 * The thumb is the one place `--ease-spring` is used. A switch is the
 * closest thing in the UI to a physical object, and a slight overshoot on
 * arrival is what sells it; used anywhere else it just reads as bouncy.
 */

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible text. Clicking it toggles, like a real label. */
  label?: string;
  /** Smaller text under the label. */
  description?: string;
  disabled?: boolean;
  /** For when the label is provided visually elsewhere. */
  'aria-label'?: string;
  size?: 'sm' | 'md';
  /** Reverses the colour: on = warning rather than success. */
  tone?: 'positive' | 'caution';
}

const SIZES = {
  sm: { track: 'w-8 h-[18px]', thumb: 'w-3 h-3', travel: 'translate-x-[14px]', inset: 'left-[3px]' },
  md: { track: 'w-11 h-6', thumb: 'w-[18px] h-[18px]', travel: 'translate-x-5', inset: 'left-[3px]' },
} as const;

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  tone = 'positive',
  ...rest
}) => {
  const s = SIZES[size];
  const onColor = tone === 'positive' ? 'var(--color-filed)' : 'var(--color-due)';

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ backgroundColor: checked ? onColor : 'var(--border-strong)' }}
      className={`relative inline-flex shrink-0 items-center rounded-full ${s.track}
        transition-[background-color] duration-(--motion-fast) ease-(--ease-standard)
        disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
    >
      <span
        className={`absolute ${s.inset} ${s.thumb} rounded-full bg-white
          transition-transform duration-(--motion-fast) ease-(--ease-spring)
          ${checked ? s.travel : 'translate-x-0'}`}
        style={{ boxShadow: '0 1px 2px rgb(14 26 22 / 0.25)' }}
      />
    </button>
  );

  if (!label) return control;

  return (
    // <label> rather than an onClick on a wrapper div: clicking the text
    // then activates the button natively, and the association is announced.
    <label
      className={`inline-flex items-start gap-2.5 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {control}
      <span className="select-none">
        <span className={`block text-xs font-semibold ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>
          {label}
        </span>
        {description && <span className="block text-[11px] text-slate-500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
};
