/**
 * Excel-style per-column filtering.
 *
 * The model is the one people already know from a spreadsheet: each column
 * holds a set of values that are allowed through, and a row survives only
 * if it satisfies every filtered column. Nothing selected for a column
 * means that column is not filtering at all — which is different from
 * "nothing selected, so nothing passes", and is the behaviour a spreadsheet
 * has trained everyone to expect.
 *
 * Kept pure and separate from the table so the export can reuse exactly
 * the same predicate. What you see filtered is what gets exported, because
 * both call this.
 */

/** column key -> the set of values kept. Absent or empty = no filter. */
export type ColumnFilters = Record<string, Set<string>>;

/**
 * How a cell becomes a filter value.
 *
 * Everything is compared as a trimmed string. A column can hold 90 and
 * '90' in different rows — the same value to a person reading the table,
 * two different keys to a Set — so normalising once here avoids a filter
 * that visibly fails to match its own listed value.
 */
export function cellValue(row: Record<string, unknown>, key: string): string {
  const raw = row?.[key];
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw).trim();
}

/** The label shown for a blank cell in the filter list. */
export const BLANK_LABEL = '(Blank)';

/**
 * Distinct values in a column, for the filter dropdown.
 *
 * Counted against the rows left by OTHER columns' filters, the way a
 * spreadsheet does it: once you filter Status to Approved, the Vendor list
 * should show the vendors that actually appear in approved rows. Showing
 * every vendor invites picking one that yields nothing.
 */
export function distinctValues(
  rows: Record<string, unknown>[],
  key: string,
  filters: ColumnFilters,
): { value: string; label: string; count: number }[] {
  const others: ColumnFilters = { ...filters };
  delete others[key];

  const visible = applyColumnFilters(rows, others);
  const counts = new Map<string, number>();

  for (const row of visible) {
    const v = cellValue(row, key);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value === '' ? BLANK_LABEL : value, count }))
    .sort((a, b) => {
      // Blanks last: they are rarely what someone is looking for.
      if (a.value === '') return 1;
      if (b.value === '') return -1;
      // Numeric columns should read 1, 2, 10 — not 1, 10, 2.
      const na = Number(a.value);
      const nb = Number(b.value);
      if (Number.isFinite(na) && Number.isFinite(nb) && a.value !== '' && b.value !== '') return na - nb;
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
}

/** Rows that satisfy every active column filter. */
export function applyColumnFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: ColumnFilters,
): T[] {
  const active = Object.entries(filters).filter(([, set]) => set && set.size > 0);
  if (active.length === 0) return rows;

  return rows.filter((row) => active.every(([key, set]) => set.has(cellValue(row, key))));
}

/** True when this column is narrowing the table. Drives the header icon. */
export function isFiltered(filters: ColumnFilters, key: string): boolean {
  return (filters[key]?.size ?? 0) > 0;
}

export function countActiveFilters(filters: ColumnFilters): number {
  return Object.values(filters).filter((s) => s && s.size > 0).length;
}

/** Replaces one column's selection, dropping the key entirely when cleared. */
export function setColumnFilter(
  filters: ColumnFilters,
  key: string,
  values: Set<string>,
): ColumnFilters {
  const next = { ...filters };
  // Delete rather than store an empty Set, so countActiveFilters and
  // isFiltered stay honest without every caller checking size.
  if (values.size === 0) delete next[key];
  else next[key] = values;
  return next;
}

export function clearAllFilters(): ColumnFilters {
  return {};
}
