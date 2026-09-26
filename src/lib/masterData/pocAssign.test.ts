import { describe, expect, it } from 'vitest';
import type { PocMaster } from '../../types/masterData';
import { describePocPlan, planPocAssignment, pocFormErrors, rowsForPerson, unionServices, type PocForm } from './pocAssign';

/** One person, several sites: the Assign POC form as POC_Master row writes. */

const form = (p: Partial<PocForm> = {}): PocForm => ({
  POC_Email: 'ravi@x.com', POC_Name: 'Ravi Kumar', Role: 'SITE_POC', Service_Codes: 'ALL', Contact_Number: '98100',
  Is_Primary: 'Yes', Active: 'Yes', Access_Start_Date: '', Access_End_Date: '', Description: '', Reporting_Manager_Email: '',
  ...p,
});

const row = (p: Partial<PocMaster>): PocMaster => ({
  Access_ID: 'AC-0001', POC_Email: 'ravi@x.com', POC_Name: 'Ravi Kumar', WH_Code: '', Role: 'SITE_POC', Site_Code: 'ZHPL-DL-03',
  Service_Codes: 'ALL', Contact_Number: '98100', Is_Primary: 'Yes', Active: 'Yes', Access_Start_Date: '', Access_End_Date: '',
  Description: '', Reporting_Manager_Email: '', Last_Updated_By: '', Last_Updated_At: '',
  ...p,
});

const wh = (code: string) => ({ 'ZHPL-DL-03': 'DEL3', 'ZHPL-DL-06': 'DEL6', 'ZHPL-HR-01': 'GGN1' } as Record<string, string>)[code] ?? '';

describe('assigning a POC to sites', () => {
  it('creates one row per site for someone new, ids left to the sheet', () => {
    const plan = planPocAssignment([], form(), ['ZHPL-DL-03', 'ZHPL-DL-06'], wh);
    expect(plan.creates.map((r) => [r.Access_ID, r.Site_Code, r.WH_Code])).toEqual([['', 'ZHPL-DL-03', 'DEL3'], ['', 'ZHPL-DL-06', 'DEL6']]);
    expect(plan.creates[0]).toMatchObject({ POC_Name: 'Ravi Kumar', Role: 'SITE_POC', Active: 'Yes' });
    expect(plan.updates).toEqual([]);
    expect(plan.deactivations).toEqual([]);
    expect(describePocPlan(plan)).toBe('Adds 2 sites.');
  });

  it('adds a third site without touching the two they already hold', () => {
    const existing = [row({ Access_ID: 'AC-0001', Site_Code: 'ZHPL-DL-03', WH_Code: 'DEL3' }), row({ Access_ID: 'AC-0002', Site_Code: 'ZHPL-DL-06', WH_Code: 'DEL6' })];
    const plan = planPocAssignment(existing, form(), ['ZHPL-DL-03', 'ZHPL-DL-06', 'ZHPL-HR-01'], wh);
    expect(plan.creates.map((r) => r.Site_Code)).toEqual(['ZHPL-HR-01']);
    expect(plan.updates).toEqual([]);
    expect(plan.deactivations).toEqual([]);
  });

  it('ends access at a site that is no longer picked, and never deletes the row', () => {
    const existing = [row({ Access_ID: 'AC-0001', Site_Code: 'ZHPL-DL-03', WH_Code: 'DEL3' }), row({ Access_ID: 'AC-0002', Site_Code: 'ZHPL-DL-06', WH_Code: 'DEL6' })];
    const plan = planPocAssignment(existing, form(), ['ZHPL-DL-03'], wh);
    expect(plan.deactivations.map((r) => [r.Access_ID, r.Active])).toEqual([['AC-0002', 'No']]);
    expect(describePocPlan(plan)).toBe('Ends access at 1 site.');
  });

  it('switches an ended site back on rather than adding a second row', () => {
    const existing = [row({ Access_ID: 'AC-0001', Site_Code: 'ZHPL-DL-03', WH_Code: 'DEL3' }), row({ Access_ID: 'AC-0002', Site_Code: 'ZHPL-DL-06', WH_Code: 'DEL6', Active: 'No' })];
    const plan = planPocAssignment(existing, form(), ['ZHPL-DL-03', 'ZHPL-DL-06'], wh);
    expect(plan.creates).toEqual([]);
    expect(plan.updates.map((r) => [r.Access_ID, r.Active])).toEqual([['AC-0002', 'Yes']]);
  });

  it('carries a changed phone number to every site they hold', () => {
    const existing = [row({ Access_ID: 'AC-0001', Site_Code: 'ZHPL-DL-03', WH_Code: 'DEL3' }), row({ Access_ID: 'AC-0002', Site_Code: 'ZHPL-DL-06', WH_Code: 'DEL6' })];
    const plan = planPocAssignment(existing, form({ Contact_Number: '99999' }), ['ZHPL-DL-03', 'ZHPL-DL-06'], wh);
    expect(plan.updates.map((r) => [r.Access_ID, r.Contact_Number])).toEqual([['AC-0001', '99999'], ['AC-0002', '99999']]);
  });

  it('gives a Service Admin one row for every site, reusing their first', () => {
    const existing = [row({ Access_ID: 'AC-0001', Site_Code: 'ZHPL-DL-03' }), row({ Access_ID: 'AC-0002', Site_Code: 'ZHPL-DL-06' })];
    const plan = planPocAssignment(existing, form({ Role: 'SERVICE_ADMIN', Service_Codes: 'DIESEL' }), ['ZHPL-DL-03'], wh);
    expect(plan.creates).toEqual([]);
    expect(plan.updates.map((r) => [r.Access_ID, r.Site_Code, r.Role, r.WH_Code])).toEqual([['AC-0001', 'ALL', 'SERVICE_ADMIN', '']]);
    expect(plan.deactivations.map((r) => r.Access_ID)).toEqual(['AC-0002']);
  });

  it("matches a person's rows whatever the email's case, and leaves other people alone", () => {
    const existing = [row({ Access_ID: 'AC-0001', POC_Email: 'Ravi@X.com' }), row({ Access_ID: 'AC-0009', POC_Email: 'neha@x.com', Site_Code: 'ZHPL-DL-06' })];
    expect(rowsForPerson(existing, 'ravi@x.com').map((r) => r.Access_ID)).toEqual(['AC-0001']);
    const plan = planPocAssignment(existing, form(), ['ZHPL-DL-06'], wh);
    expect(plan.creates.map((r) => r.Site_Code)).toEqual(['ZHPL-DL-06']);
    expect(plan.deactivations.map((r) => r.Access_ID)).toEqual(['AC-0001']);
  });

  it('asks for an email, a name and at least one site', () => {
    expect(pocFormErrors(form({ POC_Email: '', POC_Name: '' }), [])).toEqual(['POC email is required.', 'POC name is required.', 'Pick at least one site.']);
    expect(pocFormErrors(form({ POC_Email: 'not-an-email' }), ['ZHPL-DL-03'])).toEqual(['POC email must be an email address.']);
    expect(pocFormErrors(form({ Role: 'SUPER_ADMIN' }), [])).toEqual([]);
  });

  it('merges services across rows: ALL wins, otherwise the union', () => {
    expect(unionServices([{ Service_Codes: 'DIESEL' }, { Service_Codes: 'EB_DG, DIESEL' }])).toBe('DIESEL,EB_DG');
    expect(unionServices([{ Service_Codes: 'DIESEL' }, { Service_Codes: 'ALL' }])).toBe('ALL');
  });
});

describe('ids for rows kept in this app', () => {
  it('continues from the highest AC number, the way the sheet does', async () => {
    const { nextAccessIds, isTempAccessId } = await import('./pocAssign');
    expect(nextAccessIds([{ Access_ID: 'AC-0009' }, { Access_ID: 'AC-0041' }, { Access_ID: 'NEW-x-1' }], 2)).toEqual(['AC-0042', 'AC-0043']);
    expect(nextAccessIds([], 1)).toEqual(['AC-0001']);
    expect(isTempAccessId('NEW-abc-1')).toBe(true);
    expect(isTempAccessId('AC-0001')).toBe(false);
  });
});
