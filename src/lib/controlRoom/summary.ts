/**
 * The Control Room summary: one page for the whole operation today.
 *
 * Built from the same pieces as the rest of the Control Room, so its numbers
 * always match them: the Today board's site/service statuses, the bell's
 * issues (pendingWork: critical checks, EB-DG maintenance, diesel waiting),
 * and the Daily Site Reports filed today. Compared with yesterday, with a
 * 7-day filing trend and a few plain sentences a manager can read or paste.
 */

import type { DailySiteLog } from '../../types';
import { shiftDay } from '../analytics/period';
import { pendingWork, type DieselWaiting } from '../alerts/pendingWork';
import {
  activityByDay,
  computeSiteStatuses,
  lastDays,
  siteMatches,
  summarise,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
  type ServiceProgress,
  type SiteStatus,
} from './siteServiceStatus';

export interface SummaryIssue {
  kind: 'critical' | 'daily' | 'maintenance' | 'diesel';
  tone: 'bad' | 'soon';
  site: string;
  siteCode: string;
  title: string;
}

export interface ServiceToday extends ServiceProgress {
  /** Sites where it is due and not filed yet; 0 for on-request services. */
  pending: number;
  scheduled: boolean;
}

export interface ControlRoomDaySummary {
  today: string;
  sites: { total: number; complete: number; partial: number; notStarted: number; completeYesterday: number };
  filings: { done: number; due: number; rate: number | null; rateYesterday: number | null };
  services: ServiceToday[];
  issues: SummaryIssue[];
  counts: { critical: number; dailyCritical: number; dailyPartial: number; maintenance: number; diesel: number };
  notStarted: { code: string; name: string }[];
  trend: { day: string; done: number; due: number; rate: number | null }[];
  headline: string[];
}

const pct = (done: number, due: number) => (due > 0 ? Math.round((done / due) * 1000) / 10 : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function filings(statuses: SiteStatus[]) {
  const done = statuses.reduce((t, s) => t + s.done, 0);
  const due = statuses.reduce((t, s) => t + s.due, 0);
  return { done, due, rate: pct(done, due) };
}

/** "a, b and c". */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function controlRoomSummary(input: {
  sites: ControlRoomSite[];
  services: ControlRoomService[];
  records: ControlRoomRecords;
  dieselLogs: DieselWaiting[];
  dailySiteLogs: Pick<DailySiteLog, 'site' | 'date' | 'worstStatus' | 'deviationsCount'>[];
  today: string;
}): ControlRoomDaySummary {
  const { sites, services, records, dieselLogs, dailySiteLogs, today } = input;
  const yesterday = shiftDay(today, -1);

  const now = computeSiteStatuses(sites, services, records, today);
  const before = computeSiteStatuses(sites, services, records, yesterday);
  const sumNow = summarise(now, services);
  const sumBefore = summarise(before, services);
  const fNow = filings(now);
  const fBefore = filings(before);

  const svc: ServiceToday[] = sumNow.services.map((s) => {
    const scheduled = s.cadence !== 'EVENT_DRIVEN';
    return { ...s, scheduled, pending: scheduled ? s.total - s.done : 0 };
  });

  // Issues: the bell's (uncapped), plus today's critical Daily Site Reports.
  const work = pendingWork({ sites, services, records, dieselLogs, today });
  const issues: SummaryIssue[] = work.issues.map((i) => ({
    kind: i.kind === 'maintenance' ? 'maintenance' : i.kind === 'diesel' ? 'diesel' : 'critical',
    tone: i.kind === 'critical' || i.tone === 'bad' ? 'bad' : 'soon',
    site: i.site,
    siteCode: i.siteCode,
    title: i.label,
  }));
  const todays = dailySiteLogs.filter((l) => l.date === today);
  let dailyCritical = 0;
  let dailyPartial = 0;
  for (const site of sites) {
    const log = todays.find((l) => siteMatches(site, l.site));
    if (!log) continue;
    if (log.worstStatus === 'critical') {
      dailyCritical++;
      issues.push({
        kind: 'daily',
        tone: 'bad',
        site: site.name,
        siteCode: site.id,
        title: `Daily report CRITICAL, ${plural(log.deviationsCount ?? 0, 'deviation')}`,
      });
    } else if (log.worstStatus === 'partial') dailyPartial++;
  }
  const rank = { bad: 0, soon: 1 };
  issues.sort((a, b) => rank[a.tone] - rank[b.tone] || a.site.localeCompare(b.site));

  const notStarted = now
    .filter((s) => s.state === 'not-started' && s.due > 0)
    .map((s) => ({ code: s.site.id, name: s.site.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const trend = activityByDay(sites, services, records, lastDays(today, 7)).map((d) => ({ day: d.day, done: d.done, due: d.due, rate: pct(d.done, d.due) }));

  const counts = {
    critical: work.critical,
    dailyCritical,
    dailyPartial,
    maintenance: work.maintenance,
    diesel: work.diesel,
  };

  // The headline, in plain sentences.
  const headline: string[] = [];
  const diff = sumNow.complete - sumBefore.complete;
  if (!sumNow.sites) headline.push('No sites are set up in Master Data yet.');
  else if (sumNow.complete === sumNow.sites)
    headline.push(sumNow.sites === 1 ? 'The site has filed everything due today.' : `All ${sumNow.sites} sites have filed everything due today.`);
  else
    headline.push(
      `${sumNow.complete} of ${sumNow.sites} sites have filed everything due today${
        diff ? `, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} on yesterday` : ''
      }.`,
    );
  if (fNow.due) headline.push(`${fNow.done} of ${plural(fNow.due, 'scheduled filing')} ${fNow.due === 1 ? 'is' : 'are'} in (${fNow.rate}%).`);
  const parts: string[] = [];
  if (counts.critical) parts.push(plural(counts.critical, 'critical check'));
  if (counts.dailyCritical) parts.push(`${plural(counts.dailyCritical, 'daily report')} flagged critical`);
  if (counts.maintenance) parts.push(plural(counts.maintenance, 'DG alert'));
  if (counts.diesel) parts.push(`${plural(counts.diesel, 'diesel request')} waiting`);
  headline.push(parts.length ? `Needs attention: ${list(parts)}.` : 'Nothing critical is open.');
  if (notStarted.length) {
    const names = notStarted.slice(0, 3).map((s) => s.name);
    const more = notStarted.length - names.length;
    headline.push(`${plural(notStarted.length, 'site has', 'sites have')} not started: ${list(more ? [...names, `${more} more`] : names)}.`);
  }

  return {
    today,
    sites: { total: sumNow.sites, complete: sumNow.complete, partial: sumNow.partial, notStarted: sumNow.notStarted, completeYesterday: sumBefore.complete },
    filings: { ...fNow, rateYesterday: fBefore.rate },
    services: svc,
    issues,
    counts,
    notStarted,
    trend,
    headline,
  };
}

/** The whole summary as plain text, for WhatsApp or an email. */
export function summaryText(s: ControlRoomDaySummary, dateLabel: string): string {
  const lines = [`Control Room summary, ${dateLabel}`, '', ...s.headline, ''];
  lines.push('Services today:');
  for (const svc of s.services) {
    lines.push(svc.scheduled ? `- ${svc.name}: ${svc.done} of ${svc.total} sites${svc.pending ? `, ${svc.pending} pending` : ''}` : `- ${svc.name}: ${svc.done} filed (on request)`);
  }
  if (s.issues.length) {
    lines.push('', 'Needs attention:');
    for (const i of s.issues.slice(0, 15)) lines.push(`- ${i.site}: ${i.title}`);
    if (s.issues.length > 15) lines.push(`- and ${s.issues.length - 15} more`);
  }
  if (s.notStarted.length) {
    lines.push('', `Not started (${s.notStarted.length}): ${s.notStarted.slice(0, 20).map((n) => n.name).join(', ')}${s.notStarted.length > 20 ? ', ...' : ''}`);
  }
  return lines.join('\n');
}
