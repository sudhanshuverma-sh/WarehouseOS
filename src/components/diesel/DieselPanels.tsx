import React from 'react';

/**
 * Small shared pieces first made for the Diesel dashboard and still used by
 * other screens: a card, a section title and a tab switch. The Diesel
 * dashboard itself now uses its neumorphic parts (DieselNeu.tsx).
 */

export const Card: React.FC<{ title?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  actions,
  className = '',
  children,
}) => (
  <section className={`bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs break-inside-avoid min-w-0 ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {title && <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-wrap items-center gap-2 pt-2">
    <span className="w-1 h-4 rounded-full bg-(--color-filed)" />
    <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{children}</h2>
    {aside && <div className="ml-auto text-[11px] text-slate-500 font-mono">{aside}</div>}
  </div>
);

export const Tabs = <const T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) => (
  <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold print:hidden" role="tablist">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${value === o.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
