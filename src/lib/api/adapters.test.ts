import { describe, expect, it } from 'vitest';
import { capabilitiesFor, canSeeSite, resolveSiteFilter } from '../permissions';
import { userFromMe, warehouseFromSite, type MeResponse, type MySiteRow } from './adapters';

const me = (over: Partial<MeResponse>): MeResponse => ({
  email: 'poc@zomato.com',
  name: 'Poc',
  roles: ['SITE_POC'],
  sites: ['ZHPL-HR-03'],
  services: ['DIESEL'],
  grants: [],
  ...over,
});

describe('userFromMe', () => {
  it('uses the email as the id and the site code as the warehouse', () => {
    expect(userFromMe(me({}))).toMatchObject({
      id: 'poc@zomato.com',
      role: 'SITE_POC',
      warehouseId: 'ZHPL-HR-03',
      siteCodes: ['ZHPL-HR-03'],
      serviceCodes: ['DIESEL'],
    });
  });

  it('acts with the widest role a person holds', () => {
    expect(userFromMe(me({ roles: ['SITE_POC', 'WAREHOUSE_ADMIN'] })).role).toBe('WAREHOUSE_ADMIN');
    expect(userFromMe(me({ roles: ['SUPER_ADMIN'], sites: 'ALL', services: 'ALL' }))).toMatchObject({
      role: 'SUPER_ADMIN',
      warehouseId: undefined,
      siteCodes: undefined,
    });
  });

  it('falls back to the email when there is no name', () => {
    expect(userFromMe(me({ name: '' })).fullName).toBe('poc@zomato.com');
  });
});

describe('a POC covering several warehouses', () => {
  const caps = capabilitiesFor(userFromMe(me({ sites: ['ZHPL-HR-03', 'ZHPL-DL-01'] })));

  it('may see every one of their sites, and no other', () => {
    expect(caps.siteScope).toEqual(['ZHPL-HR-03', 'ZHPL-DL-01']);
    expect(canSeeSite(caps, 'ZHPL-DL-01')).toBe(true);
    expect(canSeeSite(caps, 'ZHPL-KA-01')).toBe(false);
  });

  it('can switch the site filter to their second site', () => {
    expect(resolveSiteFilter(caps, 'ZHPL-DL-01')).toBe('ZHPL-DL-01');
  });

  it('is pulled back to their own site when asking for everyone or someone else', () => {
    expect(resolveSiteFilter(caps, 'ALL')).toBe('ZHPL-HR-03');
    expect(resolveSiteFilter(caps, 'ZHPL-KA-01')).toBe('ZHPL-HR-03');
  });
});

describe('warehouseFromSite', () => {
  const row: MySiteRow = {
    site_code: 'ZHPL-HR-03',
    wh_code: 'GGN3',
    facility_name: 'Gurgaon 3',
    channel: 'B2B',
    entity: 'ZHPL',
    cost_center: null,
    sap_code: 'SAP9',
    zone: 'North',
    state: 'Haryana',
    city: null,
    address: null,
    business_type: 'WHS',
    services_enabled: 'ALL',
  };

  it('keys the warehouse by its Site_Code and fills what the forms read', () => {
    expect(warehouseFromSite(row)).toMatchObject({
      id: 'ZHPL-HR-03',
      code: 'GGN3',
      name: 'Gurgaon 3',
      b2bName: 'Gurgaon 3',
      b2cName: undefined,
      costCenter: 'SAP9',
      city: '',
    });
  });
});
