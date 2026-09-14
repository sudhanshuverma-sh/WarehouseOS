import { describe, it, expect } from 'vitest';
import { validateSite, validateService, suggestNextSiteCode, errorsByField } from './validate';
import type { SiteMaster, ServiceRegistry } from '../../types/masterData';

const SITES = [{ Site_Code: 'ZHPL-DL-01' }, { Site_Code: 'ZHPL-DL-04' }, { Site_Code: 'ZHPL-HR-02' }];
const SERVICES = [{ Service_Code: 'DIESEL' }, { Service_Code: 'EB_DG' }];

const site = (over: Partial<SiteMaster> = {}): Partial<SiteMaster> => ({
  Site_Code: 'ZHPL-DL-05',
  WH_Code: 'WH-DEL9',
  Facility_Name: 'WH-DEL9',
  Zone: 'North',
  State: 'Delhi',
  Channel: 'B2B',
  Entity: 'Zomato Hyperpure Private Limited',
  Business_Type: 'HP',
  Active: 'Yes',
  ...over,
});

const service = (over: Partial<ServiceRegistry> = {}): Partial<ServiceRegistry> => ({
  Service_Code: 'COLD_ROOM',
  Service_Name: 'Cold Room Update',
  Cadence: 'DAILY',
  Submission_Window: '18:00',
  ...over,
});

const fields = (errs: { field: string }[]) => errs.map((e) => e.field);

describe('validateSite', () => {
  it('accepts a complete new site', () => {
    expect(validateSite(site(), SITES, 'create')).toEqual([]);
  });

  it('reports every missing required field', () => {
    const errs = validateSite({ Site_Code: 'ZHPL-DL-05' }, SITES, 'create');
    expect(fields(errs)).toEqual(
      expect.arrayContaining(['WH_Code', 'Facility_Name', 'Zone', 'State', 'Channel', 'Entity', 'Business_Type']),
    );
  });

  it('treats whitespace as blank', () => {
    expect(fields(validateSite(site({ Facility_Name: '   ' }), SITES, 'create'))).toContain('Facility_Name');
  });

  it('enforces the ZHPL-XX-NN code format', () => {
    for (const bad of ['DL-01', 'ZHPL-DEL-01', 'ZHPL-DL-1', 'zhpl-dl-01']) {
      expect(fields(validateSite(site({ Site_Code: bad }), SITES, 'create'))).toContain('Site_Code');
    }
  });

  it('refuses to create a code that already exists, ignoring case', () => {
    const errs = validateSite(site({ Site_Code: 'ZHPL-DL-01' }), SITES, 'create');
    expect(errs.find((e) => e.field === 'Site_Code')?.message).toMatch(/already exists/);
  });

  it('refuses to change the code when editing', () => {
    // I2: POC rows and readings point at the code; renaming orphans them.
    const errs = validateSite(site({ Site_Code: 'ZHPL-DL-04' }), SITES, 'edit', 'ZHPL-DL-01');
    expect(errs.find((e) => e.field === 'Site_Code')?.message).toMatch(/cannot change/);
  });

  it('allows editing an existing site with the code unchanged', () => {
    expect(validateSite(site({ Site_Code: 'ZHPL-DL-01' }), SITES, 'edit', 'ZHPL-DL-01')).toEqual([]);
  });

  it('refuses to edit a site that does not exist', () => {
    const errs = validateSite(site({ Site_Code: 'ZHPL-DL-09' }), SITES, 'edit', 'ZHPL-DL-09');
    expect(errs.find((e) => e.field === 'Site_Code')?.message).toMatch(/does not exist/);
  });

  it('rejects values outside the enums', () => {
    const errs = validateSite(site({ Zone: 'Northeast' as never, Channel: 'D2C' as never, Business_Type: 'X' as never }), SITES, 'create');
    expect(fields(errs)).toEqual(expect.arrayContaining(['Zone', 'Channel', 'Business_Type']));
  });

  it('checks pincode and GSTIN only when present', () => {
    expect(fields(validateSite(site({ Pincode: '11008' }), SITES, 'create'))).toContain('Pincode');
    expect(fields(validateSite(site({ GSTIN: 'SHORT' }), SITES, 'create'))).toContain('GSTIN');
    expect(validateSite(site({ Pincode: '110081', GSTIN: '07AAACZ8867B1Z2' }), SITES, 'create')).toEqual([]);
    expect(validateSite(site({ Pincode: '', GSTIN: '' }), SITES, 'create')).toEqual([]);
  });

  it('requires a closure date when a site is switched off', () => {
    // I1: nothing is deleted, so an inactive site must say when it stopped.
    expect(fields(validateSite(site({ Active: 'No' }), SITES, 'create'))).toContain('Closure_Date');
    expect(validateSite(site({ Active: 'No', Closure_Date: '2026-09-01' }), SITES, 'create')).toEqual([]);
  });

  it('refuses a closure date before go-live', () => {
    const errs = validateSite(site({ Go_Live_Date: '2026-09-10', Closure_Date: '2026-09-01' }), SITES, 'create');
    expect(fields(errs)).toContain('Closure_Date');
  });
});

describe('validateService', () => {
  it('accepts a complete new service', () => {
    expect(validateService(service(), SERVICES, 'create')).toEqual([]);
  });

  it('requires code, name and cadence', () => {
    expect(fields(validateService({}, SERVICES, 'create'))).toEqual(
      expect.arrayContaining(['Service_Code', 'Service_Name', 'Cadence']),
    );
  });

  it('enforces the code format', () => {
    for (const bad of ['cold_room', '1COLD', 'COLD-ROOM', 'COLD ROOM']) {
      expect(fields(validateService(service({ Service_Code: bad }), SERVICES, 'create'))).toContain('Service_Code');
    }
  });

  it('refuses a duplicate code on create, ignoring case', () => {
    expect(fields(validateService(service({ Service_Code: 'DIESEL' }), SERVICES, 'create'))).toContain('Service_Code');
  });

  it('refuses to change the code when editing', () => {
    expect(fields(validateService(service({ Service_Code: 'EB_DG' }), SERVICES, 'edit', 'DIESEL'))).toContain('Service_Code');
  });

  it('validates the submission window as a real 24-hour time', () => {
    for (const bad of ['25:00', '18:60', '6pm', '1800']) {
      expect(fields(validateService(service({ Submission_Window: bad }), SERVICES, 'create'))).toContain('Submission_Window');
    }
    expect(validateService(service({ Submission_Window: '20:30' }), SERVICES, 'create')).toEqual([]);
  });

  it('accepts a blank or non-negative SLA, refuses anything else', () => {
    expect(validateService(service({ SLA_Hours: '' }), SERVICES, 'create')).toEqual([]);
    expect(validateService(service({ SLA_Hours: 24 }), SERVICES, 'create')).toEqual([]);
    expect(fields(validateService(service({ SLA_Hours: 'soon' as never }), SERVICES, 'create'))).toContain('SLA_Hours');
    expect(fields(validateService(service({ SLA_Hours: -1 }), SERVICES, 'create'))).toContain('SLA_Hours');
  });

  it('requires a deployed /exec URL when an Apps Script URL is given', () => {
    expect(fields(validateService(service({ AppScript_URL: 'https://script.google.com/home/projects/x/edit' }), SERVICES, 'create'))).toContain('AppScript_URL');
    expect(validateService(service({ AppScript_URL: 'https://script.google.com/macros/s/AK1/exec' }), SERVICES, 'create')).toEqual([]);
  });
});

describe('suggestNextSiteCode', () => {
  it('goes one above the highest code for that state', () => {
    expect(suggestNextSiteCode('Delhi', SITES)).toBe('ZHPL-DL-05');
  });

  it('does not reuse a gap', () => {
    // DL-02 and DL-03 are missing, but a gap is usually a closed or planned
    // site, and reusing its code would inherit its history.
    expect(suggestNextSiteCode('Delhi', SITES)).not.toBe('ZHPL-DL-02');
  });

  it('starts a new state at 01', () => {
    expect(suggestNextSiteCode('Kerala', SITES)).toBe('ZHPL-KL-01');
  });

  it('returns blank for an unknown state rather than guessing letters', () => {
    expect(suggestNextSiteCode('Atlantis', SITES)).toBe('');
  });
});

describe('errorsByField', () => {
  it('keeps the first message per field', () => {
    expect(
      errorsByField([
        { field: 'A', message: 'first' },
        { field: 'A', message: 'second' },
        { field: 'B', message: 'b' },
      ]),
    ).toEqual({ A: 'first', B: 'b' });
  });
});
