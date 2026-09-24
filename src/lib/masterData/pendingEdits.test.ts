import { describe, expect, it } from 'vitest';
import type { ServiceRegistry } from '../../types/masterData';
import { applyPendingEdits, changedFields, NO_PENDING_EDITS, recordPendingEdit } from './pendingEdits';
import { changedOnly, normaliseTime, validateService } from './validate';
import { controlRoomServices } from '../controlRoom/siteServiceStatus';
import { flattenNav, navFor, scopeNav } from '../nav/navConfig';

/**
 * Switching a service off in Master Data used to do nothing: the save was
 * refused without an Apps Script link, a time the sheet formatted its own way
 * failed validation, and the next sync put the old value back.
 */

const service = (over: Partial<ServiceRegistry> = {}): ServiceRegistry =>
  ({
    Service_Code: 'HOUSEKEEPING',
    Service_Name: 'Housekeeping',
    Needs_Approval: 'No',
    Needs_Delivery_Validation: 'No',
    Requires_Evidence: 'Yes',
    Cadence: 'DAILY',
    Submission_Window: '18:00',
    SLA_Hours: '',
    AppScript_URL: '',
    Records_Tab: 'Records',
    Audit_Tab: 'Audit',
    Active: 'Yes',
    Last_Updated_By: '',
    Last_Updated_At: '',
    ...over,
  }) as ServiceRegistry;

describe('pending edits survive a re-sync', () => {
  const switchedOff = recordPendingEdit(NO_PENDING_EDITS, 'Service_Registry', 'HOUSEKEEPING', { Active: 'No' }, false);

  it('keeps a service switched off while the sheet still says Yes', () => {
    const { rows, remaining } = applyPendingEdits([service()], switchedOff.Service_Registry, 'Service_Code');
    expect(rows[0].Active).toBe('No');
    expect(remaining).toHaveProperty('HOUSEKEEPING');
  });

  it('forgets the edit once the sheet says the same thing', () => {
    const { rows, remaining } = applyPendingEdits([service({ Active: 'No' })], switchedOff.Service_Registry, 'Service_Code');
    expect(rows[0].Active).toBe('No');
    expect(remaining).toEqual({});
  });

  it('lays only the changed fields over the sheet, so the sheet’s other edits stand', () => {
    const { rows } = applyPendingEdits([service({ Service_Name: 'Housekeeping v2' })], switchedOff.Service_Registry, 'Service_Code');
    expect(rows[0]).toMatchObject({ Service_Name: 'Housekeeping v2', Active: 'No' });
  });

  it('keeps a row made in the app that the sheet does not have yet', () => {
    const made = recordPendingEdit(NO_PENDING_EDITS, 'Service_Registry', 'FIRE', { Service_Code: 'FIRE', Service_Name: 'Fire Pump Healthiness', Active: 'No' }, true);
    const { rows } = applyPendingEdits([service()], made.Service_Registry, 'Service_Code');
    expect(rows.map((r) => [r.Service_Code, r.Active])).toEqual([
      ['HOUSEKEEPING', 'Yes'],
      ['FIRE', 'No'],
    ]);
  });

  it('merges two edits to the same row, and ignores bookkeeping fields', () => {
    const twice = recordPendingEdit(switchedOff, 'Service_Registry', 'HOUSEKEEPING', { Cadence: 'WEEKLY' }, false);
    expect(twice.Service_Registry.HOUSEKEEPING.fields).toEqual({ Active: 'No', Cadence: 'WEEKLY' });
    expect(changedFields(service() as never, { ...service(), Active: 'No', Last_Updated_At: 'now' })).toEqual({ Active: 'No' });
  });
});

describe('an edit is judged on what it changes', () => {
  it('lets a service be switched off even when the sheet formatted its window as 18:00:00', () => {
    const before = service({ Submission_Window: '18:00:00' });
    const after = { ...before, Active: 'No' as const };
    expect(validateService(after, [before], 'edit', 'HOUSEKEEPING')).not.toEqual([]);
    expect(changedOnly(validateService(after, [before], 'edit', 'HOUSEKEEPING'), before as never, after as never)).toEqual([]);
  });

  it('still refuses a bad value that was typed, and checks a new row whole', () => {
    const before = service();
    const after = { ...before, Submission_Window: '25:00' };
    expect(changedOnly(validateService(after, [before], 'edit', 'HOUSEKEEPING'), before as never, after as never)[0].field).toBe('Submission_Window');
    const fresh = service({ Service_Code: 'NEW_ONE', Submission_Window: '18:00:00' });
    expect(changedOnly(validateService(fresh, [], 'create'), undefined, fresh as never)).toHaveLength(1);
  });

  it('reads the sheet’s times as HH:MM', () => {
    expect(normaliseTime('18:00:00')).toBe('18:00');
    expect(normaliseTime('9:5')).toBe('09:05');
    expect(normaliseTime('6:00 PM')).toBe('18:00');
    expect(normaliseTime('12:30 am')).toBe('00:30');
    expect(normaliseTime('1899-12-30T12:30:50.000Z')).toBe('1899-12-30T12:30:50.000Z');
  });
});

describe('every service switched off', () => {
  const allOff = [service({ Active: 'No' }), service({ Service_Code: 'DIESEL', Service_Name: 'Diesel', Active: 'No' })];

  it('lists no service, instead of falling back to every built-in one', () => {
    expect(controlRoomServices(allOff, [])).toEqual([]);
    expect(controlRoomServices([], []).length).toBeGreaterThan(0); // not loaded yet: the built-ins
  });

  it('shows no service in the sidebar once Master Data has loaded', () => {
    const scope = { registered: new Set<string>(), held: 'ALL' as const, atSite: 'ALL' as const, isAccessible: () => true };
    const ids = (loaded: boolean) => flattenNav(scopeNav(navFor('SITE_POC'), { ...scope, loaded })).map((i) => i.id);
    expect(ids(true)).not.toContain('diesel');
    expect(ids(false)).toContain('diesel');
  });
});
