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
 * somebody. Pass the sites already narrowed to what the person may see.
 */

import {
  computeSiteStatuses,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
} from '../controlRoom/siteServiceStatus';

export interface PendingItem {
  kind: 'service' | 'diesel';
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

  return { total: servicesDue + dieselDue, services: servicesDue, diesel: dieselDue, sites: withWork.size, items };
}

/** One line for the bell: honest about what the number counts. */
export function pendingSummary(work: PendingWork): string {
  if (work.total === 0) return 'Nothing pending today';
  const parts: string[] = [];
  if (work.services) parts.push(`${work.services} ${work.services === 1 ? 'filing' : 'filings'} due`);
  if (work.diesel) parts.push(`${work.diesel} diesel ${work.diesel === 1 ? 'request' : 'requests'}`);
  const where = work.sites === 1 ? '1 site' : `${work.sites} sites`;
  return `${parts.join(', ')} at ${where}`;
}
