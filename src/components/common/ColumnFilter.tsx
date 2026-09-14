import React, { useMemo, useState } from 'react';
import { Filter, Search, X, Check } from 'lucide-react';
import {
  distinctValues,
  setColumnFilter,
  type ColumnFilters,
} from '../../lib/table/columnFilters';

/**
 * The little funnel in a column header, behaving the way a spreadsheet's
 * does: a searchable list of that column's values, each with a count, and
 * Select all / Clear.
 *
 * Deliberately familiar rather than clever — every POC and admin here has
 * spent years in Google Sheets, and matching what they already know beats
 * anything they would have to learn.
 */

export interface ColumnFilterProps {
  columnKey: string;
  label: string;
  rows: Record<string, unknown>[];
  filters: ColumnFilters;
  onChange: (next: ColumnFilters) => void;
}

export const ColumnFilter: React.FC<ColumnFilterProps> = ({
  columnKey,
  label,
  rows,
  filters,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const active = filters[columnKey] ?? new Set<string>();
  const isActive = active.size > 0;

  // Computed only while the dropdown is open: scanning every row for
  // distinct values on all 109 columns at once would cost far more than
  // the one column somebody is actually looking at.
  const options = useMemo(
    () => (open ? distinctValues(rows, columnKey, filters) : []),
    [open, rows, columnKey, filters],
  );

  const shown = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    const next = new Set(active);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(setColumnFilter(filters, columnKey, next));
  };

  /** Selects everything currently listed, respecting the search box. */
  const selectShown = () => {
    onChange(setColumnFilter(filters, columnKey, new Set(shown.map((o) => o.value))));
  };

  const clear = () => onChange(setColumnFilter(filters, columnKey, new Set()));

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();   // headers are also sort buttons
          setOpen((o) => !o);
        }}
        title={isActive ? `Filtered: ${active.size} selected` : `Filter ${label}`}
        className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded cursor-pointer
          transition-[background-color,color] duration-(--motion-fast) ease-(--ease-standard) ${
          isActive
            ? 'bg-indigo-600 text-white'
            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
        }`}
      >
        <Filter className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          {/* Origin top-left: this one hangs off a column header, so it
              should look like it came out of that header's funnel. */}
          <div
            className="absolute left-0 top-6 z-50 w-64 bg-white border border-slate-200 rounded-xl overflow-hidden elevate-3 animate-pop-in"
            style={{ '--pop-origin': 'top left' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 truncate" title={label}>
                {label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search values"
                  className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 text-[11px]">
              <button type="button" onClick={selectShown} className="font-semibold text-indigo-600 hover:underline cursor-pointer">
                Select all{query.trim() ? ' shown' : ''}
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={!isActive}
                className="font-semibold text-slate-500 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              {shown.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">No matching values</p>
              ) : (
                shown.map((o) => {
                  const checked = active.has(o.value);
                  return (
                    <button
                      key={o.value || '__blank__'}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer text-left"
                    >
                      {/* The tick scales in rather than blinking on. At 90ms
                          it is barely a movement, but it makes a fast run of
                          clicks feel responsive instead of flickery. */}
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0
                          transition-[background-color,border-color] duration-(--motion-instant) ease-(--ease-standard) ${
                          checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                        }`}
                      >
                        <Check
                          className={`w-2.5 h-2.5 text-white transition-transform duration-(--motion-instant) ease-(--ease-spring) ${
                            checked ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </span>
                      <span
                        className={`truncate flex-1 ${o.value === '' ? 'italic text-slate-400' : 'text-slate-700'}`}
                        title={o.label}
                      >
                        {o.label}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{o.count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
};
