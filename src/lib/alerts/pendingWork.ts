/**
 * What still needs doing today, counted once.
 *
 * The bell in the top bar, the mobile Alerts badge and the notification
 * list each used to work this out for themselves, with slightly different
 * rules, so the same screen could say 5 in one place and 4 in another. They
 * also looked at a single warehouse even for a Super Admin watching every
 * site, which made the number meaningless.
 *
 * This counts the same way for everyone: the services still pending for
 * their period at the sites in view, plus the diesel requests waiting on
 * somebody, plus today's entries that came back CRITICAL (a failed fire pump
 * check, or an issue answer on any built form), plus EB-DG maintenance: a DG
 * at or past its B-check, or a power factor that risks an EB penalty. Pass
 * the sites and services already narrowed to what the person may see: that
 * is what sends a maintenance alert to the site's POC and to the Service
 * Admin who holds EB-DG, and to nobody else.
 */

import {
  computeSiteStatuses,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
} from '../controlRoom/siteServiceStatus';
import { serviceCodeFor } from '../services/serviceCodes';
import { maintenanceAlerts } from '../ebdg/maintenance';

export interface PendingItem {
  kind: 'service' | 'diesel' | 'critical' | 'maintenance';
  /** Service code, or 'DIESEL'. */
  code: string;
  /** What is waiting, in words. */
  label: string;
  /** The site it belongs to. */
  site: string;
  siteCode: string;
  /** How urgent a maintenance alert is: past due, or coming up. */
  tone?: 'bad' | 'soon';
}

export interface PendingWork {
  total: number;
  /** Services not filed yet for their period. */
  services: number;
  /** Diesel requests waiting for approval or a POD. */
  diesel: number;
  /** Today's checks that found a fault (fire pump CRITICAL). */
  critical: number;
  /** EB-DG B-checks due or overdue, and low power factors. */
  maintenance: number;
  /** How many sites have anything outstanding. */
  sites: number;
  /** The first few, for a list. `total` is the real count. */
  items: PendingItem[];
  /** Every open issue, uncapped: critical checks, EB-DG maintenance, diesel waiting. */
  issues: PendingItem[];
}

export interface DieselWaiting {
  warehouseId?: string;
  status?: string;
  validation?: string;
  uniqueId?: string;
}

/**
 * An entry row that may carry an issue status: a fire pump check
 * (src/lib/firePump/records.ts) says `status`, a built form with issue
 * answers says `overall_status` (src/lib/services/formLogic.ts).
 */
interface CriticalRow {
  warehouseId?: string;
  site?: string;
  date?: string;
  status?: string;
  overall_status?: string;
  issues?: string;
}

/** Diesel states that are somebody's turn to act. */
const AWAITING_APPROVAL = 'Pending Admin Approval';
const AWAITING_POD = new Set(['Ready for Delivery', 'Pending Validation']);

const MAX_ITEMS = 12;

export function pendingWork(input: {
  sites: ControlRoomSite[];
  services: ControlRoomService[];
  records: ControlRoomRecords;
  dieselLogs: DieselWaiting[];
  today: string;
}): PendingWork {
  const { sites, services, records, dieselLogs, today } = input;
  const items: PendingItem[] = [];
  const withWork = new Set<string>();
  let servicesDue = 0;

  for (const status of computeSiteStatuses(sites, services, records, today)) {
    for (const s of status.services) {
      if (s.state !== 'pending') continue;
      servicesDue++;
      withWork.add(status.site.id);
      if (items.length < MAX_ITEMS) {
        items.push({ kind: 'service', code: s.code, label: `${s.name} not filed`, site: status.site.name, siteCode: status.site.id });
      }
    }
  }

  // Diesel is counted by request, not by site: two requests at one site are
  // two decisions somebody has to make.
  const known = new Map<string, ControlRoomSite>();
  for (const site of sites) for (const alias of [site.id, ...site.aliases]) known.set(alias.toLowerCase(), site);

  let dieselDue = 0;
  const dieselItems: PendingItem[] = [];
  for (const log of dieselLogs) {
    const site = known.get(String(log.warehouseId ?? '').toLowerCase());
    if (!site) continue;
    const waiting =
      log.status === AWAITING_APPROVAL ? 'waiting for approval' : AWAITING_POD.has(String(log.status)) ? 'waiting for a POD' : null;
    if (!waiting) continue;
    dieselDue++;
    withWork.add(site.id);
    const item: PendingItem = { kind: 'diesel', code: 'DIESEL', label: `Diesel ${log.uniqueId ?? 'request'} ${waiting}`, site: site.name, siteCode: site.id };
    dieselItems.push(item);
    if (items.length < MAX_ITEMS) items.push(item);
  }

  // A fault found today is the most urgent thing on the list, so it goes first.
  const criticalItems: PendingItem[] = [];
  for (const [sheetId, rows] of Object.entries(records.sheetRecords)) {
    const code = serviceCodeFor(sheetId);
    const name = code === 'FIRE' ? 'Fire pump' : services.find((s) => s.code === code)?.name ?? code;
    for (const row of (rows ?? []) as CriticalRow[]) {
      const status = String(row.overall_status ?? row.status ?? '').toUpperCase();
      if (row.date !== today || status !== 'CRITICAL') continue;
      const site = known.get(String(row.warehouseId ?? row.site ?? '').toLowerCase());
      if (!site) continue;
      withWork.add(site.id);
      criticalItems.push({
        kind: 'critical',
        code,
        label: `${name} CRITICAL: ${row.issues || 'an issue was reported'}`,
        site: site.name,
        siteCode: site.id,
      });
    }
  }

  // EB-DG maintenance, only for people who hold EB-DG.
  const maintenanceItems: PendingItem[] = [];
  if (services.some((s) => s.code === 'EB_DG')) {
    for (const alert of maintenanceAlerts(records.ebdgRows, today)) {
      const site = known.get(alert.siteCode.toLowerCase());
      if (!site) continue;
      withWork.add(site.id);
      maintenanceItems.push({ kind: 'maintenance', code: 'EB_DG', label: alert.label, site: site.name, siteCode: site.id, tone: alert.tone });
    }
  }

  return {
    total: servicesDue + dieselDue + criticalItems.length + maintenanceItems.length,
    services: servicesDue,
    diesel: dieselDue,
    critical: criticalItems.length,
    maintenance: maintenanceItems.length,
    sites: withWork.size,
    items: [...criticalItems, ...maintenanceItems.filter((m) => m.tone === 'bad'), ...items, ...maintenanceItems.filter((m) => m.tone !== 'bad')].slice(0, MAX_ITEMS),
    issues: [...criticalItems, ...maintenanceItems.filter((m) => m.tone === 'bad'), ...dieselItems, ...maintenanceItems.filter((m) => m.tone !== 'bad')],
  };
}

/** One line for the bell: honest about what the number counts. */
export function pendingSummary(work: PendingWork): string {
  if (work.total === 0) return 'Nothing pending today';
  const parts: string[] = [];
  if (work.services) parts.push(`${work.services} ${work.services === 1 ? 'filing' : 'filings'} due`);
  if (work.critical) parts.push(`${work.critical} critical ${work.critical === 1 ? 'check' : 'checks'}`);
  if (work.maintenance) parts.push(`${work.maintenance} DG ${work.maintenance === 1 ? 'alert' : 'alerts'}`);
  if (work.diesel) parts.push(`${work.diesel} diesel ${work.diesel === 1 ? 'request' : 'requests'}`);
  const where = work.sites === 1 ? '1 site' : `${work.sites} sites`;
  return `${parts.join(', ')} at ${where}`;
}
