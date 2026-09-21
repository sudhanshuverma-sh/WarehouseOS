import { describe, expect, it } from 'vitest';
import { parseServiceCodes, servicesForUser } from './servicesForUser';
import type { ControlRoomSite } from '../controlRoom/siteServiceStatus';
import type { PocMaster } from '../../types/masterData';
import type { User, UserRole } from '../../types';

const ALL = ['SHEET_DAILY_SITE', 'SHEET_HOUSEKEEPING', 'SHEET_EB_DG', 'SHEET_DIESEL'];

const site = (id: string, services: 'ALL' | string[], aliases: string[] = []): ControlRoomSite => ({
  id,
  whCode: id,
  name: id,
  city: '',
  zone: '',
  channel: 'B2B',
  services,
  aliases: [id, ...aliases],
});

const poc = (email: string, siteCode: string, codes: string, active: 'Yes' | 'No' = 'Yes'): PocMaster =>
  ({ POC_Email: email, Site_Code: siteCode, Service_Codes: codes, Role: 'SITE_POC', Active: active } as PocMaster);

const user = (role: UserRole, email: string, warehouseId?: string, assignedServiceIds?: string[]): User =>
  ({ id: 'u1', fullName: 'A Person', email, role, warehouseId, assignedServiceIds } as User);

describe('parseServiceCodes()', () => {
  it('reads a comma-separated list, blanks and case included', () => {
    expect(parseServiceCodes(' diesel, EB_DG ')).toEqual(new Set(['DIESEL', 'EB_DG']));
  });

  it('treats blank and ALL alike — everything', () => {
    expect(parseServiceCodes('')).toBe('ALL');
    expect(parseServiceCodes('ALL')).toBe('ALL');
    expect(parseServiceCodes(undefined)).toBe('ALL');
  });
});

describe('servicesForUser()', () => {
  const sites = [site('ZHPL-KA-01', ['SITE_ACTIVITY', 'EB_DG'], ['WH_BLR_B4']), site('ZHPL-MH-01', 'ALL')];

  it('gives a super admin the whole catalogue', () => {
    expect(servicesForUser(user('SUPER_ADMIN', 'boss@x.com'), sites, [], ALL)).toEqual(ALL);
  });

  it('limits a POC to the services enabled at their site', () => {
    const rows = [poc('poc@x.com', 'ZHPL-KA-01', 'ALL')];
    expect(servicesForUser(user('SITE_POC', 'poc@x.com', 'ZHPL-KA-01'), sites, rows, ALL)).toEqual([
      'SHEET_DAILY_SITE',
      'SHEET_EB_DG',
    ]);
  });

  it('narrows further to the codes on the POC’s own row', () => {
    const rows = [poc('poc@x.com', 'ZHPL-KA-01', 'EB_DG')];
    expect(servicesForUser(user('SITE_POC', 'poc@x.com', 'ZHPL-KA-01'), sites, rows, ALL)).toEqual(['SHEET_EB_DG']);
  });

  it('matches the site by any of its codes', () => {
    const rows = [poc('poc@x.com', 'WH_BLR_B4', 'SITE_ACTIVITY')];
    expect(servicesForUser(user('SITE_POC', 'poc@x.com', 'WH_BLR_B4'), sites, rows, ALL)).toEqual(['SHEET_DAILY_SITE']);
  });

  it('ignores a switched-off row rather than locking the person out', () => {
    // No live row for them is a data gap: the site's own services still show.
    const rows = [poc('poc@x.com', 'ZHPL-KA-01', 'EB_DG', 'No')];
    expect(servicesForUser(user('SITE_POC', 'poc@x.com', 'ZHPL-KA-01'), sites, rows, ALL)).toEqual([
      'SHEET_DAILY_SITE',
      'SHEET_EB_DG',
    ]);
  });

  it('gives every service at a site whose Services_Enabled is ALL', () => {
    const rows = [poc('poc@x.com', 'ZHPL-MH-01', 'ALL')];
    expect(servicesForUser(user('SITE_POC', 'poc@x.com', 'ZHPL-MH-01'), sites, rows, ALL)).toEqual(ALL);
  });

  it('scopes an admin by their own Master Data rows, across sites', () => {
    const rows = [poc('admin@x.com', 'ALL', 'DIESEL')];
    expect(servicesForUser(user('SERVICE_ADMIN', 'admin@x.com'), sites, rows, ALL)).toEqual(['SHEET_DIESEL']);
  });

  it('falls back to daily operations for an admin nobody has scoped', () => {
    expect(servicesForUser(user('SERVICE_ADMIN', 'new@x.com'), sites, [], ALL)).toEqual([
      'SHEET_DAILY_SITE',
      'SHEET_HOUSEKEEPING',
      'SHEET_DIESEL',
    ]);
  });

  it('keeps a service assigned directly in the app', () => {
    const u = user('WAREHOUSE_ADMIN', 'wh@x.com', undefined, ['SHEET_EB_DG']);
    expect(servicesForUser(u, sites, [], ALL)).toEqual(['SHEET_EB_DG']);
  });
});
