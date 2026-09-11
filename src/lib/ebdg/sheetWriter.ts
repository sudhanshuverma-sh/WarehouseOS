/**
 * EB-DG → Google Sheets.
 *
 * Turns a calculated row into something the destination tab can accept, in
 * the tab's exact column order, resolved BY HEADER NAME (MASTERDATA.md I5).
 *
 * Two transports, same shaping:
 *
 *  1. Apps Script Web App — the hidden-form POST this app already uses for
 *     Daily Site Report writes (see submitViaHiddenForm in AppContext). The
 *     matching server side is scripts/EbDg_Code.gs. Fire-and-forget: it must
 *     run inside the user's click, and a failure must never lose the entry.
 *
 *  2. CSV — the exact header plus rows, for a paste/import into the tab. This
 *     is the path that works today, since Service_Registry.AppScript_URL is
 *     still empty for all six services (MASTERDATA.md §4).
 *
 * Local storage stays the source of truth for reads either way: carry-forward
 * has to work when the warehouse link is down, which is most of the point.
 */

import { EbDgChannel, EbDgRow, EBDG_COLUMN_ORDER } from '../../types/ebdg';
import { rowToOrderedValues } from './columns';
// Type-only on purpose: repository.ts imports this module for the class below,
// so a value import here would close a runtime cycle and risk a TDZ error.
import type { EbDgRepository, SubmitResult } from './repository';

/** The destination tab's header row, exactly as it appears in EB_DG_B2B / EB_DG_B2C. */
export const EBDG_HEADER_ROW: string = EBDG_COLUMN_ORDER.join(',');

/** RFC-4180 quoting: wrap when the value carries a comma, quote, or newline. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row, in the tab's column order. Throws if the row and the header have drifted. */
export function rowToCsvLine(row: EbDgRow): string {
  return rowToOrderedValues(row).map(csvCell).join(',');
}

/**
 * A CSV block for the destination tab. `withHeader` off is what you want when
 * appending under an existing header.
 */
export function rowsToCsv(rows: EbDgRow[], withHeader = true): string {
  const lines = rows.map(rowToCsvLine);
  return (withHeader ? [EBDG_HEADER_ROW, ...lines] : lines).join('\r\n');
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

export function buildSheetPayload(row: EbDgRow, channel: EbDgChannel): EbDgSheetPayload {
  return {
    action: 'upsertEbDgRow',
    tab: channel,
    recordId: row.Record_ID,
    header: [...EBDG_COLUMN_ORDER],
    values: rowToOrderedValues(row),
    actorEmail: row.Submitted_By
  };
}

/**
 * Posts to an Apps Script Web App without reading the response — the same
 * technique as AppContext's submitViaHiddenForm, and for the same reason: the
 * response is cross-origin and unreadable, but the write itself lands.
 *
 * Must be called synchronously inside a user gesture or the popup is blocked.
 */
export function postRowToAppsScript(url: string, payload: EbDgSheetPayload): void {
  try {
    const popupName = `ebdg_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const popup = window.open('about:blank', popupName, 'width=420,height=280');
    if (!popup) {
      console.error(
        'EB-DG sheet sync popup was blocked. This call must happen directly inside the Submit click, ' +
        'not after an await. The entry is saved locally either way.'
      );
      return;
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.target = popupName;
    form.style.display = 'none';

    const field = document.createElement('input');
    field.type = 'hidden';
    field.name = 'payload';
    field.value = JSON.stringify(payload);
    form.appendChild(field);

    document.body.appendChild(form);
    form.submit();
    form.remove();

    // A cold Apps Script execution needs room; closing mid-navigation aborts it.
    setTimeout(() => {
      try {
        if (!popup.closed) popup.close();
      } catch {
        /* the user may have closed it already */
      }
    }, 6000);
  } catch (err) {
    console.error('EB-DG sheet sync failed to submit:', err);
  }
}

const WEBHOOK_KEY = 'wos_ebdg_appscript_url';

export function getEbDgWebhookUrl(): string {
  try {
    return localStorage.getItem(WEBHOOK_KEY) || '';
  } catch {
    return '';
  }
}

export function setEbDgWebhookUrl(url: string): void {
  try {
    localStorage.setItem(WEBHOOK_KEY, url.trim());
  } catch {
    /* private mode — the local entry still saves, only the sync target is lost */
  }
}

/**
 * Wraps any EbDgRepository so a successful local save is also pushed to the
 * sheet. The local write happens FIRST and decides the result: an unreachable
 * sheet must never cost the POC their entry, and the next submission still
 * carries forward correctly because the local row is already there.
 */
export class SheetSyncingEbDgRepository implements EbDgRepository {
  constructor(
    private readonly inner: EbDgRepository,
    private readonly resolveUrl: () => string = getEbDgWebhookUrl
  ) {}

  getPreviousRow(siteCode: string, beforeDate: string, channel: EbDgChannel) {
    return this.inner.getPreviousRow(siteCode, beforeDate, channel);
  }

  getRowByDate(siteCode: string, date: string, channel: EbDgChannel) {
    return this.inner.getRowByDate(siteCode, date, channel);
  }

  hasLaterRows(siteCode: string, afterDate: string, channel: EbDgChannel) {
    return this.inner.hasLaterRows(siteCode, afterDate, channel);
  }

  listBySite(siteCode: string, channel: EbDgChannel, limit?: number) {
    return this.inner.listBySite(siteCode, channel, limit);
  }

  async submit(row: EbDgRow, channel: EbDgChannel): Promise<SubmitResult> {
    const result = await this.inner.submit(row, channel);
    if (!result.success) return result;

    const url = this.resolveUrl();
    if (!url) {
      return {
        ...result,
        message: `${result.message} Saved on this device — no sheet URL configured yet, so export CSV to load it into ${channel}.`
      };
    }

    postRowToAppsScript(url, buildSheetPayload(row, channel));
    return { ...result, message: `${result.message} Pushed to ${channel}.` };
  }
}
