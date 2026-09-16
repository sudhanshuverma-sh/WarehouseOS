import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '../../types';
import { columnsFor, compareCells, dayOf, describeCell, humanizeKey, isStatusColumn, newestFirst, siteOf, statusTone, withUnit } from './recordTable';

describe('reading any service’s rows', () => {
  it('finds the site and day whatever the service calls them', () => {
    expect(siteOf({ warehouseId: 'S1' })).toBe('S1');
    expect(siteOf({ site: 'S2' })).toBe('S2');
    expect(siteOf({ Site_Code: 'S3' })).toBe('S3');
    expect(dayOf({ date: '2026-09-14' })).toBe('2026-09-14');
    expect(dayOf({ Date: '2026-09-13' })).toBe('2026-09-13');
    // 20:00 UTC is already the next day in India.
    expect(dayOf({ timestamp: '2026-09-14T20:00:00Z' })).toBe('2026-09-15');
  });

  it('orders newest first', () => {
    const rows = [
      { date: '2026-09-14', submittedAt: '2026-09-14T04:00:00Z' },
      { date: '2026-09-15', submittedAt: '2026-09-15T03:00:00Z' },
      { date: '2026-09-14', submittedAt: '2026-09-14T09:00:00Z' },
    ];
    expect([...rows].sort(newestFirst).map((r) => r.submittedAt)).toEqual([
      '2026-09-15T03:00:00Z',
      '2026-09-14T09:00:00Z',
      '2026-09-14T04:00:00Z',
    ]);
  });
});

describe('columnsFor', () => {
  const fields: FieldDefinition[] = [{ key: 'reading', label: 'Reading', type: 'number', required: true, unit: 'V' }];

  it('puts date and site first, the questions in order, extras, then who filed and status', () => {
    const rows = [
      { id: '1', sheetId: 'X', date: '2026-09-15', warehouseId: 'S1', shift: 'MORNING', reading: 4, extra: 'x', submittedByName: 'Asha', status: 'Submitted', data: {} },
    ];
    const columns = columnsFor(rows, fields);
    expect(columns.map((c) => c.key)).toEqual(['date', 'site', 'shift', 'reading', 'extra', 'filedBy', 'status']);
    expect(columns.map((c) => c.label)).toEqual(['Date', 'Site', 'Shift', 'Reading (V)', 'Extra', 'Filed by', 'Status']);
    expect(columns.map((c) => c.value(rows[0]))).toEqual(['2026-09-15', 'S1', 'MORNING', 4, 'x', 'Asha', 'Submitted']);
  });

  it('shows the form’s questions before anything is filed', () => {
    expect(columnsFor([], fields).map((c) => c.key)).toEqual(['date', 'site', 'reading']);
  });

  it('does not repeat a unit the question already names', () => {
    expect(withUnit('UPS Availability (%)', '%')).toBe('UPS Availability (%)');
    expect(withUnit('Chiller temp', '°C')).toBe('Chiller temp (°C)');
    expect(withUnit('Remarks')).toBe('Remarks');
  });

  it('labels keys for people', () => {
    expect(humanizeKey('DG1_HSD_Opening')).toBe('DG1 HSD Opening');
    expect(humanizeKey('ratePerLitre')).toBe('Rate Per Litre');
    expect(humanizeKey('submittedAt')).toBe('Filed at');
  });
});

describe('cells', () => {
  it('knows status columns and their tone', () => {
    expect(isStatusColumn('Status')).toBe(true);
    expect(isStatusColumn('DG1_B_Check_Status')).toBe(true);
    expect(isStatusColumn('statusNote')).toBe(false);
    expect(statusTone('Rejected')).toBe('bad');
    expect(statusTone('Not Delivered')).toBe('bad');
    expect(statusTone('Pending Admin Approval')).toBe('wait');
    expect(statusTone('DUE NOW')).toBe('wait');
    expect(statusTone('Delivery Completed')).toBe('good');
    expect(statusTone('Something else')).toBeNull();
  });

  it('describes values by kind', () => {
    expect(describeCell('')).toEqual({ kind: 'empty', text: '' });
    expect(describeCell(true)).toEqual({ kind: 'bool', text: 'Yes' });
    expect(describeCell(12.5)).toEqual({ kind: 'number', text: '12.5' });
    expect(describeCell('https://drive.google.com/file/d/x').kind).toBe('link');
    expect(describeCell('2026-09-15T05:30:00Z').kind).toBe('date');
    expect(describeCell('Good')).toEqual({ kind: 'text', text: 'Good' });
  });

  it('sorts numbers as numbers and blanks last', () => {
    expect(compareCells('10', '9')).toBeGreaterThan(0);
    expect(compareCells('', 'a')).toBe(1);
    expect(compareCells('a', undefined)).toBe(-1);
    expect(compareCells('Item 2', 'Item 10')).toBeLessThan(0);
  });
});
