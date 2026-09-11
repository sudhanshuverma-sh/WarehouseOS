import React, { useMemo, useState } from 'react';
import { Download, X, Filter, AlertTriangle, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { Capabilities } from '../../lib/permissions';
import {
  downloadExport,
  selectRows,
  dateRange,
  type ExportSpec,
  type ExportFilters,
  type ExportFormat,
} from '../../lib/export/exporter';

/**
 * The export control, shared by every service.
 *
 * Renders nothing at all when the role may not export — not a disabled
 * button. A greyed-out control invites "why can't I?", and the honest
 * answer ("this data does not leave the app for your role") is better
 * delivered by its absence than by a tooltip.
 *
 * Shows what is about to leave before it leaves: row count, date span, and
 * a caller-supplied summary. Discovering a wrong month after forwarding the
 * file to finance is the failure this is trying to avoid.
 */

const PRESETS = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'] | 'custom' | 'all';

export interface ExportPanelProps<T> {
  rows: T[];
  spec: ExportSpec<T>;
  caps: Capabilities;
  /** Sites offered in the picker. Scope is enforced in buildExport regardless. */
  sites?: { code: string; label: string }[];
  /** Optional totals for the chosen rows, rendered above the download button. */
  renderSummary?: (rows: T[]) => React.ReactNode;
  /** Extra filter controls specific to one service (fuel type, status...). */
  extraWhere?: (row: T) => boolean;
}

export function ExportPanel<T>({ rows, spec, caps, sites, renderSummary, extraWhere }: ExportPanelProps<T>) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetId>('last30');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [site, setSite] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const filters: ExportFilters = useMemo(() => {
    const range =
      preset === 'all'
        ? {}
        : preset === 'custom'
          ? { from: custom.from || undefined, to: custom.to || undefined }
          : dateRange(preset);
    return { ...range, site, where: extraWhere as ExportFilters['where'] };
  }, [preset, custom, site, extraWhere]);

  // The rows the download will contain. The count, the summary and the file
  // all come from this one call, so the preview cannot disagree with what
  // lands in the recipient's inbox.
  const selectedRows = useMemo(
    () => (caps.canExport ? selectRows(rows, spec, filters, caps).selected : []),
    [rows, spec, filters, caps],
  );

  if (!caps.canExport) return null;

  const handleDownload = async (format: ExportFormat) => {
    setError(null);
    setBusy(format);
    try {
      await downloadExport(format, rows, spec, filters, caps);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
          open
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Download className="w-3.5 h-3.5" /> Export
      </button>

      {open && (
        <>
          {/* Click-away. A transparent layer beneath the panel is enough,
              and unlike a document listener it cannot outlive the panel. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          {/* Anchored to the button and floated above the table, so opening
              it never reflows the rows underneath. Right-aligned because
              this usually sits at the right edge of a toolbar. */}
          <div className="absolute right-0 z-50 mt-2 w-88 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" /> Export {spec.label}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">All {spec.columns.length} columns of the sheet.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate-400 hover:text-slate-700 cursor-pointer"
          aria-label="Close export panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Period</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                preset === p.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          {(['custom', 'all'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                preset === id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {id === 'custom' ? 'Custom' : 'All time'}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
        )}
      </div>

      {sites && sites.length > 0 && (
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Site</label>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white cursor-pointer"
          >
            <option value="ALL">All sites ({sites.length})</option>
            {sites.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {renderSummary && selectedRows.length > 0 && (
        <div className="border-t border-slate-100 pt-3">{renderSummary(selectedRows)}</div>
      )}

      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="border-t border-slate-100 pt-3 space-y-2.5">
        <p className="text-xs text-slate-500">
          <strong className="text-slate-900">{selectedRows.length}</strong> record
          {selectedRows.length === 1 ? '' : 's'} · {spec.columns.length} columns
          {filters.from && filters.to ? ` · ${filters.from} to ${filters.to}` : ' · all dates'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {/* Excel first: it is what most recipients open, and it is the
              one that will not reinterpret an invoice number as a date. */}
          <button
            type="button"
            onClick={() => handleDownload('xlsx')}
            disabled={selectedRows.length === 0 || busy !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition cursor-pointer"
          >
            {busy === 'xlsx' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={() => handleDownload('csv')}
            disabled={selectedRows.length === 0 || busy !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl transition cursor-pointer"
          >
            {busy === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            CSV
          </button>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
