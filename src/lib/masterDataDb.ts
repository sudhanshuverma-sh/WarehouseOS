/**
 * Master Data — Postgres (Supabase) backend.
 *
 * This is the drop-in replacement for the Google Sheets read paths in
 * ./masterDataSync.ts. It returns the identical `MasterDataResult` shape,
 * so AppContext and every component keep working unchanged — that swap is
 * exactly what MASTERDATA.md I8 ("persistence sits behind a repository
 * interface") was written to make possible.
 *
 * WHAT CHANGES vs. the sheet:
 *  - Reads are live and reliable. No CORS wall, no hidden iframe, no
 *    "paste the page's text" fallback, no per-browser localStorage cache
 *    pretending to be a source of truth.
 *  - Writes actually land, and come back on the next read.
 *  - Permissions are enforced in Postgres by RLS, not by hiding buttons.
 *    A non-SUPER_ADMIN's write is rejected by the database itself.
 *
 * SHAPE MAPPING: Postgres columns are snake_case and properly typed
 * (boolean / date / enum). The app's types (PocMaster etc.) are still the
 * sheet's shape — Access_ID, 'Yes'/'No', and so on. The adapters below are
 * the only place that mapping lives. Do not leak snake_case upward.
 */

import { requireSupabase } from './supabase';
import type { MasterDataResult } from './masterDataSync';
import {
  ALL,
  PocMaster,
  SiteMaster,
  ServiceRegistry,
  MasterAudit,
  Scoped,
  YesNo
} from '../types/masterData';

/** Postgres boolean -> the sheet's 'Yes' / 'No'. */
const yn = (v: unknown): YesNo => (v === true ? 'Yes' : 'No');

/** null/undefined -> '' so the UI never renders "null". */
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** A `date` column comes back as 'YYYY-MM-DD' or null; the app wants '' for blank. */
const d = (v: unknown): string => (v ? String(v).slice(0, 10) : '');

function toPocMaster(r: Record<string, any>): PocMaster {
  return {
    Access_ID: s(r.access_id),
    POC_Email: s(r.poc_email).toLowerCase(),
    POC_Name: s(r.poc_name),
    WH_Code: s(r.wh_code),
    Role: r.role as PocMaster['Role'],
    Site_Code: s(r.site_code) as Scoped<string>,
    Service_Codes: s(r.service_codes) as Scoped<string>,
    Contact_Number: s(r.contact_number),
    Is_Primary: yn(r.is_primary),
    Active: yn(r.is_active),
    Access_Start_Date: d(r.access_start_date),
    Access_End_Date: d(r.access_end_date),
    Description: s(r.description),
    Reporting_Manager_Email: s(r.reporting_manager_email),
    Last_Updated_By: s(r.last_updated_by),
    Last_Updated_At: s(r.last_updated_at)
  };
}

function toSiteMaster(r: Record<string, any>): SiteMaster {
  return {
    Site_Code: s(r.site_code),
    WH_Code: s(r.wh_code),
    Facility_Name: s(r.facility_name),
    SAP_Code: s(r.sap_code),
    Cost_Center: s(r.cost_center),
    Zone: r.zone as SiteMaster['Zone'],
    State: s(r.state),
    City: s(r.city),
    Address: s(r.address),
    Pincode: s(r.pincode),
    Channel: r.channel as SiteMaster['Channel'],
    Entity: s(r.entity),
    Business_Type: r.business_type as SiteMaster['Business_Type'],
    GSTIN: s(r.gstin),
    Lat_Long: s(r.lat_long),
    Map_Link: s(r.map_link),
    Services_Enabled: s(r.services_enabled) as Scoped<string>,
    Go_Live_Date: d(r.go_live_date),
    Closure_Date: d(r.closure_date),
    Active: yn(r.is_active),
    Last_Updated_By: s(r.last_updated_by),
    Last_Updated_At: s(r.last_updated_at)
  };
}

function toServiceRegistry(r: Record<string, any>): ServiceRegistry {
  return {
    Service_Code: s(r.service_code),
    Service_Name: s(r.service_name),
    Needs_Approval: yn(r.needs_approval),
    Needs_Delivery_Validation: yn(r.needs_delivery_validation),
    Requires_Evidence: yn(r.requires_evidence),
    Cadence: r.cadence as ServiceRegistry['Cadence'],
    Submission_Window: s(r.submission_window).slice(0, 5), // 'HH:MM:SS' -> 'HH:MM'
    SLA_Hours: r.sla_hours === null || r.sla_hours === undefined ? '' : Number(r.sla_hours),
    AppScript_URL: s(r.appscript_url),
    Records_Tab: s(r.records_tab),
    Audit_Tab: s(r.audit_tab),
    Active: yn(r.is_active),
    Last_Updated_By: s(r.last_updated_by),
    Last_Updated_At: s(r.last_updated_at)
  };
}

function toMasterAudit(r: Record<string, any>): MasterAudit {
  return {
    Audit_ID: s(r.audit_id),
    Timestamp: s(r.ts),
    Actor_Email: s(r.actor_email),
    Action: r.action as MasterAudit['Action'],
    Target_Tab: r.target_tab as MasterAudit['Target_Tab'],
    Target_Key: s(r.target_key),
    Field_Changed: s(r.field_changed),
    Old_Value: s(r.old_value),
    New_Value: s(r.new_value),
    Source: r.source as MasterAudit['Source'],
    Notes: s(r.notes)
  };
}

/** The sheet's Dropdowns tab has no Postgres equivalent — these lists are the
 *  enum types themselves, so they're derived rather than stored. Site_Code and
 *  Service_Code are deliberately absent, same as the sheet (MASTERDATA.md §5):
 *  those read live off site_master / service_registry. */
function deriveDropdowns(services: ServiceRegistry[], sites: SiteMaster[]): Record<string, string[]> {
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
  return {
    Zone: ['North', 'South', 'East', 'West', 'Central'],
    State: uniq(sites.map(x => x.State)),
    Entity: uniq(sites.map(x => x.Entity)),
    Business_Type: ['WHS', 'Grozo', 'HP', 'SS B2B'],
    Channel: ['B2B', 'B2C', 'BOTH'],
    Role: ['SITE_POC', 'WAREHOUSE_ADMIN', 'SERVICE_ADMIN', 'SUPER_ADMIN'],
    Cadence: ['DAILY', 'WEEKLY', 'MONTHLY', 'EVENT_DRIVEN'],
    Yes_No: ['Yes', 'No'],
    Service_Code: uniq(services.map(x => x.Service_Code))
  };
}

/**
 * Reads all master data in one round trip per table. Unlike the sheet paths,
 * a failure here is a real error worth surfacing — there is no "best-effort,
 * try pasting instead" fallback to hide behind.
 */
export async function fetchMasterDataFromDb(): Promise<MasterDataResult> {
  const db = requireSupabase();

  const [poc, site, service, audit] = await Promise.all([
    db.from('poc_master').select('*').order('access_id'),
    db.from('site_master').select('*').neq('site_code', 'ALL').order('site_code'),
    db.from('service_registry').select('*').order('service_code'),
    db.from('master_audit').select('*').order('ts', { ascending: false }).limit(500)
  ]);

  const errors: MasterDataResult['errors'] = {};
  if (poc.error) errors.pocMaster = poc.error.message;
  if (site.error) errors.siteMaster = site.error.message;
  if (service.error) errors.serviceRegistry = service.error.message;

  const siteMaster = (site.data ?? []).map(toSiteMaster);
  const serviceRegistry = (service.data ?? []).map(toServiceRegistry);

  return {
    pocMaster: (poc.data ?? []).map(toPocMaster),
    siteMaster,
    serviceRegistry,
    // master_audit is SUPER_ADMIN-only by RLS; a non-admin gets [] rather than an error.
    masterAudit: (audit.data ?? []).map(toMasterAudit),
    dropdowns: deriveDropdowns(serviceRegistry, siteMaster),
    errors
  };
}

/**
 * Creates or updates one POC_Master row — the real version of
 * assignPocMasterRow(). Blank Access_ID creates (with the next AC-#### id);
 * an existing one updates in place.
 *
 * Note what this function does NOT do: check whether the caller is allowed.
 * That check lives in the database (db/schema.sql §8) and applies no matter
 * what the client sends, which is the entire point of moving off Sheets.
 * A non-SUPER_ADMIN gets a permission error back from Postgres.
 */
export async function upsertPocMasterRow(
  row: Partial<PocMaster>
): Promise<{ success: boolean; message: string; accessId?: string }> {
  const db = requireSupabase();

  const record: Record<string, any> = {
    poc_email: (row.POC_Email || '').trim().toLowerCase(),
    poc_name: (row.POC_Name || '').trim(),
    wh_code: row.WH_Code || null,
    role: row.Role,
    site_code: row.Site_Code || ALL,
    service_codes: row.Service_Codes || ALL,
    contact_number: row.Contact_Number || null,
    is_primary: row.Is_Primary === 'Yes',
    is_active: row.Active !== 'No',
    access_start_date: row.Access_Start_Date || null,
    access_end_date: row.Access_End_Date || null,
    description: row.Description || null,
    reporting_manager_email: row.Reporting_Manager_Email || null
  };

  // Blank Access_ID = create. Ask Postgres for the next id rather than
  // computing it client-side, where two admins could race to the same number.
  if (row.Access_ID && row.Access_ID.trim()) {
    record.access_id = row.Access_ID.trim();
  } else {
    const { data, error } = await db.rpc('next_access_id');
    if (error) return { success: false, message: `Couldn't allocate an Access_ID: ${error.message}` };
    record.access_id = data as string;
  }

  const { error } = await db.from('poc_master').upsert(record, { onConflict: 'access_id' });

  if (error) {
    // Postgres speaks up when a row violates the §6 scope matrix or RLS —
    // pass that through instead of a generic failure.
    if (error.message.includes('scope_matches_role')) {
      return {
        success: false,
        message:
          `That combination isn't allowed for a ${row.Role}: ` +
          `SUPER_ADMIN needs ALL/ALL, SERVICE_ADMIN needs ALL sites + one service, ` +
          `WAREHOUSE_ADMIN needs one site + ALL services, SITE_POC needs one site.`
      };
    }
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      return { success: false, message: 'Only a SUPER_ADMIN can change master data. Your account is not one.' };
    }
    return { success: false, message: error.message };
  }

  return {
    success: true,
    message: `Saved ${record.access_id} — the change is live for everyone, and logged in Master_Audit.`,
    accessId: record.access_id
  };
}

/** Shared translation of a Postgres refusal into something an admin can act on. */
function describeDbError(error: { code?: string; message: string }): string {
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    return 'Only a SUPER_ADMIN can change master data. Your account is not one.';
  }
  if (error.code === '23505') return 'That code already exists.';
  return error.message;
}

/** '' -> null, so optional columns are genuinely empty rather than empty strings. */
const orNull = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

/**
 * Creates or edits one Site_Master row.
 *
 * `mode` is explicit rather than inferred from whether the code exists: an
 * upsert would let "add a site" silently overwrite an existing one that
 * happened to share a mistyped code. Create inserts and fails on a
 * duplicate; edit updates and never touches site_code (MASTERDATA.md I2).
 */
export async function upsertSiteMasterRow(
  row: Partial<SiteMaster>,
  mode: 'create' | 'edit'
): Promise<{ success: boolean; message: string }> {
  const db = requireSupabase();
  const record: Record<string, any> = {
    wh_code: (row.WH_Code || '').trim(),
    facility_name: (row.Facility_Name || '').trim(),
    sap_code: orNull(row.SAP_Code),
    cost_center: orNull(row.Cost_Center),
    zone: row.Zone,
    state: (row.State || '').trim(),
    city: orNull(row.City),
    address: orNull(row.Address),
    pincode: orNull(row.Pincode),
    channel: row.Channel,
    entity: (row.Entity || '').trim(),
    business_type: row.Business_Type,
    gstin: orNull(row.GSTIN),
    lat_long: orNull(row.Lat_Long),
    map_link: orNull(row.Map_Link),
    services_enabled: orNull(row.Services_Enabled) ?? ALL,
    go_live_date: orNull(row.Go_Live_Date),
    closure_date: orNull(row.Closure_Date),
    is_active: row.Active !== 'No'
  };
  const code = (row.Site_Code || '').trim();

  const { error } =
    mode === 'create'
      ? await db.from('site_master').insert({ ...record, site_code: code })
      : await db.from('site_master').update(record).eq('site_code', code);

  if (error) return { success: false, message: describeDbError(error) };
  return { success: true, message: `${mode === 'create' ? 'Added' : 'Saved'} ${code} — logged in Master_Audit.` };
}

/** Creates or edits one Service_Registry row. Same create/edit contract as sites. */
export async function upsertServiceRegistryRow(
  row: Partial<ServiceRegistry>,
  mode: 'create' | 'edit'
): Promise<{ success: boolean; message: string }> {
  const db = requireSupabase();
  const record: Record<string, any> = {
    service_name: (row.Service_Name || '').trim(),
    needs_approval: row.Needs_Approval === 'Yes',
    needs_delivery_validation: row.Needs_Delivery_Validation === 'Yes',
    requires_evidence: row.Requires_Evidence === 'Yes',
    cadence: row.Cadence,
    submission_window: orNull(row.Submission_Window),
    sla_hours: row.SLA_Hours === '' || row.SLA_Hours === undefined ? null : Number(row.SLA_Hours),
    appscript_url: orNull(row.AppScript_URL),
    records_tab: orNull(row.Records_Tab) ?? 'Records',
    audit_tab: orNull(row.Audit_Tab) ?? 'Audit',
    is_active: row.Active !== 'No'
  };
  const code = (row.Service_Code || '').trim();

  const { error } =
    mode === 'create'
      ? await db.from('service_registry').insert({ ...record, service_code: code })
      : await db.from('service_registry').update(record).eq('service_code', code);

  if (error) return { success: false, message: describeDbError(error) };
  return { success: true, message: `${mode === 'create' ? 'Added' : 'Saved'} ${code} — logged in Master_Audit.` };
}

/**
 * Deactivates a POC row. There is no delete — MASTERDATA.md I1, enforced by
 * a trigger that raises an exception if anything tries.
 */
export async function deactivatePocMasterRow(
  accessId: string
): Promise<{ success: boolean; message: string }> {
  const db = requireSupabase();
  const { error } = await db
    .from('poc_master')
    .update({ is_active: false, access_end_date: new Date().toISOString().slice(0, 10) })
    .eq('access_id', accessId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: `${accessId} deactivated. The row is kept — history stays intact.` };
}

/**
 * The signed-in user's effective access, computed by Postgres via
 * v_effective_access (MASTERDATA.md §6, cascade included). Returns null when
 * the email has no qualifying row — which is a denial, not an error.
 */
export async function fetchEffectiveAccess(email: string) {
  const db = requireSupabase();
  const { data, error } = await db
    .from('v_effective_access')
    .select('*')
    .eq('poc_email', email.trim().toLowerCase())
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}
