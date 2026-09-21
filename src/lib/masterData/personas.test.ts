import { describe, expect, it } from 'vitest';
import { initialsOf, personasFromMaster } from './personas';
import type { ControlRoomSite } from '../controlRoom/siteServiceStatus';
import type { PocMaster } from '../../types/masterData';
import type { Warehouse } from '../../types';

const site = (id: string, aliases: string[] = []): ControlRoomSite => ({
  id,
  whCode: aliases[0] ?? id,
  name: `Facility ${id}`,
  city: '',
  zone: '',
  channel: 'B2B',
  services: 'ALL',
  aliases: [id, ...aliases],
});

const row = (over: Partial<PocMaster>): PocMaster =>
  ({
    Access_ID: 'AC-0001',
    POC_Email: 'rekha.n@example.com',
    POC_Name: 'Rekha Nair',
    Role: 'SITE_POC',
    Site_Code: 'ZHPL-KA-01',
    Service_Codes: 'ALL',
    Contact_Number: '+91 80 4123 7781',
    Active: 'Yes',
    ...over,
  }) as PocMaster;

// controlRoomSites puts both the WH_Code and the matching app warehouse's id
// in the alias list, which is how ZHPL-KA-01 and WH_BLR_B4 are one place.
const sites = [site('ZHPL-KA-01', ['WH-BLR-B4', 'WH_BLR_B4'])];
const warehouses = [{ id: 'WH_BLR_B4', code: 'WH-BLR-B4' }] as Warehouse[];

describe('personasFromMaster()', () => {
  it('turns a live POC row into an account the app can act as', () => {
    const [poc] = personasFromMaster([row({})], sites, warehouses);
    expect(poc).toMatchObject({
      id: 'AC-0001',
      fullName: 'Rekha Nair',
      email: 'rekha.n@example.com',
      role: 'SITE_POC',
      serviceCodes: 'ALL',
      siteCodes: ['ZHPL-KA-01'],
      isActive: true,
    });
  });

  it('points them at the id this app files records against', () => {
    // Master Data calls it ZHPL-KA-01, the records call it WH_BLR_B4.
    // Switching person has to land on the site that has the records.
    const [poc] = personasFromMaster([row({})], sites, warehouses);
    expect(poc.warehouseId).toBe('WH_BLR_B4');
  });

  it('keeps the Site_Code when the app has no warehouse for that site', () => {
    const [poc] = personasFromMaster([row({ Site_Code: 'ZHPL-MH-09' })], [site('ZHPL-MH-09')], warehouses);
    expect(poc.warehouseId).toBe('ZHPL-MH-09');
  });

  it('carries the service codes the row holds, which is what scoping reads', () => {
    const [poc] = personasFromMaster([row({ Service_Codes: 'DIESEL, EB_DG' })], sites, warehouses);
    expect(poc.serviceCodes).toEqual(['DIESEL', 'EB_DG']);
  });

  it('leaves out anyone switched off, or with no name', () => {
    const rows = [
      row({ Access_ID: 'AC-1', Active: 'No' }),
      row({ Access_ID: 'AC-2', POC_Name: '  ' }),
      row({ Access_ID: 'AC-3', POC_Name: 'Imran Qureshi' }),
    ];
    expect(personasFromMaster(rows, sites, warehouses).map(p => p.fullName)).toEqual(['Imran Qureshi']);
  });

  it('shows one entry per person per site, not one per grant row', () => {
    const rows = [
      row({ Access_ID: 'AC-1', Service_Codes: 'DIESEL' }),
      row({ Access_ID: 'AC-2', Service_Codes: 'EB_DG' }),
      row({ Access_ID: 'AC-3', Site_Code: 'ZHPL-MH-09' }),
    ];
    expect(personasFromMaster(rows, [...sites, site('ZHPL-MH-09')], warehouses)).toHaveLength(2);
  });

  it('puts admins above site POCs, then sorts by name', () => {
    const rows = [
      row({ Access_ID: 'AC-1', POC_Name: 'Zubin Mehta', POC_Email: 'z@example.com' }),
      row({ Access_ID: 'AC-2', POC_Name: 'Aarti Deshpande', POC_Email: 'a@example.com' }),
      row({ Access_ID: 'AC-3', POC_Name: 'Sudhanshu Verma', POC_Email: 's@example.com', Role: 'SUPER_ADMIN', Site_Code: 'ALL' }),
    ];
    expect(personasFromMaster(rows, sites, warehouses).map(p => p.fullName)).toEqual([
      'Sudhanshu Verma',
      'Aarti Deshpande',
      'Zubin Mehta',
    ]);
  });

  it('gives a super admin no site of their own', () => {
    const [admin] = personasFromMaster([row({ Role: 'SUPER_ADMIN', Site_Code: 'ALL' })], sites, warehouses);
    expect(admin.warehouseId).toBeUndefined();
    expect(admin.siteCodes).toBeUndefined();
  });
});

describe('initialsOf()', () => {
  it('takes the first and last name', () => {
    expect(initialsOf('Rekha Nair')).toBe('RN');
    expect(initialsOf('Aarti Sharma Deshpande')).toBe('AD');
  });

  it('copes with one name, or none', () => {
    expect(initialsOf('Imran')).toBe('IM');
    expect(initialsOf('   ')).toBe('??');
  });
});
