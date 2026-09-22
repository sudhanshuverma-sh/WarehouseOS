import { describe, expect, it } from 'vitest';
import { capabilitiesFor, canSeeSite, resolveSiteFilter } from './permissions';
import { User, UserRole } from '../types';

const user = (role: UserRole, warehouseId?: string): User => ({
  id: 'u1', email: 'surya@zomato.com', fullName: 'Surya', role, warehouseId,
  isActive: true, createdAt: '2026-01-01T00:00:00Z'
});

const poc = user('SITE_POC', 'WH_AP_VIZAG_B2C');
const superAdmin = user('SUPER_ADMIN');
const serviceAdmin = user('SERVICE_ADMIN');
const warehouseAdmin = user('WAREHOUSE_ADMIN', 'WH_BLR_B4');

describe('capabilitiesFor()', () => {
  it('never lets a site POC touch backend wiring', () => {
    const caps = capabilitiesFor(poc);
    expect(caps.canConfigureIntegrations).toBe(false);
    expect(caps.canManageMasterData).toBe(false);
    expect(caps.canEditSchema).toBe(false);
    expect(caps.canApprove).toBe(false);
  });

  it('pins a site POC to their own warehouse', () => {
    const caps = capabilitiesFor(poc);
    expect(caps.canViewAllSites).toBe(false);
    expect(caps.siteScope).toEqual(['WH_AP_VIZAG_B2C']);
  });

  it('gives the super admin everything', () => {
    const caps = capabilitiesFor(superAdmin);
    expect(caps.canConfigureIntegrations).toBe(true);
    expect(caps.canManageMasterData).toBe(true);
    expect(caps.canViewAllSites).toBe(true);
    expect(caps.siteScope).toBe('ALL');
  });

  it('lets a service admin span sites but not rewire the backend', () => {
    const caps = capabilitiesFor(serviceAdmin);
    expect(caps.canViewAllSites).toBe(true);
    expect(caps.canApprove).toBe(true);
    expect(caps.canConfigureIntegrations).toBe(false);
  });

  it('keeps a warehouse admin to one site', () => {
    const caps = capabilitiesFor(warehouseAdmin);
    expect(caps.canViewAllSites).toBe(false);
    expect(caps.siteScope).toEqual(['WH_BLR_B4']);
    expect(caps.canApprove).toBe(true);
  });

  it('lets a Super Admin and a Service Admin post notices, and nobody else', () => {
    // Matches fn_can_post_notice() in db/noticeboard_posters.sql. A
    // Warehouse Admin is out on purpose: a notice can reach every POC.
    expect(capabilitiesFor(superAdmin).canPostNotices).toBe(true);
    expect(capabilitiesFor(serviceAdmin).canPostNotices).toBe(true);
    expect(capabilitiesFor(warehouseAdmin).canPostNotices).toBe(false);
    expect(capabilitiesFor(poc).canPostNotices).toBe(false);
  });

  it('a site-pinned user with no site sees nothing, rather than everything', () => {
    const caps = capabilitiesFor(user('SITE_POC', undefined));
    expect(caps.siteScope).toEqual([]);
    expect(caps.canViewAllSites).toBe(false);
  });
});

describe('resolveSiteFilter()', () => {
  const pocCaps = capabilitiesFor(poc);

  it('rewrites a POC asking for ALL back to their own site', () => {
    expect(resolveSiteFilter(pocCaps, 'ALL')).toBe('WH_AP_VIZAG_B2C');
  });

  it('rewrites a POC asking for someone else\'s site back to their own', () => {
    expect(resolveSiteFilter(pocCaps, 'WH_BLR_B4')).toBe('WH_AP_VIZAG_B2C');
  });

  it('leaves their own site alone', () => {
    expect(resolveSiteFilter(pocCaps, 'WH_AP_VIZAG_B2C')).toBe('WH_AP_VIZAG_B2C');
  });

  it('lets an all-sites role keep ALL', () => {
    expect(resolveSiteFilter(capabilitiesFor(superAdmin), 'ALL')).toBe('ALL');
  });

  it('matches nothing for a pinned user with no site', () => {
    expect(resolveSiteFilter(capabilitiesFor(user('SITE_POC')), 'ALL')).toBe('__NONE__');
  });
});

describe('canSeeSite()', () => {
  it('hides other sites\' rows from a POC', () => {
    const caps = capabilitiesFor(poc);
    expect(canSeeSite(caps, 'WH_AP_VIZAG_B2C')).toBe(true);
    expect(canSeeSite(caps, 'WH_BLR_B4')).toBe(false);
    expect(canSeeSite(caps, undefined)).toBe(false);
  });

  it('shows everything to an all-sites role', () => {
    expect(canSeeSite(capabilitiesFor(superAdmin), 'WH_BLR_B4')).toBe(true);
  });
});

