/**
 * Where you can go, said once.
 *
 * The desktop sidebar and the phone drawer used to hold two hand-written
 * copies of this tree, 200 lines apart in two files. They drifted: the same
 * screen was "Filing Desk" in one and "POC Daily Filing Desk" in the other,
 * "Records" against "My Site Logs Explorer". Worse, only the sidebar applied
 * the Master Data scoping, so a POC at a site with Crate Washing switched
 * off was offered it on their phone and could open the form.
 *
 * One tree, one set of labels, one scoping rule, both surfaces.
 */

import {
  ClipboardCheck,
  Database,
  Droplet,
  Fuel,
  Award,
  LayoutDashboard,
  Layers,
  Megaphone,
  PlusCircle,
  Smartphone,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '../../types';

export interface NavItem {
  /** The `currentView` value this opens. */
  id: string;
  label: string;
  subLabel: string;
  icon: LucideIcon;
  /**
   * The services this link files. Present only on service forms: a link
   * with codes is subject to Master Data scoping, one without (a dashboard,
   * an explorer) is governed by the role branch alone.
   */
  codes?: string[];
  /** The sheet it files, for the older accessibility check. */
  sheetId?: string;
  highlight?: boolean;
  /** Set by the surface, not the tree: "3 pending" on the primary item. */
  badge?: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

// One definition per screen, so a label can only be written once.
const SCREENS = {
  pocDesk: { id: 'pocFiling', label: 'Filing Desk', subLabel: "Your site's services", icon: Smartphone },
  pocDeskAdmin: { id: 'pocFiling', label: 'Filing Desk', subLabel: 'What a POC sees at one site', icon: Smartphone },
  controlRoom: { id: 'dashboard', label: 'Control Room', subLabel: 'Every site, every service, today', icon: LayoutDashboard },
  serviceHub: { id: 'adminDashboard', label: 'Admin Service Hub', subLabel: 'Each service across sites', icon: Award },
  sheets: { id: 'sheets', label: 'Operational Sheets', subLabel: 'Forms POCs fill', icon: Layers },
  records: { id: 'database', label: 'Records', subLabel: 'Every entry filed', icon: Database },
  recordsOwn: { id: 'database', label: 'Records', subLabel: 'Everything filed at your site', icon: Database },
  newForm: { id: 'createForm', label: 'New Form', subLabel: 'Build a form to file', icon: PlusCircle },
  masterData: { id: 'masterData', label: 'Master Data', subLabel: 'POC, Site and Service', icon: Database, highlight: true },
  // No `codes`: this is not a service, so Master Data scoping must never
  // hide it. Everyone reads it; only a Super Admin posts to it.
  noticeboard: { id: 'noticeboard', label: 'Noticeboard', subLabel: 'SOPs, decks and messages', icon: Megaphone },

  diesel: { id: 'diesel', label: 'Diesel', subLabel: 'Requests, approvals, PODs', icon: Fuel, codes: ['DIESEL'], sheetId: 'SHEET_DIESEL' },
  dailyReport: { id: 'dailyForm', label: 'Daily Site Report', subLabel: 'The 43 point checklist', icon: ClipboardCheck, codes: ['SITE_ACTIVITY'], sheetId: 'SHEET_DAILY_SITE' },
  housekeeping: { id: 'housekeeping', label: 'Housekeeping', subLabel: 'Agency headcount', icon: Users, codes: ['HOUSEKEEPING'], sheetId: 'SHEET_HOUSEKEEPING' },
  ebDg: { id: 'dgPower', label: 'EB and DG', subLabel: 'Meter readings and fuel', icon: Zap, codes: ['EB_DG'], sheetId: 'SHEET_EB_DG' },
  washing: { id: 'washing', label: 'Crate Washing', subLabel: 'Washing and ad-hoc jobs', icon: Droplet, codes: ['WASHING', 'ADHOC'], sheetId: 'SHEET_WASHING' },
} satisfies Record<string, NavItem>;

/** Where a role lands, and what its primary screen is. */
export function homeFor(role: UserRole): string {
  if (role === 'SITE_POC') return 'pocFiling';
  if (role === 'SERVICE_ADMIN') return 'adminDashboard';
  return 'dashboard';
}

/** The full tree for a role, before Master Data narrows the services. */
export function navFor(role: UserRole): NavGroup[] {
  if (role === 'SITE_POC') {
    return [
      {
        group: 'MY SITE',
        items: [
          { ...SCREENS.pocDesk, highlight: true },
          SCREENS.diesel,
          SCREENS.dailyReport,
          SCREENS.housekeeping,
          SCREENS.ebDg,
          SCREENS.washing,
        ],
      },
      { group: 'RECORDS', items: [SCREENS.recordsOwn, SCREENS.noticeboard] },
    ];
  }

  if (role === 'SERVICE_ADMIN') {
    return [
      {
        group: 'MY SERVICES',
        items: [
          { ...SCREENS.serviceHub, highlight: true },
          // Not Operational Sheets: shaping a service's form is
          // canEditSchema, which a service admin does not hold.
          SCREENS.diesel,
          SCREENS.ebDg,
          SCREENS.housekeeping,
          SCREENS.dailyReport,
          SCREENS.washing,
        ],
      },
      { group: 'RECORDS', items: [SCREENS.records, SCREENS.noticeboard] },
    ];
  }

  // Super Admin, and the fallback for any role without its own branch.
  return [
    {
      group: 'MONITOR',
      items: [SCREENS.controlRoom, { ...SCREENS.serviceHub, highlight: true }, SCREENS.pocDeskAdmin],
    },
    {
      group: 'SERVICES',
      items: [SCREENS.sheets, SCREENS.diesel, SCREENS.dailyReport, SCREENS.housekeeping, SCREENS.ebDg, SCREENS.washing],
    },
    { group: 'RECORDS & FORMS', items: [SCREENS.records, SCREENS.newForm] },
    { group: 'MASTER DATA', items: [SCREENS.masterData, SCREENS.noticeboard] },
  ];
}

/** What Master Data says about the services this person can reach. */
export interface NavScope {
  /** Service_Registry codes that are Active = Yes. Empty until it loads. */
  registered: Set<string>;
  /** The person's own Service_Codes, or 'ALL'. */
  held: 'ALL' | string[] | undefined;
  /** Services_Enabled at their site, or 'ALL'. */
  atSite: 'ALL' | string[];
  /** The older per-sheet check, used before the registry has loaded. */
  isAccessible: (sheetId: string) => boolean;
}

/**
 * Drops service links this person cannot file: the service has to be active
 * in Service_Registry, held in their own grants, and enabled at their site.
 * Links with no `codes` (dashboards, records, master data) pass through: the
 * role branch already decided those.
 */
export function scopeNav(groups: NavGroup[], scope: NavScope): NavGroup[] {
  const { registered, held, atSite, isAccessible } = scope;
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!item.codes) return true;
        if (registered.size === 0) return item.sheetId ? isAccessible(item.sheetId) : true;
        return item.codes.some(
          code =>
            registered.has(code) &&
            (!held || held === 'ALL' || held.includes(code)) &&
            (atSite === 'ALL' || atSite.includes(code)),
        );
      }),
    }))
    .filter(group => group.items.length > 0);
}

/** Every item, flattened, for lookups that do not care about grouping. */
export const flattenNav = (groups: NavGroup[]): NavItem[] => groups.flatMap(g => g.items);
