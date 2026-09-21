/**
 * The people in POC_Master, as accounts this app can act as.
 *
 * The persona picker used to list six invented demo users while the board
 * beside it counted 120 Master Data sites, so the names on screen belonged to
 * nobody and their access matched no row. These are the real grants: one
 * entry per live POC_Master row, carrying the site and the service codes that
 * row actually holds, which is what servicesForUser reads to decide what the
 * person may file.
 *
 * Master Data is the source. When none is loaded the caller keeps its demo
 * list, the same fallback controlRoomSites makes for sites.
 */

import type { PocMaster } from '../../types/masterData';
import type { User, UserRole, Warehouse } from '../../types';
import { type ControlRoomSite, appWarehouseIdFor, siteMatches } from '../controlRoom/siteServiceStatus';
import { parseServiceCodes } from '../services/servicesForUser';

const ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'SERVICE_ADMIN', 'WAREHOUSE_ADMIN', 'SITE_POC'];

/** Admins first, then site POCs by name: the order someone scans them in. */
const rank = (role: UserRole) => ROLES.indexOf(role);

/** The initials shown in place of a photo. Master Data carries no avatars. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : (parts[0][1] ?? '');
  return `${first}${last}`.toUpperCase();
}

export function personasFromMaster(
  pocRows: readonly PocMaster[],
  sites: readonly ControlRoomSite[],
  warehouses: readonly Warehouse[],
): User[] {
  const live = pocRows.filter((p) => p.Active === 'Yes' && p.POC_Name?.trim() && p.Access_ID);

  const seen = new Set<string>();
  const people: User[] = [];

  for (const row of live) {
    // One person may hold several rows. Two rows for the same person at the
    // same site are one entry here: the picker answers "who am I acting as",
    // not "which grant row".
    const key = `${row.POC_Email?.toLowerCase() ?? row.Access_ID}|${row.Site_Code ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const role: UserRole = (ROLES as readonly string[]).includes(row.Role) ? (row.Role as UserRole) : 'SITE_POC';
    const scope = parseServiceCodes(row.Service_Codes);

    // 'ALL' in Site_Code means every site, so this person is pinned to none.
    // Carrying the literal made the sidebar label their site "ALL" and every
    // site filter compare against a warehouse id that does not exist.
    const nationwide = role === 'SUPER_ADMIN' || String(row.Site_Code ?? '').trim().toUpperCase() === 'ALL';
    const site = nationwide ? undefined : sites.find((s) => siteMatches(s, row.Site_Code));

    people.push({
      id: row.Access_ID,
      email: row.POC_Email ?? '',
      fullName: row.POC_Name.trim(),
      role,
      // The id the app's records and filters know this site by, so switching
      // person moves the whole app to their site rather than to a code
      // nothing has been filed against.
      warehouseId: nationwide ? undefined : site ? appWarehouseIdFor(site, warehouses as Warehouse[]) : row.Site_Code,
      siteCodes: nationwide ? undefined : [row.Site_Code],
      serviceCodes: scope === 'ALL' ? 'ALL' : [...scope],
      isActive: true,
      createdAt: row.Access_Start_Date || '',
      phone: row.Contact_Number || undefined,
    });
  }

  return people.sort((a, b) => rank(a.role) - rank(b.role) || a.fullName.localeCompare(b.fullName));
}
