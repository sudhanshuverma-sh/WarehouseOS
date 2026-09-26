import { describe, expect, it } from 'vitest';
import type { DailySiteLog } from '../../types';
import { DEFAULT_PERIOD_FILTERS } from '../analytics/period';
import type { AnalyticsSite } from '../analytics/sites';
import { computeDailySiteDashboard } from './dashboard';
import { scoreDailySite } from './scoring';

/** The Daily Site Report dashboard's figures, from filed reports. */

const TODAY = '2026-09-26';

const SITES: AnalyticsSite[] = [
  { id: 'ZHPL-HR-03', name: 'Farrukhnagar-2', city: 'Gurgaon', channel: 'B2B', aliases: ['GGN3'], services: 'ALL' },
  { id: 'ZHPL-DL-01', name: 'Delhi DC', city: 'Delhi', channel: 'B2C', aliases: [], services: ['SITE_ACTIVITY'] },
  { id: 'ZHPL-MH-01', name: 'Bhiwandi', city: 'Thane', channel: 'B2B', aliases: [], services: ['DIESEL'] }, // not offered
];

const report = (site: string, date: string, over: Partial<DailySiteLog> = {}): DailySiteLog => {
  const values = {
    ups: 100, dg: 100, ltPanel: 100, coldRoom: 100, hvls: 100, waterCoolers: 100, freezersGgp: 100, doorBuzzer: 100,
    rt: 100, bopt: 100, stackers: 100, vrc: 100,
    mtsInspection: 'Done', lightsInspection: 'Done', airCirculation: 'Done', gemba: 'Done',
    pmPlanned: 4, pmCompleted: 4,
    ...over,
  } as Record<string, unknown>;
  const score = scoreDailySite(values);
  return {
    logId: `${site}-${date}`, site, date, timestamp: `${date}T10:00:00Z`, pocName: 'Asha', pocEmail: '',
    activities: [], ...values, worstStatus: score.worstStatus, deviationsCount: score.deviationsCount,
  } as unknown as DailySiteLog;
};

describe('the Daily Site Report dashboard', () => {
  const logs = [
    report('GGN3', '2026-09-25', { coldRoom: 60, coldRoomRemark: 'Compressor tripped' }),
    report('ZHPL-HR-03', '2026-09-24', { rt: 50 }),
    report('ZHPL-DL-01', '2026-09-25', { gemba: 'Not Done', pmCompleted: 2 }),
    report('ZHPL-MH-01', '2026-09-25'), // a site that does not file this report
  ];
  const d = computeDailySiteDashboard(logs, SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'last7' }, TODAY);

  it('counts reports against the sites that owe one each day', () => {
    expect(d.kpi).toMatchObject({ filed: 3, expected: 14, filingRate: 21, sites: 2, critical: 2, partial: 1 });
    expect(d.kpi.pm).toBe(83); // 10 of 12
    expect(d.kpi.routine).toBe(92); // 11 of 12 checks done
  });

  it('ranks the weakest equipment first', () => {
    expect(d.assets[0]).toMatchObject({ key: 'rt', group: 'MHE', avg: 83.3, down: 1 });
    expect(d.assets[1]).toMatchObject({ key: 'coldRoom', avg: 86.7, down: 1, critical: true });
    expect(d.routines.find((r) => r.key === 'gemba')).toMatchObject({ done: 2, notDone: 1, rate: 67 });
  });

  it('reads each site by its latest report and lists what to act on', () => {
    const farrukhnagar = d.sites.find((s) => s.code === 'ZHPL-HR-03')!;
    expect(farrukhnagar).toMatchObject({ filed: 2, expected: 7, critical: 1, latest: { date: '2026-09-25', status: 'critical' } });
    expect(d.attention.map((a) => [a.site, a.title, a.detail])).toEqual([
      ['Delhi DC', 'Gemba not done', '25 Sep'],
      ['Farrukhnagar-2', 'Cold Room at 60%', 'Compressor tripped'],
    ]);
    expect(d.entries[0].siteName).toBeDefined();
  });

  it('narrows to a segment and compares with the period before', () => {
    const b2c = computeDailySiteDashboard(logs, SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'last7', segment: 'B2C' }, TODAY);
    expect(b2c.sites.map((s) => s.code)).toEqual(['ZHPL-DL-01']);
    const withPrev = computeDailySiteDashboard([...logs, report('ZHPL-HR-03', '2026-09-15')], SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'last7' }, TODAY);
    expect(withPrev.kpi.prev).toMatchObject({ filed: 1, expected: 14 });
  });

  it('shows today with the Today preset, and says who has not filed', () => {
    const t = computeDailySiteDashboard([report('ZHPL-HR-03', TODAY)], SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'today' }, TODAY);
    expect(t.kpi).toMatchObject({ filed: 1, expected: 2, filingRate: 50 });
    expect(t.attention).toEqual([expect.objectContaining({ site: 'Delhi DC', title: 'No report in this period' })]);
  });
});
