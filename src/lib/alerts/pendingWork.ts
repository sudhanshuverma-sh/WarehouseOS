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
 * somebody, plus today's safety checks that came back CRITICAL (a failed
 * fire pump check). Pass the sites already narrowed to what the person may see.
 */

import {
  computeSiteStatuses,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
} from '../controlRoom/siteServiceStatus';

export interface PendingItem {
  kind: 'service' | 'diesel' | 'critical';
  /** Service code, or 'DIESEL'. */
  code: string;
  /** What is waiting, in words. */
  label: string;
  /** The site it belongs to. */
  site: string;
  siteCode: string;
}

export interface PendingWork {
  total: number;
  /** Services not filed yet for their period. */
  services: number;
  /** Diesel requests waiting for approval or a POD. */
  diesel: number;
  /** Today's checks that found a fault (fire pump CRITICAL). */
  critical: number;
  /** How many sites have anything outstanding. */
  sites: number;
  /** The first few, for a list. `total` is the real count. */
  items: PendingItem[];
}

export interface DieselWaiting {
  warehouseId?: string;
  status?: string;
  validation?: string;
  uniqueId?: string;
}

/** A flattened fire pump check (see src/lib/firePump/records.ts). */
interface CriticalRow {
  warehouseId?: string;
  site?: string;
  date?: string;
  status?: string;
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
  for (const log of dieselLogs) {
    const site = known.get(String(log.warehouseId ?? '').toLowerCase());
    if (!site) continue;
    const waiting =
      log.status === AWAITING_APPROVAL ? 'waiting for approval' : AWAITING_POD.has(String(log.status)) ? 'waiting for a POD' : null;
    if (!waiting) continue;
    dieselDue++;
    withWork.add(site.id);
    if (items.length < MAX_ITEMS) {
      items.push({
        kind: 'diesel',
        code: 'DIESEL',
        label: `Diesel ${log.uniqueId ?? 'request'} ${waiting}`,
        site: site.name,
        siteCode: site.id,
      });
    }
  }

  // A failed fire check is the most urgent thing on the list, so it goes first.
  const criticalItems: PendingItem[] = [];
  for (const row of (records.sheetRecords.SHEET_FIRE ?? []) as CriticalRow[]) {
    if (row.date !== today || String(row.status).toUpperCase() !== 'CRITICAL') continue;
    const site = known.get(String(row.warehouseId ?? row.site ?? '').toLowerCase());
    if (!site) continue;
    withWork.add(site.id);
    criticalItems.push({
      kind: 'critical',
      code: 'FIRE',
      label: `Fire pump CRITICAL: ${row.issues || 'a check failed'}`,
      site: site.name,
      siteCode: site.id,
    });
  }

  return {
    total: servicesDue + dieselDue + criticalItems.length,
    services: servicesDue,
    diesel: dieselDue,
    critical: criticalItems.length,
    sites: withWork.size,
    items: [...criticalItems, ...items].slice(0, MAX_ITEMS),
  };
}

/** One line for the bell: honest about what the number counts. */
export function pendingSummary(work: PendingWork): string {
  if (work.total === 0) return 'Nothing pending today';
  const parts: string[] = [];
  if (work.services) parts.push(`${work.services} ${work.services === 1 ? 'filing' : 'filings'} due`);
  if (work.critical) parts.push(`${work.critical} critical ${work.critical === 1 ? 'check' : 'checks'}`);
  if (work.diesel) parts.push(`${work.diesel} diesel ${work.diesel === 1 ? 'request' : 'requests'}`);
  const where = work.sites === 1 ? '1 site' : `${work.sites} sites`;
  return `${parts.join(', ')} at ${where}`;
}
