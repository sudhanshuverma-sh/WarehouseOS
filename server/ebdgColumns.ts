/**
 * The bridge between the 109 sheet headers and the 109 database columns.
 *
 * MASTERDATA.md I5 — "look up columns by header name, never by index" —
 * is the rule this file exists to keep. Nothing here counts positions:
 * a row is turned into SQL by looking up each header's column name, and a
 * result row is turned back by looking up each column's header.
 *
 * Every identifier is double-quoted. Three of the headers (Date, Timestamp,
 * Day) collide with SQL keywords, and `timestamp` followed by a string
 * literal parses as a typed constant rather than a column reference — a
 * change of meaning that does not raise an error. Quoting everything is one
 * rule that cannot be forgotten; quoting three exceptions is three rules
 * that can.
 */

import { EBDG_COLUMN_ORDER } from '../src/types/ebdg';
import type { EbDgColumn, EbDgRow } from '../src/types/ebdg';
import type { Queryable } from './db';

/** header name -> database column. Mechanical: lower-case. */
export const COLUMN_FOR_HEADER: ReadonlyMap<string, string> = new Map(
  EBDG_COLUMN_ORDER.map((h) => [h, h.toLowerCase()]),
);

/** database column -> header name. The inverse, for reads. */
export const HEADER_FOR_COLUMN: ReadonlyMap<string, EbDgColumn> = new Map(
  EBDG_COLUMN_ORDER.map((h) => [h.toLowerCase(), h]),
);

/**
 * Quotes an identifier for Postgres. Embedded double quotes are doubled,
 * per the SQL standard.
 *
 * The guard is not decoration: an identifier cannot be parameterised, so
 * it is the one place in this file where a value becomes executable SQL.
 * Every name reaching it comes from EBDG_COLUMN_ORDER — a frozen literal —
 * but a future caller may not, and a silent injection point is worth more
 * than the microsecond this costs.
 */
export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to quote unexpected identifier: ${JSON.stringify(name)}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export interface UpsertPlan {
  text: string;
  values: unknown[];
}

/**
 * Builds the insert-or-update for one daily row.
 *
 * Upsert rather than insert because of the spec's duplicate-entry case: a
 * POC who already filed today and corrects a reading must update that row,
 * never create a second one for the same site and date.
 *
 * A blank ('') becomes NULL, not 0. "This DG was not run" and "this DG ran
 * for zero hours" are different facts, and collapsing them is exactly the
 * bug that once booked a standby generator's whole tank as consumed.
 */
export function buildUpsert(row: Partial<EbDgRow>): UpsertPlan {
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (const header of EBDG_COLUMN_ORDER) {
    if (!(header in row)) continue;
    const column = COLUMN_FOR_HEADER.get(header);
    if (!column) throw new Error(`No column mapped for header ${header}`);

    const raw = (row as Record<string, unknown>)[header];
    columns.push(quoteIdent(column));
    placeholders.push(`$${values.length + 1}`);
    values.push(raw === '' ? null : raw);
  }

  if (columns.length === 0) throw new Error('Nothing to write: no known headers in the row.');
  if (!('Record_ID' in row)) throw new Error('Record_ID is required — it is the upsert key.');

  // record_id is deterministic (EBDG-{site}-{yyyymmdd}), so conflicting on
  // it catches the same-site-same-day case without a second lookup.
  const updates = columns
    .filter((c) => c !== quoteIdent('record_id'))
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  return {
    text:
      `insert into ebdg_daily (${columns.join(', ')}) values (${placeholders.join(', ')}) ` +
      `on conflict (record_id) do update set ${updates} returning *`,
    values,
  };
}

/** A database row (snake_case columns) back into a header-keyed row. */
export function rowFromDb(dbRow: Record<string, unknown>): Partial<EbDgRow> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(dbRow)) {
    const header = HEADER_FOR_COLUMN.get(column);
    if (!header) continue;   // a column we do not model is not our business
    out[header] = value === null ? '' : value;
  }
  return out as Partial<EbDgRow>;
}

/** The select list, header order preserved, every name quoted. */
export function selectList(): string {
  return EBDG_COLUMN_ORDER.map((h) => quoteIdent(COLUMN_FOR_HEADER.get(h)!)).join(', ');
}

/**
 * Confirms at startup that the database agrees with EBDG_COLUMN_ORDER.
 *
 * A schema that has drifted — a renamed column, one added in the middle —
 * would otherwise surface as numbers landing in the wrong fields, which
 * looks like a calculation bug and is very hard to trace back. Better to
 * refuse to start.
 */
export async function assertHeaderMap(client: Queryable): Promise<void> {
  const { rows } = await client.query<{ header_name: string; column_name: string }>(
    'select header_name, column_name from v_ebdg_header_map order by ordinal',
  );

  if (rows.length !== EBDG_COLUMN_ORDER.length) {
    throw new Error(
      `EB-DG schema drift: database has ${rows.length} columns, the app expects ${EBDG_COLUMN_ORDER.length}. Re-run db/ebdg.sql.`,
    );
  }

  const mismatched = rows
    .map((r, i) => ({ i, db: r.header_name, app: EBDG_COLUMN_ORDER[i] }))
    .filter((m) => m.db !== m.app);

  if (mismatched.length > 0) {
    const shown = mismatched
      .slice(0, 5)
      .map((m) => `  position ${m.i + 1}: database '${m.db}', app '${m.app}'`)
      .join('\n');
    throw new Error(`EB-DG schema drift in ${mismatched.length} column(s):\n${shown}`);
  }
}
