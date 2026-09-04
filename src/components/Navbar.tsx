import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  ShieldCheck, 
  UserCheck, 
  Clock, 
  Calendar, 
  RefreshCw, 
  FileText, 
  Fuel, 
  Layers, 
  Code2, 
  CheckCircle2,
  Table,
  ChevronDown,
  Activity
} from 'lucide-react';
import { UserRole } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenArchitecture: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onOpenArchitecture }) => {
  const { 
    currentUser, 
    setCurrentUser, 
    users, 
    warehouses, 
    selectedWarehouseId, 
    setSelectedWarehouseId,
    selectedShift,
    setSelectedShift,
    currentDate,
    resetToDefaultData
  } = useApp();

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  const activeWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  const handleUserSwitch = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      setCurrentUser(targetUser);
      setIsRoleMenuOpen(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Control Room Dashboard', icon: Layers },
    { id: 'sheets', label: '15 Operations Sheets Hub', icon: Table },
    { id: 'dailyForm', label: 'Daily Site Activity Form', icon: Activity },
    { id: 'diesel', label: 'Fuel & Diesel Inward', icon: Fuel },
    { id: 'checklists', label: 'Dynamic Checklists', icon: CheckCircle2 },
    { id: 'masterData', label: 'MasterData', icon: Building2 },
    { id: 'templates', label: 'Template Schemas', icon: FileText },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      {/* Top Banner: Environment & Quick Role Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between py-2.5 border-b border-slate-800 text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-medium text-teal-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              Control Room System Live
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {currentDate}
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Shift: <span className="font-semibold text-amber-400">{selectedShift}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Schema & Rules button */}
            <button
              onClick={onOpenArchitecture}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 border border-slate-700 transition"
              title="Inspect Firestore Schema & Security Rules"
            >
              <Code2 className="w-3.5 h-3.5" />
              Schema & 15-Sheet Architecture
            </button>

            {/* Quick Demo Reset */}
            <button
              onClick={resetToDefaultData}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Reset state to initial benchmark data"
            >
              <RefreshCw className="w-3 h-3" />
              Reset State
            </button>

            {/* Quick RBAC Role Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium border transition ${
                  currentUser.role === 'SUPER_ADMIN'
                    ? 'bg-purple-950/80 text-purple-200 border-purple-700 hover:bg-purple-900'
                    : 'bg-teal-950/80 text-teal-200 border-teal-700 hover:bg-teal-900'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                <span className="font-semibold">{currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Site POC'}</span>: {currentUser.fullName.split(' ')[0]}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isRoleMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-900 rounded-lg shadow-xl border border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    Switch Test Persona (RBAC Simulation)
                  </div>
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleUserSwitch(u.id)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2.5 hover:bg-slate-800 transition ${
                        currentUser.id === u.id ? 'bg-slate-800/80 text-teal-400 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      <div className="mt-0.5">
                        {u.role === 'SUPER_ADMIN' ? (
                          <ShieldCheck className="w-4 h-4 text-purple-400" />
                        ) : (
                          <UserCheck className="w-4 h-4 text-teal-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{u.fullName}</div>
                        <div className="text-[10px] text-slate-400">
                          {u.role === 'SUPER_ADMIN' ? 'Super Admin • All Hubs' : `Site POC • ${u.warehouseId}`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Nav Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-600/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Daily Site Activity & Operations Portal</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Control Room
                </span>
              </div>
              <p className="text-xs text-slate-400">Unified 15-Sheet Digital Operations & Compliance Ecosystem</p>
            </div>
          </div>

          {/* Facility & Shift Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Warehouse Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Hub:</span>
              {currentUser.role === 'SITE_POC' ? (
                <span className="font-semibold text-teal-400">
                  {currentUser.warehouseId} ({activeWarehouse?.city || 'Assigned'})
                </span>
              ) : (
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">All Facilities (4 Hubs)</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id} className="bg-slate-900 text-white">
                      {wh.code} - {wh.city}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Shift Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Shift:</span>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as any)}
                className="bg-transparent text-amber-400 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="MORNING" className="bg-slate-900 text-white">Morning (06:00 - 14:00)</option>
                <option value="EVENING" className="bg-slate-900 text-white">Evening (14:00 - 22:00)</option>
                <option value="NIGHT" className="bg-slate-900 text-white">Night (22:00 - 06:00)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto space-x-1 py-1 border-t border-slate-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
