import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  activeFilterCount,
  DATE_PRESETS,
  EMPTY_DIESEL_FILTERS,
  type DieselDashboardFilters,
  type DieselFilterOptions,
} from '../../lib/diesel/dashboard';

/**
 * The Diesel dashboard's filters: search, date presets, month, zone,
 * channel, status, warehouses and vendors. Every change re-computes the
 * whole dashboard; active filters show as chips that remove one each.
 */

interface Props {
  filters: DieselDashboardFilters;
  options: DieselFilterOptions;
  onChange: (next: DieselDashboardFilters) => void;
}

const selectClass = (on: boolean) =>
  `h-9 pl-2.5 pr-7 text-xs rounded-lg border bg-no-repeat appearance-none cursor-pointer focus:outline-none max-w-[9.5rem] ${
    on ? 'border-(--color-filed) bg-(--color-filed-tint) text-slate-900 font-semibold' : 'border-slate-200 bg-slate-50 text-slate-600'
  }`;

const Select: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; options: string[] }> = ({ value, onChange, placeholder, options }) => (
  <div className="relative shrink-0">
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass(Boolean(value))} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

const MultiSelect: React.FC<{ label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }> = ({
  label,
  options,
  value,
  onChange,
  searchable,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [q, setQ] = useState('');
  const shown = useMemo(() => (q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);

  const toggle = () => {
    if (!open) setDraft(value);
    setOpen(!open);
  };

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={toggle} className={`${selectClass(value.length > 0)} flex items-center gap-1.5`}>
        {label}
        {value.length > 0 && <span className="px-1.5 rounded-full bg-(--color-filed) text-white text-[10px] font-bold">{value.length}</span>}
        <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-2">
            {searchable && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full h-8 px-2.5 mb-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-slate-400"
              />
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {shown.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-400">Nothing found</p>
              ) : (
                shown.map((o) => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 rounded">
                    <input
                      type="checkbox"
                      checked={draft.includes(o)}
                      onChange={(e) => setDraft(e.target.checked ? [...draft, o] : draft.filter((x) => x !== o))}
                      className="accent-(--color-filed)"
                    />
                    <span className="truncate">{o}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100">
              <div className="flex gap-1">
                <button type="button" onClick={() => setDraft(options)} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer">All</button>
                <button type="button" onClick={() => setDraft([])} className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer">Clear</button>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
                className="px-3 py-1 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const DieselFilterBar: React.FC<Props> = ({ filters, options, onChange }) => {
  const set = (patch: Partial<DieselDashboardFilters>) => onChange({ ...filters, ...patch });
  const [searchText, setSearchText] = useState(filters.search);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const count = activeFilterCount(filters);

  const q = searchText.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      q
        ? options.suggestions
            .map((g) => ({ group: g.group, values: g.values.filter((v) => v.toLowerCase().includes(q)).slice(0, 5) }))
            .filter((g) => g.values.length)
        : [],
    [options, q],
  );

  const applySearch = (value: string) => {
    setSearchText(value);
    setSuggestOpen(false);
    set({ search: value });
  };

  const chips: { key: string; label: string; clear: Partial<DieselDashboardFilters> }[] = [];
  if (filters.search.trim()) chips.push({ key: 'search', label: `Search: ${filters.search}`, clear: { search: '' } });
  if (filters.preset) {
    const p = DATE_PRESETS.find((d) => d.value === filters.preset)?.label ?? filters.preset;
    const range = filters.preset === 'custom' ? ` ${filters.from || '…'} → ${filters.to || '…'}` : '';
    chips.push({ key: 'preset', label: `Date: ${p}${range}`, clear: { preset: '', from: '', to: '' } });
  }
  if (filters.month) chips.push({ key: 'month', label: `Month: ${filters.month}`, clear: { month: '' } });
  if (filters.zone) chips.push({ key: 'zone', label: `Zone: ${filters.zone}`, clear: { zone: '' } });
  if (filters.entity) chips.push({ key: 'entity', label: filters.entity, clear: { entity: '' } });
  if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}`, clear: { status: '' } });
  if (filters.warehouses.length) {
    const w = filters.warehouses;
    chips.push({ key: 'wh', label: `WH: ${w.slice(0, 2).join(', ')}${w.length > 2 ? ` +${w.length - 2}` : ''}`, clear: { warehouses: [] } });
  }
  if (filters.vendors.length) {
    const v = filters.vendors;
    chips.push({ key: 'vnd', label: `Vendor: ${v.slice(0, 2).join(', ')}${v.length > 2 ? ` +${v.length - 2}` : ''}`, clear: { vendors: [] } });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-(--r-card) p-3 shadow-xs space-y-2.5 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search with suggestions */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setSuggestOpen(true);
              if (!e.target.value) set({ search: '' });
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch(searchText.trim());
              if (e.key === 'Escape') setSuggestOpen(false);
            }}
            placeholder="Search vendor, WH, ID, zone, email…"
            className="w-full h-9 pl-8 pr-7 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-slate-400"
          />
          {searchText && (
            <button type="button" onClick={() => applySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute left-0 z-50 mt-1.5 w-80 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
              {suggestions.map((g) => (
                <div key={g.group}>
                  <div className="sticky top-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">{g.group}</div>
                  {g.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySearch(v)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 truncate cursor-pointer"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date presets */}
        <div className="flex flex-wrap gap-0.5 p-0.5 bg-slate-100 rounded-lg">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value || 'all'}
              type="button"
              onClick={() => set({ preset: p.value, ...(p.value !== 'custom' ? { from: '', to: '' } : {}) })}
              className={`h-8 px-2.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                filters.preset === p.value ? 'bg-white shadow-sm text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filters.preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50" aria-label="From" />
            <span className="text-xs text-slate-400">–</span>
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className="h-9 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50" aria-label="To" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.month} onChange={(v) => set({ month: v })} placeholder="Month" options={options.months} />
        <Select value={filters.zone} onChange={(v) => set({ zone: v })} placeholder="Zone" options={options.zones} />
        <Select value={filters.entity} onChange={(v) => set({ entity: v as DieselDashboardFilters['entity'] })} placeholder="B2B / B2C" options={['B2B', 'B2C']} />
        <Select value={filters.status} onChange={(v) => set({ status: v as DieselDashboardFilters['status'] })} placeholder="Status" options={['Approved', 'Rejected', 'Pending']} />
        <MultiSelect label="Warehouse" options={options.warehouses} value={filters.warehouses} onChange={(v) => set({ warehouses: v })} searchable />
        <MultiSelect label="Vendor" options={options.vendors} value={filters.vendors} onChange={(v) => set({ vendors: v })} />
        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              onChange(EMPTY_DIESEL_FILTERS);
            }}
            className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-(--color-missing) bg-(--color-missing-tint) rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Clear
            <span className="px-1.5 rounded-full bg-(--color-missing) text-white text-[10px]">{count}</span>
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-500 font-medium">Filtered:</span>
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] text-slate-700">
              {c.label}
              <button
                type="button"
                onClick={() => {
                  if (c.key === 'search') setSearchText('');
                  set(c.clear);
                }}
                className="p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                aria-label={`Remove ${c.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
