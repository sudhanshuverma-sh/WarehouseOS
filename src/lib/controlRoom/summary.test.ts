import { describe, expect, it } from 'vitest';
import type { ControlRoomRecords, ControlRoomService, ControlRoomSite } from './siteServiceStatus';
import { controlRoomSummary, summaryText } from './summary';

/** The Control Room summary: today against yesterday, every issue, in plain words. */

const TODAY = '2026-09-26';
const YESTERDAY = '2026-09-25';

const site = (id: string, name: string, services: ControlRoomSite['services']): ControlRoomSite => ({
  id,
  whCode: '',
  name,
  city: '',
  zone: '',
  channel: 'B2B',
  services,
  aliases: [id],
});

const SITES = [site('A', 'Alpha', 'ALL'), site('B', 'Bravo', ['SITE_ACTIVITY'])];
const SERVICES: ControlRoomService[] = [
  { code: 'SITE_ACTIVITY', name: 'Daily Site Report', cadence: 'DAILY' },
  { code: 'FIRE', name: 'Fire Pump Healthiness', cadence: 'DAILY' },
  { code: 'DIESEL', name: 'Diesel', cadence: 'EVENT_DRIVEN' },
];

const dailySiteLogs = [
  { site: 'A', date: TODAY, worstStatus: 'critical' as const, deviationsCount: 2 },
  { site: 'A', date: YESTERDAY, worstStatus: 'clear' as const, deviationsCount: 0 },
  { site: 'B', date: YESTERDAY, worstStatus: 'partial' as const, deviationsCount: 1 },
];

const records: ControlRoomRecords = {
  dailySiteLogs,
  dieselLogs: [],
  ebdgRows: [],
  submissions: [],
  sheetRecords: { SHEET_FIRE: [{ warehouseId: 'A', date: TODAY, status: 'CRITICAL', issues: 'Hose reels OK' } as never] },
};
const dieselLogs = [{ warehouseId: 'A', status: 'Pending Admin Approval', uniqueId: 'D1' }];

describe('the Control Room summary', () => {
  const s = controlRoomSummary({ sites: SITES, services: SERVICES, records, dieselLogs, dailySiteLogs, today: TODAY });

  it('counts sites and filings, today against yesterday', () => {
    expect(s.sites).toEqual({ total: 2, complete: 1, partial: 0, notStarted: 1, completeYesterday: 1 });
    expect(s.filings).toMatchObject({ done: 2, due: 3, rate: 66.7 });
    expect(s.services.find((x) => x.code === 'SITE_ACTIVITY')).toMatchObject({ done: 1, total: 2, pending: 1, scheduled: true });
    expect(s.services.find((x) => x.code === 'DIESEL')).toMatchObject({ scheduled: false, pending: 0 });
  });

  it('merges every issue, worst first', () => {
    expect(s.counts).toMatchObject({ critical: 1, dailyCritical: 1, diesel: 1, maintenance: 0 });
    expect(s.issues.map((i) => [i.kind, i.tone])).toEqual([
      ['critical', 'bad'],
      ['daily', 'bad'],
      ['diesel', 'soon'],
    ]);
    expect(s.notStarted).toEqual([{ code: 'B', name: 'Bravo' }]);
  });

  it('keeps a 7-day trend ending today', () => {
    expect(s.trend).toHaveLength(7);
    expect(s.trend[6]).toMatchObject({ day: TODAY, done: 2, due: 3 });
  });

  it('says it in plain sentences, and as text to paste', () => {
    expect(s.headline).toEqual([
      '1 of 2 sites have filed everything due today.',
      '2 of 3 scheduled filings are in (66.7%).',
      'Needs attention: 1 critical check, 1 daily report flagged critical and 1 diesel request waiting.',
      '1 site has not started: Bravo.',
    ]);
    const text = summaryText(s, '26 Sep 2026');
    expect(text).toContain('Control Room summary, 26 Sep 2026');
    expect(text).toContain('- Daily Site Report: 1 of 2 sites, 1 pending');
    expect(text).toContain('Not started (1): Bravo');
  });

  it('reads well on a clean day', () => {
    const clean = controlRoomSummary({
      sites: [SITES[1]],
      services: SERVICES,
      records: { ...records, dailySiteLogs: [{ site: 'B', date: TODAY }], sheetRecords: {} },
      dieselLogs: [],
      dailySiteLogs: [{ site: 'B', date: TODAY, worstStatus: 'clear', deviationsCount: 0 }],
      today: TODAY,
    });
    expect(clean.headline).toEqual(['The site has filed everything due today.', '1 of 1 scheduled filing is in (100%).', 'Nothing critical is open.']);
  });
});
