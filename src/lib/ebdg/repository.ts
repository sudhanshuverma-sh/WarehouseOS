/**
 * EB-DG persistence — behind an interface (MASTERDATA.md I8), so the app
 * moves from Google Sheets to Firestore later without touching the form or
 * calculate.ts. See ../../../MASTERDATA.md §0.3 and §11.
 *
 * LocalEbDgRepository is today's implementation: it stands in for the two
 * Google Sheets tabs using localStorage, exactly the way the rest of this
 * app's `sheetRecords` already does (see src/context/AppContext.tsx) — one
 * JSON array per tab, keyed by Record_ID. A Firestore- or Apps-Script-backed
 * implementation of EbDgRepository is a drop-in replacement; nothing that
 * calls this interface needs to change.
 */

import { EbDgChannel, EbDgRow } from '../../types/ebdg';
import { rowToOrderedValues } from './columns';
import { SheetSyncingEbDgRepository } from './sheetWriter';

export interface SubmitResult {
  success: boolean;
  message: string;
  mode?: 'created' | 'updated';
}

export interface EbDgRepository {
  /**
   * The most recent row for this site strictly BEFORE `beforeDate` — the
   * carry-forward source. Matches on site AND date, never "the row above":
   * rows from ~120 sites are interleaved in one tab. Returns null when this
   * is the site's first-ever entry (edge case 1).
   */
  getPreviousRow(siteCode: string, beforeDate: string, channel: EbDgChannel): Promise<EbDgRow | null>;

  /** The row for this exact site + date, if one was already filed (duplicate check). */
  getRowByDate(siteCode: string, date: string, channel: EbDgChannel): Promise<EbDgRow | null>;

  /** True if a row exists for this site on any date AFTER `afterDate` — the back-dated-entry warning. */
  hasLaterRows(siteCode: string, afterDate: string, channel: EbDgChannel): Promise<boolean>;

  /**
   * Creates the row, or updates it in place if Record_ID already exists —
   * never a second row for the same site+date.
   *
   * `extras` are answers to questions an admin added to this service later.
   * They are kept beside the row, never inside it: the row is the 109 sheet
   * columns exactly, and the sheet's header contract does not move.
   */
  submit(row: EbDgRow, channel: EbDgChannel, extras?: Record<string, unknown>): Promise<SubmitResult>;

  /** Most recent N rows for a site, newest first — for the "openings" caption and history views. */
  listBySite(siteCode: string, channel: EbDgChannel, limit?: number): Promise<EbDgRow[]>;
}

// ---------------------------------------------------------------------
// Pure helpers — exported for direct unit testing without any storage I/O.
// ---------------------------------------------------------------------

/**
 * The carry-forward source: the most recent row for `siteCode` strictly
 * before `beforeDate`. NOT `date - 1` — if the POC missed a day, this still
 * finds the last row that exists (edge case 2, the date-gap scenario).
 */
export function pickPreviousRow(rows: EbDgRow[], siteCode: string, beforeDate: string): EbDgRow | null {
  let best: EbDgRow | null = null;
  for (const row of rows) {
    if (row.Site_Code !== siteCode) continue;
    if (row.Date >= beforeDate) continue;
    if (!best || row.Date > best.Date) best = row;
  }
  return best;
}

export function pickRowByDate(rows: EbDgRow[], siteCode: string, date: string): EbDgRow | null {
  return rows.find(r => r.Site_Code === siteCode && r.Date === date) || null;
}

export function anyLaterRows(rows: EbDgRow[], siteCode: string, afterDate: string): boolean {
  return rows.some(r => r.Site_Code === siteCode && r.Date > afterDate);
}

// ---------------------------------------------------------------------
// LocalEbDgRepository — localStorage-backed, today's implementation.
// ---------------------------------------------------------------------

const STORAGE_KEY: Record<EbDgChannel, string> = {
  EB_DG_B2B: 'wos_ebdg_EB_DG_B2B_rows',
  EB_DG_B2C: 'wos_ebdg_EB_DG_B2C_rows'
};

function loadRows(channel: EbDgChannel): EbDgRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY[channel]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRows(channel: EbDgChannel, rows: EbDgRow[]): void {
  localStorage.setItem(STORAGE_KEY[channel], JSON.stringify(rows));
}

export class LocalEbDgRepository implements EbDgRepository {
  async getPreviousRow(siteCode: string, beforeDate: string, channel: EbDgChannel): Promise<EbDgRow | null> {
    return pickPreviousRow(loadRows(channel), siteCode, beforeDate);
  }

  async getRowByDate(siteCode: string, date: string, channel: EbDgChannel): Promise<EbDgRow | null> {
    return pickRowByDate(loadRows(channel), siteCode, date);
  }

  async hasLaterRows(siteCode: string, afterDate: string, channel: EbDgChannel): Promise<boolean> {
    return anyLaterRows(loadRows(channel), siteCode, afterDate);
  }

  async submit(row: EbDgRow, channel: EbDgChannel, extras?: Record<string, unknown>): Promise<SubmitResult> {
    // Fails loudly here (MASTERDATA.md I5) rather than writing a
    // malformed row — same guard a real sheet-writer would need before
    // turning this row into a Range.setValues() call. The extras are checked
    // against the 109 columns first and then carried outside the row.
    rowToOrderedValues(row);
    const stored = extras && Object.keys(extras).length > 0 ? ({ ...row, extras } as EbDgRow) : row;

    const rows = loadRows(channel);
    const idx = rows.findIndex(r => r.Record_ID === row.Record_ID);
    if (idx >= 0) {
      rows[idx] = stored;
      saveRows(channel, rows);
      return { success: true, mode: 'updated', message: `Updated existing entry ${row.Record_ID}.` };
    }
    rows.push(stored);
    saveRows(channel, rows);
    return { success: true, mode: 'created', message: `Saved ${row.Record_ID}.` };
  }

  async listBySite(siteCode: string, channel: EbDgChannel, limit = 10): Promise<EbDgRow[]> {
    return loadRows(channel)
      .filter(r => r.Site_Code === siteCode)
      .sort((a, b) => (a.Date < b.Date ? 1 : a.Date > b.Date ? -1 : 0))
      .slice(0, limit);
  }
}

/**
 * The app-wide instance: saves locally first (so carry-forward survives a
 * dropped warehouse link), then pushes to the EB_DG_B2B / EB_DG_B2C tab when
 * an Apps Script URL has been configured. Swapping in a Firestore-backed
 * inner repository later changes this line and nothing else.
 */
export const ebDgRepository: EbDgRepository = new SheetSyncingEbDgRepository(new LocalEbDgRepository());
