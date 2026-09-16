/**
 * Where a table's columns sit, and which of them are shown.
 *
 * A layout is only the difference from the table's own column list: an
 * order, and the keys someone hid. A column added to a form later still
 * appears (it is simply not in `order` yet), and a column that disappears
 * takes its entry with it, so a saved layout never breaks a table.
 *
 * Layouts are per table and per person, kept in localStorage: they are a
 * viewing preference, not data, and nobody else should inherit them.
 */

export interface ColumnLayout {
  /** Column keys in the order someone arranged them. Empty means the table's own order. */
  order: string[];
  /** Column keys someone hid. */
  hidden: string[];
}

export const EMPTY_LAYOUT: ColumnLayout = { order: [], hidden: [] };

export const isCustomised = (layout: ColumnLayout) => layout.order.length > 0 || layout.hidden.length > 0;

/** The order to use as a starting point: what was arranged, else the table's own. */
const basis = (order: string[], allKeys: string[]): string[] => {
  const known = order.filter((k) => allKeys.includes(k));
  return [...known, ...allKeys.filter((k) => !known.includes(k))];
};

/** Columns in the saved order, without the hidden ones. */
export function arrange<T extends { key: string }>(columns: T[], layout: ColumnLayout): T[] {
  const hidden = new Set(layout.hidden);
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return basis(layout.order, columns.map((c) => c.key))
    .filter((k) => !hidden.has(k))
    .map((k) => byKey.get(k))
    .filter((c): c is T => Boolean(c));
}

/** One step left or right. Moving past either end does nothing. */
export function moveKey(order: string[], allKeys: string[], key: string, step: -1 | 1): string[] {
  const next = basis(order, allKeys);
  const from = next.indexOf(key);
  const to = from + step;
  if (from === -1 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Drag `dragged` onto `target`: it lands where the target was. */
export function dropKey(order: string[], allKeys: string[], dragged: string, target: string): string[] {
  const next = basis(order, allKeys);
  const from = next.indexOf(dragged);
  const to = next.indexOf(target);
  if (from === -1 || to === -1 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}

/** Hide or show one column. The last visible column cannot be hidden. */
export function toggleHidden(layout: ColumnLayout, key: string, allKeys: string[]): ColumnLayout {
  const hidden = new Set(layout.hidden);
  if (hidden.has(key)) {
    hidden.delete(key);
  } else {
    if (allKeys.filter((k) => !hidden.has(k)).length <= 1) return layout;
    hidden.add(key);
  }
  return { ...layout, hidden: allKeys.filter((k) => hidden.has(k)) };
}

// ---------------------------------------------------------------------------
// Remembering it
//
// Storage can be unavailable (a private window, blocked site data) and a
// stored value can be anything, so every read is guarded and anything
// unexpected is treated as "no layout saved".
// ---------------------------------------------------------------------------

const KEY = (table: string) => `warehouse_portal_columns_${table}`;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function loadLayout(table: string): ColumnLayout {
  try {
    const raw = localStorage.getItem(KEY(table));
    if (!raw) return EMPTY_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
    return { order: asStrings(parsed?.order), hidden: asStrings(parsed?.hidden) };
  } catch {
    return EMPTY_LAYOUT;
  }
}

export function saveLayout(table: string, layout: ColumnLayout): void {
  try {
    if (isCustomised(layout)) localStorage.setItem(KEY(table), JSON.stringify(layout));
    else localStorage.removeItem(KEY(table));
  } catch {
    // A remembered column order is not worth failing a click over.
  }
}
