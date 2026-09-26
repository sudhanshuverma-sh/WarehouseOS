/**
 * Assigning one person to several sites.
 *
 * POC_Master holds one row per site: Access_ID is the key and POC_Email is
 * not unique (MASTERDATA.md: "24 people cover more than one site"). So the
 * Assign POC form, which picks many sites for one person, turns into a set
 * of row writes:
 *
 *  - a picked site the person already has a row for: that row is updated
 *    (and switched back on if it had been ended), never duplicated;
 *  - a picked site with no row: a new row, Access_ID left blank so the sheet
 *    or the database assigns it (a guessed id could land on another admin's
 *    new row);
 *  - a site no longer picked: its row is ended with Active = No, never
 *    deleted, so the audit keeps the history (MASTERDATA I1).
 *
 * Service and Super Admins span every site, so they hold one row, Site_Code
 * ALL: their first existing row becomes it and any others are ended.
 */

import type { PocMaster } from '../../types/masterData';

/** The fields a person's rows share; the site is per row. */
export type PocForm = Pick<
  PocMaster,
  | 'POC_Email'
  | 'POC_Name'
  | 'Role'
  | 'Service_Codes'
  | 'Contact_Number'
  | 'Is_Primary'
  | 'Active'
  | 'Access_Start_Date'
  | 'Access_End_Date'
  | 'Description'
  | 'Reporting_Manager_Email'
>;

export interface PocPlan {
  creates: PocMaster[];
  updates: PocMaster[];
  deactivations: PocMaster[];
}

const SHARED: (keyof PocForm)[] = [
  'POC_Email', 'POC_Name', 'Role', 'Service_Codes', 'Contact_Number', 'Is_Primary', 'Active',
  'Access_Start_Date', 'Access_End_Date', 'Description', 'Reporting_Manager_Email',
];

/** Roles that span every site, and so hold one row with Site_Code ALL. */
export const spansAllSites = (role: string) => role === 'SERVICE_ADMIN' || role === 'SUPER_ADMIN';

const sameEmail = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const key = (code: string | undefined) => String(code ?? '').trim().toUpperCase();

/** Every row this person holds, whatever its state. */
export function rowsForPerson(rows: PocMaster[], email: string): PocMaster[] {
  return rows.filter((r) => sameEmail(r.POC_Email, email));
}

/** Service_Codes across several rows: ALL if any row has it, else the union. */
export function unionServices(rows: Pick<PocMaster, 'Service_Codes'>[]): string {
  const codes: string[] = [];
  for (const r of rows) {
    const raw = String(r.Service_Codes ?? '').trim();
    if (raw.toUpperCase() === 'ALL') return 'ALL';
    for (const c of raw.split(',').map((s) => s.trim()).filter(Boolean)) if (!codes.includes(c)) codes.push(c);
  }
  return codes.join(',');
}

export function pocFormErrors(form: PocForm, sites: string[]): string[] {
  const errors: string[] = [];
  if (!form.POC_Email?.trim()) errors.push('POC email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.POC_Email.trim())) errors.push('POC email must be an email address.');
  if (!form.POC_Name?.trim()) errors.push('POC name is required.');
  if (!spansAllSites(form.Role) && sites.filter((s) => s.trim()).length === 0) errors.push('Pick at least one site.');
  return errors;
}

export function planPocAssignment(
  existing: PocMaster[],
  form: PocForm,
  sites: string[],
  /** WH_Code is display only, taken from the site so each row names its own. */
  whCodeFor: (siteCode: string) => string = () => '',
): PocPlan {
  const mine = rowsForPerson(existing, form.POC_Email);
  const wanted = spansAllSites(form.Role)
    ? ['ALL']
    : [...new Map(sites.map((s) => s.trim()).filter(Boolean).map((s) => [key(s), s])).values()];

  // One row per site: an active row beats an ended one at the same site.
  const bySite = new Map<string, PocMaster>();
  for (const r of mine) {
    const k = key(r.Site_Code);
    const had = bySite.get(k);
    if (!had || (r.Active === 'Yes' && had.Active !== 'Yes')) bySite.set(k, r);
  }
  // An admin spans every site: reuse their first row rather than add one.
  if (spansAllSites(form.Role) && !bySite.has('ALL') && mine.length) {
    const first = mine.find((r) => r.Active === 'Yes') ?? mine[0];
    bySite.set('ALL', first);
  }

  const shared = Object.fromEntries(SHARED.map((f) => [f, String(form[f] ?? '').trim()])) as PocForm;
  const plan: PocPlan = { creates: [], updates: [], deactivations: [] };
  const kept = new Set<string>();

  for (const code of wanted) {
    const row = bySite.get(key(code));
    const WH_Code = code.toUpperCase() === 'ALL' ? '' : whCodeFor(code) || row?.WH_Code || '';
    if (row) {
      kept.add(row.Access_ID);
      const next: PocMaster = { ...row, ...shared, Site_Code: code, WH_Code };
      const changed = [...SHARED, 'Site_Code', 'WH_Code'].some(
        (f) => String((row as unknown as Record<string, unknown>)[f] ?? '') !== String((next as unknown as Record<string, unknown>)[f] ?? ''),
      );
      if (changed) plan.updates.push(next);
    } else {
      plan.creates.push({ ...shared, Access_ID: '', Site_Code: code, WH_Code, Last_Updated_By: '', Last_Updated_At: '' } as PocMaster);
    }
  }

  for (const r of mine) {
    if (!kept.has(r.Access_ID) && r.Active === 'Yes') plan.deactivations.push({ ...r, Active: 'No' });
  }
  return plan;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Adds 1 site, updates 2, ends access at 1." for the modal's footer. */
export function describePocPlan(plan: PocPlan): string {
  const parts: string[] = [];
  if (plan.creates.length) parts.push(`adds ${count(plan.creates.length, 'site', 'sites')}`);
  if (plan.updates.length) parts.push(`updates ${count(plan.updates.length, 'row', 'rows')}`);
  if (plan.deactivations.length) parts.push(`ends access at ${count(plan.deactivations.length, 'site', 'sites')}`);
  if (!parts.length) return 'Nothing to change.';
  const text = parts.join(', ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** New rows shown before the sheet has given them an Access_ID. */
export const TEMP_ID_PREFIX = 'NEW-';
export const isTempAccessId = (id: string | undefined) => String(id ?? '').startsWith(TEMP_ID_PREFIX);

/**
 * The next free AC-#### ids, for rows kept in this app only (no sheet or
 * database to assign them). Mirrors the sheet script: highest number + 1.
 */
export function nextAccessIds(rows: Pick<PocMaster, 'Access_ID'>[], howMany: number): string[] {
  let max = 0;
  for (const r of rows) {
    const m = String(r.Access_ID ?? '').match(/^AC-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return Array.from({ length: howMany }, (_, i) => `AC-${String(max + i + 1).padStart(4, '0')}`);
}
