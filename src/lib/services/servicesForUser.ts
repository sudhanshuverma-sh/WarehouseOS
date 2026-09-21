/**
 * Which services a person may file — read from Master Data.
 *
 * Two scopes, and a person gets the overlap:
 *
 *  - the site's, `Site_Master.Services_Enabled` ('ALL', or a list of codes);
 *  - their own, the `Service_Codes` on their live POC_Master rows.
 *
 * Master Data is the single source for this, the same rows the Control Room
 * counts against, so switching a service off at a site removes it from that
 * site's desk without a second list to maintain.
 *
 * Missing rows are a data gap, never a lockout: a site with no POC row for
 * this person still shows the site's own services, exactly as a site with no
 * `Services_Enabled` shows all of them.
 */

import type { PocMaster } from '../../types/masterData';
import type { User } from '../../types';
import { type ControlRoomSite, siteMatches } from '../controlRoom/siteServiceStatus';
import { serviceCodeFor } from './serviceCodes';

/** What a site or a POC row lists: everything, or these codes. */
export type ServiceScope = 'ALL' | Set<string>;

const norm = (value: unknown) => String(value ?? '').trim().toUpperCase();

/** 'ALL' or a comma/space separated list, which is how Master Data writes both. */
export function parseServiceCodes(value: unknown): ServiceScope {
  const raw = norm(value);
  if (!raw || raw === 'ALL') return 'ALL';
  return new Set(raw.split(/[,\s]+/).filter(Boolean));
}

const inScope = (scope: ServiceScope, code: string) => scope === 'ALL' || scope.has(norm(code));

/** The services this person's own POC_Master rows carry, across the sites they hold. */
export function pocServiceScope(user: User, pocRows: PocMaster[], site?: ControlRoomSite): ServiceScope | null {
  const email = norm(user.email);
  const mine = pocRows.filter(
    (p) =>
      p.Active === 'Yes' &&
      norm(p.POC_Email) === email &&
      (!site || norm(p.Site_Code) === 'ALL' || siteMatches(site, p.Site_Code)),
  );
  if (mine.length === 0) return null; // no rows for them: a gap, not a denial
  const held = new Set<string>();
  for (const row of mine) {
    const scope = parseServiceCodes(row.Service_Codes);
    if (scope === 'ALL') return 'ALL';
    for (const code of scope) held.add(code);
  }
  return held;
}

/** Every site this person holds, not just the one currently in view. */
function sitesOf(user: User, sites: ControlRoomSite[]): ControlRoomSite[] {
  const ids = [user.warehouseId, ...(user.siteCodes ?? [])].filter(Boolean) as string[];
  const held = sites.filter((s) => ids.some((id) => siteMatches(s, id)));
  // No site on the row is a data gap, not permission to file nowhere: the
  // caller's own scoping already decided they may see this app.
  return held.length > 0 ? held : [];
}

/**
 * Whether this person may file this service AT this site: the site's own
 * Services_Enabled and the person's POC_Master row for that site must both
 * allow it. Diesel-only at Patna P1 stays diesel-only at Patna P1, even
 * when the same person holds everything at Patna P2.
 */
export function holdsAt(user: User, pocRows: PocMaster[], site: ControlRoomSite, code: string): boolean {
  const siteScope: ServiceScope = site.services === 'ALL' ? 'ALL' : new Set(site.services.map(norm));
  if (!inScope(siteScope, code)) return false;
  const ownScope = pocServiceScope(user, pocRows, site);
  return ownScope === null || inScope(ownScope, code);
}

/** The sheet ids this person may file at one site. */
export function servicesAt(
  user: User,
  site: ControlRoomSite | undefined,
  pocRows: PocMaster[],
  allSheetIds: string[],
): string[] {
  if (user.role === 'SUPER_ADMIN' || !site) return allSheetIds;
  return allSheetIds.filter((id) => holdsAt(user, pocRows, site, serviceCodeFor(id)));
}

/**
 * The sheet ids this person may file, narrowest scope that the data supports.
 * `allSheetIds` is the catalogue to filter — everything the app knows about.
 */
export function servicesForUser(
  user: User,
  sites: ControlRoomSite[],
  pocRows: PocMaster[],
  allSheetIds: string[],
): string[] {
  if (user.role === 'SUPER_ADMIN') return allSheetIds;

  const ownScope = pocServiceScope(user, pocRows);

  if (user.role === 'SITE_POC') {
    // A POC covering two warehouses may hold different services at each, so
    // this is the union across their sites: what they can file SOMEWHERE,
    // which is the right question for a menu. The filing desk narrows it to
    // the site actually chosen, via servicesAt() below.
    return allSheetIds.filter((id) => sitesOf(user, sites).some((s) => holdsAt(user, pocRows, s, serviceCodeFor(id))));
  }

  // An admin's scope is what Master Data gives them, plus anything the app
  // assigned directly. Neither one present means their account is not scoped
  // yet, so they keep the daily operations set rather than an empty desk.
  const assigned = new Set(user.assignedServiceIds ?? []);
  const allowed = allSheetIds.filter((id) => assigned.has(id) || (ownScope !== null && inScope(ownScope, serviceCodeFor(id))));
  return allowed.length > 0 ? allowed : DEFAULT_ADMIN_SHEETS.filter((id) => allSheetIds.includes(id));
}

const DEFAULT_ADMIN_SHEETS = [
  'SHEET_DAILY_SITE',
  'SHEET_HOUSEKEEPING',
  'SHEET_DG_POWER_WATER',
  'SHEET_DIESEL',
  'SHEET_WASHING',
];
