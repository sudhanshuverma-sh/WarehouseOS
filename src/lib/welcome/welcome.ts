/**
 * What the welcome screen says to each person: their name, the one line
 * under it, where its button goes, and who to call when they need help.
 * All from the signed-in user and Master Data; nothing here is invented.
 */

import type { User, UserRole, Warehouse } from '../../types';
import type { PocMaster, ServiceRegistry, SiteMaster } from '../../types/masterData';
import { siteMatches, type ControlRoomSite } from '../controlRoom/siteServiceStatus';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sunday, 27 September" from YYYY-MM-DD, the same in every locale. */
export function welcomeDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return '';
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} ${MONTHS[m - 1]}`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

/** Roles pinned to their own sites; they file, so they land on the Filing Desk. */
export const isPinnedRole = (role: UserRole) => role === 'SITE_POC' || role === 'WAREHOUSE_ADMIN';

/** Where the button goes: each role's home screen. */
export function destinationFor(role: UserRole): { view: string; label: string } {
  if (isPinnedRole(role)) return { view: 'pocFiling', label: 'Open Filing Desk' };
  if (role === 'SERVICE_ADMIN') return { view: 'adminDashboard', label: 'Open Service Hub' };
  return { view: 'dashboard', label: 'Open Control Room' };
}

/** A service admin's line: the services they hold, by name. Commas only: names like "EB and DG" already carry an "and". */
export function serviceAdminLine(user: Pick<User, 'serviceCodes'>, registry: ServiceRegistry[]): string {
  const held = user.serviceCodes;
  if (!held || held === 'ALL' || held.length === 0) return 'Service Admin · All services';
  const names = held.map((code) => registry.find((s) => s.Service_Code === code)?.Service_Name?.trim() || code);
  return `Service Admin · ${names.join(', ')}`;
}

/**
 * The sites a pinned person files for: every one they hold a grant for,
 * matched by any name the site goes by. The same rule the Filing Desk uses.
 */
export function ownSites(user: Pick<User, 'warehouseId' | 'siteCodes'>, sites: ControlRoomSite[]): ControlRoomSite[] {
  const ids = [...(user.siteCodes ?? []), user.warehouseId].filter((v): v is string => !!v);
  return sites.filter((s) => ids.some((id) => siteMatches(s, id)));
}

export interface HelpContact {
  name: string;
  /** Who they are to this person, e.g. "Your Service Admin". */
  relation: string;
  phone?: string;
  email?: string;
}

const live = (rows: PocMaster[], role: string) => rows.filter((r) => r.Active === 'Yes' && r.Role === role && r.POC_Name?.trim());
const notMe = (email: string | undefined, me: string) => (email ?? '').toLowerCase() !== me.toLowerCase();

/**
 * Who a person should call. A POC gets a Service Admin who covers their site
 * (or every site), then a Super Admin; a Service Admin gets a Super Admin; a
 * Super Admin gets another Super Admin. Falls back to the app's own users
 * when no Master Data has been imported.
 */
export function helpContactFor(
  user: Pick<User, 'role' | 'email'>,
  mySites: ControlRoomSite[],
  pocRows: PocMaster[],
  users: User[],
): HelpContact | null {
  const covers = (siteCode: string) => siteCode?.toUpperCase() === 'ALL' || mySites.some((s) => siteMatches(s, siteCode));
  const fromRow = (r: PocMaster | undefined, relation: string): HelpContact | null =>
    r ? { name: r.POC_Name.trim(), relation, phone: r.Contact_Number?.trim() || undefined, email: r.POC_Email?.trim() || undefined } : null;
  const fromUser = (u: User | undefined, relation: string): HelpContact | null =>
    u ? { name: u.fullName, relation, phone: u.phone || undefined, email: u.email || undefined } : null;

  const supers = live(pocRows, 'SUPER_ADMIN').filter((r) => notMe(r.POC_Email, user.email));
  const superUser = users.find((u) => u.role === 'SUPER_ADMIN' && notMe(u.email, user.email));

  if (isPinnedRole(user.role)) {
    const admin = live(pocRows, 'SERVICE_ADMIN').find((r) => covers(String(r.Site_Code ?? '')));
    return (
      fromRow(admin, 'Your Service Admin') ??
      fromUser(users.find((u) => u.role === 'SERVICE_ADMIN'), 'Your Service Admin') ??
      fromRow(supers[0], 'Your Super Admin') ??
      fromUser(superUser, 'Your Super Admin')
    );
  }
  const relation = user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Your Super Admin';
  return fromRow(supers[0], relation) ?? fromUser(superUser, relation);
}

/** Where "Report a problem" goes: the Super Admins, never back to yourself. */
export function problemRecipients(user: Pick<User, 'email'>, pocRows: PocMaster[], users: User[]): string[] {
  const fromRows = live(pocRows, 'SUPER_ADMIN').map((r) => r.POC_Email?.trim()).filter((e): e is string => !!e);
  const emails = fromRows.length ? fromRows : users.filter((u) => u.role === 'SUPER_ADMIN').map((u) => u.email);
  return [...new Set(emails.filter((e) => e && notMe(e, user.email)))];
}

/** A Gmail compose window, the way the rest of the app shares by email. */
export function gmailCompose(to: string[], subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to.join(','))}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface SitePlace {
  name: string;
  /** What the site is called on the floor, e.g. BLR9; its name when it has none. */
  whCode: string;
  siteCode: string;
  /** One line: street, city, state and pincode, each once. */
  address: string;
  mapUrl?: string;
}

/**
 * Where a site is, for the pin under the greeting. Site_Master first, the
 * app's warehouse list for whatever it leaves blank. Addresses often already
 * end in their city and pincode, so a part is only added when it is missing.
 */
export function sitePlace(site: ControlRoomSite, siteRows: SiteMaster[], warehouses: Warehouse[]): SitePlace {
  const row = siteRows.find((r) => siteMatches(site, r.Site_Code));
  const wh = warehouses.find((w) => siteMatches(site, w.id));
  const pick = (...vals: (string | undefined)[]) => vals.map((v) => String(v ?? '').trim()).find(Boolean) ?? '';

  let address = pick(row?.Address, wh?.address);
  for (const part of [pick(row?.City, wh?.city), pick(row?.State, wh?.state), pick(row?.Pincode, wh?.pincode)]) {
    if (part && !address.toLowerCase().includes(part.toLowerCase())) address = address ? `${address}, ${part}` : part;
  }
  const link = pick(row?.Map_Link, wh?.mapsUrl);
  const mapUrl = /^https?:\/\//i.test(link)
    ? link
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : undefined;

  return {
    name: site.name,
    whCode: pick(site.whCode, row?.WH_Code, wh?.code) || site.name,
    siteCode: site.id,
    address,
    mapUrl,
  };
}

/** Once per person per browser session. */
export const welcomeSeenKey = (userId: string) => `wos_welcome_seen:${userId}`;
