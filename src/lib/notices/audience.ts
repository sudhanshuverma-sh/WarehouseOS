/**
 * Who a notice is for, and whether this person has read it.
 *
 * Against the API this is enforced by RLS (db/noticeboard.sql): a notice
 * addressed to one person never leaves the database for anyone else. Demo
 * mode has no database, so the same rule runs here, and the two must agree.
 * `visibleNotices` is that rule; the test beside it pins it.
 */

import type { User } from '../../types';
import { type ControlRoomSite, siteMatches } from '../controlRoom/siteServiceStatus';

export type NoticeAudience = 'ALL' | 'SITE' | 'PERSON';

export interface Notice {
  id: string;
  title: string;
  body?: string;
  /** A Google Drive or Docs link. Decks and SOPs live there, never in the app. */
  linkUrl?: string;
  audience: NoticeAudience;
  siteCode?: string;
  personEmail?: string;
  postedBy: string;
  postedByName?: string;
  postedAt?: string;
  /** Read by the person looking. Per person, not per notice. */
  read: boolean;
}

/** The sites a person holds, by every name the site goes by. */
function holdsSite(user: User, sites: readonly ControlRoomSite[], siteCode: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  const own = [user.warehouseId, ...(user.siteCodes ?? [])].filter(Boolean) as string[];
  if (own.length === 0) return false;
  const target = sites.find((s) => siteMatches(s, siteCode));
  // Match on the site's alias set, so a notice for ZHPL-KA-01 reaches a POC
  // whose account says WH_BLR_B4: the same place under two names.
  return target ? own.some((id) => siteMatches(target, id)) : own.some((id) => id.toLowerCase() === siteCode.toLowerCase());
}

/** Whether this notice is addressed to this person. */
export function isForMe(notice: Notice, user: User, sites: readonly ControlRoomSite[]): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (notice.audience === 'ALL') return true;
  if (notice.audience === 'SITE') return !!notice.siteCode && holdsSite(user, sites, notice.siteCode);
  return !!notice.personEmail && notice.personEmail.toLowerCase() === user.email.toLowerCase();
}

/** What this person may read, newest first. */
export function visibleNotices(notices: readonly Notice[], user: User, sites: readonly ControlRoomSite[]): Notice[] {
  return notices
    .filter((n) => isForMe(n, user, sites))
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
}

/** How many of those this person has not opened. */
export const unreadCount = (notices: readonly Notice[]): number => notices.filter((n) => !n.read).length;

/**
 * The Admin team's mailing list. One mail to it reaches every POC.
 *
 * A mailing address, not a secret. Because it reaches everyone, it may only
 * ever carry an Everyone notice: see allPocsMailUrl.
 */
export const ALL_POCS_MAILING_LIST = 'hp.admin@zomato.com';

/**
 * A Gmail compose window addressed to the all-POCs list, filled in with
 * this notice, or null when the notice must not go there.
 *
 * The app cannot send mail itself: like the diesel and daily report mails,
 * this opens Gmail and the poster presses Send. It returns null for a site
 * or personal notice on purpose, so a private message can never be
 * broadcast to every POC by a button that should not have been shown.
 */
export function allPocsMailUrl(notice: Notice): string | null {
  if (notice.audience !== 'ALL') return null;

  const body = [
    notice.body?.trim(),
    notice.linkUrl ? `Document: ${notice.linkUrl}` : undefined,
    'Also on the Noticeboard in WarehouseOS.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    tf: '1',
    to: ALL_POCS_MAILING_LIST,
    su: notice.title,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** "Everyone", "ZHPL-KA-01", "ramesh@..." — who the poster sent it to. */
export function audienceLabel(notice: Notice, siteName?: (code: string) => string | undefined): string {
  if (notice.audience === 'ALL') return 'Everyone';
  if (notice.audience === 'SITE') return notice.siteCode ? (siteName?.(notice.siteCode) ?? notice.siteCode) : 'One site';
  return notice.personEmail ?? 'One person';
}
