import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Building2,
  PlusCircle,
  Database,
  ArrowLeft,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  Bell,
  Lock,
  Award
} from 'lucide-react';
import { User, UserRole } from '../types';
import { appWarehouseIdFor, controlRoomSites } from '../lib/controlRoom/siteServiceStatus';
import { NotificationCenterModal } from './NotificationCenterModal';
import { usePendingWork } from './common/usePendingWork';
import { usePersonas } from './common/usePersonas';
import { Button } from './common/Button';

/** What each role is called on screen, matching the sidebar. */
const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Admin',
  SERVICE_ADMIN: 'Service',
  WAREHOUSE_ADMIN: 'Site admin',
  SITE_POC: 'POC',
};
import { pendingSummary } from '../lib/alerts/pendingWork';

interface TopBarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onBack?: () => void;
  canGoBack?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentView,
  onNavigate,
  onBack,
  canGoBack = false
}) => {
  const {
    currentDate,
    setCurrentDate,
    selectedWarehouseId,
    setSelectedWarehouseId,
    warehouses,
    siteMasterRows,
    currentUser,
    setCurrentUser,
    dataMode,
    dailySiteLogs,
    sheetRecords,
    dieselLogs
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  /**
   * The sites to choose between: the live Site_Master rows, which is the same
   * list the Control Room counts and the sidebar's "120 sites" comes from.
   * The value stays the id the app's records carry, so every screen reading
   * selectedWarehouseId keeps working.
   */
  const sites = useMemo(() => {
    const taken = new Set<string>();
    return controlRoomSites(siteMasterRows, warehouses)
      .map(site => {
        // Prefer the id the records carry. Two Master Data sites can resolve
        // to one app warehouse, and dropping the loser cost a real site: the
        // list read 119 while the sidebar counted 120, and that site could
        // not be chosen at all. The second one keeps its own Site_Code.
        const preferred = appWarehouseIdFor(site, warehouses);
        const value = taken.has(preferred) ? site.id : preferred;
        taken.add(value);
        return {
          value,
          label: site.name,
          note: site.whCode && site.whCode !== site.name ? site.whCode : site.city,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [siteMasterRows, warehouses]);

  // The real people from POC Master, shared with the sidebar's picker.
  const personas = usePersonas();
  const siteNameFor = (u: User) => {
    const name = sites.find(s => s.value === u.warehouseId)?.label ?? u.warehouseId ?? 'No site';
    const more = (u.siteCodes?.length ?? 1) - 1;
    return more > 0 && u.warehouseId ? `${name} +${more}` : name;
  };

  // The site in view, named. A POC is pinned to their own sites (the context
  // refuses anyone else's), so the one they picked is shown, else their first;
  // everyone else sees whichever the selector holds. Master Data answers
  // first, since it knows the sites the app has no warehouse row for.
  const activeSite = useMemo(() => {
    const id =
      currentUser.role === 'SITE_POC'
        ? (selectedWarehouseId !== 'ALL' ? selectedWarehouseId : currentUser.warehouseId) || selectedWarehouseId
        : selectedWarehouseId;
    const fromMaster = sites.find(s => s.value === id);
    if (fromMaster) return { name: fromMaster.label, code: fromMaster.note || fromMaster.label };
    const wh = warehouses.find(w => w.id === id) || warehouses[0];
    return { name: wh?.facilityName || wh?.name || 'No site', code: wh?.code || '' };
  }, [sites, warehouses, currentUser, selectedWarehouseId]);

  // The same count the Alerts badge and the notification list use, over the
  // sites this person can see and the facility they have chosen.
  const work = usePendingWork();
  const pendingAlertCount = work.total;

  const isHomeView =
    (currentUser.role === 'SUPER_ADMIN' && currentView === 'dashboard') ||
    (currentUser.role === 'SERVICE_ADMIN' && currentView === 'adminDashboard') ||
    (currentUser.role === 'SITE_POC' && currentView === 'pocFiling');

  return (
    // The gutters are <main>'s own (p-3 sm:p-5 lg:p-7 in App.tsx), so the
    // panel's edges line up with the cards underneath it. Carrying only the
    // width and not the padding left the bar 28px wider on each side at
    // desktop, which is what read as "not aligned with the page".
    <div className="sticky top-4 z-20 w-full max-w-7xl mx-auto mt-4 px-3 sm:px-5 lg:px-7">
    <header className="soft-glass rounded-[var(--r-panel)] font-sans">
      {/* 1. Mobile Phone View Header (< md) */}
      <div className="md:hidden px-3.5 pt-2.5 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back or Brand + Role */}
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack && onBack && !isHomeView ? (
              <button
                onClick={onBack}
                type="button"
                className="p-1.5 rounded-xl bg-slate-100 active:bg-slate-200 text-slate-800 transition shrink-0"
                title="Go Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black shrink-0 shadow-2xs">
                <Building2 className="w-4 h-4" />
              </div>
            )}

            {/* Role Switcher Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border bg-slate-50 text-slate-900 border-slate-200 transition"
              >
                {currentUser.role === 'SUPER_ADMIN' ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : currentUser.role === 'SERVICE_ADMIN' ? (
                  <Award className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="truncate max-w-[110px]">{currentUser.fullName.split(' ')[0]}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* Role Dropdown */}
              {/* Demo only: with the API, who you are comes from sign-in, not a menu. */}
              {showRoleMenu && dataMode === 'demo' && (
                <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 min-w-[260px] max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-slate-400">
                    Switch User Role & Access
                  </div>
                  <div className="space-y-1 mt-1">
                    {personas.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setCurrentUser(u);
                          if (u.role === 'SUPER_ADMIN') {
                            setSelectedWarehouseId('ALL');
                            onNavigate('dashboard');
                          } else if (u.role === 'SERVICE_ADMIN') {
                            setSelectedWarehouseId('ALL');
                            onNavigate('adminDashboard');
                          } else if (u.warehouseId) {
                            setSelectedWarehouseId(u.warehouseId);
                            onNavigate('pocFiling');
                          }
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition ${
                          currentUser.id === u.id
                            ? 'bg-teal-50 text-teal-900 font-bold border border-teal-200'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {u.role === 'SUPER_ADMIN' ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          ) : u.role === 'SERVICE_ADMIN' ? (
                            <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-bold truncate">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {u.role === 'SUPER_ADMIN' ? 'Super Admin' : u.role === 'SERVICE_ADMIN' ? (u.department || 'Service Admin') : siteNameFor(u)}
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                          {u.role === 'SUPER_ADMIN' ? 'Super' : u.role === 'SERVICE_ADMIN' ? 'Admin' : 'POC'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Only the bell here. The site and the date moved to their own
              row below: five controls on one 360px line meant every label
              truncated to about seven characters. */}
          <button
            type="button"
            onClick={() => setIsNotificationOpen(true)}
            aria-label={pendingAlertCount > 0 ? `${pendingAlertCount} pending` : 'Nothing pending'}
            className="relative p-1.5 rounded-xl bg-slate-50 border border-slate-200 active:bg-slate-100 shrink-0"
          >
            <Bell className={`w-4 h-4 ${pendingAlertCount > 0 ? 'text-(--color-due)' : 'text-slate-400'}`} />
            {pendingAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-(--color-due) text-white font-bold text-[9px] rounded-full flex items-center justify-center border-2 border-white">
                {pendingAlertCount > 99 ? '99+' : pendingAlertCount}
              </span>
            )}
          </button>
        </div>

        {/* Where and when you are looking. The date lost its "Daily Date:"
            label and its calendar icon, which said the same thing the field
            already says; the POC's "Validate Today" button went too, since
            the bell above and Alerts in the bottom bar both open exactly
            that modal. */}
        <div className="flex items-center gap-2">
          {currentUser.role === 'SITE_POC' ? (
            <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 h-9 rounded-xl text-xs">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">{activeSite.name}</span>
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 border border-slate-200 pl-2.5 pr-1 h-9 rounded-xl text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                aria-label="Site in view"
                className="min-w-0 flex-1 bg-transparent focus:outline-none cursor-pointer text-xs font-semibold text-slate-900 truncate"
              >
                <option value="ALL">All sites ({sites.length})</option>
                {sites.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input
            type="date"
            aria-label="Date in view"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="shrink-0 h-9 px-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
          />
        </div>
      </div>

      {/* 2. Desktop View Header (>= md) */}
      <div className="hidden md:flex flex-row items-center justify-between gap-3 px-4 lg:px-5 py-2.5">
        {/* Left: back, who you are, which facility. One line, never wrapping. */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {canGoBack && onBack && !isHomeView && (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition group cursor-pointer shrink-0"
              title="Go back to previous screen"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back</span>
            </button>
          )}

          {/* Quick Persona / Role Switcher Pill */}
          <div className="relative">
            {/* The person, then their role. One neutral chip: a different
                background per role made the bar change colour on a persona
                switch, which said nothing the words did not. */}
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-900 hover:bg-slate-100 transition cursor-pointer min-w-0"
            >
              {currentUser.role === 'SUPER_ADMIN' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              ) : currentUser.role === 'SERVICE_ADMIN' ? (
                <Award className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span className="truncate max-w-36">{currentUser.fullName}</span>
              <span className="hidden lg:inline shrink-0 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-600">
                {ROLE_LABEL[currentUser.role]}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {/* Role dropdown */}
            {/* Demo only: with the API, who you are comes from sign-in, not a menu. */}
            {showRoleMenu && dataMode === 'demo' && (
              <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 min-w-[290px] max-h-[80vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center justify-between">
                  <span>Switch Role & Perspective</span>
                  <span className="text-[9px] text-teal-600 font-bold">1-Click Live Switch</span>
                </div>
                <div className="space-y-1">
                  {personas.map(u => {
                    const isSuper = u.role === 'SUPER_ADMIN';
                    const isServiceAdmin = u.role === 'SERVICE_ADMIN';
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setCurrentUser(u);
                          if (isSuper) {
                            setSelectedWarehouseId('ALL');
                            onNavigate('dashboard');
                          } else if (isServiceAdmin) {
                            setSelectedWarehouseId('ALL');
                            onNavigate('adminDashboard');
                          } else if (u.warehouseId) {
                            setSelectedWarehouseId(u.warehouseId);
                            onNavigate('pocFiling');
                          }
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                          currentUser.id === u.id
                            ? 'bg-teal-50 text-teal-900 font-bold border border-teal-200'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isSuper ? (
                            <ShieldCheck className="w-4 h-4 text-purple-600" />
                          ) : isServiceAdmin ? (
                            <Award className="w-4 h-4 text-amber-600" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-teal-600" />
                          )}
                          <div>
                            <div className="font-bold">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400">
                              {isSuper
                                ? 'Every site'
                                : isServiceAdmin
                                ? `${u.department || 'Assigned services'}`
                                : siteNameFor(u)}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            isSuper
                              ? 'bg-purple-100 text-purple-800'
                              : isServiceAdmin
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {isSuper ? 'Super' : isServiceAdmin ? 'Admin' : 'POC'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* The site in view: fixed for a POC, chosen by everyone else. */}
          {currentUser.role === 'SITE_POC' ? (
            <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs min-w-0">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">{activeSite.name}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-xl bg-slate-50 border border-slate-200 text-xs min-w-0">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                aria-label="Site in view"
                className="font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer text-xs max-w-44 truncate"
              >
                <option value="ALL">All sites ({sites.length})</option>
                {sites.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                    {s.note ? ` (${s.note})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: what is pending, the date, and the fast actions. One
            primary action, and amber only when something is actually due.
            Five accent colours across six controls made every one of them
            look like the important one. */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setIsNotificationOpen(true)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl border transition cursor-pointer ${
              pendingAlertCount > 0
                ? 'bg-(--color-due-tint) border-(--color-due)/30 text-(--color-ink) hover:brightness-95'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title={pendingAlertCount > 0 ? pendingSummary(work) : 'Nothing pending today'}
          >
            <Bell className={`w-3.5 h-3.5 ${pendingAlertCount > 0 ? 'text-(--color-due)' : 'text-slate-400'}`} />
            {/* The count, said once. A rose badge next to the word "Pending"
                was the same fact three times, in the colour for failure. */}
            {pendingAlertCount > 0 ? (
              <span className="font-semibold">
                <span className="font-mono tabular-nums">{pendingAlertCount}</span>
                <span className="hidden xl:inline"> pending</span>
              </span>
            ) : (
              <span className="hidden xl:inline font-semibold">All clear</span>
            )}
          </button>

          {/* No "Daily Date:" label and no calendar icon: the field carries
              its own picker, and both said what the control already says. */}
          <input
            type="date"
            aria-label="Date in view"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="h-8 px-2.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-900 text-xs focus:outline-none focus:border-slate-400 cursor-pointer"
          />

          <Button size="sm" icon={<Database className="w-3.5 h-3.5" />} onClick={() => onNavigate('database')}>
            {currentUser.role === 'SITE_POC' ? 'My data' : 'Records'}
          </Button>

          {currentUser.role === 'SUPER_ADMIN' && (
            <Button
              size="sm"
              variant="primary"
              icon={<PlusCircle className="w-3.5 h-3.5" />}
              onClick={() => onNavigate('createForm')}
            >
              Add form
            </Button>
          )}
        </div>
      </div>

      {/* Global Notification Modal */}
      <NotificationCenterModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onNavigateToForm={onNavigate}
      />
    </header>
    </div>
  );
};


