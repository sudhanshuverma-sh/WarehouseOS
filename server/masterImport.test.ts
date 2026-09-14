import { describe, expect, it } from 'vitest';
import type { Queryable } from './db';
import { buildUpsert, importMasterSnapshot, isoDate, normaliseSnapshot } from './masterImport';

const snapshot = {
  siteMaster: [
    { Site_Code: 'ALL', WH_Code: 'ALL' },
    {
      Site_Code: 'ZHPL-HR-03', WH_Code: 'GGN3', Facility_Name: 'Gurgaon 3', Zone: 'North', State: 'Haryana',
      Channel: 'B2B', Entity: 'ZHPL', Business_Type: 'WHS', Pincode: 122001, Active: '', Go_Live_Date: '',
    },
  ],
  serviceRegistry: [{ Service_Code: 'DIESEL', Service_Name: 'Diesel', Cadence: 'EVENT_DRIVEN', Needs_Approval: 'Yes', SLA_Hours: '24', Active: 'Yes' }],
  pocMaster: [
    { Access_ID: 'AC-0078', POC_Email: 'Someone@Zomato.com', POC_Name: 'Some One', Role: 'SITE_POC', Site_Code: 'ZHPL-HR-03', Contact_Number: 9876543210, Active: '' },
  ],
};

describe('normaliseSnapshot', () => {
  const { rows, warnings } = normaliseSnapshot(snapshot);
  const byKey = (k: string) => rows.find((r) => r.key === k)!.values;

  it('skips the ALL sentinel site', () => {
    expect(rows.map((r) => r.key)).toEqual(['ZHPL-HR-03', 'DIESEL', 'AC-0078']);
  });

  it('cleans types the way json-to-sql does', () => {
    expect(byKey('ZHPL-HR-03')).toMatchObject({ pincode: '122001', go_live_date: null, services_enabled: 'ALL', is_active: true });
    expect(byKey('DIESEL')).toMatchObject({ needs_approval: true, sla_hours: 24, records_tab: 'Records' });
    expect(byKey('AC-0078')).toMatchObject({ poc_email: 'someone@zomato.com', contact_number: '9876543210', is_active: false });
  });

  it('reports a blank Active, because it revokes a POC', () => {
    expect(warnings).toContain('AC-0078: Active is blank -> No (this person loses access)');
  });
});

describe('isoDate', () => {
  it('keeps ISO dates, converts readable ones, and warns on nonsense', () => {
    const warned: string[] = [];
    expect(isoDate('2026-01-05', (m) => warned.push(m))).toBe('2026-01-05');
    expect(isoDate('', (m) => warned.push(m))).toBeNull();
    expect(isoDate('not a date', (m) => warned.push(m))).toBeNull();
    expect(warned).toEqual(["unreadable date 'not a date' left blank"]);
  });
});

describe('buildUpsert', () => {
  it('parameterises values and only refreshes rows nobody edited', () => {
    const plan = buildUpsert({ table: 'service_registry', key: 'X', values: { service_code: 'X', service_name: "O'Brien" } });
    expect(plan.text).toContain('on conflict (service_code) do update set service_name = excluded.service_name');
    expect(plan.text).toContain(
      "where (service_registry.last_updated_by = 'app' or service_registry.last_updated_by like 'import:%')",
    );
    expect(plan.text).not.toContain("O'Brien");
    expect(plan.values).toEqual(['X', "O'Brien"]);
  });
});

describe('importMasterSnapshot', () => {
  it('writes sites before POCs, counts kept rows, and skips a bad row without stopping', async () => {
    const statements: string[] = [];
    const client: Queryable = {
      query: (async (text: string) => {
        statements.push(text);
        if (text.startsWith('insert into poc_master')) {
          throw Object.assign(new Error('fk'), { constraint: 'poc_master_site_code_fkey' });
        }
        if (text.startsWith('insert into service_registry')) return { rows: [] }; // edited in app
        return { rows: [{ inserted: true }] };
      }) as unknown as Queryable['query'],
    };

    const report = await importMasterSnapshot(client, snapshot);

    // Rows are tagged as imported, and the tag is cleared afterwards.
    expect(statements[0]).toBe("select set_config('app.write_source', 'import', true)");
    expect(statements.at(-1)).toBe("select set_config('app.write_source', '', true)");

    const inserts = statements.filter((s) => s.startsWith('insert'));
    expect(inserts.map((s) => s.split(' ')[2])).toEqual(['site_master', 'service_registry', 'poc_master']);
    expect(report.sites).toEqual({ written: 1, kept: 0 });
    expect(report.services).toEqual({ written: 0, kept: 1 });
    expect(report.skipped).toEqual(['AC-0078: poc_master_site_code_fkey']);
    expect(statements).toContain('rollback to savepoint import_row');
  });
});
