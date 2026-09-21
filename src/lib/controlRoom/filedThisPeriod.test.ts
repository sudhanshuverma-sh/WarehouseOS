import { describe, expect, it } from 'vitest';
import {
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
  filedThisPeriod,
} from './siteServiceStatus';

/**
 * One answer to "has someone already done this", shared by the POC desk,
 * the forms and (in spirit) the database trigger in db/filings.sql.
 */

const site: ControlRoomSite = {
  id: 'ZHPL-KA-01',
  whCode: 'WH-BLR-B4',
  name: 'Facility Bangalore B4',
  city: '',
  zone: '',
  channel: 'B2B',
  services: 'ALL',
  aliases: ['ZHPL-KA-01', 'WH-BLR-B4', 'WH_BLR_B4'],
};

const service = (code: string, cadence: ControlRoomService['cadence']): ControlRoomService => ({
  code,
  name: code,
  cadence,
});

const empty: ControlRoomRecords = {
  dailySiteLogs: [],
  dieselLogs: [],
  ebdgRows: [],
  submissions: [],
  sheetRecords: {},
};

/** A generic service's filing, as sheetRecords holds it. */
const filed = (sheetId: string, siteId: string, date: string, by: string, at?: string): ControlRoomRecords => ({
  ...empty,
  sheetRecords: { [sheetId]: [{ warehouseId: siteId, date, submittedByName: by, submittedAt: at ?? date }] },
});

describe('filedThisPeriod()', () => {
  it('finds today’s filing and says who made it', () => {
    const records = filed('SHEET_HOUSEKEEPING', 'ZHPL-KA-01', '2026-09-21', 'Ramesh Kumar', '2026-09-21T09:14:00+05:30');
    const hit = filedThisPeriod(service('HOUSEKEEPING', 'DAILY'), site, records, '2026-09-21');
    expect(hit).toMatchObject({ by: 'Ramesh Kumar', day: '2026-09-21' });
  });

  it('matches the site by any of its names', () => {
    // The desk asks as ZHPL-KA-01; the record was saved as WH_BLR_B4.
    const records = filed('SHEET_HOUSEKEEPING', 'WH_BLR_B4', '2026-09-21', 'Ramesh Kumar');
    expect(filedThisPeriod(service('HOUSEKEEPING', 'DAILY'), site, records, '2026-09-21')).not.toBeNull();
  });

  it('is nothing when another site filed it', () => {
    const records = filed('SHEET_HOUSEKEEPING', 'ZHPL-MH-09', '2026-09-21', 'Someone Else');
    expect(filedThisPeriod(service('HOUSEKEEPING', 'DAILY'), site, records, '2026-09-21')).toBeNull();
  });

  it('is nothing on a later day, for a daily service', () => {
    const records = filed('SHEET_HOUSEKEEPING', 'ZHPL-KA-01', '2026-09-21', 'Ramesh Kumar');
    expect(filedThisPeriod(service('HOUSEKEEPING', 'DAILY'), site, records, '2026-09-22')).toBeNull();
  });

  it('counts a Monday filing as done on the Sunday of the same week', () => {
    const records = filed('SHEET_FIRE', 'ZHPL-KA-01', '2026-09-21', 'Imran Qureshi');
    expect(filedThisPeriod(service('FIRE', 'WEEKLY'), site, records, '2026-09-27')).not.toBeNull();
    // 28 Sept is the next Monday, so a new week and nothing filed in it.
    expect(filedThisPeriod(service('FIRE', 'WEEKLY'), site, records, '2026-09-28')).toBeNull();
  });

  it('counts anywhere in the calendar month for a monthly service', () => {
    const records = filed('SHEET_FIRE', 'ZHPL-KA-01', '2026-09-03', 'Imran Qureshi');
    expect(filedThisPeriod(service('FIRE', 'MONTHLY'), site, records, '2026-09-30')).not.toBeNull();
    expect(filedThisPeriod(service('FIRE', 'MONTHLY'), site, records, '2026-10-01')).toBeNull();
  });

  it('never calls an on-request service already filed', () => {
    // Diesel, Crate Washing and Ad-hoc are meant to be filed repeatedly.
    const records = filed('SHEET_WASHING', 'ZHPL-KA-01', '2026-09-21', 'Ramesh Kumar');
    expect(filedThisPeriod(service('WASHING', 'EVENT_DRIVEN'), site, records, '2026-09-21')).toBeNull();
  });

  it('reports the most recent hand when a period holds several', () => {
    const records: ControlRoomRecords = {
      ...empty,
      sheetRecords: {
        SHEET_FIRE: [
          { warehouseId: 'ZHPL-KA-01', date: '2026-09-21', submittedByName: 'First', submittedAt: '2026-09-21T08:00:00Z' },
          { warehouseId: 'ZHPL-KA-01', date: '2026-09-24', submittedByName: 'Latest', submittedAt: '2026-09-24T08:00:00Z' },
        ],
      },
    };
    expect(filedThisPeriod(service('FIRE', 'WEEKLY'), site, records, '2026-09-25')?.by).toBe('Latest');
  });
});
