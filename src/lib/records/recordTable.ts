/**
 * How the Records screen turns any service's entries into a table.
 *
 * Services store entries in different shapes: the Daily Site Report says
 * `site`, generic forms say `warehouseId`, EB-DG says `Site_Code`; dates come
 * as `date`, `Date` or only a timestamp. These helpers read all of them the
 * same way, order the columns (date and site first, the form's own questions
 * in their order, who filed and status last), and label them for people.
 */

import type { FieldDefinition } from '../../types';
import { indiaDay } from '../controlRoom/siteServiceStatus';

export type RecordRow = Record<string, unknown>;

export interface RecordColumn {
  key: string;
  label: string;
  value: (row: RecordRow) => unknown;
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== '';

export const siteOf = (r: RecordRow): string => String(r.site ?? r.warehouseId ?? r.Site_Code ?? '');

export function dayOf(r: RecordRow): string {
  const d = r.date ?? r.Date;
  if (typeof d === 'string' && d) return d.slice(0, 10);
  const stamp = r.timestamp ?? r.Timestamp ?? r.submittedAt;
  return typeof stamp === 'string' ? indiaDay(stamp) : '';
}

const stampOf = (r: RecordRow) => String(r.submittedAt ?? r.timestamp ?? r.Timestamp ?? '');

/** Newest entries first: by day, then by the moment they were filed. */
export const newestFirst = (a: RecordRow, b: RecordRow) =>
  dayOf(b).localeCompare(dayOf(a)) || stampOf(b).localeCompare(stampOf(a));

const LABELS: Record<string, string> = {
  submittedAt: 'Filed at',
  timestamp: 'Filed at',
  Timestamp: 'Filed at',
  remarks: 'Remarks',
  status: 'Status',
};

/** 'ratePerLitre' → 'Rate Per Litre', 'DG1_HSD_Opening' → 'DG1 HSD Opening'. */
export function humanizeKey(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where a row's site, date and bookkeeping live; shown once, or not at all. */
const HANDLED = new Set([
  'date', 'Date', 'site', 'warehouseId', 'Site_Code', 'shift',
  'submittedByName', 'pocName', 'status', 'remarks',
  'id', 'sheetId', 'warehouseCode', 'warehouseName', 'activities', 'dataPayload',
  'submittedBy', 'reviewedBy', 'Record_ID', 'Day',
]);

/** The table's columns for one service's rows and questions. */
export function columnsFor(rows: RecordRow[], fields: FieldDefinition[] = []): RecordColumn[] {
  const any = (key: string) => rows.some((r) => filled(r[key]));
  const columns: RecordColumn[] = [
    { key: 'date', label: 'Date', value: dayOf },
    { key: 'site', label: 'Site', value: siteOf },
  ];
  if (any('shift')) columns.push({ key: 'shift', label: 'Shift', value: (r) => r.shift });

  const taken = new Set(HANDLED);
  for (const f of fields) {
    if (taken.has(f.key)) continue;
    taken.add(f.key);
    columns.push({ key: f.key, label: f.unit ? `${f.label} (${f.unit})` : f.label, value: (r) => r[f.key] });
  }
  // Values saved under names the form no longer lists still show.
  for (const r of rows) {
    for (const [key, v] of Object.entries(r)) {
      if (taken.has(key) || (v !== null && typeof v === 'object')) continue;
      taken.add(key);
      columns.push({ key, label: humanizeKey(key), value: (row) => row[key] });
    }
  }

  const filedBy = any('submittedByName') ? 'submittedByName' : any('pocName') ? 'pocName' : null;
  if (filedBy) columns.push({ key: 'filedBy', label: 'Filed by', value: (r) => r[filedBy] });
  for (const key of ['status', 'remarks']) {
    if (any(key)) columns.push({ key, label: humanizeKey(key), value: (r) => r[key] });
  }
  return columns;
}

export const isStatusColumn = (key: string) => /(^|[_\s])status$|^validation$/i.test(key);

export type StatusTone = 'good' | 'wait' | 'bad';

export function statusTone(value: unknown): StatusTone | null {
  const s = String(value ?? '').toLowerCase();
  if (!s) return null;
  if (/reject|flag|not delivered|overdue|fail|missing/.test(s)) return 'bad';
  if (/pending|partial|processing|ready|due|warning|awaiting/.test(s)) return 'wait';
  if (/approv|verif|complet|deliver|submit|\bok\b|done|clear|active/.test(s)) return 'good';
  return null;
}

export type CellKind = 'empty' | 'bool' | 'number' | 'link' | 'date' | 'text';

const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function describeCell(v: unknown): { kind: CellKind; text: string } {
  if (!filled(v)) return { kind: 'empty', text: '' };
  if (typeof v === 'boolean') return { kind: 'bool', text: v ? 'Yes' : 'No' };
  if (typeof v === 'number') return { kind: 'number', text: String(v) };
  if (typeof v === 'object') return { kind: 'text', text: JSON.stringify(v) };
  const s = String(v);
  if (/^https?:\/\//i.test(s)) return { kind: 'link', text: s };
  if (ISO_STAMP.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return {
        kind: 'date',
        text: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      };
    }
  }
  return { kind: 'text', text: s };
}

/** Sort order for one column: numbers as numbers, text naturally, blanks last. */
export function compareCells(a: unknown, b: unknown): number {
  const aBlank = !filled(a);
  const bBlank = !filled(b);
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  const na = Number(a);
  const nb = Number(b);
  if (typeof a !== 'boolean' && typeof b !== 'boolean' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}
