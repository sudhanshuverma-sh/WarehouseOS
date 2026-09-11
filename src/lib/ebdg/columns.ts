/**
 * Column-order enforcement for the EB_DG_B2B / EB_DG_B2C sheets.
 *
 * MASTERDATA.md I5: "Look up columns by header name, never by index." An
 * inserted column in the destination sheet must fail loudly here, not
 * silently shift every value one cell to the right.
 */

import { EBDG_COLUMN_ORDER, EbDgColumn, EbDgRow } from '../../types/ebdg';

/**
 * Converts a row object into an array in EBDG_COLUMN_ORDER order, resolving
 * every cell BY HEADER NAME. Throws if the row is missing a column the sheet
 * expects, or carries a key the sheet doesn't — either one means the row
 * shape and the sheet have drifted apart, and writing anyway would corrupt
 * data silently.
 */
export function rowToOrderedValues(row: EbDgRow): Array<string | number> {
  const rowKeys = new Set(Object.keys(row));
  const missing = EBDG_COLUMN_ORDER.filter(col => !rowKeys.has(col));
  if (missing.length > 0) {
    throw new Error(`EB-DG row is missing required column(s): ${missing.join(', ')}`);
  }
  const extra = [...rowKeys].filter(k => !(EBDG_COLUMN_ORDER as readonly string[]).includes(k));
  if (extra.length > 0) {
    throw new Error(`EB-DG row has unexpected column(s) not in the sheet: ${extra.join(', ')}. Update EBDG_COLUMN_ORDER first.`);
  }
  return EBDG_COLUMN_ORDER.map(col => {
    const value = (row as unknown as Record<EbDgColumn, string | number>)[col];
    return value === undefined || value === null ? '' : value;
  });
}

/**
 * Reverses rowToOrderedValues — given a header row read back from the sheet
 * (in whatever order it is actually in today) and one data row, builds a
 * plain object keyed by header name. Used when reading existing rows back
 * (e.g. getPreviousRow), so a reordered sheet still maps correctly.
 */
export function valuesToRowByHeader(headers: string[], values: Array<string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  headers.forEach((header, i) => {
    if (!header) return;
    out[header] = values[i] ?? '';
  });
  return out;
}

/** Which of the two tabs a site's channel routes to. */
export function sheetForChannel(channel: 'B2B' | 'B2C' | 'BOTH'): 'EB_DG_B2B' | 'EB_DG_B2C' {
  // 'BOTH' has no site today (MASTERDATA.md §3), but if it ever appears,
  // default to B2B rather than silently dropping the submission.
  return channel === 'B2C' ? 'EB_DG_B2C' : 'EB_DG_B2B';
}

export { EBDG_COLUMN_ORDER };
