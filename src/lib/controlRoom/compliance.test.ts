import { describe, expect, it } from 'vitest';
import { complianceReport } from './compliance';
import type { ControlRoomRecords, ControlRoomService, ControlRoomSite } from './siteServiceStatus';

/**
 * Control Room compliance: every scheduled service, every site, over the
 * last closed days. 26 Sep 2026 is a Saturday, so the week of 21 to 27 Sep is
 * still running and 14 to 20 Sep has ended.
 */

const TODAY = '2026-09-26';

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
  { code: 'AUDIT', name: 'Weekly Audit', cadence: 'WEEKLY' },
  { code: 'DIESEL', name: 'Diesel', cadence: 'EVENT_DRIVEN' },
];

const log = (site: string, date: string) => ({ site, date });
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, '0')}`);

const records: ControlRoomRecords = {
  dailySiteLogs: [...days(19, 25).map((d) => log('A', d)), ...days(19, 22).map((d) => log('B', d)), log('A', TODAY)],
  dieselLogs: [],
  ebdgRows: [],
  submissions: [],
  sheetRecords: { SHEET_AUDIT: [{ warehouseId: 'A', date: '2026-09-16' }] },
};

describe('Control Room compliance', () => {
  const r = complianceReport(SITES, SERVICES, records, TODAY, 7);

  it('covers the last closed days and keeps today apart, in progress', () => {
    expect(r.days).toEqual(days(19, 25));
    expect(r.todayRate).toMatchObject({ day: TODAY, done: 1, due: 2, rate: 50 });
    expect(r.dayRates[r.dayRates.length - 1]).toMatchObject({ day: '2026-09-25', done: 1, due: 2, rate: 50 });
  });

  it('rates each site on its daily services, worst first, with a streak and missed days', () => {
    expect(r.sites.map((s) => [s.site.name, s.rate, s.streak, s.missed])).toEqual([
      ['Bravo', 57.1, 0, 3],
      ['Alpha', 100, 7, 0],
    ]);
    expect(r).toMatchObject({ perfect: 1, under70: 1 });
  });

  it('rates each scheduled service; a running week is not late, on-request is never due', () => {
    expect(r.services.map((s) => [s.code, s.done, s.due])).toEqual([
      ['SITE_ACTIVITY', 11, 14],
      ['AUDIT', 1, 1],
    ]);
    expect(r.overall).toBe(80); // 12 of 15
  });

  it('compares with the period just before', () => {
    // 12 to 18 Sep: no daily reports; the audit week of 7 to 13 Sep ended unfiled, 14 to 20 Sep was filed.
    expect(r.prevOverall).toBe(6.3); // 1 of 16
  });

  it('leaves out a service a site does not offer', () => {
    expect(r.sites.find((s) => s.site.id === 'B')!.cells[0]).toMatchObject({ due: 1 });
  });
});
