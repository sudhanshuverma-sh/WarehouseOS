import React, { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { X, Building2, RotateCcw, ChevronRight } from 'lucide-react';
import { controlRoomSites, siteMatches } from '../lib/controlRoom/siteServiceStatus';
import { navFor, scopeNav } from '../lib/nav/navConfig';
import { Avatar } from './common/Avatar';
import { usePendingWork } from './common/usePendingWork';
import { useUnreadNotices } from './common/useUnreadNotices';
import type { UserRole } from '../types';

/**
 * Where you go on a phone.
 *
 * This is the primary navigation below `md`, not a convenience: the bottom
 * bar holds five slots and everything else lives here. It reads the same
 * tree as the desktop sidebar (src/lib/nav/navConfig.ts), so the labels and
 * the Master Data scoping cannot drift apart again. Before that it was a
 * hand-written copy that offered a POC services their site does not run.
 */

/** What each role is called on screen, matching the sidebar and top bar. */
const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Admin',
  SERVICE_ADMIN: 'Service',
  WAREHOUSE_ADMIN: 'Site admin',
  SITE_POC: 'POC',
};

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

export const MobileMenuDrawer: React.FC<MobileMenuDrawerProps> = ({
  isOpen,
  onClose,
  currentView,
  onNavigate,
}) => {
  const {
    currentUser,
    dataMode,
    isServiceAccessible,
    serviceRegistryRows,
    siteMasterRows,
    warehouses,
    resetToDefaultData,
  } = useApp();

  const panel = useRef<HTMLDivElement>(null);
  const pending = usePendingWork().total;
  const unread = useUnreadNotices();

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

  const groups = useMemo(
    () =>
      scopeNav(navFor(currentUser.role), {
        registered,
        held: currentUser.serviceCodes,
        atSite,
        isAccessible: isServiceAccessible,
      }),
    [currentUser.role, currentUser.serviceCodes, registered, atSite, isServiceAccessible],
  );

  // Escape closes it, and the page behind stops scrolling while it is open.
  // A drawer you can scroll the page behind feels broken on a phone, and
  // one you cannot dismiss from the keyboard is unusable with a switch.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  // After every hook, never before one. This return used to sit above the
  // useMemo: closed rendered one hook, open rendered two, and React threw
  // "rendered more hooks than during the previous render" the moment the
  // drawer opened, so tapping More crashed the app.
  if (!isOpen) return null;

  const go = (viewId: string) => {
    onNavigate(viewId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
      />

      <div
        ref={panel}
        tabIndex={-1}
        className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 outline-none"
      >
        <div className="p-4 bg-(--color-ink) text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate">WarehouseOS</h2>
              <p className="text-[11px] text-white/60">
                {pending > 0 ? `${pending} pending` : 'Nothing pending'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2.5 shrink-0">
          <Avatar name={currentUser.fullName} src={currentUser.avatar} className="w-9 h-9" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs text-slate-900 truncate">{currentUser.fullName}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {currentUser.warehouseId ?? 'All sites'}
            </div>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-600">
            {ROLE_LABEL[currentUser.role]}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {groups.map(group => (
            <div key={group.group} className="space-y-1">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.group}
              </div>
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                const unreadHere = item.id === 'noticeboard' && unread > 0 && !isActive;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      isActive ? 'bg-(--color-ink) text-white' : 'text-slate-700 hover:bg-slate-100'
                    } ${unreadHere ? 'animate-unread' : ''}`}
                  >
                    <span
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0 text-left">
                      <span className="block truncate">{item.label}</span>
                      <span className={`block text-[10px] font-normal truncate ${isActive ? 'text-white/60' : 'text-slate-500'}`}>
                        {item.subLabel}
                      </span>
                    </span>
                    {unreadHere ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-due-tint) text-(--color-ink)">
                        {unread} new
                      </span>
                    ) : (
                      !isActive && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Demo only, like the persona picker: this throws away every record
            on the device, and it was previously offered to every role in
            every mode, one tap from the menu. */}
        {dataMode === 'demo' && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Replace everything on this device with the demo records?')) return;
                onClose();
                resetToDefaultData();
              }}
              className="w-full py-2 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset demo data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
