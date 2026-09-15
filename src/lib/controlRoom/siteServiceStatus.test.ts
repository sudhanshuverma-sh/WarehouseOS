import { describe, expect, it } from 'vitest';
import type { Warehouse } from '../../types';
import type { ServiceRegistry, SiteMaster } from '../../types/masterData';
import {
  appWarehouseIdFor,
  siteMatches,
  computeSiteStatuses,
  controlRoomServices,
  controlRoomSites,
  filingsFor,
  inChannel,
  lastDays,
  periodFor,
  siteProgressByDay,
  sortByAttention,
  summarise,
  type ControlRoomRecords,
} from './siteServiceStatus';

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

const service = (code: string, cadence: string, over: Partial<ServiceRegistry> = {}): ServiceRegistry =>
  ({ Service_Code: code, Service_Name: code.replace('_', ' '), Cadence: cadence, Active: 'Yes', ...over }) as ServiceRegistry;

const TODAY = '2026-09-15'; // a Tuesday

const noRecords = (): ControlRoomRecords => ({ dailySiteLogs: [], dieselLogs: [], ebdgRows: [], submissions: [], sheetRecords: {} });

describe('sites', () => {
  it('uses active Site_Master rows and ignores the ALL sentinel', () => {
    const sites = controlRoomSites(
      [site({}), site({ Site_Code: 'ZHPL-DL-01', Active: 'No' }), site({ Site_Code: 'ALL' }), site({ Site_Code: 'ZHPL-KA-01', Channel: 'BOTH', Services_Enabled: 'DIESEL, EB_DG' })],
      [],
    );
    expect(sites.map((s) => s.id)).toEqual(['ZHPL-HR-03', 'ZHPL-KA-01']);
    expect(sites[1].services).toEqual(['DIESEL', 'EB_DG']);
  });

  it('falls back to the warehouse list when Master Data is not loaded', () => {
    const sites = controlRoomSites([], [{ id: 'WH_AP_VIZAG_B2C', code: 'VZG', name: 'Vizag WHS', city: 'Visakhapatnam', zone: 'South', channel: 'B2C', isActive: true } as Warehouse]);
    expect(sites).toEqual([
      { id: 'WH_AP_VIZAG_B2C', whCode: 'VZG', name: 'Vizag WHS', city: 'Visakhapatnam', zone: 'South', channel: 'B2C', services: 'ALL', aliases: ['WH_AP_VIZAG_B2C', 'VZG'] },
    ]);
  });

  it('knows a Site_Master site by the app warehouse that is the same place', () => {
    const vizagWh = { id: 'WH_AP_VIZAG_B2C', code: 'Vizag', sapCode: '1510953B24', name: 'Vizag WHS', city: 'Visakhapatnam', isActive: true } as Warehouse;
    const other = { id: 'WH_DL_01', code: '', sapCode: '', name: 'Delhi', isActive: true } as Warehouse;
    const [byWh] = controlRoomSites([site({ Site_Code: 'ZHPL-AP-01', WH_Code: 'vizag', SAP_Code: '', City: '' } as Partial<SiteMaster>)], [vizagWh, other]);
    expect(byWh.aliases).toEqual(['ZHPL-AP-01', 'vizag', 'WH_AP_VIZAG_B2C', 'Vizag']);
    expect(byWh.city).toBe('Visakhapatnam');
    expect(siteMatches(byWh, 'wh_ap_vizag_b2c')).toBe(true);
    expect(siteMatches(byWh, 'WH_DL_01')).toBe(false);
    expect(appWarehouseIdFor(byWh, [vizagWh, other])).toBe('WH_AP_VIZAG_B2C');

    const [bySap] = controlRoomSites([site({ Site_Code: 'ZHPL-AP-01', WH_Code: 'X', SAP_Code: '1510953B24' } as Partial<SiteMaster>)], [vizagWh, other]);
    expect(siteMatches(bySap, 'WH_AP_VIZAG_B2C')).toBe(true);
    // Blank codes never match a warehouse with blank codes.
    expect(siteMatches(bySap, 'WH_DL_01')).toBe(false);
  });

  it('counts records filed under the app warehouse id for the Site_Master site', () => {
    const vizagWh = { id: 'WH_AP_VIZAG_B2C', code: 'Vizag', sapCode: '1510953B24', isActive: true } as Warehouse;
    const sites = controlRoomSites([site({ Site_Code: 'ZHPL-AP-01', WH_Code: 'Vizag' })], [vizagWh]);
    const services = controlRoomServices([service('SITE_ACTIVITY', 'DAILY')], []);
    const [s] = computeSiteStatuses(sites, services, { ...noRecords(), dailySiteLogs: [{ site: 'WH_AP_VIZAG_B2C', date: TODAY }] }, TODAY);
    expect(s).toMatchObject({ done: 1, due: 1, state: 'complete' });
  });

  it('puts BOTH sites under B2B and B2C', () => {
    const [b2b, both] = controlRoomSites([site({}), site({ Site_Code: 'X', Channel: 'BOTH' })], []);
    expect([inChannel(b2b, 'B2B'), inChannel(b2b, 'B2C'), inChannel(b2b, 'ALL')]).toEqual([true, false, true]);
    expect([inChannel(both, 'B2B'), inChannel(both, 'B2C')]).toEqual([true, true]);
  });
});

describe('services', () => {
  it('takes active registry services in order, whatever they are called', () => {
    const list = controlRoomServices([service('SITE_ACTIVITY', 'DAILY'), service('OLD', 'DAILY', { Active: 'No' }), service('PEST_CONTROL', 'WEEKLY')], []);
    expect(list.map((s) => [s.code, s.cadence])).toEqual([['SITE_ACTIVITY', 'DAILY'], ['PEST_CONTROL', 'WEEKLY']]);
  });

  it('falls back to the built-in services when the registry is empty', () => {
    const list = controlRoomServices([], [{ id: 'SHEET_HOUSEKEEPING', title: 'Housekeeping Roster' }]);
    expect(list.find((s) => s.code === 'HOUSEKEEPING')?.name).toBe('Housekeeping Roster');
    expect(list.find((s) => s.code === 'DIESEL')?.cadence).toBe('EVENT_DRIVEN');
    expect(list.filter((s) => s.code === 'EB_DG')).toHaveLength(1);
  });
});

describe('filingsFor', () => {
  it('lists one service’s filings newest first, with who filed and when', () => {
    const records: ControlRoomRecords = {
      ...noRecords(),
      dailySiteLogs: [
        { site: 'ZHPL-HR-03', date: '2026-09-14', timestamp: '2026-09-14T04:00:00Z', pocName: 'Asha' },
        { site: 'ZHPL-DL-01', date: TODAY, timestamp: '2026-09-15T05:00:00Z', pocName: 'Ravi' },
      ],
      sheetRecords: { SHEET_HOUSEKEEPING: [{ warehouseId: 'ZHPL-HR-03', date: TODAY, submittedByName: 'Asha' }] },
    };
    expect(filingsFor('SITE_ACTIVITY', records)).toEqual([
      { code: 'SITE_ACTIVITY', site: 'ZHPL-DL-01', day: TODAY, at: '2026-09-15T05:00:00Z', by: 'Ravi' },
      { code: 'SITE_ACTIVITY', site: 'ZHPL-HR-03', day: '2026-09-14', at: '2026-09-14T04:00:00Z', by: 'Asha' },
    ]);
    // No timestamp recorded: the day stands in for "when".
    expect(filingsFor('HOUSEKEEPING', records)).toEqual([{ code: 'HOUSEKEEPING', site: 'ZHPL-HR-03', day: TODAY, at: TODAY, by: 'Asha' }]);
  });
});

describe('a site’s week', () => {
  it('lists the last days oldest first and counts each day on its own', () => {
    expect(lastDays(TODAY, 3)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
    const [s] = controlRoomSites([site({ Services_Enabled: 'SITE_ACTIVITY,DIESEL' })], []);
    const svc = controlRoomServices([service('SITE_ACTIVITY', 'DAILY'), service('DIESEL', 'EVENT_DRIVEN')], []);
    const records = { ...noRecords(), dailySiteLogs: [{ site: 'ZHPL-HR-03', date: '2026-09-14' }] };
    expect(siteProgressByDay(s, svc, records, lastDays(TODAY, 2))).toEqual([
      { day: '2026-09-14', done: 1, due: 1 },
      { day: '2026-09-15', done: 0, due: 1 },
    ]);
  });
});

describe('periods', () => {
  it('judges daily today, weekly Monday to Sunday, monthly the calendar month', () => {
    expect(periodFor('DAILY', TODAY)).toEqual([TODAY, TODAY]);
    expect(periodFor('WEEKLY', TODAY)).toEqual(['2026-09-14', '2026-09-20']);
    expect(periodFor('WEEKLY', '2026-09-20')).toEqual(['2026-09-14', '2026-09-20']); // Sunday
    expect(periodFor('MONTHLY', TODAY)).toEqual(['2026-09-01', '2026-09-31']);
  });
});

describe('computeSiteStatuses', () => {
  const sites = controlRoomSites([site({}), site({ Site_Code: 'ZHPL-DL-01', WH_Code: 'DEL1', Facility_Name: 'Delhi 1', Services_Enabled: 'SITE_ACTIVITY' })], []);
  const services = controlRoomServices(
    [service('SITE_ACTIVITY', 'DAILY'), service('EB_DG', 'DAILY'), service('HOUSEKEEPING', 'DAILY'), service('PEST_CONTROL', 'WEEKLY'), service('DIESEL', 'EVENT_DRIVEN'), service('CHECKLIST', 'DAILY')],
    [],
  );

  const records: ControlRoomRecords = {
    dailySiteLogs: [{ site: 'ZHPL-HR-03', date: TODAY }, { site: 'ZHPL-DL-01', date: '2026-09-14' }],
    // 19:00 UTC on the 14th is 00:30 IST on the 15th — today.
    dieselLogs: [{ warehouseId: 'ZHPL-HR-03', timestamp: '2026-09-14T19:00:00Z' }, { warehouseId: 'ZHPL-HR-03', timestamp: '2026-09-15T05:00:00Z' }],
    ebdgRows: [{ Site_Code: 'ZHPL-HR-03', Date: '2026-09-14' }],
    submissions: [{ warehouseId: 'GGN3', submissionDate: TODAY }],
    sheetRecords: {
      SHEET_HOUSEKEEPING: [{ warehouseId: 'GGN3', date: TODAY }],
      SHEET_PEST_CONTROL: [{ warehouseId: 'ZHPL-HR-03', date: '2026-09-14' }],
    },
  };

  const [hr, dl] = computeSiteStatuses(sites, services, records, TODAY);
  const state = (code: string) => hr.services.find((s) => s.code === code)!;

  it('marks each service done or pending for its own period', () => {
    expect(state('SITE_ACTIVITY').state).toBe('done');
    expect(state('EB_DG').state).toBe('pending'); // yesterday's entry does not count today
    expect(state('PEST_CONTROL').state).toBe('done'); // filed Monday, weekly
  });

  it('joins records by Site_Code or by WH_Code', () => {
    expect(state('HOUSEKEEPING').state).toBe('done');
    expect(state('CHECKLIST').state).toBe('done');
  });

  it('shows on-request services as today’s count, never pending', () => {
    expect(state('DIESEL')).toMatchObject({ state: 'on-request', count: 2 });
  });

  it('adds up a site, leaving on-request services out of what is due', () => {
    expect(hr).toMatchObject({ due: 5, done: 4, state: 'partial' });
  });

  it('only lists the services enabled at a site', () => {
    expect(dl.services.map((s) => s.code)).toEqual(['SITE_ACTIVITY']);
    expect(dl).toMatchObject({ due: 1, done: 0, state: 'not-started' });
  });

  it('shows a new registry service on every site with no code change', () => {
    const more = [...services, { code: 'FIRE_AUDIT', name: 'Fire Audit', cadence: 'MONTHLY' as const }];
    const [a] = computeSiteStatuses(sites, more, noRecords(), TODAY);
    expect(a.services.at(-1)).toMatchObject({ code: 'FIRE_AUDIT', state: 'pending' });
  });

  it('calls a site with only on-request services complete', () => {
    const [only] = computeSiteStatuses(controlRoomSites([site({ Services_Enabled: 'DIESEL' })], []), services, noRecords(), TODAY);
    expect(only).toMatchObject({ due: 0, state: 'complete' });
  });

  it('sorts what needs attention first and summarises the network', () => {
    const list = computeSiteStatuses(sites, services, records, TODAY);
    expect(sortByAttention(list).map((s) => s.site.id)).toEqual(['ZHPL-DL-01', 'ZHPL-HR-03']);
    const sum = summarise(list, services);
    expect(sum).toMatchObject({ sites: 2, complete: 0, partial: 1, notStarted: 1 });
    expect(sum.services.find((s) => s.code === 'SITE_ACTIVITY')).toMatchObject({ done: 1, total: 2 });
    expect(sum.services.find((s) => s.code === 'DIESEL')).toMatchObject({ done: 1, total: 1 });
  });
});
