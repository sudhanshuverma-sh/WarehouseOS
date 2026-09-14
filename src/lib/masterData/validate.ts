/**
 * Validation for Site_Master and Service_Registry edits.
 *
 * Pure, so the rules are tested without a browser, and shared by both write
 * paths (Apps Script bridge and Postgres) so neither can accept a row the
 * other would refuse.
 *
 * The two rules that matter most come from MASTERDATA.md:
 *   I2 — a Site_Code or Service_Code never changes once created. POC rows,
 *        EB-DG readings and diesel requests all point at it; renaming it
 *        would orphan every one of them silently.
 *   I1 — nothing is deleted. A closed site is Active = No with a
 *        Closure_Date, so its history still has something to belong to.
 */

import type { SiteMaster, ServiceRegistry } from '../../types/masterData';

export type EditMode = 'create' | 'edit';

export interface FieldError {
  field: string;
  message: string;
}

/** What a master-data save reports back to the editor. */
export interface MasterWriteResult {
  success: boolean;
  message: string;
  /** Present when validation refused the row, so the editor can mark fields. */
  errors?: FieldError[];
}

export const ZONES = ['North', 'South', 'East', 'West', 'Central'] as const;
export const CHANNELS = ['B2B', 'B2C', 'BOTH'] as const;
export const BUSINESS_TYPES = ['WHS', 'Grozo', 'HP', 'SS B2B'] as const;
export const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'EVENT_DRIVEN'] as const;

const SITE_CODE = /^ZHPL-[A-Z]{2}-\d{2}$/;
const SERVICE_CODE = /^[A-Z][A-Z0-9_]*$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const blank = (v: unknown) => text(v) === '';

function required(row: Record<string, unknown>, fields: string[], errors: FieldError[]) {
  for (const f of fields) {
    if (blank(row[f])) errors.push({ field: f, message: `${f.replace(/_/g, ' ')} is required.` });
  }
}

function oneOf(row: Record<string, unknown>, field: string, allowed: readonly string[], errors: FieldError[]) {
  const v = text(row[field]);
  if (v && !allowed.includes(v)) {
    errors.push({ field, message: `${field.replace(/_/g, ' ')} must be one of ${allowed.join(', ')}.` });
  }
}

/**
 * Key checks shared by both tabs.
 *
 * On create the key must be new — compared case-insensitively, because
 * zhpl-dl-01 and ZHPL-DL-01 would be two rows to a spreadsheet and the same
 * site to every person reading them. On edit the key must be one that exists
 * and must be unchanged.
 */
function checkKey(
  keyField: string,
  value: string,
  existingKeys: string[],
  mode: EditMode,
  originalKey: string | undefined,
  errors: FieldError[],
) {
  if (!value) return; // already reported as required
  const lower = value.toLowerCase();
  const exists = existingKeys.some((k) => k.toLowerCase() === lower);

  if (mode === 'create' && exists) {
    errors.push({ field: keyField, message: `${value} already exists. Open it and edit it instead.` });
  }
  if (mode === 'edit') {
    if (originalKey !== undefined && originalKey !== value) {
      errors.push({
        field: keyField,
        message: `${keyField.replace(/_/g, ' ')} cannot change — other records point at ${originalKey}.`,
      });
    } else if (!exists) {
      errors.push({ field: keyField, message: `${value} does not exist, so there is nothing to edit.` });
    }
  }
}

export function validateSite(
  row: Partial<SiteMaster>,
  existing: Pick<SiteMaster, 'Site_Code'>[],
  mode: EditMode,
  originalKey?: string,
): FieldError[] {
  const errors: FieldError[] = [];
  const r = row as Record<string, unknown>;

  required(r, ['Site_Code', 'WH_Code', 'Facility_Name', 'Zone', 'State', 'Channel', 'Entity', 'Business_Type'], errors);

  const code = text(row.Site_Code);
  if (code && !SITE_CODE.test(code)) {
    errors.push({ field: 'Site_Code', message: 'Site Code must look like ZHPL-DL-01 (state letters, two digits).' });
  }
  checkKey('Site_Code', code, existing.map((s) => s.Site_Code), mode, originalKey, errors);

  oneOf(r, 'Zone', ZONES, errors);
  oneOf(r, 'Channel', CHANNELS, errors);
  oneOf(r, 'Business_Type', BUSINESS_TYPES, errors);

  const pin = text(row.Pincode);
  if (pin && !/^\d{6}$/.test(pin)) errors.push({ field: 'Pincode', message: 'Pincode must be 6 digits.' });

  const gstin = text(row.GSTIN);
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin.toUpperCase())) {
    errors.push({ field: 'GSTIN', message: 'GSTIN must be 15 letters and digits.' });
  }

  const goLive = text(row.Go_Live_Date);
  const closure = text(row.Closure_Date);
  if (goLive && closure && closure < goLive) {
    errors.push({ field: 'Closure_Date', message: 'Closure Date cannot be before Go-Live Date.' });
  }

  // A site switched off with no closure date has no answer to "when did it
  // stop filing", which is exactly what a missing-entries report asks.
  if (text(row.Active) === 'No' && !closure) {
    errors.push({ field: 'Closure_Date', message: 'Add a Closure Date when marking a site inactive.' });
  }

  return errors;
}

export function validateService(
  row: Partial<ServiceRegistry>,
  existing: Pick<ServiceRegistry, 'Service_Code'>[],
  mode: EditMode,
  originalKey?: string,
): FieldError[] {
  const errors: FieldError[] = [];
  const r = row as Record<string, unknown>;

  required(r, ['Service_Code', 'Service_Name', 'Cadence'], errors);

  const code = text(row.Service_Code);
  if (code && !SERVICE_CODE.test(code)) {
    errors.push({
      field: 'Service_Code',
      message: 'Service Code must be capitals, digits and underscores, starting with a letter (e.g. COLD_ROOM).',
    });
  }
  checkKey('Service_Code', code, existing.map((s) => s.Service_Code), mode, originalKey, errors);

  oneOf(r, 'Cadence', CADENCES, errors);

  const win = text(row.Submission_Window);
  if (win && !HH_MM.test(win)) {
    errors.push({ field: 'Submission_Window', message: 'Submission Window must be a 24-hour time like 18:00.' });
  }

  const sla = text(row.SLA_Hours);
  if (sla && (!/^\d+(\.\d+)?$/.test(sla) || Number(sla) < 0)) {
    errors.push({ field: 'SLA_Hours', message: 'SLA Hours must be a number of hours, or blank.' });
  }

  const url = text(row.AppScript_URL);
  if (url && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    errors.push({ field: 'AppScript_URL', message: 'Apps Script URL must be a deployed /exec URL from script.google.com.' });
  }

  return errors;
}

/** State name → the two letters used in Site_Code, as the existing codes use them. */
export const STATE_CODES: Record<string, string> = {
  'Andhra Pradesh': 'AP', Assam: 'AS', Bihar: 'BR', Chhattisgarh: 'CG', Delhi: 'DL', Goa: 'GA',
  Gujarat: 'GJ', Haryana: 'HR', Jammu: 'JK', Jharkhand: 'JH', Karnataka: 'KA', Kerala: 'KL',
  'Madhya Pradesh': 'MP', Maharashtra: 'MH', Odisha: 'OD', Punjab: 'PB', Rajasthan: 'RJ',
  'Tamil Nadu': 'TN', Telangana: 'TG', 'Uttar Pradesh': 'UP', Uttarakhand: 'UK', 'West Bengal': 'WB',
};

/**
 * The next free Site_Code for a state: one above the highest number already
 * used, so a new Delhi site after ZHPL-DL-04 gets ZHPL-DL-05.
 *
 * Deliberately not "fill the lowest gap". A gap is usually a site that was
 * planned or closed, and reusing its code would attach a new warehouse to
 * someone else's history.
 */
export function suggestNextSiteCode(state: string, existing: Pick<SiteMaster, 'Site_Code'>[]): string {
  const letters = STATE_CODES[state];
  if (!letters) return '';
  const prefix = `ZHPL-${letters}-`;
  const max = existing.reduce((m, s) => {
    const match = String(s.Site_Code).toUpperCase().match(new RegExp(`^${prefix}(\\d{2})$`));
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  const next = max + 1;
  return next > 99 ? '' : `${prefix}${String(next).padStart(2, '0')}`;
}

/** One error per field, for rendering under inputs. */
export function errorsByField(errors: FieldError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) if (!out[e.field]) out[e.field] = e.message;
  return out;
}
