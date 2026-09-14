/**
 * Loads a Master Data snapshot (the JSON the Master Data Apps Script's
 * doGet returns, or data/master-data.json) into Postgres.
 *
 * This is how master data reaches the platform database: db/seed.sql is
 * gitignored — it holds real names and phone numbers — so it never ships
 * with the code. A Super Admin imports the snapshot from the Master Data
 * screen instead, through RLS like any other write.
 *
 * The cleaning mirrors scripts/json-to-sql.mjs: mixed-type phone numbers
 * become text, 'Yes'/'No' become booleans (a blank Active is reported,
 * because blank means inactive and that revokes someone), blank dates
 * become NULL.
 *
 * Safe to run again. A row nobody has edited in the app is refreshed from
 * the sheet; a row a person has edited in the app is left alone, so a
 * re-import can never quietly undo an admin's change. Each row is its own
 * savepoint, so one bad row is reported and skipped instead of aborting
 * the other 400.
 */

import type { Queryable } from './db';

type Raw = Record<string, unknown>;

export interface MasterSnapshot {
  siteMaster?: Raw[];
  serviceRegistry?: Raw[];
  pocMaster?: Raw[];
}

export interface ImportReport {
  sites: { written: number; kept: number };
  services: { written: number; kept: number };
  pocs: { written: number; kept: number };
  warnings: string[];
  skipped: string[];
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

export function yesNo(v: unknown, blankMeans: boolean, warn: () => void): boolean {
  const s = String(v ?? '').trim();
  if (s === '') {
    warn();
    return blankMeans;
  }
  return s === 'Yes';
}

/** YYYY-MM-DD, NULL when blank, and a warning rather than a crash when unreadable. */
export function isoDate(v: unknown, warn: (msg: string) => void): string | null {
  const s = text(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    warn(`unreadable date '${s}' left blank`);
    return null;
  }
  return d.toISOString().slice(0, 10);
}

const number = (v: unknown): number | null => {
  const s = text(v);
  return s === null || Number.isNaN(Number(s)) ? null : Number(s);
};

export interface TableRow {
  table: 'site_master' | 'service_registry' | 'poc_master';
  key: string;
  values: Record<string, unknown>;
}

/** Pure: snapshot → database rows plus warnings. Tested without a database. */
export function normaliseSnapshot(raw: MasterSnapshot): { rows: TableRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows: TableRow[] = [];

  for (const r of raw.siteMaster ?? []) {
    const key = text(r.Site_Code);
    if (!key || key === 'ALL') continue; // 'ALL' is the schema's own sentinel row
    const warn = (msg: string) => warnings.push(`${key}: ${msg}`);
    rows.push({
      table: 'site_master',
      key,
      values: {
        site_code: key,
        wh_code: text(r.WH_Code),
        facility_name: text(r.Facility_Name),
        sap_code: text(r.SAP_Code),
        cost_center: text(r.Cost_Center),
        zone: text(r.Zone),
        state: text(r.State),
        city: text(r.City),
        address: text(r.Address),
        pincode: text(r.Pincode),
        channel: text(r.Channel),
        entity: text(r.Entity),
        business_type: text(r.Business_Type),
        gstin: text(r.GSTIN),
        lat_long: text(r.Lat_Long),
        map_link: text(r.Map_Link),
        services_enabled: text(r.Services_Enabled) ?? 'ALL',
        go_live_date: isoDate(r.Go_Live_Date, warn),
        closure_date: isoDate(r.Closure_Date, warn),
        is_active: yesNo(r.Active, true, () => warn("Active is blank -> treated as Yes")),
      },
    });
  }

  for (const r of raw.serviceRegistry ?? []) {
    const key = text(r.Service_Code);
    if (!key) continue;
    const warn = (field: string, means: boolean) => () => warnings.push(`${key}: ${field} is blank -> ${means ? 'Yes' : 'No'}`);
    rows.push({
      table: 'service_registry',
      key,
      values: {
        service_code: key,
        service_name: text(r.Service_Name),
        needs_approval: yesNo(r.Needs_Approval, false, warn('Needs_Approval', false)),
        needs_delivery_validation: yesNo(r.Needs_Delivery_Validation, false, warn('Needs_Delivery_Validation', false)),
        requires_evidence: yesNo(r.Requires_Evidence, false, warn('Requires_Evidence', false)),
        cadence: text(r.Cadence),
        submission_window: text(r.Submission_Window),
        sla_hours: number(r.SLA_Hours),
        appscript_url: text(r.AppScript_URL ?? r.Spreadsheet_ID),
        records_tab: text(r.Records_Tab) ?? 'Records',
        audit_tab: text(r.Audit_Tab) ?? 'Audit',
        is_active: yesNo(r.Active, true, warn('Active', true)),
      },
    });
  }

  for (const r of raw.pocMaster ?? []) {
    const key = text(r.Access_ID);
    if (!key) continue;
    const warn = (msg: string) => warnings.push(`${key}: ${msg}`);
    rows.push({
      table: 'poc_master',
      key,
      values: {
        access_id: key,
        poc_email: text(r.POC_Email)?.toLowerCase() ?? null,
        poc_name: text(r.POC_Name),
        wh_code: text(r.WH_Code),
        role: text(r.Role) ?? 'SITE_POC',
        site_code: text(r.Site_Code) ?? 'ALL',
        service_codes: text(r.Service_Codes) ?? 'ALL',
        contact_number: text(r.Contact_Number), // text(): numeric phone numbers land as text
        is_primary: yesNo(r.Is_Primary, true, () => warn('Is_Primary is blank -> Yes')),
        // Blank Active revokes access. Reported, never silent.
        is_active: yesNo(r.Active, false, () => warn('Active is blank -> No (this person loses access)')),
        access_start_date: isoDate(r.Access_Start_Date, warn),
        access_end_date: isoDate(r.Access_End_Date, warn),
        description: text(r.Description),
        reporting_manager_email: text(r.Reporting_Manager_Email),
      },
    });
  }

  return { rows, warnings };
}

const PRIMARY_KEY: Record<TableRow['table'], string> = {
  site_master: 'site_code',
  service_registry: 'service_code',
  poc_master: 'access_id',
};

/**
 * Insert, or refresh a row still in its imported state.
 *
 * `last_updated_by` tells the two apart (fn_touch_updated): rows written
 * by migrations carry 'app', rows written by an import carry
 * 'import:<email>', and rows edited in the app carry the editor's plain
 * email. Only the first two are refreshed — including when the editor is
 * the same admin now re-importing.
 *
 * Column names come from normaliseSnapshot, never from the request, so
 * they are safe to interpolate.
 */
export function buildUpsert(row: TableRow): { text: string; values: unknown[] } {
  const cols = Object.keys(row.values);
  const pk = PRIMARY_KEY[row.table];
  const updates = cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`);
  return {
    text:
      `insert into ${row.table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ` +
      `on conflict (${pk}) do update set ${updates.join(', ')} ` +
      `where (${row.table}.last_updated_by = 'app' or ${row.table}.last_updated_by like 'import:%') ` +
      `returning (xmax = 0) as inserted`,
    values: cols.map((c) => row.values[c]),
  };
}

/** Sites first (POCs reference them), then services, then POCs. */
const ORDER: TableRow['table'][] = ['site_master', 'service_registry', 'poc_master'];

/** Runs inside the caller's withActor transaction, so RLS decides who may import. */
export async function importMasterSnapshot(client: Queryable, snapshot: MasterSnapshot): Promise<ImportReport> {
  const { rows, warnings } = normaliseSnapshot(snapshot);
  const report: ImportReport = {
    sites: { written: 0, kept: 0 },
    services: { written: 0, kept: 0 },
    pocs: { written: 0, kept: 0 },
    warnings,
    skipped: [],
  };
  const bucket = { site_master: report.sites, service_registry: report.services, poc_master: report.pocs };

  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.table) - ORDER.indexOf(b.table));

  // Marks every row this import writes as 'import:<email>' (fn_touch_updated).
  await client.query("select set_config('app.write_source', 'import', true)");
  try {
    for (const row of sorted) {
      await client.query('savepoint import_row');
      try {
        const plan = buildUpsert(row);
        const result = await client.query(plan.text, plan.values);
        // No row back means the conflict's WHERE declined: edited in the app, kept.
        if (result.rows.length === 0) bucket[row.table].kept++;
        else bucket[row.table].written++;
        await client.query('release savepoint import_row');
      } catch (err: any) {
        await client.query('rollback to savepoint import_row');
        report.skipped.push(`${row.key}: ${err?.constraint ?? err?.message ?? 'rejected'}`);
      }
    }
  } finally {
    // Anything else in this transaction is a person's write again.
    await client.query("select set_config('app.write_source', '', true)");
  }

  return report;
}
