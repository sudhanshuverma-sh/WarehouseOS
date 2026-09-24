/**
 * Master Data edits made in the app that the Google Sheet does not show yet.
 *
 * In demo mode Master Data is read from the Google Sheet, and every Sync (or
 * Paste) replaces the rows with what the sheet says. An edit made here — a
 * service switched off, a site renamed — reaches the sheet only through the
 * Apps Script bridge, if one is linked at all, and the bridge cannot report
 * back. Without this, the next sync quietly put back the old value and the
 * edit looked like it had never worked.
 *
 * So each edit is remembered — only the fields it changed — and laid over
 * the sheet's rows after every sync, until the sheet's row says the same
 * thing (the write landed), when it is forgotten.
 */

export interface PendingEdit {
  /** Only the fields this edit changed (every field for a new row). */
  fields: Record<string, unknown>;
  /** A row made in the app: kept even while the sheet does not have it. */
  created: boolean;
  at: string;
}

export type MasterTab = 'Site_Master' | 'Service_Registry';
export type PendingEdits = Record<MasterTab, Record<string, PendingEdit>>;

export const NO_PENDING_EDITS: PendingEdits = { Site_Master: {}, Service_Registry: {} };

/** Bookkeeping fields: a sheet row can differ on these and still hold the edit. */
const IGNORED = new Set(['Last_Updated_By', 'Last_Updated_At']);

const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/** The fields of `after` that differ from `before`, bookkeeping aside. */
export function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (IGNORED.has(k)) continue;
    if (!before || !same(before[k], v)) out[k] = v;
  }
  return out;
}

/** Remember an edit, merged with any earlier one to the same row that has not landed. */
export function recordPendingEdit(
  pending: PendingEdits,
  tab: MasterTab,
  key: string,
  fields: Record<string, unknown>,
  created: boolean,
  at = new Date().toISOString(),
): PendingEdits {
  const earlier = pending[tab][key];
  return {
    ...pending,
    [tab]: {
      ...pending[tab],
      [key]: { fields: { ...earlier?.fields, ...fields }, created: created || earlier?.created === true, at },
    },
  };
}

/**
 * The sheet's rows with the app's edits laid over them, and the edits still
 * waiting (the ones whose rows the sheet does not match yet).
 */
export function applyPendingEdits<Row extends object>(
  rows: Row[],
  pending: Record<string, PendingEdit>,
  keyField: keyof Row & string,
): { rows: Row[]; remaining: Record<string, PendingEdit> } {
  const remaining: Record<string, PendingEdit> = {};
  const byKey = new Map(rows.map((r) => [String((r as Record<string, unknown>)[keyField]).trim(), r]));
  const out = [...rows];

  for (const [key, edit] of Object.entries(pending)) {
    const sheetRow = byKey.get(key) as Record<string, unknown> | undefined;
    if (sheetRow) {
      const landed = Object.entries(edit.fields).every(([k, v]) => IGNORED.has(k) || same(sheetRow[k], v));
      if (landed) continue; // the sheet says the same thing now
      const i = out.indexOf(sheetRow as Row);
      out[i] = { ...sheetRow, ...edit.fields } as Row;
    } else if (edit.created) {
      out.push({ ...edit.fields, [keyField]: key } as Row);
    } else {
      // Edited here, then removed from the sheet: the sheet decides.
      continue;
    }
    remaining[key] = edit;
  }
  return { rows: out, remaining };
}
