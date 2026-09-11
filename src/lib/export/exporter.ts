/**
 * Service-agnostic record export.
 *
 * One engine for every service — diesel today, EB-DG and the rest as they
 * land — so a new service gets a column list rather than a new export
 * implementation that filters slightly differently from the last one.
 *
 * Two rules are enforced HERE rather than by callers:
 *
 *   1. Site scope is applied inside buildExport(), not passed in already
 *      filtered. A caller that forgets is the whole bug class this exists
 *      to prevent, and an export that leaks is permanent — the file is in
 *      someone's downloads folder and cannot be recalled.
 *   2. canExport is checked here too, even though the button is hidden.
 *      Hiding a control stops an honest mistake; it does not stop a stale
 *      tab, a shared link, or a persona switched mid-session.
 *
 * This is still a client-side affordance. The enforcing copy lives in
 * Postgres RLS — a request simply never receives rows it may not see.
 */

import type { Capabilities } from '../permissions';
import { canSeeSite } from '../permissions';

/** One output column. `value` returns what the cell should contain. */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /**
   * Write this as a real number in .xlsx so the recipient can sum it.
   * Everything else is written as text — which is what stops Excel turning
   * an invoice number like DL/25-26/999 into a date, or trimming the last
   * digits off a long id.
   */
  numeric?: boolean;
}

export interface ExportSpec<T> {
  /** Used in the filename and the on-screen description. */
  label: string;
  /** Service code this belongs to, e.g. 'DIESEL'. */
  serviceCode: string;
  columns: ExportColumn<T>[];
  /** The date a row belongs to, for range filtering. ISO or parseable. */
  dateOf: (row: T) => string | undefined;
  /** The site a row belongs to, for scope filtering. */
  siteOf: (row: T) => string | undefined;
}

export interface ExportFilters {
  /** Inclusive ISO date, or undefined for open-ended. */
  from?: string;
  to?: string;
  /** A specific site, or 'ALL'. Narrowed to the user's scope regardless. */
  site?: string;
  /** Optional extra predicate — status, fuel type, whatever the screen offers. */
  where?: (row: unknown) => boolean;
}

export interface ExportResult {
  csv: string;
  filename: string;
  rowCount: number;
  /** Rows removed because they were outside the user's scope. */
  excludedByScope: number;
}

export class ExportNotPermittedError extends Error {}

/**
 * RFC 4180 quoting.
 *
 * A field is quoted when it contains a comma, a quote, or a newline, and
 * embedded quotes are doubled. Vendor names and rejection reasons contain
 * commas routinely — "Rate mismatch, re-quoted" would otherwise silently
 * become two columns and shift every field after it.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * YYYY-MM-DD from a Date, read in LOCAL time.
 *
 * Deliberately not toISOString(). That converts to UTC, and for anyone east
 * of Greenwich local midnight is the previous day there — in IST, the 1st of
 * September became '2026-08-31', quietly filing the first day of every month
 * into the wrong report. The sites are in India; local is what "a month of
 * diesel" means to the person asking.
 */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD from anything Date can parse. Invalid input yields ''. */
function isoDay(value: string | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  // Local again, and for the same reason: a request submitted at 19:00 IST
  // is a UTC timestamp on the previous day. Bucketing it by UTC would drop
  // every evening submission out of "today".
  return Number.isNaN(d.getTime()) ? '' : localDay(d);
}

/** Common ranges, so "last month's diesel" is one click rather than two dates. */
export function dateRange(preset: 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth', today = new Date()) {
  const iso = localDay;
  const start = new Date(today);

  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'last7':
      start.setDate(start.getDate() - 6);
      return { from: iso(start), to: iso(today) };
    case 'last30':
      start.setDate(start.getDate() - 29);
      return { from: iso(start), to: iso(today) };
    case 'thisMonth':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one, which
      // handles 28/29/30/31 without a lookup table.
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
  }
}

/**
 * The rows an export would contain, without building the file.
 *
 * Exported so a preview and the download come from ONE filter, not two
 * that drift apart — a summary that disagrees with the CSV beside it is
 * worse than no summary, because it gets believed.
 */
export function selectRows<T>(
  rows: T[],
  spec: ExportSpec<T>,
  filters: ExportFilters,
  caps: Capabilities,
): { selected: T[]; excludedByScope: number } {
  let excludedByScope = 0;

  const selected = rows.filter((row) => {
    // Scope first: a row outside the user's sites is not theirs to filter,
    // count, or total.
    if (!canSeeSite(caps, spec.siteOf(row))) {
      excludedByScope++;
      return false;
    }

    if (filters.site && filters.site !== 'ALL' && spec.siteOf(row) !== filters.site) return false;

    const day = isoDay(spec.dateOf(row));
    // A row with no usable date cannot be shown to fall inside a range, so
    // it is excluded whenever one is set — silently including it would put
    // undated rows in every month's report.
    if (filters.from && (!day || day < filters.from)) return false;
    if (filters.to && (!day || day > filters.to)) return false;

    if (filters.where && !filters.where(row)) return false;

    return true;
  });

  return { selected, excludedByScope };
}

export function buildExport<T>(
  rows: T[],
  spec: ExportSpec<T>,
  filters: ExportFilters,
  caps: Capabilities,
): ExportResult {
  if (!caps.canExport) {
    throw new ExportNotPermittedError(
      `Your role (${caps.role}) may view these records but not export them.`,
    );
  }

  const { selected, excludedByScope } = selectRows(rows, spec, filters, caps);

  const header = spec.columns.map((c) => csvCell(c.header)).join(',');
  const body = selected.map((row) => spec.columns.map((c) => csvCell(c.value(row))).join(','));

  const span = filters.from && filters.to ? `${filters.from}_to_${filters.to}` : 'all-dates';
  const scope = filters.site && filters.site !== 'ALL' ? filters.site : 'all-sites';

  return {
    // A BOM so Excel opens UTF-8 correctly. Without it, names with
    // accents arrive mangled and the file looks corrupt to the recipient.
    csv: '﻿' + [header, ...body].join('\r\n'),
    filename: `${spec.serviceCode}_${scope}_${span}.csv`,
    rowCount: selected.length,
    excludedByScope,
  };
}

export type ExportFormat = 'csv' | 'xlsx';

/** Triggers the browser download. Separated so buildExport stays pure. */
export function downloadCsv(result: ExportResult): void {
  const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
  saveBlob(blob, result.filename);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Without this the blob is held for the life of the page. One export is
  // nothing; an admin pulling twenty reports in a session is not.
  URL.revokeObjectURL(url);
}

/**
 * The same rows as an .xlsx workbook.
 *
 * Excel is what most recipients actually open, and a CSV forces a choice
 * on them: double-clicking it can mangle things silently. `DL/25-26/999`
 * becomes a date, a long numeric id loses its last digits to float
 * precision, and a leading zero on a pincode disappears. In a workbook the
 * type is declared per column, so none of that guesswork happens.
 *
 * Every column is written as text for exactly that reason, except the ones
 * a spec marks numeric — where a real number is wanted so the recipient
 * can sum it without converting a column first.
 *
 * The library is loaded on demand: it is only needed when someone actually
 * exports, and it should not sit in the bundle every POC downloads to file
 * a reading.
 */
export async function downloadXlsx<T>(
  rows: T[],
  spec: ExportSpec<T>,
  filters: ExportFilters,
  caps: Capabilities,
): Promise<ExportResult> {
  const result = buildExport(rows, spec, filters, caps);
  const { selected } = selectRows(rows, spec, filters, caps);

  // The '/browser' entry point specifically: the package has no bare
  // export, and the node build pulls in fs/stream, which Vite would then
  // try (and fail) to bundle for the browser.
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  // Built as raw sheet data rather than through the schema API: it keeps
  // the per-cell type explicit, which is the whole reason for offering
  // .xlsx in the first place.
  const headerRow = spec.columns.map((col) => ({
    value: col.header,
    type: String,
    fontWeight: 'bold' as const,
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
  }));

  const dataRows = selected.map((row) =>
    spec.columns.map((col) => {
      const v = col.value(row);
      // A blank stays an empty cell. Coercing '' to 0 in a numeric column
      // would invent a zero-litre delivery, or a DG reading, that never
      // happened — the same mistake the calculation engine avoids.
      if (v === null || v === undefined || v === '') return {};
      return col.numeric && Number.isFinite(Number(v))
        ? { value: Number(v), type: Number }
        : { value: String(v), type: String };
    }),
  );

  const blob = await writeXlsxFile([headerRow, ...dataRows] as never, {
    columns: spec.columns.map((col) => ({
      width: Math.min(Math.max(col.header.length + 4, 12), 40),
    })),
    sheet: spec.serviceCode.slice(0, 31),   // Excel caps sheet names at 31 chars
  } as never);

  const filename = result.filename.replace(/\.csv$/, '.xlsx');
  saveBlob(blob as unknown as Blob, filename);
  return { ...result, filename };
}

/** One call for either format, so callers do not branch on it themselves. */
export async function downloadExport<T>(
  format: ExportFormat,
  rows: T[],
  spec: ExportSpec<T>,
  filters: ExportFilters,
  caps: Capabilities,
): Promise<ExportResult> {
  if (format === 'xlsx') return downloadXlsx(rows, spec, filters, caps);
  const result = buildExport(rows, spec, filters, caps);
  downloadCsv(result);
  return result;
}
