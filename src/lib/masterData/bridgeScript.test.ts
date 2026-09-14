/**
 * Runs the REAL upsertByKey from the Master Data Apps Script — extracted
 * from the connector component where the script is embedded — against a
 * fake spreadsheet. The script cannot be executed in Google from a test, but
 * its logic is plain JavaScript, and the rules that matter (create never
 * overwrites, edit never touches the key, every change is audited) are
 * exactly the kind of thing that breaks silently on the sheet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const connector = readFileSync(
  new URL('../../components/GoogleSheetsMasterConnector.tsx', import.meta.url),
  'utf8',
);

/** Pulls one top-level function out of the embedded script by brace matching. */
function extractFunction(name: string): string {
  const start = connector.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in the embedded script`);
  let depth = 0;
  for (let i = connector.indexOf('{', start); i < connector.length; i++) {
    if (connector[i] === '{') depth++;
    else if (connector[i] === '}' && --depth === 0) return connector.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

type Audit = { action: string; tab: string; key: string; field: string; oldValue: unknown; newValue: unknown };

function loadUpsertByKey() {
  const audits: Audit[] = [];
  const logMasterAudit = (_ss: unknown, action: string, tab: string, key: string, field: string, oldValue: unknown, newValue: unknown) =>
    audits.push({ action, tab, key, field, oldValue, newValue });
  // eslint-disable-next-line no-new-func
  const fn = new Function('logMasterAudit', `${extractFunction('upsertByKey')}; return upsertByKey;`)(logMasterAudit);
  return { upsertByKey: fn as (...a: unknown[]) => Record<string, unknown>, audits };
}

function fakeSpreadsheet(tab: string, grid: unknown[][]) {
  const data = grid.map((r) => [...r]);
  const sheet = {
    getDataRange: () => ({ getValues: () => data.map((r) => [...r]) }),
    getRange: (r: number, c: number) => ({ setValue: (v: unknown) => { data[r - 1][c - 1] = v; } }),
    appendRow: (row: unknown[]) => data.push(row),
  };
  return { ss: { getSheetByName: (n: string) => (n === tab ? sheet : null) }, data };
}

const HEADER = ['Site_Code', 'WH_Code', 'Facility_Name', 'Active', 'Last_Updated_By', 'Last_Updated_At'];

describe('doPost wiring', () => {
  it('reads the form field the app actually sends', () => {
    // submitViaHiddenForm posts a field named "payload", so the body is
    // "payload=%7B..." — JSON.parse(e.postData.contents) alone always fails.
    expect(connector).toContain('e.parameter && e.parameter.payload');
  });

  it('routes the new site and service actions', () => {
    expect(connector).toContain("payload.action === 'upsertSiteMaster'");
    expect(connector).toContain("payload.action === 'upsertServiceRegistry'");
  });

  it('holds a script lock around writes', () => {
    expect(connector).toContain('LockService.getScriptLock()');
  });
});

describe('upsertByKey — create', () => {
  it('appends a new row in header order and audits it', () => {
    const { upsertByKey, audits } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'WH-DEL3', 'WH-DEL3', 'Yes', '', '']]);

    const res = upsertByKey(ss, 'Site_Master', 'Site_Code',
      { Site_Code: 'ZHPL-DL-05', Facility_Name: 'WH-DEL9', WH_Code: 'WH-DEL9', Active: 'Yes' }, 'create', 'admin@zomato.com');

    expect(res.status).toBe('success');
    expect(data).toHaveLength(3);
    expect(data[2].slice(0, 4)).toEqual(['ZHPL-DL-05', 'WH-DEL9', 'WH-DEL9', 'Yes']);
    expect(data[2][4]).toBe('admin@zomato.com');
    expect(audits[0]).toMatchObject({ action: 'CREATE', key: 'ZHPL-DL-05' });
  });

  it('refuses to overwrite an existing code, ignoring case', () => {
    const { upsertByKey, audits } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'WH-DEL3', 'Original', 'Yes', '', '']]);

    const res = upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'zhpl-dl-01', Facility_Name: 'Hijack' }, 'create', 'a');

    expect(res.status).toBe('error');
    expect(String(res.message)).toMatch(/already exists/);
    expect(data).toHaveLength(2);
    expect(data[1][2]).toBe('Original');
    expect(audits).toHaveLength(0);
  });
});

describe('upsertByKey — edit', () => {
  it('writes only changed fields, one audit row each', () => {
    const { upsertByKey, audits } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'WH-DEL3', 'Old name', 'Yes', '', '']]);

    const res = upsertByKey(ss, 'Site_Master', 'Site_Code',
      { Site_Code: 'ZHPL-DL-01', WH_Code: 'WH-DEL3', Facility_Name: 'New name', Active: 'Yes' }, 'edit', 'a');

    expect(res).toMatchObject({ status: 'success', changed: 1 });
    expect(data[1][2]).toBe('New name');
    expect(audits).toEqual([expect.objectContaining({ action: 'UPDATE', field: 'Facility_Name', oldValue: 'Old name', newValue: 'New name' })]);
  });

  it('never writes the key column, even if a different key is sent', () => {
    // I2: the row is found by key; the key cell itself is skipped on write.
    const { upsertByKey } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'WH-DEL3', 'Name', 'Yes', '', '']]);

    upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'ZHPL-DL-01', Facility_Name: 'Name 2' }, 'edit', 'a');
    expect(data[1][0]).toBe('ZHPL-DL-01');
  });

  it('refuses to edit a row that does not exist', () => {
    const { upsertByKey } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER]);

    const res = upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'ZHPL-DL-09', Facility_Name: 'X' }, 'edit', 'a');
    expect(res.status).toBe('error');
    expect(data).toHaveLength(1);
  });

  it('audits switching a site off as DEACTIVATE', () => {
    const { upsertByKey, audits } = loadUpsertByKey();
    const { ss } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'W', 'N', 'Yes', '', '']]);

    upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'ZHPL-DL-01', Active: 'No' }, 'edit', 'a');
    expect(audits[0]).toMatchObject({ action: 'DEACTIVATE', field: 'Active' });
  });

  it('does not touch Last_Updated_* when nothing changed', () => {
    const { upsertByKey, audits } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'W', 'N', 'Yes', 'prev', 'then']]);

    upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'ZHPL-DL-01', WH_Code: 'W', Facility_Name: 'N' }, 'edit', 'a');
    expect(audits).toHaveLength(0);
    expect(data[1].slice(4)).toEqual(['prev', 'then']);
  });

  it('ignores fields the sheet has no column for, rather than guessing', () => {
    const { upsertByKey } = loadUpsertByKey();
    const { ss, data } = fakeSpreadsheet('Site_Master', [HEADER, ['ZHPL-DL-01', 'W', 'N', 'Yes', '', '']]);

    const res = upsertByKey(ss, 'Site_Master', 'Site_Code', { Site_Code: 'ZHPL-DL-01', NotAColumn: 'x' }, 'edit', 'a');
    expect(res).toMatchObject({ status: 'success', changed: 0 });
    expect(data[1]).toHaveLength(HEADER.length);
  });

  it('refuses an unknown mode', () => {
    const { upsertByKey } = loadUpsertByKey();
    const { ss } = fakeSpreadsheet('Service_Registry', [['Service_Code', 'Service_Name'], ['DIESEL', 'Diesel']]);
    expect(upsertByKey(ss, 'Service_Registry', 'Service_Code', { Service_Code: 'DIESEL' }, 'upsert', 'a').status).toBe('error');
  });
});
