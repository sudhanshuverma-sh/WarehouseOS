/**
 * Control Room compliance: how reliably each site and each service files,
 * across every scheduled service in the Service Registry and every Master
 * Data site. The Today board answers "is it done now?"; this answers "does
 * it get done, day after day?".
 *
 * Rules:
 *  - The period is the last N closed days, ending yesterday. Today is shown
 *    beside it as "in progress" and never counts against anyone.
 *  - DAILY services are due every day at every site that offers them.
 *  - A WEEKLY or MONTHLY service is due once per week or month touched by
 *    the period, but only once that week or month has ended, or it has
 *    already been filed. A week still running is not yet late.
 *  - On-request (EVENT_DRIVEN) services are never due, so they are left out.
 */

import { shiftDay } from '../analytics/period';
import {
  countFor,
  indexRecords,
  lastDays,
  periodFor,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
  type RecordIndex,
} from './siteServiceStatus';

export interface ComplianceCell {
  day: string;
  done: number;
  due: number;
}

export interface SiteCompliance {
  site: ControlRoomSite;
  /** One per closed day, oldest first. */
  cells: ComplianceCell[];
  /** Today, in progress. */
  today: ComplianceCell;
  done: number;
  due: number;
  /** Daily services filed out of due, %; null when nothing was due. */
  rate: number | null;
  /** Fully filed days in a row, ending yesterday. */
  streak: number;
  /** Closed days with something due and not all of it filed. */
  missed: number;
}

export interface ServiceCompliance extends ControlRoomService {
  done: number;
  due: number;
  rate: number | null;
}

export interface DayRate extends ComplianceCell {
  rate: number | null;
}

export interface ComplianceReport {
  days: string[];
  today: string;
  sites: SiteCompliance[];
  services: ServiceCompliance[];
  /** Every scheduled filing due in the period, filed out of due, %. */
  overall: number | null;
  /** The same for the period just before, to compare. */
  prevOverall: number | null;
  /** Sites with every daily filing in. */
  perfect: number;
  /** Sites under 70%. */
  under70: number;
  /** The network's daily-service rate per closed day, then today. */
  dayRates: DayRate[];
  todayRate: DayRate;
}

const pct = (done: number, due: number) => (due > 0 ? Math.round((done / due) * 1000) / 10 : null);
const offers = (site: ControlRoomSite, svc: ControlRoomService) => site.services === 'ALL' || site.services.includes(svc.code);

/** Each scheduled service's filed / due over a run of closed days. */
function serviceTotals(index: RecordIndex, sites: ControlRoomSite[], services: ControlRoomService[], days: string[]): ServiceCompliance[] {
  const last = days[days.length - 1];
  return services
    .filter((s) => s.cadence !== 'EVENT_DRIVEN')
    .map((svc) => {
      let done = 0;
      let due = 0;
      if (svc.cadence === 'DAILY') {
        for (const site of sites) {
          if (!offers(site, svc)) continue;
          for (const day of days) {
            due++;
            if (countFor(index, svc.code, site, [day, day]) > 0) done++;
          }
        }
      } else {
        // Each week or month the period touches, once.
        const periods = new Map<string, [string, string]>();
        for (const day of days) {
          const p = periodFor(svc.cadence, day);
          periods.set(p[0], p);
        }
        for (const site of sites) {
          if (!offers(site, svc)) continue;
          for (const [from, to] of periods.values()) {
            const filed = countFor(index, svc.code, site, [from, to]) > 0;
            const ended = to <= last;
            if (!filed && !ended) continue; // still running and not filed yet: not late
            due++;
            if (filed) done++;
          }
        }
      }
      return { ...svc, done, due, rate: pct(done, due) };
    });
}

export function complianceReport(
  sites: ControlRoomSite[],
  services: ControlRoomService[],
  records: ControlRoomRecords,
  today: string,
  days: number,
): ComplianceReport {
  const index = indexRecords(records);
  const yesterday = shiftDay(today, -1);
  const closed = lastDays(yesterday, days);
  const daily = services.filter((s) => s.cadence === 'DAILY');

  const cell = (site: ControlRoomSite, day: string): ComplianceCell => {
    let done = 0;
    let due = 0;
    for (const svc of daily) {
      if (!offers(site, svc)) continue;
      due++;
      if (countFor(index, svc.code, site, [day, day]) > 0) done++;
    }
    return { day, done, due };
  };

  const rows: SiteCompliance[] = sites.map((site) => {
    const cells = closed.map((day) => cell(site, day));
    const done = cells.reduce((t, c) => t + c.done, 0);
    const due = cells.reduce((t, c) => t + c.due, 0);
    let streak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (c.due === 0) continue; // nothing due does not break a streak
      if (c.done < c.due) break;
      streak++;
    }
    return {
      site,
      cells,
      today: cell(site, today),
      done,
      due,
      rate: pct(done, due),
      streak,
      missed: cells.filter((c) => c.due > 0 && c.done < c.due).length,
    };
  });
  rows.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.site.name.localeCompare(b.site.name));

  const svcNow = serviceTotals(index, sites, services, closed);
  const svcPrev = serviceTotals(index, sites, services, lastDays(shiftDay(closed[0], -1), days));
  const sum = (list: ServiceCompliance[]) => pct(list.reduce((t, s) => t + s.done, 0), list.reduce((t, s) => t + s.due, 0));

  const dayRate = (day: string, pick: (r: SiteCompliance) => ComplianceCell): DayRate => {
    const done = rows.reduce((t, r) => t + pick(r).done, 0);
    const due = rows.reduce((t, r) => t + pick(r).due, 0);
    return { day, done, due, rate: pct(done, due) };
  };

  return {
    days: closed,
    today,
    sites: rows,
    services: svcNow.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name)),
    overall: sum(svcNow),
    prevOverall: sum(svcPrev),
    perfect: rows.filter((r) => r.due > 0 && r.done === r.due).length,
    under70: rows.filter((r) => r.rate !== null && r.rate < 70).length,
    dayRates: closed.map((day, i) => dayRate(day, (r) => r.cells[i])),
    todayRate: dayRate(today, (r) => r.today),
  };
}
