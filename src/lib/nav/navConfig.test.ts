import { describe, expect, it } from 'vitest';
import { flattenNav, homeFor, navFor, scopeNav, type NavScope } from './navConfig';

/**
 * One tree for the sidebar, the phone drawer and the bottom bar. These
 * pin the two things that used to differ between the hand-written copies:
 * which items a role gets, and whether Master Data narrowed them.
 */

const ids = (role: Parameters<typeof navFor>[0]) => flattenNav(navFor(role)).map(i => i.id);

/** Everything allowed: the state before Master Data has been imported. */
const open: NavScope = { registered: new Set(), held: 'ALL', atSite: 'ALL', isAccessible: () => true };

const withRegistry = (over: Partial<NavScope> = {}): NavScope => ({
  registered: new Set(['SITE_ACTIVITY', 'DIESEL', 'EB_DG', 'HOUSEKEEPING', 'WASHING', 'ADHOC']),
  held: 'ALL',
  atSite: 'ALL',
  isAccessible: () => true,
  ...over,
});

describe('navFor()', () => {
  it('lands each role on its own home', () => {
    expect(homeFor('SITE_POC')).toBe('pocFiling');
    expect(homeFor('SERVICE_ADMIN')).toBe('adminDashboard');
    expect(homeFor('SUPER_ADMIN')).toBe('dashboard');
    // The bottom bar used to send a Service Admin to the POC filing desk.
    expect(homeFor('SERVICE_ADMIN')).not.toBe('pocFiling');
  });

  it('gives a POC their own site and nothing administrative', () => {
    const poc = ids('SITE_POC');
    expect(poc).toContain('pocFiling');
    expect(poc).toContain('database');
    expect(poc).not.toContain('masterData');
    expect(poc).not.toContain('sheets');
    expect(poc).not.toContain('createForm');
  });

  it('keeps the sheets console away from a service admin', () => {
    // Shaping a form is canEditSchema, which only a Super Admin holds.
    expect(ids('SERVICE_ADMIN')).not.toContain('sheets');
    expect(ids('SUPER_ADMIN')).toContain('sheets');
  });

  it('every item names a route and carries a label', () => {
    for (const role of ['SITE_POC', 'SERVICE_ADMIN', 'SUPER_ADMIN'] as const) {
      for (const item of flattenNav(navFor(role))) {
        expect(item.id).toBeTruthy();
        expect(item.label.trim()).toBeTruthy();
        expect(item.subLabel.trim()).toBeTruthy();
      }
    }
  });

  it('says the same thing to every surface', () => {
    // The sidebar said "Filing Desk" and the drawer "POC Daily Filing Desk"
    // for one screen. One tree means one label, whoever renders it.
    const labels = new Map<string, string>();
    for (const role of ['SITE_POC', 'SERVICE_ADMIN', 'SUPER_ADMIN'] as const) {
      for (const item of flattenNav(navFor(role))) {
        if (item.id === 'pocFiling' || item.id === 'database') continue; // worded per audience
        const seen = labels.get(item.id);
        if (seen) expect(item.label).toBe(seen);
        labels.set(item.id, item.label);
      }
    }
  });
});

describe('scopeNav()', () => {
  it('leaves everything alone before Master Data loads', () => {
    expect(flattenNav(scopeNav(navFor('SITE_POC'), open)).map(i => i.id)).toEqual(ids('SITE_POC'));
  });

  it('drops a service switched off at the person’s site', () => {
    // This is the bug the phone drawer had: Crate Washing disabled at the
    // site, still listed, and it opened.
    const scoped = scopeNav(navFor('SITE_POC'), withRegistry({ atSite: ['SITE_ACTIVITY', 'DIESEL'] }));
    const shown = flattenNav(scoped).map(i => i.id);
    expect(shown).toContain('diesel');
    expect(shown).not.toContain('washing');
    expect(shown).not.toContain('housekeeping');
  });

  it('drops a service the person does not hold', () => {
    const scoped = scopeNav(navFor('SITE_POC'), withRegistry({ held: ['DIESEL'] }));
    const shown = flattenNav(scoped).map(i => i.id);
    expect(shown).toEqual(expect.arrayContaining(['pocFiling', 'diesel', 'database']));
    expect(shown).not.toContain('dailyForm');
  });

  it('drops a service that is not active in the registry', () => {
    const scoped = scopeNav(navFor('SITE_POC'), withRegistry({ registered: new Set(['DIESEL']) }));
    expect(flattenNav(scoped).map(i => i.id)).not.toContain('dailyForm');
  });

  it('keeps Crate Washing while either of its two codes survives', () => {
    const onlyAdhoc = scopeNav(navFor('SITE_POC'), withRegistry({ held: ['ADHOC'] }));
    expect(flattenNav(onlyAdhoc).map(i => i.id)).toContain('washing');
  });

  it('never narrows a dashboard or an explorer', () => {
    // Those have no service codes: the role branch already decided them.
    const scoped = scopeNav(navFor('SUPER_ADMIN'), withRegistry({ held: [], atSite: [] }));
    const shown = flattenNav(scoped).map(i => i.id);
    expect(shown).toEqual(expect.arrayContaining(['dashboard', 'adminDashboard', 'database', 'masterData']));
    expect(shown).not.toContain('diesel');
  });

  it('removes a group once everything in it is scoped away', () => {
    const scoped = scopeNav([{ group: 'ONLY SERVICES', items: flattenNav(navFor('SITE_POC')).filter(i => i.codes) }], withRegistry({ held: [] }));
    expect(scoped).toEqual([]);
  });
});
