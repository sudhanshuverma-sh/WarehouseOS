import { describe, expect, it } from 'vitest';
import type { EbDgRow } from '../../types/ebdg';
import { EBDG_COLUMN_ORDER } from './columns';
import {
  changePct,
  computeEbDgDashboard,
  attentionItems,
  DEFAULT_EBDG_FILTERS,
  entriesInView,
  formatAutonomy,
  formatRupees,
  formatShort,
  installedDgs,
  isImpossible,
  maintenanceOf,
  monthsWithData,
  previousRange,
  rangeFor,
  type SiteInfo,
} from './dashboard';

/**
 * The EB-DG dashboard's figures, from filed EB-DG rows: what it adds up, what
 * it leaves out, and how it treats each DG (1, 2 and 3) on its own.
 */

const TODAY = '2026-09-26';

const row = (site: string, date: string, over: Partial<Record<string, unknown>> = {}): EbDgRow => {
  const blank = Object.fromEntries(EBDG_COLUMN_ORDER.map((c) => [c, ''])) as unknown as EbDgRow;
  return { ...blank, Record_ID: `EBDG-${site}-${date}`, Site_Code: site, Date: date, ...over } as EbDgRow;
};

/**
 * A normal running day on DG 1: its day tank 200 → 160 (40 L burnt), topped
 * up 0; the main tank 500 → 500 (nothing transferred); 1,000 kWh from the grid.
 */
const running = (site: string, date: string, over: Partial<Record<string, unknown>> = {}) =>
  row(site, date, {
    DG1_HSD_Opening: 200,
    DG1_HSD_Added: 0,
    DG1_HSD_Closing: 160,
    DG1_HSD_Consumption: 40,
    DG1_KWH_Consumption: 120,
    DG1_Run_Hrs: 1,
    DG1_Hour_Meter: 300,
    Total_Run_Hrs: 1,
    Total_HSD_Consumption: 40,
    Total_KWH_Consumption: 120,
    HSD_Tank_Opening: 500,
    HSD_Received_Ltr: 0,
    HSD_Tank_Closing: 500,
    Grid_KWH_Consumed: 1000,
    Grid_PF: 0.97,
    Grid_Supply_Pct: 95,
    EB_Power_Cuts: 2,
    Max_Load_KW: 180,
    HSD_Rate: 90,
    EB_Rate_Per_Unit: 8,
    EB_Amount: 8000,
    DG_Amount: 3600,
    Total_Amount: 11600,
    DG1_B_Check_Remaining_Hrs: 200,
    DG1_B_Check_Remaining_Days: 120,
    DG1_B_Check_Due_Date: '2027-01-20',
    DG1_B_Check_Status: 'OK',
    ...over,
  });

const SITES: Record<string, SiteInfo> = {
  'ZHPL-HR-03': { name: 'Farrukhnagar-2', city: 'Gurgaon', channel: 'B2B' },
  'ZHPL-DL-01': { name: 'Delhi DC', city: 'Delhi', channel: 'B2C' },
};
const info = (code: string) => SITES[code];
const last7 = { ...DEFAULT_EBDG_FILTERS, preset: 'last7' as const };

describe('the date range', () => {
  it('runs presets up to yesterday, since today is still being filed', () => {
    expect(rangeFor({ preset: 'last7', month: '' }, TODAY)).toEqual({ from: '2026-09-19', to: '2026-09-25' });
    expect(rangeFor({ preset: 'currentMonth', month: '' }, TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-25' });
    expect(rangeFor({ preset: 'prevMonth', month: '' }, TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(rangeFor({ preset: 'last30', month: '2026-08' }, TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(rangeFor({ preset: 'all', month: '' }, TODAY)).toEqual({ from: null, to: '2026-09-25' });
  });

  it('takes a custom range, in either order, up to today at most', () => {
    expect(rangeFor({ preset: 'custom', month: '', from: '2026-09-10', to: '2026-09-14' }, TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-14' });
    expect(rangeFor({ preset: 'custom', month: '', from: '2026-09-14', to: '2026-09-10' }, TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-14' });
    expect(rangeFor({ preset: 'custom', month: '', from: '2026-09-20', to: '2026-10-30' }, TODAY)).toEqual({ from: '2026-09-20', to: TODAY });
    expect(rangeFor({ preset: 'custom', month: '', from: '2026-09-12', to: '' }, TODAY)).toEqual({ from: '2026-09-12', to: '2026-09-12' });
  });

  it('compares against the equal-length period just before', () => {
    expect(previousRange({ from: '2026-09-19', to: '2026-09-25' })).toEqual({ from: '2026-09-12', to: '2026-09-18' });
    expect(previousRange({ from: null, to: '2026-09-25' })).toBeNull();
  });

  it('offers only months that have entries', () => {
    expect(monthsWithData([row('A', '2026-08-03'), row('A', '2026-09-01'), row('A', '2026-10-01')], TODAY)).toEqual(['2026-09', '2026-08']);
  });
});

describe('totals and per-site figures', () => {
  const rows = [
    running('ZHPL-HR-03', '2026-09-20'),
    running('ZHPL-HR-03', '2026-09-21', { DG1_HSD_Opening: 160, DG1_HSD_Closing: 120 }),
    row('ZHPL-DL-01', '2026-09-21', { HSD_Tank_Closing: 300, Grid_KWH_Consumed: 1000, EB_Amount: 8000, Total_Amount: 8000 }),
    running('ZHPL-HR-03', TODAY), // today: not in a preset yet
  ];
  const d = computeEbDgDashboard(rows, info, last7, TODAY);

  it('adds up diesel, DG hours, energy and spend across sites', () => {
    expect(d.kpi).toMatchObject({ hsd: 80, dgHrs: 2, dgKwh: 240, grid: 3000, sites: 2, sitesRanDg: 1, rows: 3, spend: 31200, cuts: 4 });
    expect(d.kpi.dgShare).toBe(7.4); // 240 of 3,240 kWh
    expect(d.kpi.lastDate).toBe('2026-09-21');
    expect(d.kpi.dgUnitRate).toBe(30); // ₹7,200 over 240 DG units
    expect(d.kpi.ebUnitRate).toBe(8);
    expect(d.kpi.peakLoad).toBe(180);
  });

  it('counts diesel on site as the main tank plus the DG day tanks', () => {
    const farrukhnagar = d.sites[0];
    expect(farrukhnagar).toMatchObject({ site: 'Farrukhnagar-2', city: 'Gurgaon', segment: 'B2B', mainTank: 500, dayTanks: 120, stock: 620 });
    expect(farrukhnagar.cover).toBe(15.5); // 620 L at 40 L a day
    expect(farrukhnagar).toMatchObject({ ltrHr: 40, kwhPerL: 3, pf: 0.97, supplyPct: 95 });
    expect(farrukhnagar.autonomy).toBe(16); // 620 L at 40 L/h
  });

  it('keeps the per-day and per-site splits for drilling in', () => {
    expect(d.daily.map((p) => p.d)).toEqual(['2026-09-20', '2026-09-21']);
    expect(d.daySites['2026-09-21'].map((s) => s.site).sort()).toEqual(['Delhi DC', 'Farrukhnagar-2']);
    expect(d.siteDays['ZHPL-HR-03'].map((s) => s.d)).toEqual(['2026-09-21', '2026-09-20']);
    expect(d.siteDays['ZHPL-HR-03'][0]).toMatchObject({ mainTank: 500, dayTanks: 120, ltrHr: 40 });
  });

  it('narrows to a segment or to chosen sites', () => {
    const b2c = computeEbDgDashboard(rows, info, { ...last7, segment: 'B2C' }, TODAY);
    expect(b2c.sites.map((s) => s.code)).toEqual(['ZHPL-DL-01']);
    const one = computeEbDgDashboard(rows, info, { ...last7, sites: ['ZHPL-HR-03'] }, TODAY);
    expect(one.sites.map((s) => s.code)).toEqual(['ZHPL-HR-03']);
  });

  it('includes today in a custom range that asks for it', () => {
    const withToday = computeEbDgDashboard(rows, info, { ...DEFAULT_EBDG_FILTERS, preset: 'custom', from: TODAY, to: TODAY }, TODAY);
    expect(withToday.kpi.rows).toBe(1);
  });

  it('compares with the period before', () => {
    const earlier = [...rows, running('ZHPL-HR-03', '2026-09-15', { Total_HSD_Consumption: 100, DG1_HSD_Consumption: 100 })];
    const withPrev = computeEbDgDashboard(earlier, info, last7, TODAY);
    expect(withPrev.kpi.prev).toMatchObject({ hsd: 100, sites: 1 });
    expect(changePct(withPrev.kpi.hsd, withPrev.kpi.prev?.hsd)).toBe(-20);
    expect(changePct(5, 0)).toBeNull();
  });
});

describe('each DG on its own', () => {
  it('knows a DG is installed only once it has a reading', () => {
    expect(installedDgs([running('A', '2026-09-20')])).toEqual([1]);
    expect(installedDgs([running('A', '2026-09-20'), row('A', '2026-09-21', { DG3_Hour_Meter: 12 })])).toEqual([1, 3]);
    expect(installedDgs([row('A', '2026-09-20')])).toEqual([]);
  });

  it('lists one unit per installed DG, with hours, diesel, L/h and kWh/L', () => {
    const three = running('ZHPL-HR-03', '2026-09-21', {
      DG3_HSD_Opening: 100,
      DG3_HSD_Closing: 70,
      DG3_HSD_Consumption: 30,
      DG3_KWH_Consumption: 75,
      DG3_Run_Hrs: 1.5,
      DG3_Hour_Meter: 900,
      DG3_B_Check_Remaining_Hrs: -4,
      Total_Run_Hrs: 2.5,
      Total_HSD_Consumption: 70,
      Total_KWH_Consumption: 195,
    });
    const d = computeEbDgDashboard([running('ZHPL-HR-03', '2026-09-20'), three], info, last7, TODAY);
    expect(d.units.map((u) => u.n)).toEqual([1, 3]); // no empty DG 2
    const dg3 = d.units.find((u) => u.n === 3)!;
    expect(dg3).toMatchObject({ hrs: 1.5, hsd: 30, kwh: 75, ltrHr: 20, kwhPerL: 2.5, hourMeter: 900, dayTank: 70, state: 'OVERDUE' });
    expect(d.kpi.dgHrsBy).toEqual({ 1: 2, 2: 0, 3: 1.5 });
    expect(d.kpi.hsdBy).toEqual({ 1: 80, 2: 0, 3: 30 });
    expect(d.sites[0]).toMatchObject({ dg1: 2, dg3: 1.5, installed: [1, 3], dayTanks: 230 }); // 160 + 70
    expect(d.daily[1]).toMatchObject({ dg1Hrs: 1, dg3Hrs: 1.5, dg3Hsd: 30 });
  });
});

describe('impossible entries', () => {
  it('are left out of the figures without being flagged', () => {
    expect(isImpossible(running('A', '2026-09-20', { DG3_Run_Hrs: 30 }), TODAY)).toBe(true);
    expect(isImpossible(running('A', '2026-09-20', { Grid_KWH_Consumed: -5 }), TODAY)).toBe(true);
    expect(isImpossible(running('A', '2026-09-27'), TODAY)).toBe(true);
    // The main tank feeds the day tanks: a transfer is not a missing litre.
    expect(isImpossible(running('A', '2026-09-20', { HSD_Tank_Closing: 300, DG1_HSD_Added: 200 }), TODAY)).toBe(false);

    const rows = [running('ZHPL-HR-03', '2026-09-20'), running('ZHPL-HR-03', '2026-09-21', { DG1_Run_Hrs: 30, Total_HSD_Consumption: 999 })];
    const d = computeEbDgDashboard(rows, info, last7, TODAY);
    expect(d.kpi).toMatchObject({ hsd: 40, rows: 1, excluded: 1 });
  });
});

describe('every entry in view', () => {
  it('lists the filed rows the filters cover, newest first, impossible ones included', () => {
    const rows = [
      running('ZHPL-HR-03', '2026-09-20'),
      running('ZHPL-HR-03', '2026-09-21', { DG1_Run_Hrs: 30 }),
      row('ZHPL-DL-01', '2026-09-21'),
      running('ZHPL-HR-03', '2026-09-01'),
    ];
    expect(entriesInView(rows, info, last7, TODAY).map((r) => `${r.Date} ${r.Site_Code}`)).toEqual([
      '2026-09-21 ZHPL-DL-01',
      '2026-09-21 ZHPL-HR-03',
      '2026-09-20 ZHPL-HR-03',
    ]);
    expect(entriesInView(rows, info, { ...last7, segment: 'B2C' }, TODAY)).toHaveLength(1);
  });
});

describe('needs attention', () => {
  it('lists low cover, due B-checks and a low power factor, worst first', () => {
    const rows = [
      running('ZHPL-HR-03', '2026-09-20', { HSD_Tank_Closing: 20, DG1_HSD_Closing: 20, DG1_B_Check_Remaining_Hrs: 30, Grid_PF: 0.85 }),
      running('ZHPL-DL-01', '2026-09-20'),
    ];
    const items = attentionItems(computeEbDgDashboard(rows, info, last7, TODAY));
    expect(items.map((i) => [i.kind, i.tone, i.site])).toEqual([
      ['fuel', 'bad', 'Farrukhnagar-2'], // 40 L at 40 L a day: 1 day
      ['pf', 'soon', 'Farrukhnagar-2'],
      ['bcheck', 'soon', 'Farrukhnagar-2'],
    ]);
    expect(items[2].title).toBe('DG 1 B-check in 30 h');
  });
});

describe('B-check', () => {
  const site = (bcheck: Record<number, { remHrs: number | null; remDays: number | null }>) =>
    ({ bcheck: Object.fromEntries(Object.entries(bcheck).map(([k, v]) => [k, { ...v, due: '', status: '' }])) }) as never;

  it('is judged by the DG closest to its service', () => {
    expect(maintenanceOf(site({ 1: { remHrs: 200, remDays: 120 }, 2: { remHrs: 30, remDays: 90 } }))).toMatchObject({ state: 'DUE SOON', nextDue: '30 hrs' });
    expect(maintenanceOf(site({ 1: { remHrs: -5, remDays: 10 } })).state).toBe('OVERDUE');
    expect(maintenanceOf(site({ 1: { remHrs: 400, remDays: 12 } }))).toMatchObject({ state: 'DUE SOON', nextDue: '12 days' });
    expect(maintenanceOf(site({})).state).toBe('NO DATA');
  });

  it('keeps each DG’s latest reading', () => {
    const rows = [running('ZHPL-HR-03', '2026-09-20'), running('ZHPL-HR-03', '2026-09-21', { DG1_B_Check_Remaining_Hrs: 199 })];
    const d = computeEbDgDashboard(rows, info, last7, TODAY);
    expect(d.sites[0].bcheck[1]).toMatchObject({ remHrs: 199, remDays: 120, due: '2027-01-20' });
  });
});

describe('formatting', () => {
  it('shortens big numbers, rupees and hours of autonomy', () => {
    expect(formatShort(74352)).toBe('74.4K');
    expect(formatShort(2108794)).toBe('2.11M');
    expect(formatRupees(240000)).toBe('₹2.4L');
    expect(formatRupees(12_500_000)).toBe('₹1.25Cr');
    expect(formatAutonomy(9)).toBe('9 h');
    expect(formatAutonomy(125)).toBe('5.2 d');
    expect(formatAutonomy(null)).toBe('-');
  });
});
