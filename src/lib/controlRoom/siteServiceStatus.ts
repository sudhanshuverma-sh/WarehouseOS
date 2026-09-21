/**
 * Control Room — which service each site has done, for the period that
 * service is due in.
 *
 * Sites come from Site_Master and services from Service_Registry, so a site
 * or service added in Master Data shows up here with no code change. Each
 * service's cadence decides what "done" means:
 *
 *   DAILY         a record for that site today
 *   WEEKLY        any record this ISO week (Mon–Sun)
 *   MONTHLY       any record this month
 *   EVENT_DRIVEN  filed only when needed (Diesel, Washing, Adhoc): shows how
 *                 many came in today and is never counted as pending
 *
 * Days are India days. Pure: the Control Room only renders what this returns.
 */

import type { DailySiteLog, DieselLog, TaskSubmission, Warehouse } from '../../types';
import type { PocMaster, ServiceRegistry, SiteMaster } from '../../types/masterData';
import { serviceCodeFor, SHEET_TO_SERVICE, sheetIdFor } from '../services/serviceCodes';

export type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'EVENT_DRIVEN';
export type ChannelTab = 'ALL' | 'B2B' | 'B2C';

export interface ControlRoomSite {
  id: string;
  whCode: string;
  name: string;
  city: string;
  zone: string;
  channel: 'B2B' | 'B2C' | 'BOTH';
  /** 'ALL', or the service codes enabled at this site. */
  services: 'ALL' | string[];
  /**
   * Every id this site is known by: its Site_Code, WH_Code and SAP_Code, and
   * the id/code of the app warehouse that is the same place. Records, users
   * and filters written with any of them count for this site.
   */
  aliases: string[];
}

export interface ControlRoomService {
  code: string;
  name: string;
  cadence: Cadence;
}

export type ServiceState = 'done' | 'pending' | 'on-request';
export type SiteState = 'complete' | 'partial' | 'not-started';

export interface SiteServiceStatus extends ControlRoomService {
  state: ServiceState;
  /** Records in the service's period (today, for on-request services). */
  count: number;
}

export interface SiteStatus {
  site: ControlRoomSite;
  services: SiteServiceStatus[];
  /** Services with a deadline in this period (not on-request). */
  due: number;
  done: number;
  state: SiteState;
}

export interface ControlRoomRecords {
  dailySiteLogs: (Pick<DailySiteLog, 'site' | 'date'> & { timestamp?: string; pocName?: string })[];
  dieselLogs: (Pick<DieselLog, 'warehouseId' | 'timestamp'> & { submittedByName?: string })[];
  ebdgRows: { Site_Code?: string; Date?: string; Timestamp?: string; Submitted_By?: string }[];
  submissions: (Pick<TaskSubmission, 'warehouseId' | 'submissionDate'> & { submittedAt?: string; submittedByName?: string })[];
  sheetRecords: Record<string, { warehouseId?: string; site?: string; date?: string; submittedAt?: string; submittedByName?: string }[]>;
}

/** One filed record, reduced to what a status screen needs. */
export interface Filing {
  code: string;
  site: string;
  day: string;
  /** When it was filed (timestamp), or the day when no time was recorded. */
  at: string;
  by: string;
}

const CADENCES: Cadence[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'EVENT_DRIVEN'];
const ON_REQUEST_BY_DEFAULT = new Set(['DIESEL', 'WASHING', 'ADHOC']);

// ---------------------------------------------------------------------------
// Sites and services
// ---------------------------------------------------------------------------

function parseServices(raw: string | undefined): 'ALL' | string[] {
  const s = (raw ?? '').trim().toUpperCase();
  if (!s || s === 'ALL') return 'ALL';
  return s.split(/[,\s]+/).filter(Boolean);
}

const asChannel = (c: string | undefined): ControlRoomSite['channel'] => (c === 'B2B' || c === 'B2C' ? c : 'BOTH');

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const uniq = (values: (string | undefined)[]) => [...new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean))];

/**
 * The app warehouses that are this Site_Master site: same WH_Code (warehouse
 * `code`) or same SAP_Code (warehouse `sapCode`). The demo users and records
 * use warehouse ids like WH_AP_VIZAG_B2C while Site_Master calls the same
 * place ZHPL-AP-01; this is the join between them.
 */
function sameWarehouses(site: SiteMaster, warehouses: Warehouse[]): Warehouse[] {
  const wh = norm(site.WH_Code);
  const sap = norm(site.SAP_Code);
  return warehouses.filter((w) => (wh && norm(w.code) === wh) || (sap && norm(w.sapCode) === sap));
}

/** Active Site_Master sites; the app's warehouse list only when none are loaded. */
export function controlRoomSites(siteMaster: SiteMaster[], warehouses: Warehouse[]): ControlRoomSite[] {
  const active = siteMaster.filter((s) => s.Active === 'Yes' && s.Site_Code && s.Site_Code !== 'ALL');
  if (active.length) {
    return active.map((s) => {
      const matches = sameWarehouses(s, warehouses);
      return {
        id: s.Site_Code,
        whCode: s.WH_Code || '',
        name: s.Facility_Name || s.WH_Code || s.Site_Code,
        city: s.City || matches[0]?.city || s.State || '',
        zone: s.Zone || '',
        channel: asChannel(s.Channel),
        services: parseServices(s.Services_Enabled),
        aliases: uniq([s.Site_Code, s.WH_Code, s.SAP_Code, ...matches.flatMap((w) => [w.id, w.code])]),
      };
    });
  }
  return warehouses
    .filter((w) => w.isActive !== false)
    .map((w) => ({
      id: w.id,
      whCode: w.code || '',
      name: w.name || w.facilityName || w.id,
      city: w.city || w.state || '',
      zone: w.zone || '',
      channel: asChannel(w.channel),
      services: 'ALL' as const,
      aliases: uniq([w.id, w.code]),
    }));
}

/** True when `id` is any of the names this site goes by. */
export const siteMatches = (site: ControlRoomSite, id: string | undefined): boolean =>
  Boolean(id) && site.aliases.some((a) => norm(a) === norm(id));

/**
 * The people who file for this site: live POC_Master rows for it, matched by
 * any of the site's codes. Admin rows are not site POCs, and a row that was
 * switched off is not someone to call. Pass a service code to narrow it to
 * the POCs who hold that service.
 */
export function sitePocs(site: ControlRoomSite, pocRows: PocMaster[], serviceCode?: string): PocMaster[] {
  return pocRows.filter((p) => {
    if (p.Active !== 'Yes' || p.Role !== 'SITE_POC') return false;
    if (!siteMatches(site, p.Site_Code)) return false;
    if (!serviceCode) return true;
    const held = String(p.Service_Codes ?? '').trim().toUpperCase();
    return held === 'ALL' || held.split(/[,\s]+/).includes(serviceCode.toUpperCase());
  });
}

/** The id the app's existing forms know this site by: its warehouse id, else the Site_Code. */
export const appWarehouseIdFor = (site: ControlRoomSite, warehouses: Warehouse[]): string =>
  warehouses.find((w) => siteMatches(site, w.id))?.id ?? site.id;

/** Active Service_Registry services, in registry order; built-in services when none are loaded. */
export function controlRoomServices(registry: ServiceRegistry[], sheets: { id: string; title: string }[]): ControlRoomService[] {
  const active = registry.filter((s) => s.Active === 'Yes' && s.Service_Code);
  if (active.length) {
    return active.map((s) => ({
      code: s.Service_Code,
      name: s.Service_Name || s.Service_Code,
      cadence: (CADENCES as string[]).includes(s.Cadence) ? (s.Cadence as Cadence) : 'DAILY',
    }));
  }
  const codes = [...new Set(Object.values(SHEET_TO_SERVICE))];
  return codes.map((code) => ({
    code,
    name: sheets.find((sh) => sh.id === sheetIdFor(code))?.title ?? code,
    cadence: ON_REQUEST_BY_DEFAULT.has(code) ? 'EVENT_DRIVEN' : 'DAILY',
  }));
}

export const inChannel = (site: ControlRoomSite, tab: ChannelTab) =>
  tab === 'ALL' || site.channel === tab || site.channel === 'BOTH';

// ---------------------------------------------------------------------------
// Periods (India days)
// ---------------------------------------------------------------------------

const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

export function indiaDay(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? '' : IST.format(d);
}

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The inclusive day range a cadence is judged over, on `today`. */
export function periodFor(cadence: Cadence, today: string): [string, string] {
  if (cadence === 'WEEKLY') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7; // Mon=1 … Sun=7
    const monday = shift(today, 1 - weekday);
    return [monday, shift(monday, 6)];
  }
  if (cadence === 'MONTHLY') return [`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`];
  return [today, today];
}

// ---------------------------------------------------------------------------
// Records → status
// ---------------------------------------------------------------------------

/** service code → site key → days a record was filed. */
type RecordIndex = Map<string, Map<string, string[]>>;

const DEDICATED = new Set(['SITE_ACTIVITY', 'DIESEL', 'EB_DG', 'CHECKLIST']);

/** Every filed record across all sources, as (service, site, day, when, by). */
export function allFilings(records: ControlRoomRecords): Filing[] {
  const out: Filing[] = [];
  const add = (code: string, site: string | undefined, day: string | undefined, at?: string, by?: string) => {
    if (!site || !day) return;
    out.push({ code, site, day: day.slice(0, 10), at: at || day.slice(0, 10), by: by || '' });
  };

  for (const l of records.dailySiteLogs) add('SITE_ACTIVITY', l.site, l.date, l.timestamp, l.pocName);
  for (const l of records.dieselLogs) add('DIESEL', l.warehouseId, indiaDay(l.timestamp), l.timestamp, l.submittedByName);
  for (const r of records.ebdgRows) add('EB_DG', r.Site_Code, r.Date, r.Timestamp, r.Submitted_By);
  for (const s of records.submissions) add('CHECKLIST', s.warehouseId, s.submissionDate, s.submittedAt, s.submittedByName);
  for (const [sheetId, rows] of Object.entries(records.sheetRecords)) {
    const code = serviceCodeFor(sheetId);
    // The old power/water sheet still counts as EB-DG filings.
    if (DEDICATED.has(code) && sheetId !== 'SHEET_DG_POWER_WATER') continue;
    for (const r of rows ?? []) add(code, r.warehouseId || r.site, r.date, r.submittedAt, r.submittedByName);
  }
  return out;
}

/** One service's filings, newest first. */
export const filingsFor = (code: string, records: ControlRoomRecords): Filing[] =>
  allFilings(records)
    .filter((f) => f.code === code)
    .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));

/**
 * The filing that already covers this period at this site, or null.
 *
 * The one place that answers "has someone done this already", so the desk,
 * the forms and the database rule cannot drift apart. An EVENT_DRIVEN
 * service is never already filed: several a day is what it is for.
 */
export function filedThisPeriod(
  service: ControlRoomService,
  site: ControlRoomSite,
  records: ControlRoomRecords,
  today: string,
): Filing | null {
  if (service.cadence === 'EVENT_DRIVEN') return null;
  const [from, to] = periodFor(service.cadence, today);
  return filingsFor(service.code, records).find((f) => f.day >= from && f.day <= to && siteMatches(site, f.site)) ?? null;
}

export function indexRecords(records: ControlRoomRecords): RecordIndex {
  const index: RecordIndex = new Map();
  for (const f of allFilings(records)) {
    const bySite = index.get(f.code) ?? new Map<string, string[]>();
    const days = bySite.get(f.site) ?? [];
    days.push(f.day);
    bySite.set(f.site, days);
    index.set(f.code, bySite);
  }
  return index;
}

function countFor(index: RecordIndex, code: string, site: ControlRoomSite, [from, to]: [string, string]): number {
  const bySite = index.get(code);
  if (!bySite) return 0;
  const keys = new Set(site.aliases.length ? site.aliases : [site.id, site.whCode].filter(Boolean));
  let n = 0;
  for (const key of keys) for (const day of bySite.get(key) ?? []) if (day >= from && day <= to) n++;
  return n;
}

export function computeSiteStatuses(
  sites: ControlRoomSite[],
  services: ControlRoomService[],
  records: ControlRoomRecords,
  today: string,
): SiteStatus[] {
  const index = indexRecords(records);

  return sites.map((site) => {
    const offered = services.filter((s) => site.services === 'ALL' || site.services.includes(s.code));
    const statuses: SiteServiceStatus[] = offered.map((svc) => {
      const count = countFor(index, svc.code, site, periodFor(svc.cadence, today));
      const state: ServiceState = svc.cadence === 'EVENT_DRIVEN' ? 'on-request' : count > 0 ? 'done' : 'pending';
      return { ...svc, count, state };
    });
    const due = statuses.filter((s) => s.state !== 'on-request').length;
    const done = statuses.filter((s) => s.state === 'done').length;
    const state: SiteState = due === 0 || done === due ? 'complete' : done === 0 ? 'not-started' : 'partial';
    return { site, services: statuses, due, done, state };
  });
}

/** A month ('YYYY-MM') as Monday-first weeks; cells outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay() || 7; // Mon=1 … Sun=7
  const length = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(weekday - 1).fill(null), ...Array.from({ length }, (_, i) => shift(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** 'YYYY-MM' moved by `n` months. */
export const shiftMonth = (month: string, n: number): string =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export interface DayActivity {
  day: string;
  /** Daily services filed that day, counted per site. */
  done: number;
  /** Daily services expected that day, counted per site. */
  due: number;
  /** Every entry filed that day for these sites and services, any cadence. */
  entries: number;
}

/** For each day: how many daily filings were done of those due, and how many entries came in. */
export function activityByDay(
  sites: ControlRoomSite[],
  services: ControlRoomService[],
  records: ControlRoomRecords,
  days: string[],
): DayActivity[] {
  const index = indexRecords(records);
  const daily = services.filter((s) => s.cadence === 'DAILY');
  const codes = new Set(services.map((s) => s.code));
  const known = new Set(sites.flatMap((s) => [s.id, ...s.aliases].map((a) => a.toLowerCase())));
  const entries = new Map<string, number>();
  for (const f of allFilings(records)) {
    if (codes.has(f.code) && known.has(f.site.toLowerCase())) entries.set(f.day, (entries.get(f.day) ?? 0) + 1);
  }

  return days.map((day) => {
    let done = 0;
    let due = 0;
    for (const site of sites) {
      for (const svc of daily) {
        if (site.services !== 'ALL' && !site.services.includes(svc.code)) continue;
        due++;
        if (countFor(index, svc.code, site, [day, day]) > 0) done++;
      }
    }
    return { day, done, due, entries: entries.get(day) ?? 0 };
  });
}

/** The last `days` India days ending on `today`, oldest first. */
export function lastDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shift(today, i - (days - 1)));
}

/** One site's done / due for each of the given days — the POC's week strip. */
export function siteProgressByDay(
  site: ControlRoomSite,
  services: ControlRoomService[],
  records: ControlRoomRecords,
  days: string[],
): { day: string; done: number; due: number }[] {
  return days.map((day) => {
    const [s] = computeSiteStatuses([site], services, records, day);
    return { day, done: s.done, due: s.due };
  });
}

const STATE_RANK: Record<SiteState, number> = { 'not-started': 0, partial: 1, complete: 2 };

/** What needs attention first: not started, then in progress, then complete; then by name. */
export const sortByAttention = (list: SiteStatus[]): SiteStatus[] =>
  [...list].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.site.name.localeCompare(b.site.name));

export interface ServiceProgress extends ControlRoomService {
  /** Sites where it is done (or, on-request, filed today). */
  done: number;
  /** Sites where it is offered. */
  total: number;
}

export interface ControlRoomSummary {
  sites: number;
  complete: number;
  partial: number;
  notStarted: number;
  services: ServiceProgress[];
}

export function summarise(statuses: SiteStatus[], services: ControlRoomService[]): ControlRoomSummary {
  return {
    sites: statuses.length,
    complete: statuses.filter((s) => s.state === 'complete').length,
    partial: statuses.filter((s) => s.state === 'partial').length,
    notStarted: statuses.filter((s) => s.state === 'not-started').length,
    services: services.map((svc) => {
      const rows = statuses.map((s) => s.services.find((x) => x.code === svc.code)).filter((x): x is SiteServiceStatus => Boolean(x));
      return { ...svc, total: rows.length, done: rows.filter((r) => r.count > 0).length };
    }),
  };
}
