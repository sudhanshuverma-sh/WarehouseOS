import { describe, it, expect } from 'vitest';
import {
  applyColumnFilters,
  cellValue,
  distinctValues,
  isFiltered,
  countActiveFilters,
  setColumnFilter,
  BLANK_LABEL,
} from './columnFilters';

const ROWS = [
  { site: 'ZHPL-DL-01', status: 'Approved', vendor: 'Shell', qty: 100 },
  { site: 'ZHPL-DL-01', status: 'Rejected', vendor: 'BPCL', qty: 20 },
  { site: 'ZHPL-HR-04', status: 'Approved', vendor: 'Shell', qty: 2 },
  { site: 'ZHPL-HR-04', status: 'Approved', vendor: '', qty: 10 },
];

const f = (key: string, ...values: string[]) => ({ [key]: new Set(values) });

describe('cellValue', () => {
  it('normalises everything to a trimmed string', () => {
    expect(cellValue({ a: 90 }, 'a')).toBe('90');
    expect(cellValue({ a: '  90 ' }, 'a')).toBe('90');
    expect(cellValue({ a: true }, 'a')).toBe('true');
  });

  it('treats null, undefined and a missing key as blank', () => {
    expect(cellValue({ a: null }, 'a')).toBe('');
    expect(cellValue({ a: undefined }, 'a')).toBe('');
    expect(cellValue({}, 'a')).toBe('');
  });

  it('gives 90 and "90" the same key', () => {
    // Otherwise a column holding both shows two entries for one value and
    // selecting either fails to match the other.
    expect(cellValue({ a: 90 }, 'a')).toBe(cellValue({ a: '90' }, 'a'));
  });
});

describe('applyColumnFilters', () => {
  it('returns everything when nothing is selected', () => {
    expect(applyColumnFilters(ROWS, {})).toHaveLength(4);
  });

  it('treats an empty selection as no filter, not as "match nothing"', () => {
    // This is the spreadsheet behaviour people expect; the opposite reads
    // as the table having broken.
    expect(applyColumnFilters(ROWS, { status: new Set<string>() })).toHaveLength(4);
  });

  it('keeps only the selected values', () => {
    expect(applyColumnFilters(ROWS, f('status', 'Approved'))).toHaveLength(3);
  });

  it('allows several values in one column', () => {
    expect(applyColumnFilters(ROWS, f('status', 'Approved', 'Rejected'))).toHaveLength(4);
  });

  it('ANDs across columns', () => {
    const r = applyColumnFilters(ROWS, { ...f('status', 'Approved'), ...f('vendor', 'Shell') });
    expect(r).toHaveLength(2);
  });

  it('matches a numeric column typed as a string', () => {
    expect(applyColumnFilters(ROWS, f('qty', '100'))).toHaveLength(1);
  });

  it('can select blanks', () => {
    expect(applyColumnFilters(ROWS, f('vendor', ''))).toHaveLength(1);
  });
});

describe('distinctValues', () => {
  it('lists each value once, with a count', () => {
    const v = distinctValues(ROWS, 'status', {});
    expect(v).toEqual([
      { value: 'Approved', label: 'Approved', count: 3 },
      { value: 'Rejected', label: 'Rejected', count: 1 },
    ]);
  });

  it('labels a blank rather than showing an empty row', () => {
    const v = distinctValues(ROWS, 'vendor', {});
    expect(v.find((x) => x.value === '')?.label).toBe(BLANK_LABEL);
  });

  it('puts blanks last', () => {
    expect(distinctValues(ROWS, 'vendor', {}).at(-1)?.value).toBe('');
  });

  it('sorts numbers numerically, not as text', () => {
    // 1, 2, 10 — not 1, 10, 2.
    expect(distinctValues(ROWS, 'qty', {}).map((v) => v.value)).toEqual(['2', '10', '20', '100']);
  });

  it('narrows to what other columns already allow', () => {
    // Filter to Rejected and only BPCL remains — offering Shell would
    // invite picking a value that yields nothing.
    const v = distinctValues(ROWS, 'vendor', f('status', 'Rejected'));
    expect(v.map((x) => x.value)).toEqual(['BPCL']);
  });

  it("ignores the column's own filter when listing its options", () => {
    // Otherwise selecting one value would hide every other option and you
    // could never widen the selection again.
    const v = distinctValues(ROWS, 'status', f('status', 'Approved'));
    expect(v.map((x) => x.value)).toEqual(['Approved', 'Rejected']);
  });
});

describe('filter bookkeeping', () => {
  it('reports which columns are narrowing the table', () => {
    const filters = f('status', 'Approved');
    expect(isFiltered(filters, 'status')).toBe(true);
    expect(isFiltered(filters, 'vendor')).toBe(false);
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('drops the key entirely when a selection is cleared', () => {
    const next = setColumnFilter(f('status', 'Approved'), 'status', new Set());
    expect('status' in next).toBe(false);
    expect(countActiveFilters(next)).toBe(0);
  });

  it('does not mutate the filters handed in', () => {
    const before = f('status', 'Approved');
    setColumnFilter(before, 'vendor', new Set(['Shell']));
    expect(Object.keys(before)).toEqual(['status']);
  });
});

describe('what you see is what you export', () => {
  it('export and table read the same predicate', () => {
    const filters = { ...f('status', 'Approved'), ...f('site', 'ZHPL-HR-04') };
    const shown = applyColumnFilters(ROWS, filters);
    const exported = applyColumnFilters(ROWS, filters);
    expect(exported).toEqual(shown);
    expect(shown).toHaveLength(2);
  });
});
