import { describe, it, expect } from 'vitest';
import {
  toSheetName,
  toSheetRows,
  buildXlsxBlob,
  type ExportSpec,
  type XlsxWriter,
} from './exporter';

interface Row {
  id: string;
  litres: number | '';
  note: string;
}

const SPEC: ExportSpec<Row> = {
  label: 'Test',
  serviceCode: 'EB_DG',
  dateOf: () => undefined,
  siteOf: () => undefined,
  columns: [
    { header: 'Record_ID', value: (r) => r.id },
    { header: 'Litres', value: (r) => r.litres, numeric: true },
    { header: 'Note', value: (r) => r.note },
  ],
};

describe('toSheetName', () => {
  it('leaves an ordinary code alone', () => {
    expect(toSheetName('EB_DG')).toBe('EB_DG');
    expect(toSheetName('OPS_03_DG')).toBe('OPS_03_DG');
  });

  it('strips every character Excel rejects', () => {
    // Excel refuses [ ] / \ : * ? and the library throws rather than
    // trimming — which fails the export with the same symptom as the Blob
    // bug, so it is worth degrading gracefully instead.
    for (const bad of ['[', ']', '/', '\\', ':', '*', '?']) {
      expect(toSheetName(`AB${bad}CD`)).toBe('AB CD');
    }
  });

  it('caps at 31 characters', () => {
    expect(toSheetName('X'.repeat(50))).toHaveLength(31);
  });

  it('falls back to a plain name when nothing usable is left', () => {
    expect(toSheetName('')).toBe('Data');
    expect(toSheetName('   ')).toBe('Data');
    expect(toSheetName('///')).toBe('Data');
    expect(toSheetName(undefined as unknown as string)).toBe('Data');
  });

  it('does not leave a trailing space after truncation', () => {
    expect(toSheetName('A'.repeat(30) + ' tail')).toBe('A'.repeat(30));
  });
});

describe('toSheetRows', () => {
  const rows: Row[] = [{ id: 'EBDG-ZHPL-DL-01-20260903', litres: 23.5, note: 'ok' }];

  it('starts with a bold header row covering every column', () => {
    const out = toSheetRows(rows, SPEC.columns);
    expect(out[0]).toHaveLength(3);
    expect(out[0][0]).toMatchObject({ value: 'Record_ID', type: String, fontWeight: 'bold' });
  });

  it('one row per record', () => {
    expect(toSheetRows(rows, SPEC.columns)).toHaveLength(2);
  });

  it('writes an id as text so Excel cannot reinterpret it', () => {
    // Left as a number or untyped, DL/25-26/999 and date-like ids get
    // silently converted the moment the file is opened.
    const cell = toSheetRows(rows, SPEC.columns)[1][0];
    expect(cell).toEqual({ value: 'EBDG-ZHPL-DL-01-20260903', type: String });
  });

  it('writes a numeric column as a real number, so it can be summed', () => {
    expect(toSheetRows(rows, SPEC.columns)[1][1]).toEqual({ value: 23.5, type: Number });
  });

  it('leaves a blank genuinely empty rather than 0', () => {
    // A DG nobody ran has no reading. A 0 would book its whole tank as
    // consumed — the mistake the calculation engine exists to avoid.
    const out = toSheetRows([{ id: 'X', litres: '', note: '' }], SPEC.columns);
    expect(out[1][1]).toEqual({});
    expect(out[1][2]).toEqual({});
  });

  it('keeps a real zero as 0', () => {
    const out = toSheetRows([{ id: 'X', litres: 0, note: '' }], SPEC.columns);
    expect(out[1][1]).toEqual({ value: 0, type: Number });
  });

  it('falls back to text when a numeric column holds something unparseable', () => {
    const spec: ExportSpec<{ v: string }> = {
      ...SPEC,
      columns: [{ header: 'Amount', value: (r) => r.v, numeric: true }],
    } as unknown as ExportSpec<{ v: string }>;
    expect(toSheetRows([{ v: 'N/A' }], spec.columns)[1][0]).toEqual({ value: 'N/A', type: String });
  });
});

/**
 * The regression this file exists for.
 *
 * writeXlsxFile returns { toBlob, toFile } — not a Blob, and not a
 * promise. The old code awaited the wrapper and handed THAT to
 * URL.createObjectURL, which failed with "Overload resolution failed"
 * only in the browser, only on .xlsx, and only when a user clicked.
 */
describe('buildXlsxBlob unwraps the library return value', () => {
  const fakeBlob = new Blob(['xlsx'], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const writer = (calls: unknown[] = []): (() => Promise<XlsxWriter>) =>
    async () =>
      ((sheetRows: unknown, options: unknown) => {
        calls.push({ sheetRows, options });
        return { toBlob: async () => fakeBlob };
      }) as XlsxWriter;

  it('returns the Blob from toBlob(), not the wrapper', async () => {
    const blob = await buildXlsxBlob([{ id: 'X', litres: 1, note: '' }], SPEC, writer());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob).toBe(fakeBlob);
    // The wrapper must never survive to the caller — that is exactly what
    // reached createObjectURL before.
    expect(blob).not.toHaveProperty('toBlob');
    expect(blob).not.toHaveProperty('toFile');
  });

  it('is a value createObjectURL would accept', async () => {
    const blob = await buildXlsxBlob([{ id: 'X', litres: 1, note: '' }], SPEC, writer());
    const url = URL.createObjectURL(blob);
    expect(url).toMatch(/^blob:/);
    URL.revokeObjectURL(url);
  });

  it('passes the sanitised sheet name through to the writer', async () => {
    const calls: any[] = [];
    const spec = { ...SPEC, serviceCode: 'OPS/03:DG' };
    await buildXlsxBlob([{ id: 'X', litres: 1, note: '' }], spec, writer(calls));
    expect(calls[0].options.sheet).toBe('OPS 03 DG');
  });

  it('passes header plus data rows to the writer', async () => {
    const calls: any[] = [];
    await buildXlsxBlob(
      [
        { id: 'A', litres: 1, note: '' },
        { id: 'B', litres: 2, note: '' },
      ],
      SPEC,
      writer(calls),
    );
    expect(calls[0].sheetRows).toHaveLength(3);
    expect(calls[0].sheetRows[0][0].value).toBe('Record_ID');
  });

  it('gives every column a width', async () => {
    const calls: any[] = [];
    await buildXlsxBlob([{ id: 'X', litres: 1, note: '' }], SPEC, writer(calls));
    expect(calls[0].options.columns).toHaveLength(3);
    expect(calls[0].options.columns.every((c: any) => c.width > 0)).toBe(true);
  });
});
