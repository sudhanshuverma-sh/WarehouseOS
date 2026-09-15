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
import type { ServiceRegistry, SiteMaster } from '../../types/masterData';
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
  dailySiteLogs: Pick<DailySiteLog, 'site' | 'date'>[];
  dieselLogs: Pick<DieselLog, 'warehouseId' | 'timestamp'>[];
  ebdgRows: { Site_Code?: string; Date?: string }[];
  submissions: Pick<TaskSubmission, 'warehouseId' | 'submissionDate'>[];
  sheetRecords: Record<string, { warehouseId?: string; site?: string; date?: string }[]>;
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

/** Active Site_Master sites; the app's warehouse list only when none are loaded. */
export function controlRoomSites(siteMaster: SiteMaster[], warehouses: Warehouse[]): ControlRoomSite[] {
  const active = siteMaster.filter((s) => s.Active === 'Yes' && s.Site_Code && s.Site_Code !== 'ALL');
  if (active.length) {
    return active.map((s) => ({
      id: s.Site_Code,
      whCode: s.WH_Code || '',
      name: s.Facility_Name || s.WH_Code || s.Site_Code,
      city: s.City || s.State || '',
      zone: s.Zone || '',
      channel: asChannel(s.Channel),
      services: parseServices(s.Services_Enabled),
    }));
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
    }));
}

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

export function indexRecords(records: ControlRoomRecords): RecordIndex {
  const index: RecordIndex = new Map();
  const add = (code: string, site: string | undefined, day: string | undefined) => {
    if (!site || !day) return;
    const bySite = index.get(code) ?? new Map<string, string[]>();
    const days = bySite.get(site) ?? [];
    days.push(day.slice(0, 10));
    bySite.set(site, days);
    index.set(code, bySite);
  };

  for (const l of records.dailySiteLogs) add('SITE_ACTIVITY', l.site, l.date);
  for (const l of records.dieselLogs) add('DIESEL', l.warehouseId, indiaDay(l.timestamp));
  for (const r of records.ebdgRows) add('EB_DG', r.Site_Code, r.Date);
  for (const s of records.submissions) add('CHECKLIST', s.warehouseId, s.submissionDate);
  for (const [sheetId, rows] of Object.entries(records.sheetRecords)) {
    const code = serviceCodeFor(sheetId);
    // The old power/water sheet still counts as EB-DG filings.
    if (DEDICATED.has(code) && sheetId !== 'SHEET_DG_POWER_WATER') continue;
    for (const r of rows ?? []) add(code, r.warehouseId || r.site, r.date);
  }
  return index;
}

function countFor(index: RecordIndex, code: string, site: ControlRoomSite, [from, to]: [string, string]): number {
  const bySite = index.get(code);
  if (!bySite) return 0;
  const keys = new Set([site.id, site.whCode].filter(Boolean));
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
