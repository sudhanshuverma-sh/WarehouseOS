import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, AlertTriangle } from 'lucide-react';
import type { Capabilities } from '../../lib/permissions';
import { downloadExport, type ExportSpec, type ExportFormat } from '../../lib/export/exporter';
import { Popover } from './Popover';

/**
 * Export, as two choices and nothing else.
 *
 * There used to be date and site pickers in here. They were a second
 * filtering system sitting beside the table's own, and two filters that
 * can disagree is worse than either alone — the count in the panel and the
 * rows on screen would drift apart, and the file would surprise whoever
 * opened it.
 *
 * So this exports exactly the rows it is handed. Narrow the table with the
 * column filters in its header, then export what you can see. One place to
 * filter, and the file always matches the screen.
 *
 * Renders nothing at all when the role may not export — not a disabled
 * button. A greyed-out control invites "why can't I?", and the honest
 * answer is better delivered by its absence than by a tooltip.
 */

export interface ExportPanelProps<T> {
  /** Exactly the rows to export — already filtered by the table. */
  rows: T[];
  spec: ExportSpec<T>;
  caps: Capabilities;
  /** Shown next to the count when the table is narrowed, e.g. "of 262". */
  totalCount?: number;
}

export function ExportPanel<T>({ rows, spec, caps, totalCount }: ExportPanelProps<T>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!caps.canExport) return null;

  const handle = async (format: ExportFormat) => {
    setError(null);
    setBusy(format);
    try {
      // No filters passed: scope is still enforced inside buildExport, but
      // the row selection is whatever the table decided.
      await downloadExport(format, rows, spec, {}, caps);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const narrowed = totalCount !== undefined && totalCount !== rows.length;

  return (
    <span className="inline-block">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer
          transition-[background-color,border-color,color] duration-(--motion-fast) ease-(--ease-standard)
          active:scale-[0.98] active:duration-(--motion-instant) ${
          open ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Download className="w-3.5 h-3.5" /> Export
      </button>

      {/* Portalled, so a table's own scrolling never clips it. */}
      <Popover open={open} onClose={() => setOpen(false)} anchor={trigger} align="right" width={240} label="Export">
          <div>
            {/* Says what is about to leave. When the table is filtered this
                is the reassurance that the file matches the screen. */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
              <p className="text-[11px] text-slate-600">
                <strong className="text-slate-900">{rows.length.toLocaleString('en-IN')}</strong>
                {narrowed && <span className="text-slate-400"> of {totalCount?.toLocaleString('en-IN')}</span>} row
                {rows.length === 1 ? '' : 's'} · {spec.columns.length} columns
              </p>
              {narrowed && <p className="text-[10px] text-slate-400 mt-0.5">Matches the filtered table</p>}
            </div>

            <button
              type="button"
              onClick={() => handle('xlsx')}
              disabled={rows.length === 0 || busy !== null}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-emerald-50 disabled:text-slate-300 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer text-left"
            >
              {busy === 'xlsx' ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              )}
              <span className="flex-1">
                Excel
                <span className="block text-[10px] font-normal text-slate-400">.xlsx — keeps text as text</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => handle('csv')}
              disabled={rows.length === 0 || busy !== null}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-white disabled:cursor-not-allowed transition cursor-pointer text-left border-t border-slate-100"
            >
              {busy === 'csv' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <FileText className="w-4 h-4 text-slate-500" />
              )}
              <span className="flex-1">
                CSV
                <span className="block text-[10px] font-normal text-slate-400">.csv — plain text</span>
              </span>
            </button>

            {error && (
              <p className="px-3 py-2 text-[11px] text-rose-700 bg-rose-50 border-t border-rose-100 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {error}
              </p>
            )}
          </div>
      </Popover>
    </span>
  );
}
