import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Search, MousePointerClick } from 'lucide-react';
import { ColumnFilter } from '../common/ColumnFilter';
import { ColumnsMenu, DragHandle, ExpandButton, TableFullscreen, useColumnLayout, visibleColumns } from '../common/TableTools';
import {
  applyColumnFilters,
  cellValue,
  clearAllFilters,
  countActiveFilters,
  type ColumnFilters,
} from '../../lib/table/columnFilters';

/**
 * A master-data tab as a spreadsheet: per-column filters, click-to-sort,
 * search across every column, and double-click a row to edit it.
 *
 * Reuses the same ColumnFilter and applyColumnFilters as the Diesel ledger
 * and the records explorer, so filtering behaves identically everywhere —
 * one mental model, not three slightly different ones.
 *
 * Filters, search and sort live inside this component, and the parent
 * mounts it with `key={tab}`, so switching tab resets them. A Zone filter
 * left over from Site_Master would otherwise silently empty Service_Registry,
 * which has no Zone column to show why.
 */

export interface MasterDataTableProps {
  rows: Record<string, unknown>[];
  columns: string[];
  keyColumn: string;
  /** When set, rows are double-clickable and show the edit affordance. */
  onEditRow?: (row: Record<string, unknown>) => void;
  /** Extra toolbar content on the right, e.g. an "Add site" button. */
  actions?: React.ReactNode;
}

type Sort = { column: string; dir: 'asc' | 'desc' } | null;

const YES_NO = (col: string) =>
  col === 'Active' || col === 'Is_Primary' || col.startsWith('Needs_') || col === 'Requires_Evidence';

export const MasterDataTable: React.FC<MasterDataTableProps> = ({ rows, columns, keyColumn, onEditRow, actions }) => {
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [expanded, setExpanded] = useState(false);

  // Each tab keeps its own column arrangement; the key column names the tab.
  const columnInfo = useMemo(() => columns.map((c) => ({ key: c, label: c })), [columns]);
  const { layout, move, toggle, reset, dragProps, customised } = useColumnLayout(`master:${keyColumn}`, columns);
  const shownColumns = useMemo(() => visibleColumns(columnInfo, layout).map((c) => c.key), [columnInfo, layout]);

  // Search narrows first, then column filters, then sort. The column filter
  // value lists are built from `searched`, so a search for "Delhi" leaves
  // only Delhi-relevant options in each dropdown.
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => columns.some((c) => cellValue(r, c).toLowerCase().includes(q)));
  }, [rows, columns, search]);

  const visible = useMemo(() => {
    const filtered = applyColumnFilters(searched, filters);
    if (!sort) return filtered;
    const { column, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = cellValue(a, column);
      const bv = cellValue(b, column);
      // Blanks sink regardless of direction — nobody sorts to find them.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [searched, filters, sort]);

  const activeFilters = countActiveFilters(filters);
  const narrowed = activeFilters > 0 || search.trim() !== '';

  /** none → asc → desc → none, the cycle spreadsheets use. */
  const cycleSort = (column: string) =>
    setSort((s) =>
      !s || s.column !== column ? { column, dir: 'asc' } : s.dir === 'asc' ? { column, dir: 'desc' } : null,
    );

  const filterSignature = JSON.stringify([
    search,
    sort,
    Object.entries(filters).map(([k, v]) => [k, [...v].sort()]),
  ]);

  return (
    <TableFullscreen expanded={expanded} onCollapse={() => setExpanded(false)}>
    <div className={expanded ? 'flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-(--r-card) overflow-hidden' : ''}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all columns"
            className="w-56 pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400"
          />
        </div>

        <span className="text-xs text-slate-500">
          <strong className="text-slate-900">{visible.length.toLocaleString('en-IN')}</strong>
          {narrowed && <> of {rows.length.toLocaleString('en-IN')}</>} rows
          {activeFilters > 0 && <> · {activeFilters} filter{activeFilters === 1 ? '' : 's'}</>}
        </span>

        {narrowed && (
          <button
            type="button"
            onClick={() => {
              setFilters(clearAllFilters());
              setSearch('');
            }}
            className="text-xs text-slate-500 hover:text-slate-900 underline cursor-pointer"
          >
            Clear
          </button>
        )}

        {onEditRow && (
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400">
            <MousePointerClick className="w-3.5 h-3.5" /> Double-click a row to edit
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <ColumnsMenu columns={columnInfo} layout={layout} onMove={move} onToggle={toggle} onReset={reset} customised={customised} />
          <ExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </div>
      </div>

      <div className={`overflow-auto ${expanded ? 'flex-1 min-h-0' : 'max-h-[560px]'}`}>
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 border-b border-slate-200">
            <tr>
              {shownColumns.map((col) => {
                const sorted = sort?.column === col ? sort.dir : null;
                const drag = dragProps(col);
                return (
                  <th
                    key={col}
                    {...drag}
                    className={`py-2 px-3 whitespace-nowrap font-bold uppercase tracking-wider text-[10px] select-none ${drag.className}`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <DragHandle />
                      <button
                        type="button"
                        onClick={() => cycleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-slate-950 cursor-pointer"
                        title="Sort"
                      >
                        {col}
                        {sorted === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-slate-900" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="w-3 h-3 text-slate-900" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </button>
                      <ColumnFilter columnKey={col} label={col} rows={searched} filters={filters} onChange={setFilters} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Keyed on the filter state so the body settles when the view
              changes, and stays still during unrelated re-renders. */}
          <tbody key={filterSignature} className="divide-y divide-slate-100 text-slate-700 animate-settle">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={shownColumns.length} className="py-10 text-center text-sm text-slate-400">
                  {rows.length === 0 ? 'No rows yet — sync or paste above to load them.' : 'No rows match these filters.'}
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => (
                <tr
                  key={String(row[keyColumn] ?? idx)}
                  onDoubleClick={onEditRow ? () => onEditRow(row) : undefined}
                  title={onEditRow ? 'Double-click to edit' : undefined}
                  className={`transition-colors duration-(--motion-fast) ${
                    onEditRow ? 'cursor-pointer hover:bg-teal-50/70 select-none' : 'hover:bg-slate-50'
                  } ${String(row.Active) === 'No' ? 'opacity-60' : ''}`}
                >
                  {shownColumns.map((col) => {
                    const val = row[col];
                    const empty = val === '' || val === undefined || val === null;
                    return (
                      <td key={col} className="py-2 px-3 whitespace-nowrap max-w-55 truncate" title={String(val ?? '')}>
                        {YES_NO(col) ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              val === 'Yes' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {empty ? '—' : String(val)}
                          </span>
                        ) : empty ? (
                          <span className="text-slate-300 italic">—</span>
                        ) : (
                          <span className={/ID|Email|Code/.test(col) ? 'font-mono' : ''}>{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </TableFullscreen>
  );
};
