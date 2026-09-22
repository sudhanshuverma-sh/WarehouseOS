import React, { useMemo, useState } from 'react';
import { Bell, Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { controlRoomSites, siteMatches } from '../lib/controlRoom/siteServiceStatus';
import { flattenNav, homeFor, navFor, scopeNav, type NavItem } from '../lib/nav/navConfig';
import { MobileMenuDrawer } from './MobileMenuDrawer';
import { useUnreadNotices } from './common/useUnreadNotices';

/**
 * The five slots at the bottom of a phone.
 *
 * Three of them used to be hard-coded to Home, Diesel and Checklist for
 * every role, so a Service Admin's Home landed on the POC filing desk and
 * a POC at a site without Diesel still got a Diesel tab. And because only
 * those three routes had an active state, the bar read as "nothing
 * selected" on the other ten screens in the app.
 *
 * Now: slot 1 is the role's real home, slots 2 and 3 are the first services
 * this person actually holds (same scoped tree as the sidebar and the
 * drawer), and every route lights something up, falling back to More for
 * the ones that live in the menu.
 */

interface MobileBottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenNotifications: () => void;
  pendingAlertCount: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenNotifications,
  pendingAlertCount,
}) => {
  const {
    currentUser,
    isServiceAccessible,
    serviceRegistryRows,
    siteMasterRows,
    warehouses,
  } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const unreadNotices = useUnreadNotices();

  const registered = useMemo(
    () => new Set(serviceRegistryRows.filter(s => s.Active === 'Yes').map(s => s.Service_Code)),
    [serviceRegistryRows],
  );

  const atSite = useMemo<'ALL' | string[]>(() => {
    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'SERVICE_ADMIN') return 'ALL';
    const own = [currentUser.warehouseId, ...(currentUser.siteCodes ?? [])].filter(Boolean) as string[];
    const mine = controlRoomSites(siteMasterRows, warehouses).filter(s => own.some(id => siteMatches(s, id)));
    if (mine.length === 0 || mine.some(s => s.services === 'ALL')) return 'ALL';
    return [...new Set(mine.flatMap(s => s.services as string[]))];
  }, [currentUser.role, currentUser.warehouseId, currentUser.siteCodes, siteMasterRows, warehouses]);

  const items = useMemo(
    () =>
      flattenNav(
        scopeNav(navFor(currentUser.role), {
          registered,
          held: currentUser.serviceCodes,
          atSite,
          isAccessible: isServiceAccessible,
        }),
      ),
    [currentUser.role, currentUser.serviceCodes, registered, atSite, isServiceAccessible],
  );

  /** Slot 1, then the two services this person files most directly. */
  const slots = useMemo<NavItem[]>(() => {
    const home = homeFor(currentUser.role);
    const first = items.find(i => i.id === home);
    const services = items.filter(i => i.codes && i.id !== home).slice(0, 2);
    return [...(first ? [first] : []), ...services];
  }, [items, currentUser.role]);

  /** Every route the bar cannot show gets folded into More, so the bar is
      never entirely unlit. */
  const inSlots = slots.some(s => s.id === currentView);

  return (
    <>
      {/* z-30 keeps this below a screen's own sticky action bar: at z-40 it
          painted over the daily report's submit buttons. pb clears the
          iPhone home indicator. tap-dense opts these five out of the global
          44px minimum, since they are already ~52px through their padding. */}
      <nav
        aria-label="Main"
        className="tap-dense fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] flex items-stretch justify-around md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      >
        {slots.map(item => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-start gap-0.5 p-1 rounded-2xl min-w-14 flex-1 transition active:scale-95 cursor-pointer"
            >
              <span
                className={`p-1.5 rounded-xl transition ${
                  active ? 'bg-(--color-ink) text-white' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
              </span>
              <span
                className={`text-[10px] tracking-tight text-center leading-tight ${
                  active ? 'text-(--color-ink) font-semibold' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenNotifications}
          className="flex flex-col items-center justify-start gap-0.5 p-1 rounded-2xl min-w-14 flex-1 transition active:scale-95 cursor-pointer"
        >
          <span className="p-1.5 rounded-xl relative text-slate-500">
            <Bell className="w-5 h-5" />
            {pendingAlertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-(--color-due) text-white font-bold text-[9px] rounded-full flex items-center justify-center border-2 border-white">
                {pendingAlertCount > 99 ? '99+' : pendingAlertCount}
              </span>
            )}
          </span>
          <span className="text-[10px] tracking-tight text-slate-500">Alerts</span>
        </button>

        {/* The Noticeboard has no slot of its own, so it lives in More.
            That makes More the only place a POC on a phone can see a new
            notice waiting, so the count and the flash go here too. */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-expanded={isMenuOpen}
          aria-label={unreadNotices > 0 ? `More, ${unreadNotices} new notices` : 'More'}
          className="flex flex-col items-center justify-start gap-0.5 p-1 rounded-2xl min-w-14 flex-1 transition active:scale-95 cursor-pointer"
        >
          <span
            className={`relative p-1.5 rounded-xl transition ${
              !inSlots ? 'bg-(--color-ink) text-white' : 'text-slate-500'
            } ${unreadNotices > 0 && currentView !== 'noticeboard' ? 'animate-unread' : ''}`}
          >
            <Menu className="w-5 h-5" />
            {unreadNotices > 0 && currentView !== 'noticeboard' && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-(--color-due) text-white font-bold text-[9px] rounded-full flex items-center justify-center border-2 border-white">
                {unreadNotices > 9 ? '9+' : unreadNotices}
              </span>
            )}
          </span>
          <span className={`text-[10px] tracking-tight ${!inSlots ? 'text-(--color-ink) font-semibold' : 'text-slate-500'}`}>
            More
          </span>
        </button>
      </nav>

      <MobileMenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentView={currentView}
        onNavigate={onNavigate}
      />
    </>
  );
};
