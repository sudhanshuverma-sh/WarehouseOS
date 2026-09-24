/**
 * EB-DG persistence — behind an interface (MASTERDATA.md I8), so the form and
 * calculate.ts do not care where a row lives.
 *
 * ApiEbDgRepository is the real one: the ebdg_daily table through /api/ebdg,
 * the same way Diesel saves to diesel_request. LocalEbDgRepository keeps the
 * two tabs in localStorage for demo mode — one JSON array per tab, keyed by
 * Record_ID. Neither writes to the Google Sheet: that copy is made by the
 * browser after a successful save (submitEbDgEntry in AppContext), as it is
 * for Diesel.
 */

import { EbDgChannel, EbDgRow } from '../../types/ebdg';
import { rowToOrderedValues } from './columns';
import { api as defaultApi, ApiClient, ApiError, DataMode, qs } from '../api/client';

export interface SubmitResult {
  success: boolean;
  message: string;
  mode?: 'created' | 'updated';
  /** Set when the day already had an entry and `amend` was not asked for. */
  alreadyFiled?: { by: string; at: string };
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
   * Creates the row for this site and date. Replacing one that already
   * exists has to be asked for with `amend`: three or four POCs share a
   * site, and an unasked-for upsert meant whoever opened the form second
   * silently replaced the first one's meter readings.
   *
   * `extras` are answers to questions an admin added to this service later.
   * They are kept beside the row, never inside it: the row is the 109 sheet
   * columns exactly, and the sheet's header contract does not move.
   */
  submit(
    row: EbDgRow,
    channel: EbDgChannel,
    extras?: Record<string, unknown>,
    amend?: boolean,
  ): Promise<SubmitResult>;

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
// LocalEbDgRepository — localStorage-backed, for demo mode.
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

  async submit(
    row: EbDgRow,
    channel: EbDgChannel,
    extras?: Record<string, unknown>,
    amend = false,
  ): Promise<SubmitResult> {
    // Fails loudly here (MASTERDATA.md I5) rather than writing a
    // malformed row — same guard a real sheet-writer would need before
    // turning this row into a Range.setValues() call. The extras are checked
    // against the 109 columns first and then carried outside the row.
    rowToOrderedValues(row);
    const stored = extras && Object.keys(extras).length > 0 ? ({ ...row, extras } as EbDgRow) : row;

    const rows = loadRows(channel);
    const idx = rows.findIndex(r => r.Record_ID === row.Record_ID);
    if (idx >= 0) {
      const prior = rows[idx];
      if (!amend) {
        return {
          success: false,
          message: `An entry for ${row.Site_Code} on ${row.Date} was already filed.`,
          alreadyFiled: { by: prior.Submitted_By || '', at: prior.Timestamp || prior.Date || '' },
        };
      }
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

// ---------------------------------------------------------------------
// ApiEbDgRepository — the ebdg_daily table, through /api/ebdg.
//
// One table holds both channels (the site decides which tab its row is
// copied to), so `channel` only matters for where the sheet copy goes.
// Row level security already limits a POC to their own sites' rows.
// ---------------------------------------------------------------------

export class ApiEbDgRepository implements EbDgRepository {
  constructor(private readonly client: ApiClient = defaultApi) {}

  async getPreviousRow(siteCode: string, beforeDate: string, _channel?: EbDgChannel): Promise<EbDgRow | null> {
    return this.client.get<EbDgRow | null>(`/ebdg/previous${qs({ site: siteCode, date: beforeDate })}`);
  }

  async getRowByDate(siteCode: string, date: string, _channel?: EbDgChannel): Promise<EbDgRow | null> {
    return this.client.get<EbDgRow | null>(`/ebdg/row${qs({ site: siteCode, date })}`);
  }

  async hasLaterRows(siteCode: string, afterDate: string, _channel?: EbDgChannel): Promise<boolean> {
    const res = await this.client.get<{ later: boolean }>(`/ebdg/later${qs({ site: siteCode, date: afterDate })}`);
    return Boolean(res?.later);
  }

  async submit(
    row: EbDgRow,
    _channel: EbDgChannel,
    extras?: Record<string, unknown>,
    amend = false,
  ): Promise<SubmitResult> {
    // The same guard as the local save: a row that has drifted from the 109
    // columns is refused here, before it reaches the database or the sheet.
    rowToOrderedValues(row);
    try {
      await this.client.post('/ebdg/submit', {
        ...row,
        ...(extras && Object.keys(extras).length > 0 ? { extras } : {}),
        amend,
      });
      return amend
        ? { success: true, mode: 'updated', message: `Updated existing entry ${row.Record_ID}.` }
        : { success: true, mode: 'created', message: `Saved ${row.Record_ID}.` };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE') {
        const d = (err.details ?? {}) as { submittedBy?: string; submittedAt?: string };
        return {
          success: false,
          message: `An entry for ${row.Site_Code} on ${row.Date} was already filed.`,
          alreadyFiled: { by: d.submittedBy ?? '', at: d.submittedAt ?? '' },
        };
      }
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listBySite(siteCode: string, _channel: EbDgChannel, limit = 10): Promise<EbDgRow[]> {
    return this.client.get<EbDgRow[]>(`/ebdg/rows${qs({ site: siteCode, limit })}`);
  }
}

export const localEbDgRepository = new LocalEbDgRepository();
export const apiEbDgRepository = new ApiEbDgRepository();

/** The database when the app runs against the API; this device in demo mode. */
export function ebDgRepositoryFor(mode: DataMode): EbDgRepository {
  return mode === 'api' ? apiEbDgRepository : localEbDgRepository;
}

/** Every row this device holds, both tabs — the demo-mode "Send all to sheet". */
export function loadAllLocalRows(): { row: EbDgRow; channel: EbDgChannel }[] {
  return (Object.keys(STORAGE_KEY) as EbDgChannel[]).flatMap(channel =>
    loadRows(channel).map(row => ({ row, channel }))
  );
}
