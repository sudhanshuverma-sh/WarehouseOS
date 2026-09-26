import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_DIESEL_FILTERS,
  type DieselDashboardFilters,
  type DieselFilterOptions,
} from '../../lib/diesel/dashboard';
import { Drop, Multi, NEU, Option } from '../analytics/NeuKit';

/**
 * The Diesel dashboard's filters in the neumorphic look: search (with
 * suggestions), date presets, and dropdowns for month, zone, B2B / B2C,
 * status, warehouses and vendors. Every change re-computes the dashboard.
 */

type Key = 'month' | 'zone' | 'entity' | 'status' | 'warehouses' | 'vendors';

const Divider = () => <span className="hidden md:block w-px self-stretch my-1.5 mx-0.5" style={{ background: NEU.rule }} aria-hidden />;

export const DieselNeuFilterBar: React.FC<{
  filters: DieselDashboardFilters;
  options: DieselFilterOptions;
  onChange: (next: DieselDashboardFilters) => void;
}> = ({ filters, options, onChange }) => {
  const set = (patch: Partial<DieselDashboardFilters>) => onChange({ ...filters, ...patch });
  const [open, setOpen] = useState<Key | null>(null);
  const [text, setText] = useState(filters.search);
  const [suggest, setSuggest] = useState(false);
  const count = activeFilterCount(filters);

  const q = text.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      q
        ? options.suggestions
            .map((g) => ({ group: g.group, values: g.values.filter((v) => v.toLowerCase().includes(q)).slice(0, 5) }))
            .filter((g) => g.values.length)
        : [],
    [options, q],
  );
  const search = (v: string) => {
    setText(v);
    setSuggest(false);
    set({ search: v });
  };

  const single: { key: Exclude<Key, 'warehouses' | 'vendors'>; label: string; all: string; opts: string[] }[] = [
    { key: 'month', label: 'Month', all: 'All months', opts: options.months },
    { key: 'zone', label: 'Zone', all: 'All zones', opts: options.zones },
    { key: 'entity', label: 'B2B / B2C', all: 'Both', opts: ['B2B', 'B2C'] },
    { key: 'status', label: 'Status', all: 'All statuses', opts: ['Approved', 'Rejected', 'Pending'] },
  ];

  return (
    <div className="neu-card relative z-20 flex flex-wrap items-center gap-3 p-3.5 print:hidden" style={{ borderRadius: 22 }}>
      {/* Search with suggestions */}
      <div className="relative w-full sm:w-[270px]">
        <label className="neu-inset flex items-center gap-2.5 h-11 px-4 rounded-[14px]">
          <Search className="w-[18px] h-[18px] shrink-0" style={{ color: NEU.muted }} />
          <span className="sr-only">Search</span>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSuggest(true);
              if (!e.target.value) set({ search: '' });
            }}
            onFocus={() => setSuggest(true)}
            onBlur={() => window.setTimeout(() => setSuggest(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search(text.trim());
              if (e.key === 'Escape') setSuggest(false);
            }}
            placeholder="Search vendor, WH, diesel ID"
            className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm"
            style={{ color: NEU.ink, fontFamily: 'inherit' }}
          />
          {text && (
            <button type="button" onClick={() => search('')} aria-label="Clear search" className="border-0 bg-transparent cursor-pointer p-0.5" style={{ color: NEU.muted }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </label>
        {suggest && suggestions.length > 0 && (
          <div className="neu-card neu-scroll absolute left-0 top-[52px] z-[60] w-80 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto p-2" style={{ borderRadius: 18 }}>
            {suggestions.map((g) => (
              <div key={g.group} className="mb-1">
                <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: NEU.muted }}>
                  {g.group}
                </div>
                {g.values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => search(v)}
                    className="neu-row w-full text-left px-3 py-2 rounded-xl border-0 bg-transparent text-sm truncate cursor-pointer"
                    style={{ color: NEU.ink }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Date presets */}
      <div className="neu-inset flex flex-wrap gap-0.5 p-1 rounded-[14px]" role="group" aria-label="Period">
        {DATE_PRESETS.map((p) => {
          const on = filters.preset === p.value;
          return (
            <button
              key={p.value || 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => set({ preset: p.value, ...(p.value !== 'custom' ? { from: '', to: '' } : {}) })}
              className={`neu-press h-9 px-3 rounded-[11px] border-0 text-[13px] whitespace-nowrap cursor-pointer ${on ? 'neu-raised' : 'bg-transparent'}`}
              style={{ color: on ? NEU.accentInk : NEU.muted, fontWeight: on ? 700 : 500 }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {filters.preset === 'custom' && (
        <div className="flex items-center gap-2">
          {(['from', 'to'] as const).map((k) => (
            <label key={k} className="neu-inset flex items-center gap-2 h-11 px-3 rounded-[14px] text-xs font-semibold" style={{ color: NEU.muted }}>
              {k === 'from' ? 'From' : 'To'}
              <input
                type="date"
                value={filters[k]}
                onChange={(e) => set({ [k]: e.target.value })}
                className="border-0 outline-none bg-transparent text-sm"
                style={{ color: NEU.ink, fontFamily: 'inherit' }}
              />
            </label>
          ))}
        </div>
      )}

      <Divider />

      {single.map((f) => {
        const val = String(filters[f.key] ?? '');
        return (
          <Drop key={f.key} label={f.label} active={val} open={open === f.key} onToggle={() => setOpen(open === f.key ? null : f.key)} onClose={() => setOpen(null)}>
            {[['', f.all], ...f.opts.map((o) => [o, o])].map(([v, l]) => (
              <Option
                key={v || 'all'}
                label={l}
                on={v === val}
                onPick={() => {
                  set({ [f.key]: v } as Partial<DieselDashboardFilters>);
                  setOpen(null);
                }}
              />
            ))}
          </Drop>
        );
      })}
      <Multi label="Warehouse" options={options.warehouses} value={filters.warehouses} open={open === 'warehouses'} onToggle={() => setOpen(open === 'warehouses' ? null : 'warehouses')} onClose={() => setOpen(null)} onApply={(v) => set({ warehouses: v })} />
      <Multi label="Vendor" options={options.vendors} value={filters.vendors} open={open === 'vendors'} onToggle={() => setOpen(open === 'vendors' ? null : 'vendors')} onClose={() => setOpen(null)} onApply={(v) => set({ vendors: v })} />

      {count > 0 && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange(EMPTY_DIESEL_FILTERS);
          }}
          className="h-11 px-3.5 border-0 bg-transparent text-sm font-semibold cursor-pointer whitespace-nowrap"
          style={{ color: NEU.accentInk }}
        >
          {count} {count === 1 ? 'filter' : 'filters'} active, Reset
        </button>
      )}
    </div>
  );
};
