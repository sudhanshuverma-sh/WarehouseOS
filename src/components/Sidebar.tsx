import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  ClipboardCheck,
  Fuel,
  Database,
  PlusCircle,
  CheckSquare,
  Building2,
  Sliders,
  ShieldCheck,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Menu,
  Layers,
  Sparkles,
  RotateCcw,
  LogOut,
  ChevronDown,
  Users,
  Zap,
  Droplet,
  Smartphone,
  Award,
  Pin,
  PinOff
} from 'lucide-react';
import { UserRole } from '../types';

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
    selectedWarehouseId,
    setSelectedWarehouseId,
    dailySiteLogs,
    currentDate,
    resetToDefaultData
  } = useApp();

  // Pin state: by default false so sidebar stays tucked/compact and expands on hover
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
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
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

  // Is expanded when pinned OR when hovered
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
              subLabel: 'One-Tap 15-Service Hub',
              icon: Smartphone,
              badge: 'Fast Filing',
              badgeColor: 'bg-teal-500 text-white font-bold',
              highlight: true
            },
            {
              id: 'diesel',
              label: 'My Site Diesel & Inward',
              subLabel: 'Fuel Consumption & POD',
              icon: Fuel,
              badge: 'Diesel',
              badgeColor: 'bg-amber-500 text-slate-950 font-bold'
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
              badge: 'Site Logs',
              badgeColor: 'bg-indigo-600 text-white'
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
              badgeColor: 'bg-amber-400 text-slate-950 font-black',
              highlight: true
            },
            {
              id: 'sheets',
              label: '15 Operational Sheets',
              subLabel: 'Service Catalog & Hub',
              icon: Layers,
              badge: '15 Sheets',
              badgeColor: 'bg-slate-700 text-slate-300'
            },
            {
              id: 'diesel',
              label: 'Diesel & Fuel Management',
              subLabel: 'Inward & Vendor POD Audit',
              icon: Fuel,
              badge: 'Diesel Admin',
              badgeColor: 'bg-orange-500 text-white font-bold'
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
              badge: 'Live Data',
              badgeColor: 'bg-indigo-600 text-white'
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
            badge: criticalCount > 0 ? `${criticalCount} Risk` : `${todaysFiledCount}/${warehouses.length}`,
            badgeColor: criticalCount > 0 ? 'bg-rose-500 text-white' : 'bg-slate-700 text-slate-300'
          },
          {
            id: 'adminDashboard',
            label: 'Admin Service Hub',
            subLabel: 'Service-Wise KPIs & Radar',
            icon: Award,
            badge: 'Admin Hub',
            badgeColor: 'bg-amber-400 text-slate-950 font-black',
            highlight: true
          },
          {
            id: 'pocFiling',
            label: 'POC Fast Filing Desk',
            subLabel: 'Site-Level Filing Simulator',
            icon: Smartphone,
            badge: 'POC Desk',
            badgeColor: 'bg-teal-500 text-white font-bold'
          },
          {
            id: 'sheets',
            label: '15 Operational Sheets',
            subLabel: 'Catalog & Master Registry',
            icon: Layers,
            badge: '15 Sheets',
            badgeColor: 'bg-slate-700 text-slate-300'
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
            badge: 'Live',
            badgeColor: 'bg-indigo-600 text-white'
          },
          {
            id: 'createForm',
            label: 'Add New Form',
            subLabel: 'Custom Sheet Builder',
            icon: PlusCircle,
            badge: 'Builder',
            badgeColor: 'bg-emerald-600 text-white'
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
            badgeColor: 'bg-teal-500 text-white font-bold',
            highlight: true
          },
          {
            id: 'serviceAssignments',
            label: 'Service Assignments',
            subLabel: 'Assign Services to Admins/POCs',
            icon: ShieldCheck,
            badge: 'Admin Matrix',
            badgeColor: 'bg-blue-600 text-white font-bold'
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

  return (
    <>
      {/* Spacer div to preserve layout width when pinned */}
      <div
        className={`shrink-0 transition-all duration-300 hidden md:block ${
          isPinned ? 'w-64 sm:w-72' : 'w-16'
        }`}
      />

      {/* Main Hover / Flyout Sidebar (Desktop only - mobile uses MobileBottomNav & MobileMenuDrawer) */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed top-0 left-0 bottom-0 z-40 bg-slate-900 text-slate-200 border-r border-slate-800 hidden md:flex flex-col select-none transition-all duration-300 ease-out elevate-4 ${
          isExpanded ? 'w-64 sm:w-72' : 'w-16'
        } ${!isPinned && isHovered ? 'ring-1 ring-teal-500/20' : ''}`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-2 h-16">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 shrink-0 font-black elevate-2 ring-1 ring-white/10">
              <Building2 className="w-5 h-5 text-slate-950" />
            </div>
            {isExpanded && (
              <div className="min-w-0 animate-fade-in-up">
                <h1 className="font-display font-bold text-sm text-white tracking-tight truncate">Warehouse Portal</h1>
                <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">Ops Ecosystem</p>
              </div>
            )}
          </div>

          {isExpanded && (
            <button
              onClick={togglePin}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isPinned
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 hover:bg-teal-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
              }`}
              title={isPinned ? 'Unpin Sidebar (Auto-hides to side rail)' : 'Pin Sidebar Open'}
            >
              {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* User Persona Switcher Widget */}
        <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="relative">
            <button
              onClick={() => isExpanded && setShowPersonaMenu(!showPersonaMenu)}
              className={`w-full text-left p-2 rounded-xl border transition flex items-center gap-2.5 cursor-pointer ${
                currentUser.role === 'SUPER_ADMIN'
                  ? 'bg-purple-950/40 border-purple-800/60 hover:bg-purple-950/60'
                  : 'bg-teal-950/40 border-teal-800/60 hover:bg-teal-950/60'
              } ${!isExpanded ? 'justify-center' : ''}`}
              title={!isExpanded ? `${currentUser.fullName} (${currentUser.role})` : undefined}
            >
              <div className="relative shrink-0">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.fullName}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-slate-900"></span>
              </div>

              {isExpanded && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate">
                      {currentUser.fullName.split(' ')[0]}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                        currentUser.role === 'SUPER_ADMIN'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-teal-500/20 text-teal-300'
                      }`}
                    >
                      {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'POC'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {currentUser.role === 'SUPER_ADMIN' ? 'All Hubs' : currentUser.warehouseId}
                  </p>
                </div>
              )}

              {isExpanded && <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </button>

            {/* Persona Menu Popup */}
            <AnimatePresence>
              {isExpanded && showPersonaMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-slate-700 rounded-xl elevate-4 p-2 z-50"
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Role / Site POC
                  </div>
                  <div className="space-y-1 mt-1 max-h-56 overflow-y-auto">
                    {users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setCurrentUser(u);
                          if (u.warehouseId) {
                            setSelectedWarehouseId(u.warehouseId);
                          }
                          setShowPersonaMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2.5 transition cursor-pointer ${
                          currentUser.id === u.id
                            ? 'bg-teal-600/20 text-teal-300 font-bold border border-teal-500/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="shrink-0">
                          {u.role === 'SUPER_ADMIN' ? (
                            <ShieldCheck className="w-4 h-4 text-purple-400" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-teal-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-semibold">{u.fullName}</div>
                          <div className="text-[10px] text-slate-400">
                            {u.role === 'SUPER_ADMIN' ? 'Super Admin' : u.warehouseId}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation Group Items */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          {navItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {isExpanded ? (
                <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {group.group}
                </div>
              ) : (
                <div className="h-px bg-slate-800 my-2 mx-1" />
              )}

              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectView(item.id)}
                    title={!isExpanded ? `${item.label} (${item.subLabel || ''})` : undefined}
                    className={`w-full text-left px-2.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors group relative cursor-pointer overflow-hidden ${
                      isActive
                        ? 'text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    } ${item.highlight && !isActive ? 'ring-1 ring-teal-500/30 bg-teal-950/20' : ''} ${
                      !isExpanded ? 'justify-center' : ''
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebarActiveGlow"
                        className="absolute inset-0 bg-teal-600 rounded-xl"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon
                      className={`relative z-10 w-4 h-4 shrink-0 transition ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-400'
                      }`}
                    />

                    {isExpanded && (
                      <div className="relative z-10 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 ${
                                item.badgeColor || 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.subLabel && (
                          <p
                            className={`text-[10px] truncate ${
                              isActive ? 'text-teal-100' : 'text-slate-400'
                            }`}
                          >
                            {item.subLabel}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-2.5 border-t border-slate-800 space-y-1.5 bg-slate-950/30">
          <button
            onClick={onOpenArchitecture}
            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 text-teal-400 hover:text-teal-300 hover:bg-slate-800 transition cursor-pointer ${
              !isExpanded ? 'justify-center' : ''
            }`}
            title="Inspect Firestore Security Rules & 15-Sheet Schema"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            {isExpanded && <span className="font-semibold truncate">Firestore Architecture</span>}
          </button>

          <button
            onClick={resetToDefaultData}
            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer ${
              !isExpanded ? 'justify-center' : ''
            }`}
            title="Reset Benchmark Data"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            {isExpanded && <span>Reset Benchmark State</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

