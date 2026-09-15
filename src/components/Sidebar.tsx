import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { controlRoomSites, siteMatches } from '../lib/controlRoom/siteServiceStatus';
import {
  LayoutDashboard,
  ClipboardCheck,
  Fuel,
  Database,
  PlusCircle,
  Building2,
  Sliders,
  ShieldCheck,
  UserCheck,
  Layers,
  Sparkles,
  RotateCcw,
  Users,
  Zap,
  Droplet,
  Smartphone,
  Award,
  Pin,
  PinOff
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenArchitecture: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView, onOpenArchitecture }) => {
  const {
    currentUser,
    setCurrentUser,
    users,
    warehouses,
    setSelectedWarehouseId,
    dailySiteLogs,
    currentDate,
    resetToDefaultData,
    isServiceAccessible,
    dataMode,
    serviceRegistryRows,
    siteMasterRows
  } = useApp();

  const [isPinned, setIsPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_pinned') === 'true';
    } catch {
      return false;
    }
  });

  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_pinned', String(next));
      } catch {}
      return next;
    });
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      setShowPersonaMenu(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const isExpanded = isPinned || isHovered;

  // Compute pending/critical status
  const todaysFiledCount = dailySiteLogs.filter(l => l.date === currentDate).length;
  const criticalCount = dailySiteLogs.filter(l => l.date === currentDate && l.worstStatus === 'critical').length;

  // Nav items dynamically filtered strictly by role
  const navItems = useMemo(() => {
    if (currentUser.role === 'SITE_POC') {
      return [
        {
          group: 'MY SITE OPERATIONS & FILING',
          items: [
            {
              id: 'pocFiling',
              label: 'POC Daily Filing Desk',
              subLabel: "Your site's services",
              icon: Smartphone,
              badge: 'Fast Filing',
              highlight: true
            },
            {
              id: 'diesel',
              label: 'My Site Diesel & Inward',
              subLabel: 'Fuel Consumption & POD',
              icon: Fuel,
              badge: 'Diesel'
            },
            {
              id: 'dailyForm',
              label: 'Daily Site Report (43-Pt)',
              subLabel: 'Utility & MHE Checklist',
              icon: ClipboardCheck
            },
            {
              id: 'housekeeping',
              label: 'Housekeeping Roster',
              subLabel: 'SMS / Vedanta Agency',
              icon: Users
            },
            {
              id: 'dgPower',
              label: 'DG, EB & Water Sheet',
              subLabel: '500KVA x2 Fuel & Grid',
              icon: Zap
            },
            {
              id: 'washing',
              label: 'Crate Washing & Adhoc',
              subLabel: 'Sanitization & Repairs',
              icon: Droplet
            }
          ]
        },
        {
          group: 'MY SITE AUDIT LOGS',
          items: [
            {
              id: 'database',
              label: 'My Site Records',
              subLabel: 'Filtered to Assigned Hub',
              icon: Database,
              badge: 'Site Logs'
            }
          ]
        }
      ];
    }

    if (currentUser.role === 'SERVICE_ADMIN') {
      return [
        {
          group: 'ADMIN SERVICE HUB',
          items: [
            {
              id: 'adminDashboard',
              label: 'Admin Service Hub',
              subLabel: 'Service-Wise KPIs & Radar',
              icon: Award,
              badge: 'Admin Hub',
              highlight: true
            },
            {
              id: 'sheets',
              label: 'Operational Sheets',
              subLabel: 'Service Catalog & Hub',
              icon: Layers,
              badge: 'Sheets'
            },
            {
              id: 'diesel',
              label: 'Diesel & Fuel Management',
              subLabel: 'Inward & Vendor POD Audit',
              icon: Fuel,
              badge: 'Diesel Admin'
            },
            {
              id: 'dgPower',
              label: 'DG, EB & Water Power',
              subLabel: '500KVA x2 Fuel & Grid Units',
              icon: Zap
            },
            {
              id: 'housekeeping',
              label: 'Housekeeping Roster',
              subLabel: 'SMS / Vedanta Headcount',
              icon: Users
            },
            {
              id: 'dailyForm',
              label: 'Daily Site Master Logs',
              subLabel: '43-Col Checklist Records',
              icon: ClipboardCheck
            },
            {
              id: 'washing',
              label: 'Crate Washing & Adhoc',
              subLabel: 'Sanitization & Repairs',
              icon: Droplet
            }
          ]
        },
        {
          group: 'DATA & AUDIT LOGS',
          items: [
            {
              id: 'database',
              label: 'Database Explorer',
              subLabel: 'Nationwide Service Records',
              icon: Database,
              badge: 'Live Data'
            }
          ]
        }
      ];
    }

    // Super Admin: Full network visibility and all administrative consoles
    return [
      {
        group: 'EXECUTIVE CONTROL ROOM',
        items: [
          {
            id: 'dashboard',
            label: 'Control Room',
            subLabel: 'Nationwide Matrix & Pulse',
            icon: LayoutDashboard,
            badge: criticalCount > 0 ? `${criticalCount} at risk` : `${todaysFiledCount}/${warehouses.length}`
          },
          {
            id: 'adminDashboard',
            label: 'Admin Service Hub',
            subLabel: 'Service-Wise KPIs & Radar',
            icon: Award,
            badge: 'Admin Hub',
            highlight: true
          },
          {
            id: 'pocFiling',
            label: 'POC Fast Filing Desk',
            subLabel: 'Site-Level Filing Simulator',
            icon: Smartphone,
            badge: 'POC Desk'
          },
          {
            id: 'sheets',
            label: 'Operational Sheets',
            subLabel: 'Catalog & Master Registry',
            icon: Layers,
            badge: 'Sheets'
          },
          {
            id: 'diesel',
            label: 'Diesel & Fuel Logs',
            subLabel: 'Inward & POD Audit',
            icon: Fuel
          },
          {
            id: 'dailyForm',
            label: 'Daily Site Report',
            subLabel: '43-Col Master Form',
            icon: ClipboardCheck
          },
          {
            id: 'housekeeping',
            label: 'Housekeeping Roster',
            subLabel: 'SMS / Vedanta Agency',
            icon: Users
          },
          {
            id: 'dgPower',
            label: 'DG, EB & Water Sheet',
            subLabel: '500KVA x2 Fuel & Grid',
            icon: Zap
          },
          {
            id: 'washing',
            label: 'Crate Washing & Adhoc',
            subLabel: 'Sanitization & Repairs',
            icon: Droplet
          }
        ]
      },
      {
        group: 'DATA & CUSTOM FORMS',
        items: [
          {
            id: 'database',
            label: 'Database Explorer',
            subLabel: 'Sheet-wise Data Viewer',
            icon: Database,
            badge: 'Live'
          },
          {
            id: 'createForm',
            label: 'Add New Form',
            subLabel: 'Custom Sheet Builder',
            icon: PlusCircle,
            badge: 'Builder'
          }
        ]
      },
      {
        group: 'MASTER DATA & ALLOCATION',
        items: [
          {
            id: 'masterData',
            label: 'MasterData',
            subLabel: 'POC · Site · Service Allocation',
            icon: Database,
            badge: 'Master Data',
            highlight: true
          },
          {
            id: 'serviceAssignments',
            label: 'Service Assignments',
            subLabel: 'Assign Services to Admins/POCs',
            icon: ShieldCheck,
            badge: 'Admin Matrix'
          },
          {
            id: 'templates',
            label: 'Form Schemas',
            subLabel: 'Field Definitions',
            icon: Sliders
          }
        ]
      }
    ];
  }, [currentUser.role, criticalCount, todaysFiledCount, warehouses.length]);

  /**
   * Nav entries that open a service form, mapped to the sheet they file.
   * Anything absent here (dashboards, explorers, master data) is governed by
   * the role branches above, not by service scope.
   */
  const NAV_SERVICE = useMemo<Record<string, { sheetId: string; codes: string[] }>>(() => ({
    dailyForm: { sheetId: 'SHEET_DAILY_SITE', codes: ['SITE_ACTIVITY'] },
    housekeeping: { sheetId: 'SHEET_HOUSEKEEPING', codes: ['HOUSEKEEPING'] },
    dgPower: { sheetId: 'SHEET_EB_DG', codes: ['EB_DG'] },
    washing: { sheetId: 'SHEET_WASHING', codes: ['WASHING', 'ADHOC'] },
    diesel: { sheetId: 'SHEET_DIESEL', codes: ['DIESEL'] }
  }), []);

  /** Active services in Master Data → Service_Registry. Empty until it is loaded. */
  const registeredCodes = useMemo(
    () => new Set(serviceRegistryRows.filter(s => s.Active === 'Yes').map(s => s.Service_Code)),
    [serviceRegistryRows]
  );

  /** The services enabled at a pinned person's site (Site_Master Services_Enabled). */
  const siteServices = useMemo<'ALL' | string[]>(() => {
    if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'SERVICE_ADMIN') return 'ALL';
    const own = [currentUser.warehouseId, ...(currentUser.siteCodes ?? [])].filter(Boolean) as string[];
    const sites = controlRoomSites(siteMasterRows, warehouses).filter(s => own.some(id => siteMatches(s, id)));
    if (sites.length === 0 || sites.some(s => s.services === 'ALL')) return 'ALL';
    return [...new Set(sites.flatMap(s => s.services as string[]))];
  }, [currentUser.role, currentUser.warehouseId, currentUser.siteCodes, siteMasterRows, warehouses]);

  /**
   * Service links follow Master Data: a link shows only for a service that is
   * active in Service_Registry, enabled at the person's site, and in their
   * own grants. Before the registry is loaded, the older scope check applies.
   */
  const scopedNavItems = useMemo(() => {
    const held = currentUser.serviceCodes;
    return navItems
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          const nav = NAV_SERVICE[item.id];
          if (!nav) return true;
          if (registeredCodes.size === 0) return isServiceAccessible(nav.sheetId);
          return nav.codes.some(
            code =>
              registeredCodes.has(code) &&
              (!held || held === 'ALL' || held.includes(code)) &&
              (siteServices === 'ALL' || siteServices.includes(code))
          );
        })
      }))
      .filter(group => group.items.length > 0);
  }, [navItems, NAV_SERVICE, isServiceAccessible, registeredCodes, siteServices, currentUser.serviceCodes]);

  // The rail shows icons only; the flyout carries the labels. Flattening here
  // keeps the icon order identical to the labelled list, so the two never
  // disagree about what sits where.
  const flatItems = useMemo(
    () => scopedNavItems.flatMap((group, gIdx) => group.items.map(item => ({ ...item, groupIndex: gIdx }))),
    [scopedNavItems]
  );

  return (
    <>
      {/* Reserves the rail's width. The rail itself floats, so this stays fixed
          regardless of the flyout — the page content never shifts on hover. */}
      <div className="shrink-0 hidden md:block w-[5.75rem]" />

      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="fixed left-0 top-0 bottom-0 z-40 hidden md:flex items-stretch select-none"
      >
        {/* The rail */}
        <div className="rail my-4 ml-4 w-[4.25rem] flex flex-col items-center py-4 shrink-0">
          <button
            onClick={() => onSelectView(currentUser.role === 'SUPER_ADMIN' ? 'dashboard' : 'pocFiling')}
            className="w-10 h-10 rounded-[0.9rem] bg-white grid place-items-center shrink-0 mb-5 transition-transform hover:scale-105"
            title="WarehouseOS — home"
          >
            <Building2 className="w-5 h-5 text-[var(--color-ink)]" />
          </button>

          <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-3">
            {flatItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const startsGroup = idx > 0 && item.groupIndex !== flatItems[idx - 1].groupIndex;

              return (
                <React.Fragment key={item.id}>
                  {startsGroup && <div className="h-px w-6 bg-white/12 my-2 shrink-0" />}
                  <button
                    onClick={() => onSelectView(item.id)}
                    data-active={isActive}
                    className="rail-item shrink-0 cursor-pointer"
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="w-[1.15rem] h-[1.15rem]" />
                    {item.id === 'dashboard' && criticalCount > 0 && (
                      <span className="rail-dot" aria-hidden="true" />
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>

          <div className="flex flex-col items-center gap-1 pt-3 mt-2 border-t border-white/10 w-full px-3">
            <button
              onClick={onOpenArchitecture}
              className="rail-item shrink-0 cursor-pointer"
              title="Firestore schema & security rules"
            >
              <Sparkles className="w-[1.15rem] h-[1.15rem]" />
            </button>
            <button
              onClick={resetToDefaultData}
              className="rail-item shrink-0 cursor-pointer"
              title="Reset benchmark data"
            >
              <RotateCcw className="w-[1.15rem] h-[1.15rem]" />
            </button>
            <img
              src={currentUser.avatar}
              alt={currentUser.fullName}
              className="w-9 h-9 rounded-[0.8rem] object-cover mt-1 ring-2 ring-white/15"
            />
          </div>
        </div>

        {/* The flyout — labels live here, so the rail stays quiet at icon size */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="soft-panel my-4 ml-3 w-[17.5rem] flex flex-col overflow-hidden elevate-4"
            >
              <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="font-display font-bold text-[0.95rem] text-[var(--color-ink)] leading-tight">
                    WarehouseOS
                  </h1>
                  <p className="code-chip mt-0.5">
                    {warehouses.length} sites · {todaysFiledCount} filed today
                  </p>
                </div>
                <button
                  onClick={togglePin}
                  className={`p-1.5 rounded-lg transition cursor-pointer shrink-0 ${
                    isPinned
                      ? 'bg-[var(--color-filed-tint)] text-[var(--color-filed)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'
                  }`}
                  title={isPinned ? 'Unpin' : 'Keep open'}
                >
                  {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Who you're acting as. With the API this is the signed-in person
                  from /api/me; the persona picker exists only in demo mode. */}
              <div className="px-3 pb-3">
                <div className="relative">
                  <button
                    onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                    className="w-full text-left p-2.5 rounded-[var(--r-chip)] bg-[var(--bg-subtle)] hover:bg-[var(--color-frost)] transition flex items-center gap-2.5 cursor-pointer"
                  >
                    <img
                      src={currentUser.avatar}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--color-ink)] truncate">
                        {currentUser.fullName}
                      </div>
                      <div className="code-chip truncate">
                        {currentUser.role === 'SUPER_ADMIN' ? 'ALL SITES' : currentUser.warehouseId}
                      </div>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        currentUser.role === 'SUPER_ADMIN' ? 'chip-missing' : 'chip-filed'
                      }`}
                    >
                      {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'POC'}
                    </span>
                  </button>

                  <AnimatePresence>
                    {showPersonaMenu && dataMode === 'demo' && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-[var(--r-card)] elevate-4 p-1.5 z-50 max-h-64 overflow-y-auto"
                      >
                        {users.map(u => (
                          <button
                            key={u.id}
                            onClick={() => {
                              setCurrentUser(u);
                              if (u.warehouseId) setSelectedWarehouseId(u.warehouseId);
                              setShowPersonaMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-[var(--r-chip)] text-xs flex items-center gap-2.5 transition cursor-pointer ${
                              currentUser.id === u.id
                                ? 'bg-[var(--color-filed-tint)] font-bold'
                                : 'hover:bg-[var(--bg-subtle)]'
                            }`}
                          >
                            {u.role === 'SUPER_ADMIN' ? (
                              <ShieldCheck className="w-4 h-4 text-[var(--color-missing)] shrink-0" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-[var(--color-filed)] shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-semibold text-[var(--color-ink)]">{u.fullName}</div>
                              <div className="code-chip">
                                {u.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : u.warehouseId}
                              </div>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
                {scopedNavItems.map((group, gIdx) => (
                  <div key={gIdx}>
                    <div className="px-2 pb-1.5 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {group.group}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map(item => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;

                        return (
                          <button
                            key={item.id}
                            onClick={() => onSelectView(item.id)}
                            className={`w-full text-left px-2.5 py-2 rounded-[var(--r-chip)] flex items-center gap-2.5 transition cursor-pointer ${
                              isActive
                                ? 'bg-[var(--color-ink)] text-white'
                                : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-white' : 'text-[var(--text-muted)]'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span
                                  className={`text-xs font-semibold truncate ${
                                    isActive ? 'text-white' : 'text-[var(--color-ink)]'
                                  }`}
                                >
                                  {item.label}
                                </span>
                                {item.badge && !isActive && (
                                  <span
                                    className={`chip shrink-0 ${
                                      item.highlight ? 'chip-filed' : 'chip-neutral'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              {item.subLabel && (
                                <p
                                  className={`text-[0.6875rem] truncate ${
                                    isActive ? 'text-white/60' : 'text-[var(--text-muted)]'
                                  }`}
                                >
                                  {item.subLabel}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
