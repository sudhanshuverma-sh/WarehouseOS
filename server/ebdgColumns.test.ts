import { describe, it, expect } from 'vitest';
import { EBDG_COLUMN_ORDER } from '../src/types/ebdg';
import {
  quoteIdent,
  buildUpsert,
  rowFromDb,
  selectList,
  assertHeaderMap,
  COLUMN_FOR_HEADER,
  HEADER_FOR_COLUMN,
} from './ebdgColumns';
import type { Queryable } from './db';

/** A Queryable that returns whatever rows it is handed. */
const stubClient = (rows: unknown[]): Queryable => ({ query: async () => ({ rows }) as any });

describe('header <-> column mapping', () => {
  it('covers all 109 columns in both directions', () => {
    expect(EBDG_COLUMN_ORDER.length).toBe(109);
    expect(COLUMN_FOR_HEADER.size).toBe(109);
    expect(HEADER_FOR_COLUMN.size).toBe(109);
  });

  it('round-trips every header', () => {
    for (const h of EBDG_COLUMN_ORDER) {
      expect(HEADER_FOR_COLUMN.get(COLUMN_FOR_HEADER.get(h)!)).toBe(h);
    }
  });
});

describe('quoteIdent', () => {
  it('quotes the three keyword collisions', () => {
    // `timestamp` followed by a string literal parses as a typed constant.
    // Quoting is what keeps it a column reference.
    expect(quoteIdent('date')).toBe('"date"');
    expect(quoteIdent('timestamp')).toBe('"timestamp"');
    expect(quoteIdent('day')).toBe('"day"');
  });

  it('refuses anything that is not a plain identifier', () => {
    expect(() => quoteIdent('date; drop table ebdg_daily')).toThrow();
    expect(() => quoteIdent('a"b')).toThrow();
    expect(() => quoteIdent('')).toThrow();
  });
});

describe('selectList', () => {
  it('quotes every one of the 109 names', () => {
    const list = selectList();
    expect(list.split(', ')).toHaveLength(109);
    expect(list.split(', ').every((c) => c.startsWith('"') && c.endsWith('"'))).toBe(true);
  });

  it('includes the keyword columns quoted', () => {
    expect(selectList()).toContain('"timestamp"');
  });
});

describe('buildUpsert', () => {
  const base = { Record_ID: 'EBDG-ZHPL-DL-01-20260903', Site_Code: 'ZHPL-DL-01', Date: '2026-09-03' };

  it('parameterises values rather than inlining them', () => {
    const plan = buildUpsert(base);
    // Values follow EBDG_COLUMN_ORDER, not the order of the object's keys —
    // so Date (position 2) precedes Site_Code (position 5) regardless of
    // how the caller assembled the row.
    expect(plan.values).toEqual(['EBDG-ZHPL-DL-01-20260903', '2026-09-03', 'ZHPL-DL-01']);
    expect(plan.text).toContain('$1');
    expect(plan.text).not.toContain("'ZHPL-DL-01'");
  });

  /** Reads back the value bound to a given column in a built plan. */
  const boundValue = (plan: { text: string; values: unknown[] }, column: string) => {
    const cols = plan.text
      .slice(plan.text.indexOf('(') + 1, plan.text.indexOf(')'))
      .split(', ')
      .map((c) => c.replace(/"/g, ''));
    const i = cols.indexOf(column);
    expect(i).toBeGreaterThanOrEqual(0);
    return plan.values[i];
  };

  it('writes blank as NULL and a real zero as 0', () => {
    // The distinction the whole engine rests on: a DG nobody ran has no
    // reading, and 0 would book its entire tank as consumed. A DG that ran
    // for zero hours genuinely is 0 and must survive as one.
    const plan = buildUpsert({ ...base, DG2_HSD_Closing: '' as any, DG2_Run_Hrs: 0 });
    expect(boundValue(plan, 'dg2_hsd_closing')).toBeNull();
    expect(boundValue(plan, 'dg2_run_hrs')).toBe(0);
  });

  it('upserts on Record_ID so a correction never makes a second row', () => {
    const plan = buildUpsert(base);
    expect(plan.text).toContain('on conflict (record_id) do update');
  });

  it('never tries to overwrite the conflict key itself', () => {
    expect(buildUpsert(base).text).not.toContain('"record_id" = excluded."record_id"');
  });

  it('quotes keyword columns in the insert list', () => {
    expect(buildUpsert(base).text).toContain('"date"');
  });

  it('ignores keys that are not real headers', () => {
    const plan = buildUpsert({ ...base, NotAColumn: 'x' } as any);
    expect(plan.text).not.toContain('notacolumn');
    expect(plan.values).toHaveLength(3);
  });

  it('requires Record_ID', () => {
    expect(() => buildUpsert({ Site_Code: 'ZHPL-DL-01' } as any)).toThrow(/Record_ID/);
  });

  it('refuses an empty row rather than emitting invalid SQL', () => {
    expect(() => buildUpsert({} as any)).toThrow();
  });

  it('handles a full 109-column row', () => {
    const full: Record<string, unknown> = {};
    for (const h of EBDG_COLUMN_ORDER) full[h] = h === 'Record_ID' ? 'EBDG-X-1' : '';
    const plan = buildUpsert(full as any);
    expect(plan.values).toHaveLength(109);
    expect(plan.values.filter((v) => v === null)).toHaveLength(108);
  });
});

describe('rowFromDb', () => {
  it('maps columns back to headers and NULL back to blank', () => {
    const out = rowFromDb({ record_id: 'EBDG-X-1', dg1_hsd_closing: null, dg1_run_hrs: 4.5 });
    expect(out.Record_ID).toBe('EBDG-X-1');
    expect(out.DG1_HSD_Closing).toBe('');
    expect(out.DG1_Run_Hrs).toBe(4.5);
  });

  it('preserves a real zero', () => {
    // Round-tripping must not turn 0 into '' — that would undo the
    // distinction buildUpsert works to keep.
    expect(rowFromDb({ dg1_run_hrs: 0 }).DG1_Run_Hrs).toBe(0);
  });

  it('drops columns the app does not model', () => {
    expect(rowFromDb({ record_id: 'X', internal_seq: 12 })).not.toHaveProperty('internal_seq');
  });
});

describe('assertHeaderMap', () => {
  const asMap = (headers: readonly string[]) =>
    headers.map((h) => ({ header_name: h, column_name: h.toLowerCase() }));

  it('passes when the database agrees', async () => {
    await expect(assertHeaderMap(stubClient(asMap(EBDG_COLUMN_ORDER)))).resolves.toBeUndefined();
  });

  it('fails on a column count mismatch', async () => {
    await expect(assertHeaderMap(stubClient(asMap(EBDG_COLUMN_ORDER.slice(0, 108))))).rejects.toThrow(/108/);
  });

  it('fails when a column moved, naming the position', async () => {
    const shuffled = [...EBDG_COLUMN_ORDER];
    [shuffled[10], shuffled[11]] = [shuffled[11], shuffled[10]];
    await expect(assertHeaderMap(stubClient(asMap(shuffled)))).rejects.toThrow(/position 11/);
  });

  it('fails when a column was renamed', async () => {
    const renamed = EBDG_COLUMN_ORDER.map((h) => (h === 'Grid_MF' ? 'Grid_Multiplier' : h));
    await expect(assertHeaderMap(stubClient(asMap(renamed)))).rejects.toThrow(/drift/i);
  });
});
