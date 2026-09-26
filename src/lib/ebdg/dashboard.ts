/**
 * EB-DG dashboard — site power across every site, from the EB-DG entries
 * filed in WarehouseOS.
 *
 * The ZHPL "Site Power" figures (diesel burnt, DG hours, DG vs EB energy,
 * stock cover, B-checks, power factor) plus what the app's EB-DG record adds:
 * each DG on its own (DG 1, 2 and 3), solar, cost per unit, power cuts, peak
 * load and water. Pure, so every number is tested without a browser.
 *
 * Two facts about the record shape the maths:
 *  - Every site is offered DG 1, 2 and 3, and a DG left blank books nothing.
 *    A DG counts as installed at a site once any entry has a reading for it,
 *    so a two-DG site never shows an empty DG 3.
 *  - The main HSD tank feeds each DG's own day tank (DGn_HSD_Added); diesel
 *    is burnt from the day tanks. Diesel on site is therefore the main tank
 *    plus every day tank.
 *
 * A row with an impossible value (a negative reading, more than 24 hours of
 * running, a date in the future) is left out quietly, so one bad entry
 * cannot move the headline figures.
 */

import type { EbDgRow } from '../../types/ebdg';
import {
  DEFAULT_PERIOD_FILTERS,
  formatDate,
  monthsOf,
  previousRange,
  rangeFor,
  type PeriodFilters,
} from '../analytics/period';

export { changePct, daysBetween, formatDate, formatMonth, formatRange, previousRange, rangeFor, shiftDay } from '../analytics/period';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

// The period and scope are shared with the other analytics dashboards.
export type { Segment, Preset } from '../analytics/period';
export type EbDgFilters = PeriodFilters;
export const DEFAULT_EBDG_FILTERS: EbDgFilters = DEFAULT_PERIOD_FILTERS;

/** What the dashboard knows about a site beyond its rows. */
export interface SiteInfo {
  name: string;
  city: string;
  channel: 'B2B' | 'B2C' | 'BOTH';
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type DgNo = 1 | 2 | 3;
export const DGS: readonly DgNo[] = [1, 2, 3];

export interface BCheck {
  remHrs: number | null;
  remDays: number | null;
  due: string;
  status: string;
}

export type MaintenanceState = 'OVERDUE' | 'DUE SOON' | 'OK' | 'NO DATA';

export interface SitePower {
  code: string;
  site: string;
  city: string;
  segment: 'B2B' | 'B2C';
  /** DGs with any reading at this site, ever. */
  installed: DgNo[];
  hsd: number;
  dgKwh: number;
  grid: number;
  solar: number;
  dgHrs: number;
  dg1: number;
  dg2: number;
  dg3: number;
  days: number;
  /** Diesel on site: main tank plus every day tank, latest readings. */
  stock: number;
  mainTank: number;
  dayTanks: number;
  /** Litres per running hour over the period. */
  ltrHr: number;
  /** DG units generated per litre. */
  kwhPerL: number;
  /** Days of diesel at this site's average daily burn. */
  cover: number | null;
  /** Hours the DGs can run on current stock at this site's burn rate. */
  autonomy: number | null;
  /** Median grid power factor. */
  pf: number | null;
  /** Latest B-check reading per DG that has one. */
  bcheck: Partial<Record<DgNo, BCheck>>;
  ebAmt: number;
  dgAmt: number;
  spend: number;
  /** Spend per unit of energy, all sources. */
  rate: number | null;
  cuts: number;
  /** Average share of the day on grid supply. */
  supplyPct: number | null;
  peakLoad: number | null;
  water: number;
}

/** One generator: a DG at a site. */
export interface DgUnit {
  code: string;
  site: string;
  n: DgNo;
  hrs: number;
  hsd: number;
  kwh: number;
  ltrHr: number | null;
  kwhPerL: number | null;
  hourMeter: number | null;
  dayTank: number | null;
  /** Share of the site's DG hours this unit ran. */
  share: number;
  bcheck: BCheck | null;
  state: MaintenanceState;
}

export interface DayPoint {
  d: string;
  hsd: number;
  hrs: number;
  grid: number;
  dgKwh: number;
  solar: number;
  spend: number;
  cuts: number;
  dg1Hrs: number;
  dg2Hrs: number;
  dg3Hrs: number;
  dg1Hsd: number;
  dg2Hsd: number;
  dg3Hsd: number;
}

/** One site's figures on one day, for the click-a-day panel. */
export interface DaySite {
  code: string;
  site: string;
  hsd: number;
  hrs: number;
  dgKwh: number;
  grid: number;
  solar: number;
  spend: number;
  cuts: number;
}

/** One site's day, for the site drawer. */
export interface SiteDay {
  d: string;
  hrsBy: Record<DgNo, number>;
  hsdBy: Record<DgNo, number>;
  hrs: number;
  hsd: number;
  ltrHr: number | null;
  dgKwh: number;
  grid: number;
  solar: number;
  ebHrs: number | null;
  cuts: number | null;
  mainTank: number | null;
  dayTanks: number | null;
  pf: number | null;
  spend: number | null;
}

/** The headline totals, also worked out for the period before, to compare. */
export interface Totals {
  hsd: number;
  dgHrs: number;
  dgKwh: number;
  grid: number;
  solar: number;
  energy: number;
  spend: number;
  cuts: number;
  water: number;
  sites: number;
}

export interface EbDgDashboard {
  kpi: Totals & {
    dgHrsBy: Record<DgNo, number>;
    hsdBy: Record<DgNo, number>;
    kwhBy: Record<DgNo, number>;
    sitesRanDg: number;
    units: number;
    rows: number;
    /** Rows left out for an impossible value. */
    excluded: number;
    dgShare: number;
    ebShare: number;
    solarShare: number;
    firstDate: string;
    lastDate: string;
    ebAmt: number;
    dgAmt: number;
    solarAmt: number;
    /** ₹ per unit: all sources, DG only, EB only. */
    blendedRate: number | null;
    dgUnitRate: number | null;
    ebUnitRate: number | null;
    hsdRate: number | null;
    gridSupplyPct: number | null;
    peakLoad: number | null;
    def: number;
    hasSolar: boolean;
    hasWater: boolean;
    hasDef: boolean;
    /** The same totals for the equal-length period just before; null for "all". */
    prev: Totals | null;
  };
  sites: SitePower[];
  units: DgUnit[];
  daily: DayPoint[];
  daySites: Record<string, DaySite[]>;
  siteDays: Record<string, SiteDay[]>;
  range: { from: string | null; to: string };
  prevRange: { from: string; to: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A cell as a number: blank, text or null count as absent. */
export function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
const nz = (v: unknown) => num(v) ?? 0;
const pos = (v: unknown) => Math.max(nz(v), 0);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number, digits = 1) => (b > 0 ? Math.round((a / b) * 10 ** digits) / 10 ** digits : null);

const dateOf = (r: EbDgRow) => String(r.Date ?? '').slice(0, 10);
const field = (r: EbDgRow, name: string) => (r as unknown as Record<string, unknown>)[name];
const dgVal = (r: EbDgRow, n: DgNo, suffix: string) => field(r, `DG${n}_${suffix}`);
const byDg = (): Record<DgNo, number> => ({ 1: 0, 2: 0, 3: 0 });

/** The months that have entries, newest first, for the month picker. */
export function monthsWithData(rows: readonly EbDgRow[], today: string): string[] {
  return monthsOf(rows.map((r) => String(r.Date ?? '')), today);
}

/** An entry no real day could produce. Left out of every figure. */
export function isImpossible(r: EbDgRow, today: string): boolean {
  if (dateOf(r) > today) return true;
  for (const n of DGS) {
    const h = num(dgVal(r, n, 'Run_Hrs'));
    if (h !== null && (h < 0 || h > 24)) return true;
  }
  if (nz(r.Total_Run_Hrs) > 24) return true;
  return nz(r.Total_HSD_Consumption) < 0 || nz(r.Grid_KWH_Consumed) < 0 || nz(r.Total_KWH_Consumption) < 0;
}

/** DGs with any reading in these rows: a DG never read is not installed. */
export function installedDgs(rows: readonly EbDgRow[]): DgNo[] {
  return DGS.filter((n) =>
    rows.some(
      (r) =>
        num(dgVal(r, n, 'Hour_Meter')) !== null ||
        num(dgVal(r, n, 'KWH_Closing')) !== null ||
        num(dgVal(r, n, 'HSD_Closing')) !== null ||
        nz(dgVal(r, n, 'Run_Hrs')) > 0,
    ),
  );
}

/** Spend on a row: the record's total, or its parts when the total is blank. */
const spendOf = (r: EbDgRow) => {
  const total = num(r.Total_Amount);
  return total !== null ? Math.max(total, 0) : pos(r.EB_Amount) + pos(r.DG_Amount) + pos(r.Solar_Amount);
};

/** What one B-check reading says: past due, due within 50 h / 30 days, or fine. */
export function bcheckState(checks: readonly BCheck[]): { state: MaintenanceState; worstHrs: number | null; worstDays: number | null } {
  const hrs = checks.map((c) => c.remHrs).filter((v): v is number => v !== null);
  const days = checks.map((c) => c.remDays).filter((v): v is number => v !== null);
  if (!hrs.length && !days.length) return { state: 'NO DATA', worstHrs: null, worstDays: null };
  const worstHrs = hrs.length ? Math.min(...hrs) : null;
  const worstDays = days.length ? Math.min(...days) : null;
  const overdue = (worstHrs !== null && worstHrs <= 0) || (worstDays !== null && worstDays <= 0);
  const soon = !overdue && ((worstHrs !== null && worstHrs <= 50) || (worstDays !== null && worstDays <= 30));
  return { state: overdue ? 'OVERDUE' : soon ? 'DUE SOON' : 'OK', worstHrs, worstDays };
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

function totalsOf(rows: readonly EbDgRow[]): Totals {
  const t: Totals = { hsd: 0, dgHrs: 0, dgKwh: 0, grid: 0, solar: 0, energy: 0, spend: 0, cuts: 0, water: 0, sites: 0 };
  const sites = new Set<string>();
  for (const r of rows) {
    sites.add(r.Site_Code);
    t.hsd += pos(r.Total_HSD_Consumption);
    t.dgHrs += pos(r.Total_Run_Hrs);
    t.dgKwh += pos(r.Total_KWH_Consumption);
    t.grid += pos(r.Grid_KWH_Consumed);
    t.solar += pos(r.Solar_Generated);
    t.spend += spendOf(r);
    t.cuts += pos(r.EB_Power_Cuts);
    t.water += pos(r.Water_Consumed);
  }
  t.energy = t.dgKwh + t.grid + t.solar;
  return {
    hsd: Math.round(t.hsd),
    dgHrs: round1(t.dgHrs),
    dgKwh: Math.round(t.dgKwh),
    grid: Math.round(t.grid),
    solar: Math.round(t.solar),
    energy: Math.round(t.energy),
    spend: Math.round(t.spend),
    cuts: Math.round(t.cuts),
    water: round1(t.water),
    sites: sites.size,
  };
}

export function computeEbDgDashboard(
  allRows: readonly EbDgRow[],
  siteInfo: (code: string) => SiteInfo | undefined,
  filters: EbDgFilters,
  today: string,
): EbDgDashboard {
  const range = rangeFor(filters, today);
  const prevRange = previousRange(range);
  const wanted = new Set(filters.sites);
  const segmentOf = (code: string): 'B2B' | 'B2C' => (siteInfo(code)?.channel === 'B2C' ? 'B2C' : 'B2B');
  const inScope = (r: EbDgRow) =>
    !!r.Site_Code &&
    (filters.segment === 'ALL' || segmentOf(r.Site_Code) === filters.segment) &&
    (!wanted.size || wanted.has(r.Site_Code));

  // Which DGs each site has, from all its history.
  const historyBySite = new Map<string, EbDgRow[]>();
  for (const r of allRows) {
    const list = historyBySite.get(r.Site_Code);
    if (list) list.push(r);
    else historyBySite.set(r.Site_Code, [r]);
  }
  const installedCache = new Map<string, DgNo[]>();
  const installedAt = (code: string) => {
    let v = installedCache.get(code);
    if (!v) installedCache.set(code, (v = installedDgs(historyBySite.get(code) ?? [])));
    return v;
  };

  let excluded = 0;
  const rows: EbDgRow[] = [];
  const prevRows: EbDgRow[] = [];
  for (const r of allRows) {
    const d = dateOf(r);
    if (!d || !inScope(r)) continue;
    const inRange = (!range.from || d >= range.from) && d <= range.to;
    const inPrev = !!prevRange && d >= prevRange.from && d <= prevRange.to;
    if (!inRange && !inPrev) continue;
    if (isImpossible(r, today)) {
      if (inRange) excluded++;
      continue;
    }
    if (inRange) rows.push(r);
    else prevRows.push(r);
  }
  rows.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

  type Acc = SitePower & {
    pfs: number[];
    supply: number[];
    dayTankBy: Partial<Record<DgNo, number>>;
    hourMeterBy: Partial<Record<DgNo, number>>;
    unitBy: Record<DgNo, { hrs: number; hsd: number; kwh: number }>;
  };
  const bySite = new Map<string, Acc>();
  const daily = new Map<string, DayPoint>();
  const daySites: Record<string, DaySite[]> = {};
  const siteDays: Record<string, SiteDay[]> = {};
  const hsdRates: number[] = [];
  const supplyAll: number[] = [];
  const kpiBy = { hrs: byDg(), hsd: byDg(), kwh: byDg() };
  let ebAmt = 0;
  let dgAmt = 0;
  let solarAmt = 0;
  let def = 0;
  let hasDef = false;
  let peakLoad: number | null = null;

  for (const r of rows) {
    const code = r.Site_Code;
    const date = dateOf(r);
    const installed = installedAt(code);

    let s = bySite.get(code);
    if (!s) {
      const info = siteInfo(code);
      s = {
        code,
        site: info?.name || code,
        city: info?.city || '',
        segment: segmentOf(code),
        installed,
        hsd: 0, dgKwh: 0, grid: 0, solar: 0, dgHrs: 0, dg1: 0, dg2: 0, dg3: 0, days: 0,
        stock: 0, mainTank: 0, dayTanks: 0, ltrHr: 0, kwhPerL: 0, cover: null, autonomy: null, pf: null, bcheck: {},
        ebAmt: 0, dgAmt: 0, spend: 0, rate: null, cuts: 0, supplyPct: null, peakLoad: null, water: 0,
        pfs: [], supply: [], dayTankBy: {}, hourMeterBy: {},
        unitBy: { 1: { hrs: 0, hsd: 0, kwh: 0 }, 2: { hrs: 0, hsd: 0, kwh: 0 }, 3: { hrs: 0, hsd: 0, kwh: 0 } },
      };
      bySite.set(code, s);
    }
    s.days++;

    const hsd = pos(r.Total_HSD_Consumption);
    const hrs = pos(r.Total_Run_Hrs);
    const kwh = pos(r.Total_KWH_Consumption);
    const grid = pos(r.Grid_KWH_Consumed);
    const solar = pos(r.Solar_Generated);
    const spend = spendOf(r);
    const cuts = num(r.EB_Power_Cuts);

    // Rows are in date order, so the latest reading of each tank wins.
    const main = num(r.HSD_Tank_Closing);
    if (main !== null && main >= 0) s.mainTank = main;
    const hrsBy = byDg();
    const hsdBy = byDg();
    let dayTanks: number | null = null;
    for (const n of installed) {
      const h = pos(dgVal(r, n, 'Run_Hrs'));
      const f = pos(dgVal(r, n, 'HSD_Consumption'));
      const k = pos(dgVal(r, n, 'KWH_Consumption'));
      hrsBy[n] = h;
      hsdBy[n] = f;
      s.unitBy[n].hrs += h;
      s.unitBy[n].hsd += f;
      s.unitBy[n].kwh += k;
      kpiBy.hrs[n] += h;
      kpiBy.hsd[n] += f;
      kpiBy.kwh[n] += k;
      const tank = num(dgVal(r, n, 'HSD_Closing'));
      if (tank !== null && tank >= 0) {
        s.dayTankBy[n] = tank;
        dayTanks = (dayTanks ?? 0) + tank;
      }
      const meter = num(dgVal(r, n, 'Hour_Meter'));
      if (meter !== null) {
        s.hourMeterBy[n] = meter;
        // B-check: the latest reading from a day the DG's meter was read.
        const remHrs = num(dgVal(r, n, 'B_Check_Remaining_Hrs'));
        const remDays = num(dgVal(r, n, 'B_Check_Remaining_Days'));
        if (remHrs !== null || remDays !== null) {
          s.bcheck[n] = {
            remHrs: remHrs === null ? null : Math.round(remHrs),
            remDays: remDays === null ? null : Math.round(remDays),
            due: String(dgVal(r, n, 'B_Check_Due_Date') ?? ''),
            status: String(dgVal(r, n, 'B_Check_Status') ?? ''),
          };
        }
      }
    }

    s.hsd += hsd;
    s.dgKwh += kwh;
    s.grid += grid;
    s.solar += solar;
    s.dgHrs += hrs;
    s.dg1 += hrsBy[1];
    s.dg2 += hrsBy[2];
    s.dg3 += hrsBy[3];
    s.ebAmt += pos(r.EB_Amount);
    s.dgAmt += pos(r.DG_Amount);
    s.spend += spend;
    s.cuts += cuts === null ? 0 : Math.max(cuts, 0);
    s.water += pos(r.Water_Consumed);
    ebAmt += pos(r.EB_Amount);
    dgAmt += pos(r.DG_Amount);
    solarAmt += pos(r.Solar_Amount);

    const pf = num(r.Grid_PF);
    if ((grid > 0 || hsd > 0) && pf !== null && pf > 0 && pf <= 1.2) s.pfs.push(pf);
    const supply = num(r.Grid_Supply_Pct);
    if (supply !== null && supply >= 0) {
      s.supply.push(supply);
      supplyAll.push(supply);
    }
    const load = num(r.Max_Load_KW);
    if (load !== null && load > 0) {
      s.peakLoad = Math.max(s.peakLoad ?? 0, load);
      peakLoad = Math.max(peakLoad ?? 0, load);
    }
    const rate = num(r.HSD_Rate);
    if (rate !== null && rate > 0) hsdRates.push(rate);
    const defUsed = num(r.DEF_Used);
    if (defUsed !== null) {
      hasDef = true;
      def += Math.max(defUsed, 0);
    }

    const day = daily.get(date) ?? {
      d: date, hsd: 0, hrs: 0, grid: 0, dgKwh: 0, solar: 0, spend: 0, cuts: 0,
      dg1Hrs: 0, dg2Hrs: 0, dg3Hrs: 0, dg1Hsd: 0, dg2Hsd: 0, dg3Hsd: 0,
    };
    day.hsd += hsd;
    day.hrs += hrs;
    day.grid += grid;
    day.dgKwh += kwh;
    day.solar += solar;
    day.spend += spend;
    day.cuts += cuts === null ? 0 : Math.max(cuts, 0);
    day.dg1Hrs += hrsBy[1];
    day.dg2Hrs += hrsBy[2];
    day.dg3Hrs += hrsBy[3];
    day.dg1Hsd += hsdBy[1];
    day.dg2Hsd += hsdBy[2];
    day.dg3Hsd += hsdBy[3];
    daily.set(date, day);

    (daySites[date] ??= []).push({
      code, site: s.site, hsd: Math.round(hsd), hrs: round1(hrs), dgKwh: Math.round(kwh), grid: Math.round(grid), solar: Math.round(solar), spend: Math.round(spend), cuts: cuts ?? 0,
    });
    (siteDays[code] ??= []).push({
      d: date,
      hrsBy,
      hsdBy,
      hrs: round1(hrs),
      hsd: Math.round(hsd),
      ltrHr: ratio(hsd, hrs),
      dgKwh: Math.round(kwh),
      grid: Math.round(grid),
      solar: Math.round(solar),
      ebHrs: num(r.Grid_Supply_Hrs),
      cuts,
      mainTank: main,
      dayTanks,
      pf: pf === null ? null : round2(pf),
      spend: spend || null,
    });
  }

  const units: DgUnit[] = [];
  const sites: SitePower[] = [...bySite.values()].map(({ pfs, supply, dayTankBy, hourMeterBy, unitBy, ...s }) => {
    const dayTanks = Object.values(dayTankBy).reduce((a, b) => a + (b ?? 0), 0);
    const stock = s.mainTank + dayTanks;
    const ltrHr = s.dgHrs > 0.5 ? s.hsd / s.dgHrs : 0;
    const avgDaily = s.days ? s.hsd / s.days : 0;

    for (const n of s.installed) {
      const u = unitBy[n];
      const b = s.bcheck[n] ?? null;
      units.push({
        code: s.code,
        site: s.site,
        n,
        hrs: round1(u.hrs),
        hsd: Math.round(u.hsd),
        kwh: Math.round(u.kwh),
        ltrHr: ratio(u.hsd, u.hrs),
        kwhPerL: ratio(u.kwh, u.hsd, 2),
        hourMeter: hourMeterBy[n] ?? null,
        dayTank: dayTankBy[n] ?? null,
        share: s.dgHrs > 0 ? Math.round((u.hrs / s.dgHrs) * 100) : 0,
        bcheck: b,
        state: bcheckState(b ? [b] : []).state,
      });
    }

    return {
      ...s,
      hsd: Math.round(s.hsd),
      dgKwh: Math.round(s.dgKwh),
      grid: Math.round(s.grid),
      solar: Math.round(s.solar),
      dgHrs: round1(s.dgHrs),
      dg1: round1(s.dg1),
      dg2: round1(s.dg2),
      dg3: round1(s.dg3),
      stock: Math.round(stock),
      mainTank: Math.round(s.mainTank),
      dayTanks: Math.round(dayTanks),
      ltrHr: round1(ltrHr),
      kwhPerL: ratio(s.dgKwh, s.hsd, 2) ?? 0,
      cover: avgDaily > 0.5 && stock > 0 ? round1(stock / avgDaily) : null,
      autonomy: ltrHr > 0 && stock > 0 ? Math.round(stock / ltrHr) : null,
      pf: pfs.length ? round2(median(pfs)) : null,
      ebAmt: Math.round(s.ebAmt),
      dgAmt: Math.round(s.dgAmt),
      spend: Math.round(s.spend),
      rate: ratio(s.spend, s.dgKwh + s.grid + s.solar, 2),
      cuts: Math.round(s.cuts),
      supplyPct: supply.length ? round1(supply.reduce((a, b) => a + b, 0) / supply.length) : null,
      water: round1(s.water),
    };
  });
  sites.sort((a, b) => b.hsd - a.hsd || a.site.localeCompare(b.site));
  units.sort((a, b) => b.hrs - a.hrs || a.site.localeCompare(b.site) || a.n - b.n);
  for (const list of Object.values(siteDays)) list.reverse(); // newest first

  const tot = totalsOf(rows);
  const share = (part: number) => (tot.energy ? Math.round((part / tot.energy) * 1000) / 10 : 0);
  const round0By = (r: Record<DgNo, number>) => ({ 1: Math.round(r[1]), 2: Math.round(r[2]), 3: Math.round(r[3]) });

  return {
    kpi: {
      ...tot,
      dgHrsBy: { 1: round1(kpiBy.hrs[1]), 2: round1(kpiBy.hrs[2]), 3: round1(kpiBy.hrs[3]) },
      hsdBy: round0By(kpiBy.hsd),
      kwhBy: round0By(kpiBy.kwh),
      sitesRanDg: sites.filter((s) => s.dgHrs > 0).length,
      units: units.length,
      rows: rows.length,
      excluded,
      dgShare: share(tot.dgKwh),
      ebShare: share(tot.grid),
      solarShare: share(tot.solar),
      firstDate: rows.length ? dateOf(rows[0]) : '',
      lastDate: rows.length ? dateOf(rows[rows.length - 1]) : '',
      ebAmt: Math.round(ebAmt),
      dgAmt: Math.round(dgAmt),
      solarAmt: Math.round(solarAmt),
      blendedRate: ratio(tot.spend, tot.energy, 2),
      dgUnitRate: ratio(dgAmt, tot.dgKwh, 2),
      ebUnitRate: ratio(ebAmt, tot.grid, 2),
      hsdRate: hsdRates.length ? round2(median(hsdRates)) : null,
      gridSupplyPct: supplyAll.length ? round1(supplyAll.reduce((a, b) => a + b, 0) / supplyAll.length) : null,
      peakLoad,
      def: round1(def),
      hasSolar: tot.solar > 0,
      hasWater: tot.water > 0,
      hasDef,
      prev: prevRange ? totalsOf(prevRows) : null,
    },
    sites,
    units,
    daily: [...daily.values()]
      .sort((a, b) => a.d.localeCompare(b.d))
      .map((p) => ({
        ...p,
        hsd: Math.round(p.hsd),
        hrs: round1(p.hrs),
        grid: Math.round(p.grid),
        dgKwh: Math.round(p.dgKwh),
        solar: Math.round(p.solar),
        spend: Math.round(p.spend),
        dg1Hrs: round1(p.dg1Hrs),
        dg2Hrs: round1(p.dg2Hrs),
        dg3Hrs: round1(p.dg3Hrs),
        dg1Hsd: Math.round(p.dg1Hsd),
        dg2Hsd: Math.round(p.dg2Hsd),
        dg3Hsd: Math.round(p.dg3Hsd),
      })),
    daySites,
    siteDays,
    range,
    prevRange,
  };
}

/**
 * Every entry the dashboard's filters cover, newest first, exactly as filed:
 * the rows the Records table shows for EB-DG. Unlike the figures, nothing is
 * left out here, so an entry with an impossible value can still be found.
 */
export function entriesInView<R extends EbDgRow>(
  allRows: readonly R[],
  siteInfo: (code: string) => SiteInfo | undefined,
  filters: EbDgFilters,
  today: string,
): R[] {
  const range = rangeFor(filters, today);
  const wanted = new Set(filters.sites);
  return allRows
    .filter((r) => {
      const d = dateOf(r);
      if (!d || !r.Site_Code) return false;
      if ((range.from && d < range.from) || d > range.to) return false;
      if (filters.segment !== 'ALL' && (siteInfo(r.Site_Code)?.channel === 'B2C' ? 'B2C' : 'B2B') !== filters.segment) return false;
      return !wanted.size || wanted.has(r.Site_Code);
    })
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(a.Site_Code).localeCompare(String(b.Site_Code)));
}

// ---------------------------------------------------------------------------
// Needs attention: the few things someone should act on
// ---------------------------------------------------------------------------

export interface Attention {
  kind: 'fuel' | 'bcheck' | 'pf';
  tone: 'bad' | 'soon';
  code: string;
  site: string;
  title: string;
  detail: string;
}

/**
 * What needs acting on, worst first: diesel running out (under a week of
 * cover), a DG at or near its B-check, and a power factor low enough to
 * draw an EB penalty (under 0.90).
 */
export function attentionItems(d: Pick<EbDgDashboard, 'sites' | 'units'>): Attention[] {
  const items: Attention[] = [];
  for (const s of d.sites) {
    if (s.cover !== null && s.cover < 7) {
      items.push({
        kind: 'fuel',
        tone: s.cover < 3 ? 'bad' : 'soon',
        code: s.code,
        site: s.site,
        title: `${s.cover} days of diesel left`,
        detail: `${formatNum(s.stock)} L`,
      });
    }
    if (s.pf !== null && s.pf < 0.9) {
      items.push({ kind: 'pf', tone: 'soon', code: s.code, site: s.site, title: `Power factor ${s.pf.toFixed(2)}`, detail: 'EB penalty risk' });
    }
  }
  for (const u of d.units) {
    if (u.state !== 'OVERDUE' && u.state !== 'DUE SOON') continue;
    const b = u.bcheck;
    const left =
      b?.remHrs !== null && b?.remHrs !== undefined && b.remHrs > 0
        ? `in ${formatNum(b.remHrs)} h`
        : b?.remDays !== null && b?.remDays !== undefined && b.remDays > 0
          ? `in ${formatNum(b.remDays)} days`
          : 'overdue';
    items.push({
      kind: 'bcheck',
      tone: u.state === 'OVERDUE' ? 'bad' : 'soon',
      code: u.code,
      site: u.site,
      title: `DG ${u.n} B-check ${left}`,
      detail: b?.due ? formatDate(String(b.due).slice(0, 10)) : '500 h cycle',
    });
  }
  const rank = { bad: 0, soon: 1 };
  return items.sort((a, b) => rank[a.tone] - rank[b.tone] || a.site.localeCompare(b.site));
}

// ---------------------------------------------------------------------------
// B-check status, per site
// ---------------------------------------------------------------------------

/** The DG closest to its B-check decides the site's state. */
export function maintenanceOf(s: Pick<SitePower, 'bcheck'>): { state: MaintenanceState; nextDue: string; worstHrs: number | null; worstDays: number | null } {
  const { state, worstHrs, worstDays } = bcheckState(Object.values(s.bcheck));
  if (state === 'NO DATA') return { state, nextDue: '-', worstHrs, worstDays };
  // At a typical 8 h/day, compare the hour limit and the date limit on the same scale.
  const nextDue =
    worstHrs !== null && (worstDays === null || worstHrs <= worstDays * 8)
      ? `${worstHrs.toLocaleString('en-IN')} hrs`
      : `${(worstDays as number).toLocaleString('en-IN')} days`;
  return { state, nextDue, worstHrs, worstDays };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatNum = (n: number) => Math.round(n).toLocaleString('en-IN');

/** 74,352 → "74.4K", 2,108,794 → "2.11M". */
export function formatShort(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Rupees in lakh / crore once they are big: ₹2.4L, ₹1.2Cr. */
export function formatRupees(n: number): string {
  const v = Math.abs(n);
  if (v >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return `₹${formatNum(n)}`;
}

/** Hours of autonomy as "9 h" or "5.2 d". */
export const formatAutonomy = (h: number | null) => (h === null ? '-' : h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h} h`);
