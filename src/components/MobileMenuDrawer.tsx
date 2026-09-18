import React from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Building2,
  ShieldCheck,
  LayoutDashboard,
  Smartphone,
  Award,
  Layers,
  ClipboardCheck,
  Users,
  Zap,
  Fuel,
  Droplet,
  Database,
  PlusCircle,
  Sliders,
  RotateCcw,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

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
    setCurrentUser,
    users,
    selectedWarehouseId,
    setSelectedWarehouseId,
    resetToDefaultData
  } = useApp();

  if (!isOpen) return null;

  const handleItemClick = (viewId: string) => {
    onNavigate(viewId);
    onClose();
  };

  const navGroups = React.useMemo(() => {
    if (currentUser.role === 'SITE_POC') {
      return [
        {
          title: 'My Site Operations & Filing',
          items: [
            { id: 'pocFiling', label: 'POC Daily Filing Desk', icon: Smartphone, color: 'text-teal-600', bg: 'bg-teal-50' },
            { id: 'diesel', label: 'My Site Diesel & Inward', icon: Fuel, color: 'text-amber-600', bg: 'bg-amber-50' },
            { id: 'dailyForm', label: 'Daily Site Checklist (43 Pts)', icon: ClipboardCheck, color: 'text-sky-600', bg: 'bg-sky-50' },
            { id: 'housekeeping', label: 'Housekeeping & Staff Roster', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
            { id: 'dgPower', label: 'DG Power, EB Units & Water', icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { id: 'washing', label: 'Crate Washing & Adhoc Tasks', icon: Droplet, color: 'text-cyan-600', bg: 'bg-cyan-50' }
          ]
        },
        {
          title: 'My Site Records & History',
          items: [
            { id: 'database', label: 'My Site Logs Explorer', icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' }
          ]
        }
      ];
    }

    if (currentUser.role === 'SERVICE_ADMIN') {
      return [
        {
          title: 'My services',
          items: [
            { id: 'adminDashboard', label: 'Admin Service Hub', icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
            { id: 'sheets', label: 'Operational Sheets', icon: Layers, color: 'text-slate-700', bg: 'bg-slate-100' },
            { id: 'diesel', label: 'Diesel', icon: Fuel, color: 'text-amber-600', bg: 'bg-amber-50' },
            { id: 'dgPower', label: 'EB and DG', icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { id: 'housekeeping', label: 'Housekeeping', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
            { id: 'dailyForm', label: 'Daily Site Report', icon: ClipboardCheck, color: 'text-sky-600', bg: 'bg-sky-50' },
            { id: 'washing', label: 'Crate Washing', icon: Droplet, color: 'text-cyan-600', bg: 'bg-cyan-50' }
          ]
        },
        {
          title: 'Records',
          items: [
            { id: 'database', label: 'Records', icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' }
          ]
        }
      ];
    }

    return [
      {
        title: 'Filing',
        items: [
          { id: 'pocFiling', label: 'Filing Desk', icon: Smartphone, color: 'text-teal-600', bg: 'bg-teal-50' },
          { id: 'dailyForm', label: 'Daily Site Report', icon: ClipboardCheck, color: 'text-sky-600', bg: 'bg-sky-50' },
          { id: 'housekeeping', label: 'Housekeeping', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
          { id: 'dgPower', label: 'EB and DG', icon: Zap, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { id: 'diesel', label: 'Diesel', icon: Fuel, color: 'text-amber-600', bg: 'bg-amber-50' },
          { id: 'washing', label: 'Crate Washing', icon: Droplet, color: 'text-cyan-600', bg: 'bg-cyan-50' }
        ]
      },
      {
        title: 'Monitor',
        items: [
          { id: 'dashboard', label: 'Control Room', icon: LayoutDashboard, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { id: 'adminDashboard', label: 'Admin Service Hub', icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
          { id: 'sheets', label: 'Operational Sheets', icon: Layers, color: 'text-slate-700', bg: 'bg-slate-100' },
          { id: 'database', label: 'Records', icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' },
          { id: 'createForm', label: 'New Form', icon: PlusCircle, color: 'text-teal-600', bg: 'bg-teal-50' }
        ]
      },
      {
        title: 'Master Data',
        items: [
          { id: 'masterData', label: 'Master Data', icon: Database, color: 'text-teal-600', bg: 'bg-teal-50' },
          { id: 'serviceAssignments', label: 'Service Assignments', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { id: 'templates', label: 'Form Fields', icon: Sliders, color: 'text-slate-700', bg: 'bg-slate-100' }
        ]
      }
    ];
  }, [currentUser.role]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-in Drawer */}
      <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center font-black">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white">Warehouse Portal</h2>
              <p className="text-[10px] text-teal-300 font-medium">Sites, services and filings</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={currentUser.avatar}
              alt={currentUser.fullName}
              className="w-9 h-9 rounded-xl object-cover border border-slate-200"
            />
            <div>
              <div className="font-bold text-xs text-slate-900">{currentUser.fullName}</div>
              <div className="text-[10px] font-semibold text-slate-500">
                {currentUser.role === 'SUPER_ADMIN' ? 'Super Admin' : `Site POC (${currentUser.warehouseId})`}
              </div>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
            currentUser.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'
          }`}>
            {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'POC'}
          </span>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <div className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {group.title}
              </div>
              <div className="space-y-1 mt-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-white/20 text-white' : `${item.bg} ${item.color}`}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              resetToDefaultData();
            }}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        </div>

      </div>
    </div>
  );
};
