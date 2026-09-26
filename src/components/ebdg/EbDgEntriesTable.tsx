import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react';
import { EBDG_SHEET_HEADER, sheetValue, type EbDgRecord } from '../../lib/ebdg/sheetWriter';
import { compareCells, describeCell, isStatusColumn, statusTone } from '../../lib/records/recordTable';
import { ColumnsMenu, DragHandle, ExpandButton, TableFullscreen, useColumnLayout, visibleColumns } from '../common/TableTools';
import { Card } from '../diesel/DieselPanels';

/**
 * Every EB-DG entry, day by day, with every column of the record: the same
 * 110 columns, in the same order and with the same values as Records and
 * the EB_DG_B2B / EB_DG_B2C sheet (EBDG_SHEET_HEADER + sheetValue).
 *
 * Search, sort any column, choose and drag columns (remembered per table),
 * full screen, and a CSV with every column.
 */

const PAGE = 50;
const COLUMNS = EBDG_SHEET_HEADER.map((h) => ({ key: h, label: h }));

type Row = { key: string; cells: Record<string, string | number> };

const Cell: React.FC<{ column: string; value: unknown }> = ({ column, value }) => {
  const cell = describeCell(value);
  if (cell.kind === 'empty') return <span className="text-slate-300">-</span>;
  if (isStatusColumn(column) || column.endsWith('_Status')) {
    const tone = statusTone(value);
    const cls = tone === 'good' ? 'bg-(--color-filed-tint)' : tone === 'wait' ? 'bg-(--color-due-tint)' : tone === 'bad' ? 'bg-(--color-missing-tint)' : 'bg-slate-100';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold text-(--color-ink) whitespace-nowrap ${cls}`}>{cell.text}</span>;
  }
  if (cell.kind === 'number') return <span className="font-mono tabular-nums">{cell.text}</span>;
  return (
    <span className="block max-w-56 truncate" title={cell.text}>
      {cell.text}
    </span>
  );
};

export const EbDgEntriesTable: React.FC<{
  rows: readonly EbDgRecord[];
  /** Heading; none when the card around it already names it. */
  title?: string;
  fileName: string;
  /** Where the column layout is remembered. */
  layoutKey: string;
  /** Sites by code, so a search for a site's name finds its entries. */
  siteName?: (code: string) => string;
  /** Inside another card: no card or full screen of its own. */
  bare?: boolean;
  /** The neumorphic look, inside a NeuPage. */
  neu?: boolean;
}> = ({ rows, title, fileName, layoutKey, siteName, bare, neu }) => {
  // Class sets for the two looks: the app's light cards, or the neumorphic surface.
  const ui = neu
    ? {
        input: 'neu-inset h-10 w-48 pl-8 pr-2 text-xs rounded-xl border-0 bg-transparent focus:outline-none',
        button: 'neu-press neu-raised inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border-0 text-xs font-semibold text-slate-800 cursor-pointer disabled:opacity-40',
        well: 'neu-inset rounded-2xl',
        head: 'bg-[#e7ebf1]',
        th: 'bg-[#e7ebf1] border-b border-[#d5dae3]',
        body: 'divide-y divide-[#dde2ea]',
        row: 'group hover:bg-[#dfe4ec]',
        stick: 'bg-[#e7ebf1] group-hover:bg-[#dfe4ec] shadow-[inset_-1px_0_0_#d5dae3]',
      }
    : {
        input: 'h-9 w-44 pl-8 pr-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-600',
        button:
          'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer disabled:opacity-40',
        well: 'border border-slate-200 rounded-xl',
        head: 'bg-slate-50',
        th: 'bg-slate-50 border-b border-slate-200',
        body: 'divide-y divide-slate-100',
        row: 'group hover:bg-slate-50',
        stick: 'bg-white group-hover:bg-slate-50 shadow-[inset_-1px_0_0_var(--color-slate-200)]',
      };
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [full, setFull] = useState(false);
  const { layout, move, toggle, reset, dragProps, customised } = useColumnLayout(layoutKey, useMemo(() => COLUMNS.map((c) => c.key), []));
  const columns = useMemo(() => visibleColumns(COLUMNS, layout), [layout]);

  const all: Row[] = useMemo(
    () =>
      rows.map((r, i) => ({
        key: String(r.Record_ID || `${r.Site_Code}-${r.Date}-${i}`),
        cells: Object.fromEntries(EBDG_SHEET_HEADER.map((h) => [h, sheetValue(h, r)])),
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? all
      : all.filter((row) => {
          const site = siteName?.(String(row.cells.Site_Code)) ?? '';
          return site.toLowerCase().includes(q) || Object.values(row.cells).some((v) => String(v).toLowerCase().includes(q));
        });
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const c = compareCells(a.cells[sort.key], b.cells[sort.key]);
      const blank = describeCell(a.cells[sort.key]).kind === 'empty' || describeCell(b.cells[sort.key]).kind === 'empty';
      return blank ? c : c * sort.dir;
    });
  }, [all, query, sort, siteName]);
  const shown = filtered.slice(0, limit);

  const toggleSort = (key: string) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  const download = () => {
    const esc = (v: unknown) => {
      const t = String(v ?? '');
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = [EBDG_SHEET_HEADER.map(esc).join(','), ...filtered.map((row) => EBDG_SHEET_HEADER.map((h) => esc(row.cells[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tools = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Search entries"
          aria-label="Search entries"
          className={ui.input}
        />
      </div>
      <ColumnsMenu columns={COLUMNS} layout={layout} onMove={move} onToggle={toggle} onReset={reset} customised={customised} />
      <button
        type="button"
        onClick={download}
        disabled={!filtered.length}
        className={ui.button}
      >
        <Download className="w-3.5 h-3.5" /> CSV
      </button>
      {!bare && <ExpandButton expanded={full} onToggle={() => setFull((v) => !v)} />}
    </div>
  );

  const table = (
    <>
      <div data-pdf-expand className={`overflow-auto neu-scroll ${ui.well} ${full ? 'flex-1 min-h-0' : 'max-h-128'}`}>
        <table className="w-full text-xs">
          <thead className={`sticky top-0 z-10 ${ui.head}`}>
            <tr>
              {columns.map((c, ci) => {
                const sorted = sort?.key === c.key ? sort.dir : null;
                const SortIcon = sorted === 1 ? ArrowUp : sorted === -1 ? ArrowDown : ArrowUpDown;
                const drag = dragProps(c.key);
                return (
                  <th
                    key={c.key}
                    scope="col"
                    {...drag}
                    aria-sort={sorted === 1 ? 'ascending' : sorted === -1 ? 'descending' : 'none'}
                    className={`px-3 py-2.5 text-left align-bottom font-semibold text-slate-600 ${ui.th} select-none ${
                      ci === 0 ? 'sticky left-0 z-20 shadow-[inset_-1px_0_0_var(--color-slate-200)]' : ''
                    } ${drag.className}`}
                  >
                    <span className="flex items-end gap-1 min-w-16 max-w-36">
                      <DragHandle />
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        title={c.key}
                        className="group flex-1 min-w-0 inline-flex items-end gap-1 text-left leading-snug hover:text-slate-900 cursor-pointer"
                      >
                        <span className="line-clamp-2">{c.label}</span>
                        <SortIcon className={`w-3 h-3 shrink-0 mb-0.5 ${sorted ? 'text-slate-900' : 'text-slate-300 group-hover:text-slate-500'}`} />
                      </button>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={ui.body}>
            {shown.map((row) => (
              <tr key={row.key} className={ui.row}>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-slate-800 whitespace-nowrap ${
                      ci === 0 ? `sticky left-0 z-1 ${ui.stick} font-semibold` : ''
                    }`}
                  >
                    <Cell column={c.key} value={row.cells[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-slate-500">
                  {all.length ? 'No entries match the search.' : 'No entries filed in this period.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Showing {shown.length.toLocaleString('en-IN')} of {filtered.length.toLocaleString('en-IN')} entries, {columns.length} of {COLUMNS.length} columns
        </span>
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE * 2)} className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
            Show more
          </button>
        )}
      </div>
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col min-h-0 flex-1">
        <div className={`mb-2 flex flex-wrap items-center gap-2 ${title ? 'justify-between' : 'justify-end'}`}>
          {title && <h3 className="text-xs font-bold text-slate-700">{title}</h3>}
          {tools}
        </div>
        {table}
      </div>
    );
  }

  return (
    <TableFullscreen expanded={full} onCollapse={() => setFull(false)}>
      <Card title={title} actions={tools} className={full ? 'flex-1 flex flex-col min-h-0' : ''}>
        {table}
      </Card>
    </TableFullscreen>
  );
};
