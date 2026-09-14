/**
 * Database rows → the sheet-shaped rows the Master Data screen already
 * works with (src/types/masterData.ts). Keeping that shape at the API
 * boundary means the screen, its validation and its export change nothing
 * when the source moves from the sheet to Postgres (MASTERDATA.md I8).
 */

import type { MasterAudit, PocMaster, ServiceRegistry, SiteMaster } from '../src/types/masterData';

type Row = Record<string, any>;

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const yn = (v: unknown) => (v ? 'Yes' : 'No') as 'Yes' | 'No';
const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : s(v));

export const toSite = (r: Row): SiteMaster => ({
  Site_Code: r.site_code,
  WH_Code: s(r.wh_code),
  Facility_Name: s(r.facility_name),
  SAP_Code: s(r.sap_code),
  Cost_Center: s(r.cost_center),
  Zone: r.zone,
  State: s(r.state),
  City: s(r.city),
  Address: s(r.address),
  Pincode: s(r.pincode),
  Channel: r.channel,
  Entity: s(r.entity),
  Business_Type: r.business_type,
  GSTIN: s(r.gstin),
  Lat_Long: s(r.lat_long),
  Map_Link: s(r.map_link),
  Services_Enabled: s(r.services_enabled) || 'ALL',
  Go_Live_Date: s(r.go_live_date),
  Closure_Date: s(r.closure_date),
  Active: yn(r.is_active),
  Last_Updated_By: s(r.last_updated_by),
  Last_Updated_At: ts(r.last_updated_at),
});

export type ServiceRow = ServiceRegistry & { Sheet_Mirror_URL: string };

export const toService = (r: Row): ServiceRow => ({
  Service_Code: r.service_code,
  Service_Name: s(r.service_name),
  Needs_Approval: yn(r.needs_approval),
  Needs_Delivery_Validation: yn(r.needs_delivery_validation),
  Requires_Evidence: yn(r.requires_evidence),
  Cadence: r.cadence,
  // A Postgres `time` arrives as HH:MM:SS; the sheet and the editor use HH:MM.
  Submission_Window: s(r.submission_window).slice(0, 5),
  SLA_Hours: r.sla_hours === null || r.sla_hours === undefined ? '' : Number(r.sla_hours),
  AppScript_URL: s(r.appscript_url),
  Records_Tab: s(r.records_tab),
  Audit_Tab: s(r.audit_tab),
  Active: yn(r.is_active),
  Last_Updated_By: s(r.last_updated_by),
  Last_Updated_At: ts(r.last_updated_at),
  Sheet_Mirror_URL: s(r.sheet_mirror_url),
});

export const toPoc = (r: Row): PocMaster => ({
  Access_ID: r.access_id,
  POC_Email: s(r.poc_email),
  POC_Name: s(r.poc_name),
  WH_Code: s(r.wh_code),
  Role: r.role,
  Site_Code: s(r.site_code),
  Service_Codes: s(r.service_codes) || 'ALL',
  Contact_Number: s(r.contact_number),
  Is_Primary: yn(r.is_primary),
  Active: yn(r.is_active),
  Access_Start_Date: s(r.access_start_date),
  Access_End_Date: s(r.access_end_date),
  Description: s(r.description),
  Reporting_Manager_Email: s(r.reporting_manager_email),
  Last_Updated_By: s(r.last_updated_by),
  Last_Updated_At: ts(r.last_updated_at),
});

const TAB_NAME: Record<string, MasterAudit['Target_Tab']> = {
  poc_master: 'POC_Master',
  site_master: 'Site_Master',
  service_registry: 'Service_Registry',
};

export const toAudit = (r: Row): MasterAudit => ({
  Audit_ID: s(r.audit_id),
  Timestamp: ts(r.ts),
  Actor_Email: s(r.actor_email),
  Action: r.action,
  Target_Tab: TAB_NAME[r.target_tab] ?? r.target_tab,
  Target_Key: s(r.target_key),
  Field_Changed: s(r.field_changed),
  Old_Value: s(r.old_value),
  New_Value: s(r.new_value),
  Source: r.source,
  Notes: s(r.notes),
});
