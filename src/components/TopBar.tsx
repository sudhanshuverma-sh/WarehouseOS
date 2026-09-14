import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Calendar,
  Building2,
  Filter,
  PlusCircle,
  Database,
  Search,
  Sparkles,
  Layers,
  ArrowLeft,
  ShieldCheck,
  UserCheck,
  ChevronDown,
  LayoutDashboard,
  Smartphone,
  Bell,
  Lock,
  Fuel,
  Award
} from 'lucide-react';
import { User } from '../types';
import { NotificationCenterModal } from './NotificationCenterModal';

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
    currentUser,
    setCurrentUser,
    users,
    dataMode,
    dailySiteLogs,
    sheetRecords,
    dieselLogs
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // Active warehouse resolution
  const activeWarehouse = useMemo(() => {
    if (currentUser.role === 'SITE_POC' && currentUser.warehouseId) {
      return warehouses.find(w => w.id === currentUser.warehouseId) || warehouses[0];
    }
    return warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];
  }, [warehouses, currentUser, selectedWarehouseId]);

  // Real-time pending daily validation calculation for logged-in user / POC
  const pendingAlertCount = useMemo(() => {
    let count = 0;
    const userWhId = currentUser.warehouseId || activeWarehouse.id;
    const wh = warehouses.find(w => w.id === userWhId) || warehouses[0];

    // Check Daily Site Report for today
    const filedDaily = dailySiteLogs.some(l => l.site === wh.id && l.date === currentDate);
    if (!filedDaily) count++;

    // Check Housekeeping for today
    const hkFiled = (sheetRecords['SHEET_HOUSEKEEPING'] || []).some(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (!hkFiled) count++;

    // Check DG Power for today
    const dgFiled = (sheetRecords['SHEET_DG_POWER_WATER'] || []).some(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (!dgFiled) count++;

    // Check Diesel Inward POD needing site verification
    const pendingDiesel = dieselLogs.filter(d => d.warehouseId === wh.id && (d.status === 'Approved' || d.validation === 'Pending Validation')).length;
    count += pendingDiesel;

    return count;
  }, [currentUser, warehouses, currentDate, dailySiteLogs, sheetRecords, dieselLogs, activeWarehouse]);

  const isHomeView =
    (currentUser.role === 'SUPER_ADMIN' && currentView === 'dashboard') ||
    (currentUser.role === 'SERVICE_ADMIN' && currentView === 'adminDashboard') ||
    (currentUser.role === 'SITE_POC' && currentView === 'pocFiling');

  return (
    <header className="soft-glass rounded-[var(--r-panel)] sticky top-4 z-20 font-sans mx-3 sm:mx-5 lg:mx-7 mt-4">
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold border transition ${
                  currentUser.role === 'SUPER_ADMIN'
                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                    : currentUser.role === 'SERVICE_ADMIN'
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-teal-50 text-teal-800 border-teal-200'
                }`}
              >
                {currentUser.role === 'SUPER_ADMIN' ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                ) : currentUser.role === 'SERVICE_ADMIN' ? (
                  <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                )}
                <span className="truncate max-w-[110px]">
                  {currentUser.role === 'SUPER_ADMIN' ? 'Super Admin' : currentUser.role === 'SERVICE_ADMIN' ? 'Service Admin' : currentUser.fullName.split(' ')[0]}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* Role Dropdown */}
              {/* Demo only: with the API, who you are comes from sign-in, not a menu. */}
              {showRoleMenu && dataMode === 'demo' && (
                <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 min-w-[260px] max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-slate-400">
                    Switch User Role & Access
                  </div>
                  <div className="space-y-1 mt-1">
                    {users.map(u => (
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
                              {u.role === 'SUPER_ADMIN' ? 'Super Admin' : u.role === 'SERVICE_ADMIN' ? (u.department || 'Service Admin') : u.warehouseId}
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

          {/* Right: Facility Selector (Locked for POC) + Notification Bell */}
          <div className="flex items-center gap-1.5">
            {currentUser.role === 'SITE_POC' ? (
              <div className="flex items-center gap-1 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-xl text-xs font-bold text-teal-900">
                <Lock className="w-3 h-3 text-teal-600 shrink-0" />
                <span className="truncate max-w-[120px]">{activeWarehouse.code}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl text-xs font-bold text-slate-800">
                <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="bg-transparent focus:outline-none cursor-pointer text-xs font-bold text-slate-800 max-w-[120px] truncate"
                >
                  <option value="ALL">All Hubs</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} ({w.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="relative p-1.5 rounded-xl bg-amber-50 active:bg-amber-100 text-amber-900 border border-amber-200"
            >
              <Bell className="w-4 h-4 text-amber-700" />
              {pendingAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white font-black text-[9px] rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                  {pendingAlertCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Sub-strip: Date Only (Shifts removed) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex-1 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Daily Date:</span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs w-full"
            />
          </div>

          {currentUser.role === 'SITE_POC' && pendingAlertCount > 0 && (
            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-black shrink-0 flex items-center gap-1 animate-pulse"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
              Validate Today
            </button>
          )}
        </div>
      </div>

      {/* 2. Desktop View Header (>= md) */}
      <div className="hidden md:flex flex-row items-center justify-between gap-3 px-6 py-2.5">
        {/* Left Section: Back Button + Role Switcher + Facility Context */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canGoBack && onBack && !isHomeView && (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition shadow-2xs group cursor-pointer"
              title="Go back to previous screen"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back</span>
            </button>
          )}

          {/* Quick Persona / Role Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                currentUser.role === 'SUPER_ADMIN'
                  ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                  : currentUser.role === 'SERVICE_ADMIN'
                  ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
              }`}
            >
              {currentUser.role === 'SUPER_ADMIN' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              ) : currentUser.role === 'SERVICE_ADMIN' ? (
                <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              )}
              <span className="truncate">
                {currentUser.role === 'SUPER_ADMIN'
                  ? 'Super Admin (Full Network)'
                  : currentUser.role === 'SERVICE_ADMIN'
                  ? `Service Admin (${currentUser.fullName.split(' ')[0]})`
                  : `Site POC: ${currentUser.fullName.split(' ')[0]}`}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
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
                  {users.map(u => {
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
                                ? 'Full Network Monitoring & Assignments'
                                : isServiceAdmin
                                ? `${u.department || 'Assigned Service Lead'}`
                                : `Assigned Facility: ${u.warehouseId}`}
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

          {/* Facility Context: Strict Lock for POC vs Selector for Admins */}
          {currentUser.role === 'SITE_POC' ? (
            <div className="flex items-center gap-2 bg-teal-50/80 px-3 py-1.5 rounded-xl border border-teal-200 text-xs">
              <Lock className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span className="font-semibold text-teal-800">My Assigned Site:</span>
              <span className="font-black text-teal-950 truncate max-w-[220px]">
                {activeWarehouse.facilityName || activeWarehouse.name} ({activeWarehouse.code})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Building2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span className="font-semibold text-slate-500">Facility Filter:</span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL">All Hubs (Nationwide Overview)</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.city} • {w.code} ({w.name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notification Alert Bell */}
          <button
            type="button"
            onClick={() => setIsNotificationOpen(true)}
            className="relative p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Open Daily Alerts & Action Items"
          >
            <Bell className="w-4 h-4 text-amber-700" />
            {pendingAlertCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black bg-rose-600 text-white rounded-full leading-none animate-pulse">
                {pendingAlertCount}
              </span>
            )}
            <span className="hidden lg:inline text-xs font-bold text-amber-950">
              {pendingAlertCount > 0 ? `${pendingAlertCount} Daily Validations Pending` : 'Daily Status OK'}
            </span>
          </button>
        </div>

        {/* Right Section: Daily Date & Fast Actions (Shift removed) */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-500 text-[11px]">Daily Date:</span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs"
            />
          </div>

          <button
            onClick={() => onNavigate('database')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold transition cursor-pointer shadow-2xs"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{currentUser.role === 'SITE_POC' ? 'My Site Data' : 'Database'}</span>
          </button>

          {currentUser.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => onNavigate('createForm')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-2xs transition cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Add Form</span>
            </button>
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
  );
};


