/**
 * Fire Pump Healthiness dashboard: whether every site's fire system was
 * checked, what failed, and where it is still failing, from the checks filed
 * in WarehouseOS.
 *
 * A check's result is the form's own (lib/firePump/checks): any asked check
 * that is not its healthy answer makes the day CRITICAL; "sprinkler
 * available: No" is a fact about the site, not a fault. Pure, so every
 * figure is tested without a browser.
 */

import { daysBetween, formatShortDay, inRange, previousRange, rangeFor, type PeriodFilters } from '../analytics/period';
import { siteResolver, sitesInScope, type AnalyticsSite } from '../analytics/sites';
import { FIRE_PUMP_CHECKS, isFailure, visibleChecks, type FirePumpCheck } from './checks';
import type { FirePumpLog } from './records';

export type FireMetric = 'filing' | 'healthy' | 'critical' | 'pressure';

export interface FireTotals {
  filed: number;
  expected: number;
  /** Share of expected checks filed, %. */
  filingRate: number;
  ok: number;
  critical: number;
  /** Checks that came back OK, %. */
  healthyRate: number | null;
  /** Average hydrant header pressure, bar. */
  pressure: number | null;
}

export interface FirePoint {
  d: string;
  ok: number;
  critical: number;
  filing: number;
  healthy: number | null;
  pressure: number | null;
}

export interface CheckStat {
  key: string;
  label: string;
  group: string;
  asked: number;
  failed: number;
  /** Failed out of asked, %. */
  failRate: number;
}

export interface FireSiteRow {
  code: string;
  name: string;
  city: string;
  filed: number;
  expected: number;
  critical: number;
  /** The latest check in the period, or null when none was filed. */
  latest: { date: string; status: 'OK' | 'CRITICAL'; failed: string[]; pressure: number | null; by: string } | null;
}

export interface FireAttention {
  code: string;
  site: string;
  tone: 'bad' | 'soon';
  title: string;
  detail: string;
}

export interface FirePumpDashboard {
  kpi: FireTotals & { sites: number; criticalNow: number; openIssues: number; prev: FireTotals | null };
  daily: FirePoint[];
  checks: CheckStat[];
  sites: FireSiteRow[];
  attention: FireAttention[];
  entries: (FirePumpLog & { siteName: string; failed: string[] })[];
  range: { from: string | null; to: string };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const statusOf = (l: FirePumpLog): 'OK' | 'CRITICAL' => (l.overallStatus === 'CRITICAL' ? 'CRITICAL' : 'OK');
const failedChecks = (l: FirePumpLog): FirePumpCheck[] => visibleChecks(l.answers ?? {}).filter((c) => isFailure(c, l.answers?.[c.key]));
const pressureOf = (l: FirePumpLog) => {
  const p = Number(l.hydrantPressureBar);
  return l.hydrantPressureBar === null || l.hydrantPressureBar === undefined || !Number.isFinite(p) ? null : p;
};

function totalsOf(logs: readonly FirePumpLog[], expected: number): FireTotals {
  const filed = new Set(logs.map((l) => `${l.siteCode}|${l.date}`)).size;
  const critical = logs.filter((l) => statusOf(l) === 'CRITICAL').length;
  const ok = logs.length - critical;
  const pressures = logs.map(pressureOf).filter((p): p is number => p !== null);
  return {
    filed,
    expected,
    filingRate: expected ? Math.min(100, Math.round((filed / expected) * 100)) : 0,
    ok,
    critical,
    healthyRate: logs.length ? Math.round((ok / logs.length) * 100) : null,
    pressure: pressures.length ? round1(pressures.reduce((a, b) => a + b, 0) / pressures.length) : null,
  };
}

export function computeFirePumpDashboard(
  allLogs: readonly FirePumpLog[],
  allSites: readonly AnalyticsSite[],
  filters: PeriodFilters,
  today: string,
): FirePumpDashboard {
  const scope = sitesInScope(allSites, 'FIRE', filters.segment, filters.sites);
  const resolve = siteResolver(scope);
  const firstDay = allLogs.reduce((m, l) => (l.date && l.date < m ? l.date : m), today);
  const range = rangeFor(filters, today);
  const days = daysBetween(range.from ?? firstDay, range.to);
  const prevRange = previousRange(range);

  const own = allLogs.filter((l) => l.date && resolve(l.siteCode));
  const logs = own
    .filter((l) => inRange(l.date, range))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.submittedAt ?? '').localeCompare(String(a.submittedAt ?? '')));
  const prevLogs = prevRange ? own.filter((l) => l.date >= prevRange.from && l.date <= prevRange.to) : [];

  const byDay = new Map<string, FirePumpLog[]>();
  for (const l of logs) (byDay.get(l.date) ?? byDay.set(l.date, []).get(l.date)!).push(l);
  const daily: FirePoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, list]) => {
      const t = totalsOf(list, scope.length);
      return { d, ok: t.ok, critical: t.critical, filing: t.filingRate, healthy: t.healthyRate, pressure: t.pressure };
    });

  const checks: CheckStat[] = FIRE_PUMP_CHECKS.filter((c) => !c.neutral)
    .map((c) => {
      const asked = logs.filter((l) => visibleChecks(l.answers ?? {}).some((v) => v.key === c.key) && l.answers?.[c.key]);
      const failed = asked.filter((l) => isFailure(c, l.answers?.[c.key])).length;
      return { key: c.key, label: c.short, group: c.group, asked: asked.length, failed, failRate: asked.length ? Math.round((failed / asked.length) * 100) : 0 };
    })
    .sort((a, b) => b.failRate - a.failRate || b.failed - a.failed);

  const bySite = new Map<string, FirePumpLog[]>();
  for (const l of logs) {
    const site = resolve(l.siteCode)!;
    (bySite.get(site.id) ?? bySite.set(site.id, []).get(site.id)!).push(l);
  }
  const sites: FireSiteRow[] = scope
    .map((s) => {
      const list = bySite.get(s.id) ?? [];
      const last = list[0];
      return {
        code: s.id,
        name: s.name,
        city: s.city,
        filed: new Set(list.map((l) => l.date)).size,
        expected: days,
        critical: list.filter((l) => statusOf(l) === 'CRITICAL').length,
        latest: last
          ? { date: last.date, status: statusOf(last), failed: failedChecks(last).map((c) => c.short), pressure: pressureOf(last), by: last.submittedByName ?? last.submittedBy ?? '' }
          : null,
      };
    })
    .sort((a, b) => {
      const rank = (r: FireSiteRow) => (r.latest?.status === 'CRITICAL' ? 0 : r.latest ? 2 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

  const attention: FireAttention[] = [];
  for (const s of sites) {
    if (!s.latest) {
      attention.push({ code: s.code, site: s.name, tone: 'soon', title: 'Not checked in this period', detail: 'No check' });
      continue;
    }
    if (s.latest.status === 'CRITICAL') {
      attention.push({ code: s.code, site: s.name, tone: 'bad', title: s.latest.failed.join(', ') || 'Check failed', detail: formatShortDay(s.latest.date) });
    } else if (range.to === today && s.latest.date !== today) {
      attention.push({ code: s.code, site: s.name, tone: 'soon', title: 'Not checked today', detail: `Last ${formatShortDay(s.latest.date)}` });
    }
  }

  const expected = scope.length * days;
  const prevDays = prevRange ? daysBetween(prevRange.from, prevRange.to) : 0;
  const latestRows = sites.filter((s) => s.latest);

  return {
    kpi: {
      ...totalsOf(logs, expected),
      sites: bySite.size,
      criticalNow: latestRows.filter((s) => s.latest!.status === 'CRITICAL').length,
      openIssues: latestRows.reduce((t, s) => t + s.latest!.failed.length, 0),
      prev: prevRange ? totalsOf(prevLogs, scope.length * prevDays) : null,
    },
    daily,
    checks,
    sites,
    attention,
    entries: logs.map((l) => ({ ...l, siteName: resolve(l.siteCode)?.name ?? l.siteCode, failed: failedChecks(l).map((c) => c.short) })),
    range,
  };
}

