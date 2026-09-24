/**
 * API responses → the app's own types.
 *
 * The screens were written against `User` and `Warehouse`. Mapping at this
 * one boundary keeps them unchanged while the data underneath becomes
 * Postgres (MASTERDATA.md I8). The important difference: a warehouse's id
 * is now its real Site_Code (ZHPL-HR-03), the same key every record in the
 * database uses — not the demo data's WH_DEL_01.
 */

import type { FieldDefinition, OperationalSheetDef, Shift, TaskSubmission, User, UserRole, Warehouse } from '../../types';
import type { ServiceRegistry } from '../../types/masterData';

export interface MeResponse {
  email: string;
  name: string;
  roles: string[];
  sites: 'ALL' | string[];
  services: 'ALL' | string[];
  grants: { access_id: string; poc_name: string; role: string; site_code: string; service_codes: string }[];
}

export interface MySiteRow {
  site_code: string;
  wh_code: string;
  facility_name: string;
  channel: 'B2B' | 'B2C' | 'BOTH';
  entity: string;
  cost_center: string | null;
  sap_code: string | null;
  zone: Warehouse['zone'];
  state: string;
  city: string | null;
  address: string | null;
  business_type: string;
  services_enabled: string;
}

/** Most powerful first: someone holding two roles acts with the wider one. */
const ROLE_ORDER: UserRole[] = ['SUPER_ADMIN', 'SERVICE_ADMIN', 'WAREHOUSE_ADMIN', 'SITE_POC'];

export function userFromMe(me: MeResponse): User {
  const role = ROLE_ORDER.find((r) => me.roles.includes(r)) ?? 'SITE_POC';
  const sites = me.sites === 'ALL' ? undefined : me.sites;
  return {
    // The email is the identity everywhere in the database; there is no
    // separate user id to keep in step with it.
    id: me.email,
    email: me.email,
    fullName: me.name || me.email,
    role,
    warehouseId: sites?.[0],
    siteCodes: sites,
    serviceCodes: me.services,
    isActive: true,
    createdAt: '',
  };
}

// ---------------------------------------------------------------------------
// Generic service entries (Housekeeping, Washing, Cold Room, checklists, …)
// ---------------------------------------------------------------------------

export interface SubmissionRow {
  id: string;
  serviceCode: string;
  siteCode: string;
  warehouseId: string;
  date: string;
  shift?: Shift;
  status: string;
  data: Record<string, unknown>;
  remarks?: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

/** Services with their own tables and endpoints, never sent as generic entries. */
export const DEDICATED_SERVICES: ReadonlySet<string> = new Set(['DIESEL', 'EB_DG', 'SITE_ACTIVITY', 'FIRE']);

const SHIFTS: readonly Shift[] = ['MORNING', 'EVENING', 'NIGHT'];

/** Bookkeeping the forms put beside their values; the server records these itself. */
const META_KEYS = new Set([
  'id', 'sheetId', 'warehouseId', 'warehouseCode', 'warehouseName', 'date', 'shift',
  'submittedBy', 'submittedByName', 'submittedAt', 'timestamp', 'remarks',
]);

/** A form's record → the body of POST /api/services/:code/submissions. */
export function submissionBody(
  record: Record<string, any>,
  fallback: { siteCode?: string; date: string; submittedByName: string },
) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!META_KEYS.has(key) && value !== undefined) data[key] = value;
  }
  return {
    siteCode: record.warehouseId || fallback.siteCode,
    date: record.date || fallback.date,
    // Forms sometimes send labels like 'Daily Log'; only real shifts are kept.
    shift: SHIFTS.includes(record.shift) ? (record.shift as Shift) : undefined,
    data,
    remarks: typeof record.remarks === 'string' && record.remarks.trim() ? record.remarks : undefined,
    submittedByName: fallback.submittedByName,
  };
}

/** A stored entry → the flat row the data explorer and dashboards read. */
export function recordFromSubmission(s: SubmissionRow, sheetId: string): Record<string, any> {
  return {
    ...s.data,
    id: s.id,
    sheetId,
    warehouseId: s.siteCode,
    date: s.date,
    shift: s.shift,
    submittedByName: s.submittedByName,
    submittedAt: s.submittedAt,
    // The form's own outcome (Compliant, Flagged…) when it has one; the review status otherwise.
    status: typeof s.data.status === 'string' ? s.data.status : s.status,
    reviewStatus: s.status,
    remarks: s.remarks,
  };
}

/** A checklist entry → the app's TaskSubmission, keyed the way the checklist screen looks it up. */
export function taskSubmissionFrom(
  s: SubmissionRow,
  computeId: (date: string, warehouseId: string, templateId: string, shift: Shift) => string,
): TaskSubmission {
  const { templateId, ...payload } = s.data as { templateId?: unknown } & Record<string, unknown>;
  const shift = s.shift ?? 'MORNING';
  return {
    id: computeId(s.date, s.siteCode, String(templateId ?? ''), shift),
    submissionDate: s.date,
    shift,
    status: 'COMPLETED',
    templateId: String(templateId ?? ''),
    warehouseId: s.siteCode,
    submittedById: s.submittedBy,
    submittedByName: s.submittedByName,
    submittedAt: s.submittedAt,
    dataPayload: payload,
    notes: s.remarks,
  };
}

/** A form's frequency label → the registry's cadence. */
export function cadenceFor(frequency: string | undefined): ServiceRegistry['Cadence'] {
  const f = frequency ?? '';
  if (/week/i.test(f)) return 'WEEKLY';
  if (/month/i.test(f)) return 'MONTHLY';
  if (/adhoc|ad-hoc|event|demand|as needed/i.test(f)) return 'EVENT_DRIVEN';
  return 'DAILY';
}

/** A service created in the app (not one of the built-in sheets) → an operational sheet card. */
export function sheetFromService(service: ServiceRegistry, sheetId: string, fields: FieldDefinition[]): OperationalSheetDef {
  return {
    id: sheetId,
    code: service.Service_Code,
    title: service.Service_Name || service.Service_Code,
    category: 'Custom Forms',
    iconName: 'ClipboardList',
    frequency: service.Cadence,
    description: `${service.Service_Name} records`,
    fieldsCount: fields.length,
    tableTarget: `service_submission:${service.Service_Code}`,
    defaultShift: 'MORNING',
    isCustom: true,
    fieldsConfig: fields,
  };
}

export function warehouseFromSite(s: MySiteRow): Warehouse {
  return {
    id: s.site_code,
    code: s.wh_code,
    name: s.facility_name,
    facilityName: s.facility_name,
    sapCode: s.sap_code ?? undefined,
    state: s.state,
    b2bName: s.channel !== 'B2C' ? s.facility_name : undefined,
    b2cName: s.channel !== 'B2B' ? s.facility_name : undefined,
    entity: s.entity,
    costCenter: s.cost_center ?? s.sap_code ?? '',
    zone: s.zone,
    city: s.city ?? '',
    address: s.address ?? '',
    isActive: true,
    createdAt: '',
    channel: s.channel,
    businessType: s.business_type,
  };
}
