import { describe, expect, it } from 'vitest';
import { allPocsMailUrl, isForMe, unreadCount, visibleNotices, type Notice } from './audience';
import type { ControlRoomSite } from '../controlRoom/siteServiceStatus';
import type { User, UserRole } from '../../types';

/**
 * The demo-mode copy of the rule RLS enforces in db/noticeboard.sql. If
 * these two disagree, a POC sees one thing on a phone and another against
 * the real database, so the leak cases are pinned here explicitly.
 */

const site = (id: string, aliases: string[] = []): ControlRoomSite => ({
  id,
  whCode: id,
  name: id,
  city: '',
  zone: '',
  channel: 'B2B',
  services: 'ALL',
  aliases: [id, ...aliases],
});

const sites = [site('ZHPL-KA-01', ['WH_BLR_B4']), site('ZHPL-DL-01')];

const person = (role: UserRole, email: string, warehouseId?: string): User =>
  ({ id: email, email, fullName: email, role, warehouseId, isActive: true, createdAt: '' }) as User;

const notice = (over: Partial<Notice>): Notice => ({
  id: over.id ?? 'n',
  title: 'A notice',
  audience: 'ALL',
  postedBy: 'boss@zomato.com',
  postedAt: '2026-09-22T09:00:00Z',
  read: false,
  ...over,
});

const ramesh = person('SITE_POC', 'ramesh@zomato.com', 'ZHPL-KA-01');
const sunita = person('SITE_POC', 'sunita@zomato.com', 'ZHPL-DL-01');
const boss = person('SUPER_ADMIN', 'boss@zomato.com');

describe('isForMe()', () => {
  it('gives an everyone notice to everyone', () => {
    const n = notice({ audience: 'ALL' });
    expect(isForMe(n, ramesh, sites)).toBe(true);
    expect(isForMe(n, sunita, sites)).toBe(true);
  });

  it('gives a site notice only to people at that site', () => {
    const n = notice({ audience: 'SITE', siteCode: 'ZHPL-KA-01' });
    expect(isForMe(n, ramesh, sites)).toBe(true);
    expect(isForMe(n, sunita, sites)).toBe(false);
  });

  it('matches the site by any of its names', () => {
    // The notice says ZHPL-KA-01; this POC's account says WH_BLR_B4.
    const byAlias = person('SITE_POC', 'kiran@zomato.com', 'WH_BLR_B4');
    expect(isForMe(notice({ audience: 'SITE', siteCode: 'ZHPL-KA-01' }), byAlias, sites)).toBe(true);
  });

  it('never shows one person’s notice to another', () => {
    // The case that matters most: a direct message is private.
    const n = notice({ audience: 'PERSON', personEmail: 'ramesh@zomato.com' });
    expect(isForMe(n, ramesh, sites)).toBe(true);
    expect(isForMe(n, sunita, sites)).toBe(false);
  });

  it('matches the addressee regardless of letter case', () => {
    expect(isForMe(notice({ audience: 'PERSON', personEmail: 'Ramesh@Zomato.com' }), ramesh, sites)).toBe(true);
  });

  it('shows a Super Admin everything, since they posted it', () => {
    expect(isForMe(notice({ audience: 'PERSON', personEmail: 'ramesh@zomato.com' }), boss, sites)).toBe(true);
    expect(isForMe(notice({ audience: 'SITE', siteCode: 'ZHPL-DL-01' }), boss, sites)).toBe(true);
  });

  it('reaches nobody with a site notice missing its site', () => {
    expect(isForMe(notice({ audience: 'SITE' }), ramesh, sites)).toBe(false);
  });

  it('gives a site notice to a POC with no site: nobody', () => {
    const siteless = person('SITE_POC', 'lost@zomato.com');
    expect(isForMe(notice({ audience: 'SITE', siteCode: 'ZHPL-KA-01' }), siteless, sites)).toBe(false);
  });
});

describe('visibleNotices()', () => {
  it('filters to what this person may read, newest first', () => {
    const all = [
      notice({ id: 'old', postedAt: '2026-09-20T09:00:00Z' }),
      notice({ id: 'mine', audience: 'PERSON', personEmail: 'ramesh@zomato.com', postedAt: '2026-09-22T09:00:00Z' }),
      notice({ id: 'theirs', audience: 'PERSON', personEmail: 'sunita@zomato.com', postedAt: '2026-09-21T09:00:00Z' }),
    ];
    expect(visibleNotices(all, ramesh, sites).map((n) => n.id)).toEqual(['mine', 'old']);
  });
});

describe('allPocsMailUrl()', () => {
  const read = (url: string) => new URL(url).searchParams;

  it('addresses the all-POCs list with the notice filled in', () => {
    const url = allPocsMailUrl(
      notice({ title: 'Cold chain SOP v4', body: 'Read before Monday.', linkUrl: 'https://docs.google.com/document/d/x' }),
    );
    expect(url).not.toBeNull();
    const p = read(url!);
    expect(p.get('to')).toBe('hp.admin@zomato.com');
    expect(p.get('su')).toBe('Cold chain SOP v4');
    expect(p.get('body')).toContain('Read before Monday.');
    expect(p.get('body')).toContain('https://docs.google.com/document/d/x');
  });

  it('never offers a site or personal notice to a list that reaches everyone', () => {
    // The list reaches every POC, so this is what keeps a private message
    // private even if a button is shown where it should not be.
    expect(allPocsMailUrl(notice({ audience: 'SITE', siteCode: 'ZHPL-KA-01' }))).toBeNull();
    expect(allPocsMailUrl(notice({ audience: 'PERSON', personEmail: 'ramesh@zomato.com' }))).toBeNull();
  });

  it('keeps a title with an ampersand intact', () => {
    // Hand-built query strings split on &; URLSearchParams does not.
    expect(read(allPocsMailUrl(notice({ title: 'HK & washing SOP' }))!).get('su')).toBe('HK & washing SOP');
  });
});

describe('unreadCount()', () => {
  it('counts only what this person has not opened', () => {
    expect(unreadCount([notice({ read: true }), notice({ read: false }), notice({ read: false })])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});
