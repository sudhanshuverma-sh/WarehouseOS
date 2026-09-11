import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateSheetUrl } from './sheetSync';
import { DIESEL_SHEET_HEADER, buildDieselSheetPayload } from './dieselSheet';
import type { DieselLog } from '../../types';

const log = (over: Partial<DieselLog> = {}): DieselLog =>
  ({
    id: 'd1',
    uniqueId: 'DSL-DEL-901',
    timestamp: '2026-09-05T10:00:00.000Z',
    warehouseId: 'ZHPL-DL-01',
    submittedById: 'u1',
    emailAddress: 'gyan.jaiswal@zomato.com',
    fuel: 'Diesel',
    type: 'Payment Only',
    quantity: 100,
    ratePerLitre: 90,
    finalAmount: 9000,
    status: 'Approved',
    ...over,
  }) as DieselLog;

describe('validateSheetUrl', () => {
  it('accepts a deployed /exec URL', () => {
    expect(validateSheetUrl('https://script.google.com/macros/s/AKfycbx123/exec').ok).toBe(true);
  });

  it('rejects the editor link, which is what people copy first', () => {
    const r = validateSheetUrl('https://script.google.com/home/projects/abc/edit');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/editor/i);
  });

  it('rejects the /dev URL and explains why it seems to work for the author', () => {
    const r = validateSheetUrl('https://script.google.com/macros/s/AKfycbx123/dev');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/only works while you are signed in/i);
  });

  it('rejects a non-Apps-Script URL', () => {
    expect(validateSheetUrl('https://docs.google.com/spreadsheets/d/abc/edit').ok).toBe(false);
  });

  it('rejects blank', () => {
    expect(validateSheetUrl('   ').ok).toBe(false);
  });

  it('tolerates surrounding whitespace from a copy-paste', () => {
    expect(validateSheetUrl('  https://script.google.com/macros/s/AK1/exec  ').ok).toBe(true);
  });
});

describe('diesel sheet payload', () => {
  it('sends all 21 columns, header and values aligned', () => {
    const p = buildDieselSheetPayload(log());
    expect(p.header).toHaveLength(21);
    expect(p.values).toHaveLength(p.header.length);
  });

  it('upserts on Unique ID so a validation edits its own row', () => {
    const p = buildDieselSheetPayload(log({ uniqueId: 'DSL-DEL-901' }));
    expect(p.action).toBe('upsertDieselRow');
    expect(p.key).toBe('DSL-DEL-901');
  });

  it('puts each value under its own header', () => {
    const p = buildDieselSheetPayload(log({ finalAmount: 9000, ratePerLitre: 90 }));
    const at = (h: string) => p.values[p.header.indexOf(h)];
    expect(at('Unique ID')).toBe('DSL-DEL-901');
    expect(at('Final Amount')).toBe(9000);
    expect(at('Rate per Litres')).toBe(90);
    expect(at('Email Address')).toBe('gyan.jaiswal@zomato.com');
  });

  it('writes a missing delivery as blank, never 0', () => {
    // A Payment Only request has no delivery. A 0 here would be summed as
    // a real zero-litre delivery by anyone pivoting on the sheet.
    const p = buildDieselSheetPayload(log({ type: 'Payment Only' }));
    expect(p.values[p.header.indexOf('Delivered Quantity')]).toBe('');
    expect(p.values[p.header.indexOf('Order Quantity')]).toBe('');
  });

  it('keeps a real zero as 0', () => {
    const p = buildDieselSheetPayload(log({ deliveredQuantityLitres: 0 }));
    expect(p.values[p.header.indexOf('Delivered Quantity')]).toBe(0);
  });
});

/**
 * The app and the Apps Script each hold a copy of the header. They are
 * checked against each other here so a change to one that is not made to
 * the other fails the build, rather than surfacing as a refused write
 * after someone has already deployed.
 */
describe('app and Apps Script agree on the header', () => {
  const gs = readFileSync(new URL('../../../scripts/Diesel_Code.gs', import.meta.url), 'utf8');

  const scriptHeader = (() => {
    const block = gs.match(/var DIESEL_HEADER = \[([\s\S]*?)\];/);
    if (!block) throw new Error('DIESEL_HEADER not found in scripts/Diesel_Code.gs');
    return [...block[1].matchAll(/(?:'([^']*)'|"([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  })();

  it('matches column for column, in order', () => {
    expect(scriptHeader).toEqual([...DIESEL_SHEET_HEADER]);
  });

  it('keys on the same column', () => {
    expect(gs).toContain("var KEY_COLUMN = 'Unique ID'");
    expect(buildDieselSheetPayload(log()).action).toBe('upsertDieselRow');
    expect(gs).toContain("payload.action === 'upsertDieselRow'");
  });

  it('also accepts the partial update the app sends on approve and reject', () => {
    // AppContext.pushDieselUpdateToSheet has always sent this shape. The
    // script must handle it, or every approval would be a silent no-op.
    expect(gs).toContain("payload.action === 'updateDiesel'");
    expect(gs).toContain('FIELD_TO_COLUMN');
  });

  it('maps every field the app sends in a partial update', () => {
    const sent = ['status', 'validation', 'deliveredQuantityLitres'];
    const block = gs.match(/var FIELD_TO_COLUMN = \{([\s\S]*?)\};/);
    expect(block).toBeTruthy();
    for (const field of sent) expect(block![1]).toContain(field + ':');
  });

  it('writes to the tab the client targets', () => {
    expect(gs).toContain("var DIESEL_TAB = 'Records'");
    expect(buildDieselSheetPayload(log()).tab).toBe('Records');
  });
});
