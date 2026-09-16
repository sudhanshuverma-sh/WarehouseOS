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

  it('says in one line what the number counts', () => {
    expect(pendingSummary({ total: 0, services: 0, diesel: 0, sites: 0, items: [] })).toBe('Nothing pending today');
    expect(pendingSummary({ total: 3, services: 2, diesel: 1, sites: 1, items: [] })).toBe('2 filings due, 1 diesel request at 1 site');
    expect(pendingSummary({ total: 1, services: 1, diesel: 0, sites: 2, items: [] })).toBe('1 filing due at 2 sites');
  });
});
