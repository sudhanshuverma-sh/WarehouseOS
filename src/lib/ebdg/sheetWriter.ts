/**
 * EB-DG → Google Sheets.
 *
 * Turns a calculated row into something the destination tab can accept, in
 * the tab's exact column order, resolved BY HEADER NAME (MASTERDATA.md I5).
 *
 * The tab's header is not the app's 109-column contract: the live EB_DG_B2B /
 * EB_DG_B2C tabs have no Timestamp column, and end with Submitted_At and
 * Status. EBDG_SHEET_HEADER is that header; the database, calculate.ts and
 * v_ebdg_header_map keep the 109 columns, the same way Diesel keeps its own
 * sheet header apart from its table (DIESEL_SHEET_HEADER).
 *
 * Two transports, same shaping:
 *
 *  1. Apps Script Web App — scripts/EbDg_Code.gs. The row is saved first
 *     (database, or this device in demo mode) and then copied to the sheet
 *     from the browser, exactly as Diesel is: see submitEbDgEntry and
 *     reserveSheetWindow in AppContext. The link is the one a Super Admin
 *     sets in the shared "Link sheet" panel, so every POC's browser uses it.
 *
 *  2. CSV — the exact header plus rows, for a paste/import into the tab.
 */

import { EbDgChannel, EbDgColumn, EbDgRow, EBDG_COLUMN_ORDER } from '../../types/ebdg';
import { rowToOrderedValues } from './columns';

/** Whether this day's row is the first filing or replaced an earlier one. */
export type EbDgSheetStatus = 'Submitted' | 'Amended';

/** A row as the app holds it for Records: the 109 columns plus its sheet Status. */
export type EbDgRecord = EbDgRow & { Status?: EbDgSheetStatus };

/** The live tab's header, column for column: 110 names, no Timestamp, Submitted_At and Status last. */
export const EBDG_SHEET_HEADER: readonly string[] = [
  ...EBDG_COLUMN_ORDER.filter(c => c !== 'Timestamp'),
  'Submitted_At',
  'Status',
];

/** The destination tab's header row, exactly as it appears in EB_DG_B2B / EB_DG_B2C. */
export const EBDG_HEADER_ROW: string = EBDG_SHEET_HEADER.join(',');

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `yyyy-MM-dd HH:mm:ss` in Indian time, which Sheets reads as a date-time.
 * A row filed in the app carries `…+05:30`; one read back from the database
 * carries UTC (`…Z`) — both land as the same wall-clock time.
 */
export function submittedAtOf(timestamp: unknown): string {
  const raw = String(timestamp ?? '').trim();
  if (!raw) return '';
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return raw;
  const ist = new Date(ms + 330 * 60_000);
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
}

/** One cell of the tab, by header name. A blank reading stays blank — never 0. */
export function sheetValue(header: string, row: EbDgRecord, status?: EbDgSheetStatus): string | number {
  if (header === 'Submitted_At') return submittedAtOf(row.Timestamp);
  if (header === 'Status') return status ?? row.Status ?? 'Submitted';
  const v = (row as unknown as Record<string, unknown>)[header];
  return v === null || v === undefined ? '' : (v as string | number);
}

/**
 * The row in the tab's order. rowToOrderedValues runs first so a row that has
 * drifted from the 109-column contract fails loudly instead of writing a
 * misaligned line.
 */
export function rowToSheetValues(row: EbDgRecord, status?: EbDgSheetStatus): Array<string | number> {
  rowToOrderedValues(sheetColumnsOf(row));
  return EBDG_SHEET_HEADER.map(h => sheetValue(h, row, status));
}

/** RFC-4180 quoting: wrap when the value carries a comma, quote, or newline. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row, in the tab's column order. Throws if the row and the header have drifted. */
export function rowToCsvLine(row: EbDgRecord): string {
  return rowToSheetValues(row).map(csvCell).join(',');
}

/**
 * A CSV block for the destination tab. `withHeader` off is what you want when
 * appending under an existing header.
 */
export function rowsToCsv(rows: EbDgRecord[], withHeader = true): string {
  const lines = rows.map(rowToCsvLine);
  return (withHeader ? [EBDG_HEADER_ROW, ...lines] : lines).join('\r\n');
}

/**
 * Only the 109 contract columns of a row. A row read back from the database or
 * from this device also carries the answers to questions an admin added
 * later, and its sheet Status; neither is one of the 109.
 */
export function sheetColumnsOf(row: EbDgRow): EbDgRow {
  const out: Record<string, unknown> = {};
  const source = row as unknown as Record<EbDgColumn, unknown>;
  for (const col of EBDG_COLUMN_ORDER) out[col] = source[col] ?? '';
  return out as unknown as EbDgRow;
}

/**
 * The payload shape scripts/EbDg_Code.gs expects. `header` travels with every
 * write on purpose: the script matches incoming values to the live sheet by
 * header name and refuses the write if a column it does not recognise shows
 * up, rather than appending a misaligned row.
 */
export interface EbDgSheetPayload {
  action: 'upsertEbDgRow';
  tab: EbDgChannel;
  recordId: string;
  header: string[];
  values: Array<string | number>;
  actorEmail: string;
}

export function buildSheetPayload(row: EbDgRecord, channel: EbDgChannel, status?: EbDgSheetStatus): EbDgSheetPayload {
  return {
    action: 'upsertEbDgRow',
    tab: channel,
    recordId: row.Record_ID,
    header: [...EBDG_SHEET_HEADER],
    values: rowToSheetValues(row, status),
    actorEmail: row.Submitted_By
  };
}

export interface EbDgSheetBatchPayload {
  action: 'upsertEbDgRows';
  header: string[];
  /** Each row names its own tab: one post carries B2B and B2C sites together. */
  rows: { tab: EbDgChannel; key: string; values: Array<string | number> }[];
}

/**
 * Every entry in one post — the "Send all to sheet" catch-up. One post, not
 * one per tab, because a browser allows a single popup per click. Rows the
 * sheet already has are updated in place on Record_ID, missing ones added,
 * so it is safe to press as often as you like.
 */
export function buildEbDgSheetBatch(entries: { row: EbDgRecord; channel: EbDgChannel }[]): EbDgSheetBatchPayload {
  return {
    action: 'upsertEbDgRows',
    header: [...EBDG_SHEET_HEADER],
    rows: entries
      .filter(e => e.row.Record_ID)
      .map(e => ({ tab: e.channel, key: e.row.Record_ID, values: rowToSheetValues(e.row) }))
  };
}
