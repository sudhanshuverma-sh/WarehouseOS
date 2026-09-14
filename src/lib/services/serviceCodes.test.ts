import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_SHEETS } from '../../data/initialData';
import { serviceCodeFor, SHEET_TO_SERVICE, sheetIdFor } from './serviceCodes';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** The service codes db/services.sql seeds — what the database will accept. */
const seeded = (() => {
  const sql = read('db/services.sql');
  const block = sql.slice(sql.indexOf('insert into service_registry'), sql.indexOf('on conflict (service_code) do nothing'));
  return new Set([...block.matchAll(/\('([A-Z0-9_]+)'/g)].map((m) => m[1]));
})();

describe('service codes', () => {
  it('reads the seeded codes', () => {
    expect(seeded.has('DIESEL')).toBe(true);
    expect(seeded.size).toBeGreaterThan(10);
  });

  it('maps every sheet the POC filing desk offers to a service the database knows', () => {
    const keys = [...read('src/components/POCFilingView.tsx').matchAll(/sheetKey: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(seeded, `${key} → ${serviceCodeFor(key)}`).toContain(serviceCodeFor(key));
  });

  it('maps every built-in operational sheet', () => {
    for (const sheet of OPERATIONAL_SHEETS.filter((s) => !s.isCustom)) {
      expect(seeded, `${sheet.id} → ${serviceCodeFor(sheet.id)}`).toContain(serviceCodeFor(sheet.id));
    }
  });

  it('maps every known code to a seeded service', () => {
    for (const code of Object.values(SHEET_TO_SERVICE)) expect(seeded).toContain(code);
  });

  it('round-trips, preferring the real sheet over an alias', () => {
    expect(sheetIdFor('EB_DG')).toBe('SHEET_EB_DG');
    expect(sheetIdFor(serviceCodeFor('SHEET_COLD'))).toBe('SHEET_COLD');
  });

  it('derives a valid code for a form created in the app', () => {
    expect(serviceCodeFor('SHEET_pest-control')).toBe('PEST_CONTROL');
    expect(serviceCodeFor('SHEET_2026_AUDIT')).toBe('S_2026_AUDIT');
    expect(sheetIdFor('PEST_CONTROL')).toBe('SHEET_PEST_CONTROL');
  });
});
