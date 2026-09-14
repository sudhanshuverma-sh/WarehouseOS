import { describe, expect, it } from 'vitest';
import { capabilitiesFor, canSeeSite, resolveSiteFilter } from '../permissions';
import {
  cadenceFor,
  recordFromSubmission,
  sheetFromService,
  submissionBody,
  taskSubmissionFrom,
  userFromMe,
  warehouseFromSite,
  type MeResponse,
  type MySiteRow,
  type SubmissionRow,
} from './adapters';

const row = (over: Partial<SubmissionRow> = {}): SubmissionRow => ({
  id: '41',
  serviceCode: 'HOUSEKEEPING',
  siteCode: 'ZHPL-HR-03',
  warehouseId: 'ZHPL-HR-03',
  date: '2026-09-14',
  shift: 'MORNING',
  status: 'Submitted',
  data: { agency: 'SMS', ongroundCount: 12 },
  remarks: 'all good',
  submittedBy: 'poc@zomato.com',
  submittedByName: 'Poc',
  submittedAt: '2026-09-14T04:00:00.000Z',
  ...over,
});

describe('submissionBody', () => {
  it('separates the values from the bookkeeping the server records itself', () => {
    const body = submissionBody(
      { warehouseId: 'ZHPL-HR-03', warehouseCode: 'GGN3', date: '2026-09-13', shift: 'Daily Log', submittedBy: 'x', agency: 'SMS', remarks: 'ok', status: 'Compliant' },
      { siteCode: 'ZHPL-DL-01', date: '2026-09-14', submittedByName: 'Poc' },
    );
    expect(body).toEqual({
      siteCode: 'ZHPL-HR-03',
      date: '2026-09-13',
      shift: undefined, // 'Daily Log' is not a shift
      data: { agency: 'SMS', status: 'Compliant' },
      remarks: 'ok',
      submittedByName: 'Poc',
    });
  });

  it('falls back to the current site and date when the form sends none', () => {
    const body = submissionBody({ cratesWashed: 40 }, { siteCode: 'ZHPL-DL-01', date: '2026-09-14', submittedByName: 'Poc' });
    expect(body).toMatchObject({ siteCode: 'ZHPL-DL-01', date: '2026-09-14', data: { cratesWashed: 40 } });
  });
});

describe('recordFromSubmission', () => {
  it('flattens an entry and prefers the form’s own outcome as its status', () => {
    expect(recordFromSubmission(row({ data: { agency: 'SMS', status: 'Compliant' } }), 'SHEET_HOUSEKEEPING')).toMatchObject({
      id: '41',
      sheetId: 'SHEET_HOUSEKEEPING',
      agency: 'SMS',
      warehouseId: 'ZHPL-HR-03',
      status: 'Compliant',
      reviewStatus: 'Submitted',
    });
    expect(recordFromSubmission(row(), 'SHEET_HOUSEKEEPING').status).toBe('Submitted');
  });
});

describe('taskSubmissionFrom', () => {
  it('rebuilds the id the checklist screen looks up, and lifts the template out of the values', () => {
    const sub = taskSubmissionFrom(row({ data: { templateId: 'CHK_GEN_01', temp: 4 } }), (d, w, t, s) => `SUB_${d}_${w}_${t}_${s}`);
    expect(sub).toMatchObject({
      id: 'SUB_2026-09-14_ZHPL-HR-03_CHK_GEN_01_MORNING',
      templateId: 'CHK_GEN_01',
      dataPayload: { temp: 4 },
      status: 'COMPLETED',
      notes: 'all good',
    });
  });
});

describe('forms created in the app', () => {
  it('maps a frequency label to a cadence', () => {
    expect(cadenceFor('DAILY (Every Shift)')).toBe('DAILY');
    expect(cadenceFor('Weekly')).toBe('WEEKLY');
    expect(cadenceFor('Monthly audit')).toBe('MONTHLY');
    expect(cadenceFor('Adhoc')).toBe('EVENT_DRIVEN');
    expect(cadenceFor(undefined)).toBe('DAILY');
  });

  it('turns a stored service back into a sheet card with its columns', () => {
    const sheet = sheetFromService(
      { Service_Code: 'PEST_CONTROL', Service_Name: 'Pest Control', Cadence: 'WEEKLY' } as any,
      'SHEET_PEST_CONTROL',
      [{ key: 'bait', label: 'Bait stations', type: 'number', required: true }],
    );
    expect(sheet).toMatchObject({ id: 'SHEET_PEST_CONTROL', code: 'PEST_CONTROL', title: 'Pest Control', isCustom: true, fieldsCount: 1 });
  });
});

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
