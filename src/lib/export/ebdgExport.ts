/**
 * EB-DG export: the complete sheet header, all 109 columns, in order.
 *
 * Generated from EBDG_COLUMN_ORDER rather than listed by hand, so the
 * export cannot drift from the sheet contract. Adding a column to the
 * contract adds it here; there is no second list to remember to update.
 */

import { EBDG_COLUMN_ORDER } from '../../types/ebdg';
import type { EbDgRow } from '../../types/ebdg';
import type { ExportColumn, ExportSpec } from './exporter';

/**
 * Columns that hold text even though they look numeric, or that must not
 * be reinterpreted by Excel.
 *
 * Record_ID is the important one: `EBDG-ZHPL-DL-01-20260903` survives, but
 * a bare date-like or slash-separated id is exactly what Excel silently
 * converts. Day and the Yes/No and status columns are plainly text.
 */
const TEXT_COLUMNS = new Set<string>([
  'Record_ID',
  'Date',
  'Timestamp',
  'Day',
  'Site_Code',
  'WH_Code',
  'Zone',
  'Channel',
  'Sheet_Target',
  'Remark',
  'Submitted_By',
]);

const isTextual = (header: string) =>
  TEXT_COLUMNS.has(header) ||
  header.endsWith('_Date') ||          // B-check dates
  header.endsWith('_Status') ||        // OK / DUE SOON / DUE NOW
  header.endsWith('_Done_Today');      // Yes / No

export const EBDG_EXPORT: ExportSpec<EbDgRow> = {
  label: 'EB-DG daily readings',
  serviceCode: 'EB_DG',
  dateOf: (r) => r.Date,
  siteOf: (r) => r.Site_Code,
  columns: EBDG_COLUMN_ORDER.map(
    (header): ExportColumn<EbDgRow> => ({
      header,
      // Resolved by header name, never by index (MASTERDATA.md I5).
      value: (row) => {
        const v = (row as unknown as Record<string, unknown>)[header];
        return v === null || v === undefined ? '' : (v as string | number);
      },
      // A reading left blank stays blank through to the workbook. Writing
      // 0 for a DG nobody ran would book its whole tank as consumed —
      // the same mistake the calculation engine exists to avoid.
      numeric: !isTextual(header),
    }),
  ),
};
