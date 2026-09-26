/**
 * The people in POC_Master, as accounts this app can act as.
 *
 * The persona picker used to list six invented demo users while the board
 * beside it counted 120 Master Data sites, so the names on screen belonged to
 * nobody and their access matched no row. These are the real grants: one
 * entry per person, carrying every site their live POC_Master rows hold and
 * the service codes across them, which is what servicesForUser reads to
 * decide what the person may file.
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

  const people = new Map<string, User>();

  for (const row of live) {
    const role: UserRole = (ROLES as readonly string[]).includes(row.Role) ? (row.Role as UserRole) : 'SITE_POC';
    const scope = parseServiceCodes(row.Service_Codes);

    // 'ALL' in Site_Code means every site, so this person is pinned to none.
    // Carrying the literal made the sidebar label their site "ALL" and every
    // site filter compare against a warehouse id that does not exist.
    const nationwide = role === 'SUPER_ADMIN' || String(row.Site_Code ?? '').trim().toUpperCase() === 'ALL';

    // One person may hold several rows, one per site. Someone pinned to sites
    // is one entry holding every one of them, as a real sign-in gives
    // (/api/me sends every site): the picker answers "who am I acting as",
    // and a POC with two warehouses is asked which one they are filing for.
    const email = row.POC_Email?.trim().toLowerCase() || row.Access_ID;
    const key = nationwide ? `${email}|${role}|ALL` : `${email}|${role}`;
    const had = people.get(key);

    if (had) {
      if (!nationwide && !had.siteCodes?.includes(row.Site_Code)) had.siteCodes = [...(had.siteCodes ?? []), row.Site_Code];
      if (had.serviceCodes !== 'ALL') {
        had.serviceCodes = scope === 'ALL' ? 'ALL' : [...new Set([...(had.serviceCodes ?? []), ...scope])];
      }
      if (!had.phone && row.Contact_Number) had.phone = row.Contact_Number;
      continue;
    }

    const site = nationwide ? undefined : sites.find((s) => siteMatches(s, row.Site_Code));
    people.set(key, {
      id: row.Access_ID,
      email: row.POC_Email ?? '',
      fullName: row.POC_Name.trim(),
      role,
      // The id the app's records and filters know their first site by, so
      // switching person moves the whole app to their site rather than to a
      // code nothing has been filed against.
      warehouseId: nationwide ? undefined : site ? appWarehouseIdFor(site, warehouses as Warehouse[]) : row.Site_Code,
      siteCodes: nationwide ? undefined : [row.Site_Code],
      serviceCodes: scope === 'ALL' ? 'ALL' : [...scope],
      isActive: true,
      createdAt: row.Access_Start_Date || '',
      phone: row.Contact_Number || undefined,
    });
  }

  return [...people.values()].sort((a, b) => rank(a.role) - rank(b.role) || a.fullName.localeCompare(b.fullName));
}
