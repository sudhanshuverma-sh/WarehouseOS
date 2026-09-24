import { describe, expect, it } from 'vitest';
import type { ServiceRegistry } from '../../types/masterData';
import { controlRoomServices } from '../controlRoom/siteServiceStatus';
import { flattenNav, navFor, scopeNav } from '../nav/navConfig';
import { refreshBuiltInSheets, withBuiltInServices } from './builtInServices';
import { OPERATIONAL_SHEETS } from '../../data/initialData';
import { serviceCodeFor } from './serviceCodes';

/**
 * Fire Pump Healthiness is built into the app but the Master Data sheet in
 * use lists only six services. Every screen lists services from the
 * registry, so without this it was working and invisible everywhere.
 */

const row = (code: string, name: string, active: 'Yes' | 'No' = 'Yes'): ServiceRegistry =>
  ({ Service_Code: code, Service_Name: name, Cadence: 'DAILY', Active: active }) as ServiceRegistry;

// The live sheet's Service_Registry, as it is today.
const SHEET = [
  row('DIESEL', 'Diesel Procurement'),
  row('SITE_ACTIVITY', 'Daily Site Report'),
  row('ATTENDANCE', 'Attendance'),
  row('EB_DG', 'EB-DG Sheet'),
  row('COLD_ROOM', 'Cold Room Update'),
  row('HOUSEKEEPING', 'Housekeeping'),
];

describe('withBuiltInServices', () => {
  it('adds Fire Pump Healthiness when the sheet does not list FIRE', () => {
    const view = withBuiltInServices(SHEET);
    expect(view).toHaveLength(7);
    expect(view.at(-1)).toMatchObject({ Service_Code: 'FIRE', Service_Name: 'Fire Pump Healthiness', Cadence: 'DAILY', Active: 'Yes' });
  });

  it('lets the sheet switch it off', () => {
    const view = withBuiltInServices([...SHEET, row('FIRE', 'Fire Pump Healthiness', 'No')]);
    expect(view.filter((r) => r.Service_Code === 'FIRE')).toEqual([row('FIRE', 'Fire Pump Healthiness', 'No')]);
  });

  it('keeps the sheet’s own name for a FIRE row it has', () => {
    const view = withBuiltInServices([...SHEET, row('FIRE', 'Fire Safety')]);
    expect(view.filter((r) => r.Service_Code === 'FIRE').map((r) => r.Service_Name)).toEqual(['Fire Safety']);
  });

  it('leaves an empty registry empty, so the built-in fallback still applies', () => {
    expect(withBuiltInServices([])).toEqual([]);
  });
});

describe('where it shows', () => {
  it('is a service in the Control Room, the Filing Desk and Records', () => {
    expect(controlRoomServices(withBuiltInServices(SHEET), [])).toContainEqual({
      code: 'FIRE',
      name: 'Fire Pump Healthiness',
      cadence: 'DAILY',
    });
  });

  it.each(['SITE_POC', 'SERVICE_ADMIN', 'SUPER_ADMIN'] as const)('is in the %s sidebar', (role) => {
    const registered = new Set(withBuiltInServices(SHEET).filter((r) => r.Active === 'Yes').map((r) => r.Service_Code));
    const nav = scopeNav(navFor(role), { registered, held: 'ALL', atSite: 'ALL', isAccessible: () => true });
    expect(flattenNav(nav).map((i) => i.id)).toContain('firePump');
  });
});

describe('refreshBuiltInSheets', () => {
  it('replaces an old saved Fire Safety sheet with Fire Pump Healthiness, keeping added questions', () => {
    const extra = { key: 'extinguisher_count', label: 'Extinguishers', type: 'number' as const, required: false, isExtra: true };
    const saved = OPERATIONAL_SHEETS.map((s) =>
      s.id === 'SHEET_FIRE' ? { ...s, title: 'Fire Safety & Hydrant System Sheet', fieldsConfig: [extra], fieldsCount: 13 } : s,
    );
    const fire = refreshBuiltInSheets(saved, OPERATIONAL_SHEETS, serviceCodeFor).find((s) => s.id === 'SHEET_FIRE')!;
    expect(fire.title).toBe('Fire Pump Healthiness');
    expect(fire.fieldsConfig?.map((f) => f.key)).toContain('hydrant_boxes');
    expect(fire.fieldsConfig?.at(-1)).toEqual(extra);
    expect(fire.fieldsCount).toBe(fire.fieldsConfig?.length);
  });

  it('adds the sheet when the saved list never had it, and leaves other sheets alone', () => {
    const saved = OPERATIONAL_SHEETS.filter((s) => s.id !== 'SHEET_FIRE');
    const out = refreshBuiltInSheets(saved, OPERATIONAL_SHEETS, serviceCodeFor);
    expect(out.some((s) => s.id === 'SHEET_FIRE')).toBe(true);
    expect(out.find((s) => s.id === 'SHEET_DIESEL')).toBe(saved.find((s) => s.id === 'SHEET_DIESEL'));
  });
});
