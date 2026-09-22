/**
 * Computed capabilities — MASTERDATA.md §6: "No permission is assigned
 * directly. Every permission is computed."
 *
 * Before this module, role checks were inline `role === 'SUPER_ADMIN'` tests
 * scattered across a dozen components, and they disagreed with each other:
 * the sidebar promised a POC "My Site Records — Filtered to Assigned Hub"
 * while the explorer underneath it defaulted to every warehouse. One place to
 * ask means one answer.
 *
 * IMPORTANT — this is a UX affordance, not the control. MASTERDATA.md §6:
 * "Filter server-side. Client-side scope filtering is a UX affordance, never
 * the control." Hiding a button here stops an honest mistake, not an attacker.
 * The enforcing copy of these rules lives in Postgres RLS (db/schema.sql §8)
 * and must stay in step with this file.
 */

import { User, UserRole } from '../types';

export interface Capabilities {
  role: UserRole;
  isSuperAdmin: boolean;
  isPoc: boolean;
  /** Any admin flavour — approves, reviews, sees across sites. */
  isAdmin: boolean;

  /**
   * May attach or change a spreadsheet ID, Apps Script URL, or any other
   * backend wiring. A site POC files readings; they never point the app at a
   * different sheet, and they are not shown the plumbing that would let them.
   */
  canConfigureIntegrations: boolean;

  /** May edit POC_Master / Site_Master / Service_Registry. */
  canManageMasterData: boolean;

  /** May change a form's schema — add columns, create new forms. */
  canEditSchema: boolean;

  /** May approve or reject another person's submission. */
  canApprove: boolean;

  /**
   * May download records as a file.
   *
   * Deliberately narrower than "can see it on screen". An export leaves the
   * app: once a month of diesel spend across 120 sites is a CSV in someone's
   * downloads folder, the app's scoping no longer applies to it and there is
   * no way to recall it. Reading a row and extracting the whole table are
   * different acts, so they get different permissions.
   *
   * Super Admin and Service Admin only. A POC files; they do not take the
   * data away with them.
   */
  canExport: boolean;

  /**
   * May post to the noticeboard: everyone, a site, or one person.
   *
   * Super Admin and Service Admin, matching fn_can_post_notice() in
   * db/noticeboard_posters.sql. Not a Warehouse Admin: a notice can reach
   * every POC in the company, which is not a one-site decision.
   */
  canPostNotices: boolean;

  /** 'ALL', or the warehouse ids this user may see. */
  siteScope: 'ALL' | string[];

  /** False for anyone pinned to specific sites. */
  canViewAllSites: boolean;
}

export function capabilitiesFor(user: User): Capabilities {
  const role = user.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isPoc = role === 'SITE_POC';
  const isAdmin = role === 'SUPER_ADMIN' || role === 'SERVICE_ADMIN' || role === 'WAREHOUSE_ADMIN';

  // SERVICE_ADMIN and SUPER_ADMIN span every site; WAREHOUSE_ADMIN and
  // SITE_POC are pinned to the one warehouse on their row.
  const spansAllSites = role === 'SUPER_ADMIN' || role === 'SERVICE_ADMIN';
  // A POC covering several warehouses holds one grant per site, and the API
  // sends every one (user.siteCodes). Demo users carry only warehouseId.
  const siteScope: 'ALL' | string[] = spansAllSites
    ? 'ALL'
    : user.siteCodes?.length
      ? [...user.siteCodes]
      : user.warehouseId
        ? [user.warehouseId]
        : []; // pinned to a site but no site on the row = sees nothing, not everything

  return {
    role,
    isSuperAdmin,
    isPoc,
    isAdmin,
    // Backend wiring is a super-admin act. It reroutes where every site's
    // data lands, so it is never a per-site decision.
    canConfigureIntegrations: isSuperAdmin,
    canManageMasterData: isSuperAdmin,
    canEditSchema: isSuperAdmin,
    // No self-approval (MASTERDATA.md §6) is enforced per-record elsewhere;
    // this is only "may this role ever approve".
    canApprove: isAdmin,
    // Not `isAdmin`: a WAREHOUSE_ADMIN runs one site and has no reason to
    // take a file away. Widening this is one clause, if that turns out to
    // be wrong in practice.
    canExport: role === 'SUPER_ADMIN' || role === 'SERVICE_ADMIN',
    canPostNotices: role === 'SUPER_ADMIN' || role === 'SERVICE_ADMIN',
    siteScope,
    canViewAllSites: spansAllSites
  };
}

/**
 * Forces a requested warehouse filter back inside the user's scope. A POC who
 * asks for 'ALL' — via a stale filter, a shared link, or a control that should
 * not have been offered — gets their own site instead of everyone's.
 */
export function resolveSiteFilter(caps: Capabilities, requested: string): string {
  if (caps.canViewAllSites || caps.siteScope === 'ALL') return requested;
  const [ownSite] = caps.siteScope;
  if (!ownSite) return '__NONE__'; // pinned user with no site matches nothing
  // Any of their own sites is fine; 'ALL' or someone else's falls back to their first.
  return caps.siteScope.includes(requested) ? requested : ownSite;
}

/** True when this row belongs to a site the user may see. */
export function canSeeSite(caps: Capabilities, warehouseId: string | undefined): boolean {
  if (caps.canViewAllSites) return true;
  if (caps.siteScope === 'ALL') return true;
  if (!warehouseId) return false;
  return caps.siteScope.includes(warehouseId);
}

// Which services a person may file now comes from Master Data — see
// src/lib/services/servicesForUser.ts.
