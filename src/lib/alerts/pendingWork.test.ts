import { describe, expect, it } from 'vitest';
import type { ServiceRegistry, SiteMaster } from '../../types/masterData';
import { controlRoomServices, controlRoomSites, type ControlRoomRecords } from '../controlRoom/siteServiceStatus';
import { pendingSummary, pendingWork } from './pendingWork';

const TODAY = '2026-09-16';

const site = (over: Partial<SiteMaster>): SiteMaster =>
  ({
    Site_Code: 'ZHPL-HR-03',
    WH_Code: 'GGN3',
    Facility_Name: 'Gurgaon 3',
    City: 'Gurgaon',
    Zone: 'North',
    Channel: 'B2B',
    Services_Enabled: 'ALL',
    Active: 'Yes',
    ...over,
  }) as SiteMaster;

const service = (code: string, cadence: string): ServiceRegistry =>
  ({ Service_Code: code, Service_Name: code.replace('_', ' '), Cadence: cadence, Active: 'Yes' }) as ServiceRegistry;

const noRecords = (): ControlRoomRecords => ({ dailySiteLogs: [], dieselLogs: [], ebdgRows: [], submissions: [], sheetRecords: {} });

const sites = controlRoomSites([site({}), site({ Site_Code: 'ZHPL-DL-01', WH_Code: 'DEL1', Facility_Name: 'Delhi 1' })], []);
const services = controlRoomServices([service('SITE_ACTIVITY', 'DAILY'), service('HOUSEKEEPING', 'DAILY'), service('DIESEL', 'EVENT_DRIVEN')], []);

describe('pendingWork', () => {
  it('counts every service still due at every site in view', () => {
    const work = pendingWork({ sites, services, records: noRecords(), dieselLogs: [], today: TODAY });
    // Two daily services at two sites; diesel is on request and never pending.
    expect(work).toMatchObject({ total: 4, services: 4, diesel: 0, sites: 2 });
    expect(work.items).toHaveLength(4);
    expect(work.items[0]).toMatchObject({ kind: 'service', site: 'Gurgaon 3', label: 'SITE ACTIVITY not filed' });
  });

  it('stops counting a service once it is filed', () => {
    const records: ControlRoomRecords = {
      ...noRecords(),
      dailySiteLogs: [{ site: 'ZHPL-HR-03', date: TODAY }],
      sheetRecords: { SHEET_HOUSEKEEPING: [{ warehouseId: 'ZHPL-HR-03', date: TODAY }] },
    };
    expect(pendingWork({ sites, services, records, dieselLogs: [], today: TODAY })).toMatchObject({ total: 2, sites: 1 });
  });

  it('adds diesel requests that are somebody’s turn, by any of the site’s codes', () => {
    const work = pendingWork({
      sites,
      services: [],
      records: noRecords(),
      dieselLogs: [
        { warehouseId: 'GGN3', status: 'Pending Admin Approval', uniqueId: 'DSL-1' },
        { warehouseId: 'ZHPL-DL-01', status: 'Ready for Delivery', uniqueId: 'DSL-2' },
        { warehouseId: 'ZHPL-DL-01', status: 'Delivery Completed', uniqueId: 'DSL-3' },
        { warehouseId: 'SOMEWHERE-ELSE', status: 'Pending Admin Approval', uniqueId: 'DSL-4' },
      ],
      today: TODAY,
    });
    expect(work).toMatchObject({ total: 2, services: 0, diesel: 2, sites: 2 });
    expect(work.items.map((i) => i.label)).toEqual([
      'Diesel DSL-1 waiting for approval',
      'Diesel DSL-2 waiting for a POD',
    ]);
  });

  it('puts today’s failed fire pump check first, as critical, and only today’s', () => {
    const fire = (date: string, status: string, warehouseId = 'ZHPL-DL-01') =>
      ({ warehouseId, date, status, issues: 'Hydrant boxes OK, Hose reels OK' }) as never;
    const work = pendingWork({
      sites,
      services: [],
      records: { ...noRecords(), sheetRecords: { SHEET_FIRE: [fire(TODAY, 'CRITICAL'), fire(TODAY, 'OK', 'ZHPL-HR-03'), fire('2026-09-15', 'CRITICAL')] } },
      dieselLogs: [{ warehouseId: 'GGN3', status: 'Pending Admin Approval', uniqueId: 'DSL-1' }],
      today: TODAY,
    });
    expect(work).toMatchObject({ total: 2, critical: 1, diesel: 1 });
    expect(work.items[0]).toMatchObject({ kind: 'critical', code: 'FIRE', siteCode: 'ZHPL-DL-01', label: 'Fire pump CRITICAL: Hydrant boxes OK, Hose reels OK' });
    expect(pendingSummary(work)).toBe('1 critical check, 1 diesel request at 2 sites');
  });

  it('says in one line what the number counts', () => {
    expect(pendingSummary({ total: 0, services: 0, diesel: 0, critical: 0, maintenance: 0, sites: 0, items: [], issues: [] })).toBe('Nothing pending today');
    expect(pendingSummary({ total: 3, services: 2, diesel: 1, critical: 0, maintenance: 0, sites: 1, items: [], issues: [] })).toBe('2 filings due, 1 diesel request at 1 site');
    expect(pendingSummary({ total: 1, services: 1, diesel: 0, critical: 0, maintenance: 0, sites: 2, items: [], issues: [] })).toBe('1 filing due at 2 sites');
  });

  it('raises EB-DG maintenance for whoever holds EB-DG at the site, worst first', () => {
    const withEbDg = controlRoomServices([service('EB_DG', 'DAILY')], []);
    const records: ControlRoomRecords = {
      ...noRecords(),
      ebdgRows: [
        // Filed today, so EB-DG itself is not pending here.
        { Site_Code: 'ZHPL-HR-03', Date: TODAY, DG2_Hour_Meter: 1500, DG2_B_Check_Remaining_Hrs: -6, DG2_B_Check_Remaining_Days: 40, Grid_PF: 0.84 },
        { Site_Code: 'ZHPL-DL-01', Date: TODAY, DG1_Hour_Meter: 800, DG1_B_Check_Remaining_Hrs: 30, DG1_B_Check_Remaining_Days: 200, Grid_PF: 0.98 },
      ] as never,
    };
    const work = pendingWork({ sites, services: withEbDg, records, dieselLogs: [], today: TODAY });
    expect(work).toMatchObject({ maintenance: 3, total: 3, sites: 2 });
    expect(work.items.map((i) => [i.site, i.label, i.tone])).toEqual([
      ['Gurgaon 3', 'DG 2 B-check overdue', 'bad'],
      ['Delhi 1', 'DG 1 B-check due in 30 h', 'soon'],
      ['Gurgaon 3', 'Power factor 0.84, EB penalty risk', 'soon'],
    ]);
    expect(pendingSummary(work)).toBe('3 DG alerts at 2 sites');

    // Someone who does not hold EB-DG is not told.
    expect(pendingWork({ sites, services, records, dieselLogs: [], today: TODAY }).maintenance).toBe(0);
  });

  it('lets an old reading go quiet', () => {
    const withEbDg = controlRoomServices([service('EB_DG', 'EVENT_DRIVEN')], []);
    const records: ControlRoomRecords = {
      ...noRecords(),
      ebdgRows: [{ Site_Code: 'ZHPL-HR-03', Date: '2026-07-01', DG1_Hour_Meter: 10, DG1_B_Check_Remaining_Hrs: -1, Grid_PF: 0.7 }] as never,
    };
    expect(pendingWork({ sites, services: withEbDg, records, dieselLogs: [], today: TODAY }).maintenance).toBe(0);
  });
});
