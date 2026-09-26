/**
 * Daily Site Report dashboard: how the sites' equipment and routines held up,
 * from the Daily Site Activity Reports filed in WarehouseOS.
 *
 * The rules are the form's own (lib/dailySite/scoring): a reading left blank
 * is 100%, anything under 100% is a deviation, a cold room or freezer down
 * or a routine check not done makes the day critical. Pure, so every figure
 * is tested without a browser.
 */

import type { DailySiteLog } from '../../types';
import { daysBetween, formatShortDay, inRange, previousRange, rangeFor, type PeriodFilters } from '../analytics/period';
import { siteResolver, sitesInScope, type AnalyticsSite } from '../analytics/sites';
import { MHE_KEYS, ROUTINE_KEYS, UTILITY_KEYS, type SiteHealth } from './scoring';

export type DailyMetric = 'filing' | 'utility' | 'mhe' | 'routine' | 'critical';

export interface DailyTotals {
  filed: number;
  expected: number;
  /** Share of expected reports filed, %. */
  filingRate: number;
  /** Average availability, %. */
  utility: number | null;
  mhe: number | null;
  /** Routine checks done out of those that applied, %. */
  routine: number | null;
  pmPlanned: number;
  pmCompleted: number;
  /** PM completed out of planned, %. */
  pm: number | null;
  critical: number;
  partial: number;
  clear: number;
}

export interface DailyPoint {
  d: string;
  filing: number;
  utility: number | null;
  mhe: number | null;
  routine: number | null;
  critical: number;
  filed: number;
}

export interface AssetStat {
  key: string;
  label: string;
  group: 'Utility' | 'MHE';
  /** Average availability, %. */
  avg: number;
  /** Reports where it was under 100%. */
  down: number;
  /** A stock-at-risk utility (cold room, freezers). */
  critical: boolean;
}

export interface RoutineStat {
  key: string;
  label: string;
  done: number;
  notDone: number;
  na: number;
  /** Done out of Done + Not Done, %. */
  rate: number | null;
}

export interface DailySiteRow {
  code: string;
  name: string;
  city: string;
  filed: number;
  expected: number;
  utility: number | null;
  mhe: number | null;
  routine: number | null;
  pm: number | null;
  critical: number;
  /** The latest report in the period. */
  latest: { date: string; status: SiteHealth; deviations: number; by: string; highlights: string } | null;
}

export interface DailyAttention {
  code: string;
  site: string;
  tone: 'bad' | 'soon';
  title: string;
  detail: string;
}

export interface DailySiteDashboard {
  kpi: DailyTotals & { sites: number; prev: DailyTotals | null };
  daily: DailyPoint[];
  assets: AssetStat[];
  routines: RoutineStat[];
  sites: DailySiteRow[];
  attention: DailyAttention[];
  entries: (DailySiteLog & { siteName: string })[];
  range: { from: string | null; to: string };
}

const pct = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? 100 : Math.max(0, Math.min(100, Number(v))));
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const field = (l: DailySiteLog, key: string) => (l as unknown as Record<string, unknown>)[key];

/** One report's utility and MHE availability, and its routine checks. */
function readingsOf(l: DailySiteLog) {
  const utility = UTILITY_KEYS.map((u) => pct(field(l, u.key)));
  const mhe = MHE_KEYS.map((m) => pct(field(l, m.key)));
  const routines = ROUTINE_KEYS.map((r) => String(field(l, r.key) || 'Done'));
  return {
    utility: utility.reduce((a, b) => a + b, 0) / utility.length,
    mhe: mhe.reduce((a, b) => a + b, 0) / mhe.length,
    done: routines.filter((v) => v === 'Done').length,
    notDone: routines.filter((v) => v === 'Not Done').length,
  };
}

function totalsOf(logs: readonly DailySiteLog[], expected: number): DailyTotals {
  const util: number[] = [];
  const mhe: number[] = [];
  let done = 0;
  let notDone = 0;
  let pmPlanned = 0;
  let pmCompleted = 0;
  let critical = 0;
  let partial = 0;
  let clear = 0;
  const filed = new Set<string>();
  for (const l of logs) {
    filed.add(`${l.site}|${l.date}`);
    const r = readingsOf(l);
    util.push(r.utility);
    mhe.push(r.mhe);
    done += r.done;
    notDone += r.notDone;
    pmPlanned += Math.max(Number(l.pmPlanned) || 0, 0);
    pmCompleted += Math.max(Number(l.pmCompleted) || 0, 0);
    if (l.worstStatus === 'critical') critical++;
    else if (l.worstStatus === 'partial') partial++;
    else clear++;
  }
  return {
    filed: filed.size,
    expected,
    filingRate: expected ? Math.min(100, Math.round((filed.size / expected) * 100)) : 0,
    utility: mean(util),
    mhe: mean(mhe),
    routine: done + notDone ? Math.round((done / (done + notDone)) * 100) : null,
    pmPlanned,
    pmCompleted,
    pm: pmPlanned ? Math.min(100, Math.round((pmCompleted / pmPlanned) * 100)) : null,
    critical,
    partial,
    clear,
  };
}

export function computeDailySiteDashboard(
  allLogs: readonly DailySiteLog[],
  allSites: readonly AnalyticsSite[],
  filters: PeriodFilters,
  today: string,
): DailySiteDashboard {
  const scope = sitesInScope(allSites, 'SITE_ACTIVITY', filters.segment, filters.sites);
  const resolve = siteResolver(scope);
  const firstDay = allLogs.reduce((m, l) => (l.date && l.date < m ? l.date : m), today);
  const range = rangeFor(filters, today);
  const days = daysBetween(range.from ?? firstDay, range.to);
  const prevRange = previousRange(range);

  const own = allLogs.filter((l) => l.date && resolve(l.site));
  const logs = own.filter((l) => inRange(l.date, range)).sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));
  const prevLogs = prevRange ? own.filter((l) => l.date >= prevRange.from && l.date <= prevRange.to) : [];

  // Per day.
  const byDay = new Map<string, DailySiteLog[]>();
  for (const l of logs) (byDay.get(l.date) ?? byDay.set(l.date, []).get(l.date)!).push(l);
  const daily: DailyPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, list]) => {
      const t = totalsOf(list, scope.length);
      return { d, filing: t.filingRate, utility: t.utility, mhe: t.mhe, routine: t.routine, critical: t.critical, filed: t.filed };
    });

  // Per asset and routine.
  const assets: AssetStat[] = [...UTILITY_KEYS.map((u) => ({ ...u, group: 'Utility' as const })), ...MHE_KEYS.map((m) => ({ ...m, group: 'MHE' as const }))].map(
    (a) => {
      const vals = logs.map((l) => pct(field(l, a.key)));
      return {
        key: a.key,
        label: a.label,
        group: a.group,
        avg: mean(vals) ?? 100,
        down: vals.filter((v) => v < 100).length,
        critical: 'isCrit' in a && !!a.isCrit,
      };
    },
  );
  assets.sort((a, b) => a.avg - b.avg || b.down - a.down);

  const routines: RoutineStat[] = ROUTINE_KEYS.map((r) => {
    const vals = logs.map((l) => String(field(l, r.key) || 'Done'));
    const done = vals.filter((v) => v === 'Done').length;
    const notDone = vals.filter((v) => v === 'Not Done').length;
    return { key: r.key, label: r.label, done, notDone, na: vals.length - done - notDone, rate: done + notDone ? Math.round((done / (done + notDone)) * 100) : null };
  });

  // Per site.
  const bySite = new Map<string, DailySiteLog[]>();
  for (const l of logs) {
    const site = resolve(l.site)!;
    (bySite.get(site.id) ?? bySite.set(site.id, []).get(site.id)!).push(l);
  }
  const sites: DailySiteRow[] = scope
    .map((s) => {
      const list = bySite.get(s.id) ?? [];
      const t = totalsOf(list, days);
      const last = list[0];
      return {
        code: s.id,
        name: s.name,
        city: s.city,
        filed: t.filed,
        expected: days,
        utility: t.utility,
        mhe: t.mhe,
        routine: t.routine,
        pm: t.pm,
        critical: t.critical,
        latest: last
          ? { date: last.date, status: last.worstStatus, deviations: last.deviationsCount, by: last.pocName, highlights: last.highlights ?? '' }
          : null,
      };
    })
    .sort((a, b) => b.critical - a.critical || (a.utility ?? 101) - (b.utility ?? 101) || a.name.localeCompare(b.name));

  // What to act on: the latest report per site, read for its faults.
  const attention: DailyAttention[] = [];
  for (const s of sites) {
    const last = bySite.get(s.code)?.[0];
    if (!last) {
      if (range.to === today) attention.push({ code: s.code, site: s.name, tone: 'soon', title: 'No report in this period', detail: 'Not filed' });
      continue;
    }
    for (const u of UTILITY_KEYS) {
      const v = pct(field(last, u.key));
      if (v >= 100) continue;
      const crit = 'isCrit' in u && !!u.isCrit;
      if (!crit && v >= 75) continue; // small dips on non-critical kit stay in the tables
      attention.push({
        code: s.code,
        site: s.name,
        tone: crit || v < 50 ? 'bad' : 'soon',
        title: `${u.label} at ${v}%`,
        detail: String(field(last, u.remarkKey) || formatShortDay(last.date)),
      });
    }
    for (const r of ROUTINE_KEYS) {
      if (String(field(last, r.key) || 'Done') !== 'Not Done') continue;
      attention.push({ code: s.code, site: s.name, tone: 'bad', title: `${r.label} not done`, detail: String(field(last, r.remarkKey) || formatShortDay(last.date)) });
    }
    for (const a of last.activities ?? []) {
      if (a.status !== 'Blocked') continue;
      attention.push({ code: s.code, site: s.name, tone: 'soon', title: `Blocked: ${a.work}`, detail: a.barrier || a.owner || formatShortDay(last.date) });
    }
  }
  attention.sort((a, b) => (a.tone === b.tone ? a.site.localeCompare(b.site) : a.tone === 'bad' ? -1 : 1));

  const expected = scope.length * days;
  const prevDays = prevRange ? daysBetween(prevRange.from, prevRange.to) : 0;
  const siteName = (code: string) => resolve(code)?.name ?? code;

  return {
    kpi: { ...totalsOf(logs, expected), sites: bySite.size, prev: prevRange ? totalsOf(prevLogs, scope.length * prevDays) : null },
    daily,
    assets,
    routines,
    sites,
    attention,
    entries: logs.map((l) => ({ ...l, siteName: siteName(l.site) })),
    range,
  };
}


/** One report's utility and MHE availability, for a table row. */
export function reportAvailability(l: DailySiteLog): { utility: number; mhe: number } {
  const r = readingsOf(l);
  return { utility: round1(r.utility), mhe: round1(r.mhe) };
}
