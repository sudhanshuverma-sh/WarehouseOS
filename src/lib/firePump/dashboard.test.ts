import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIOD_FILTERS } from '../analytics/period';
import type { AnalyticsSite } from '../analytics/sites';
import { scoreFirePump, type FirePumpAnswers } from './checks';
import { computeFirePumpDashboard } from './dashboard';
import type { FirePumpLog } from './records';

/** The Fire Pump Healthiness dashboard's figures, from filed checks. */

const TODAY = '2026-09-26';

const SITES: AnalyticsSite[] = [
  { id: 'ZHPL-HR-03', name: 'Farrukhnagar-2', city: 'Gurgaon', channel: 'B2B', aliases: ['GGN3'], services: 'ALL' },
  { id: 'ZHPL-DL-01', name: 'Delhi DC', city: 'Delhi', channel: 'B2C', aliases: [], services: ['FIRE'] },
];

const HEALTHY: FirePumpAnswers = {
  fire_alarm: 'Yes', mcp: 'Yes', pump_room: 'Operational', hydrant_pressure: 'Yes', hydrant_line: 'Yes',
  hydrant_boxes: 'Yes', hose_reel: 'Yes', sprinkler_available: 'No',
};

const check = (siteCode: string, date: string, over: FirePumpAnswers = {}, pressure: number | null = 7): FirePumpLog => {
  const answers = { ...HEALTHY, ...over };
  const score = scoreFirePump(answers);
  return {
    id: `${siteCode}-${date}`, siteCode, date, submittedAt: `${date}T09:00:00Z`, submittedByName: 'Ravi',
    answers, remarks: {}, photos: {}, hydrantPressureBar: pressure, overallStatus: score.overall, issuesCount: score.issues.length,
  };
};

describe('the Fire Pump dashboard', () => {
  const logs = [
    check('GGN3', '2026-09-25', { hose_reel: 'No' }, 6),
    check('ZHPL-HR-03', '2026-09-24'),
    check('ZHPL-DL-01', '2026-09-25', {}, 8),
    check('ZHPL-DL-01', '2026-09-24', { sprinkler_available: 'Yes', sprinkler_charged: 'No' }),
  ];
  const d = computeFirePumpDashboard(logs, SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'last7' }, TODAY);

  it('counts checks filed, healthy and critical', () => {
    expect(d.kpi).toMatchObject({ filed: 4, expected: 14, filingRate: 29, ok: 2, critical: 2, healthyRate: 50, pressure: 7, sites: 2 });
    expect(d.kpi).toMatchObject({ criticalNow: 1, openIssues: 1 });
  });

  it('ranks checks by how often they fail, and ignores a site with no sprinkler', () => {
    expect(d.checks[0]).toMatchObject({ key: 'sprinkler_charged', asked: 1, failed: 1, failRate: 100 });
    expect(d.checks.find((c) => c.key === 'hose_reel')).toMatchObject({ asked: 4, failed: 1, failRate: 25 });
    expect(d.checks.some((c) => c.key === 'sprinkler_available')).toBe(false);
  });

  it('puts sites still failing first and lists them to act on', () => {
    expect(d.sites.map((s) => [s.name, s.latest?.status])).toEqual([
      ['Farrukhnagar-2', 'CRITICAL'],
      ['Delhi DC', 'OK'],
    ]);
    expect(d.sites[0].latest).toMatchObject({ failed: ['Hose reels OK'], pressure: 6 });
    expect(d.attention).toEqual([expect.objectContaining({ site: 'Farrukhnagar-2', tone: 'bad', title: 'Hose reels OK' })]);
    expect(d.daily.map((p) => [p.d, p.ok, p.critical])).toEqual([
      ['2026-09-24', 1, 1],
      ['2026-09-25', 1, 1],
    ]);
  });

  it('flags a site not checked today when today is in view', () => {
    const t = computeFirePumpDashboard([check('ZHPL-HR-03', TODAY)], SITES, { ...DEFAULT_PERIOD_FILTERS, preset: 'today' }, TODAY);
    expect(t.kpi).toMatchObject({ filed: 1, expected: 2, healthyRate: 100 });
    expect(t.attention).toEqual([expect.objectContaining({ site: 'Delhi DC', title: 'Not checked in this period' })]);
  });
});
