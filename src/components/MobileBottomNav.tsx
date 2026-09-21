import React, { useState } from 'react';
import {
  Smartphone,
  LayoutDashboard,
  Fuel,
  ClipboardCheck,
  Bell,
  Database,
  Menu,
  Sparkles
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MobileMenuDrawer } from './MobileMenuDrawer';

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
  pendingAlertCount
}) => {
  const { currentUser } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isSuper = currentUser.role === 'SUPER_ADMIN';

  return (
    <>
      {/* pb-safe holds room for the iPhone home indicator, which otherwise
          sits on top of this row. tap-dense opts these out of the global
          44px minimum: five of them share one row, and they are already
          about 52px tall through their own padding. */}
      <nav className="tap-dense fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] flex items-center justify-around md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {/* 1. Home / Site Desk */}
        <button
          type="button"
          onClick={() => onNavigate(isSuper ? 'dashboard' : 'pocFiling')}
          className={`flex flex-col items-center justify-center p-1 rounded-2xl min-w-[56px] transition active:scale-95 cursor-pointer ${
            (currentView === 'pocFiling' || currentView === 'dashboard')
              ? 'text-teal-700 font-extrabold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${
            (currentView === 'pocFiling' || currentView === 'dashboard')
              ? 'bg-teal-100 text-teal-800 shadow-2xs'
              : 'hover:bg-slate-100'
          }`}>
            {isSuper ? <LayoutDashboard className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">
            {isSuper ? 'Control' : 'Site Desk'}
          </span>
        </button>

        {/* 2. Diesel Procurement Fast Inward */}
        <button
          type="button"
          onClick={() => onNavigate('diesel')}
          className={`flex flex-col items-center justify-center p-1 rounded-2xl min-w-[56px] transition active:scale-95 cursor-pointer ${
            currentView === 'diesel'
              ? 'text-amber-800 font-extrabold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${
            currentView === 'diesel' ? 'bg-amber-100 text-amber-900 shadow-2xs' : 'hover:bg-slate-100'
          }`}>
            <Fuel className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Diesel</span>
        </button>

        {/* 3. Daily Site 43-Point Checklist Form */}
        <button
          type="button"
          onClick={() => onNavigate('dailyForm')}
          className={`flex flex-col items-center justify-center p-1 rounded-2xl min-w-[56px] transition active:scale-95 cursor-pointer ${
            currentView === 'dailyForm'
              ? 'text-teal-700 font-extrabold'
              : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${
            currentView === 'dailyForm' ? 'bg-teal-100 text-teal-800 shadow-2xs' : 'hover:bg-slate-100'
          }`}>
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">Checklist</span>
        </button>

        {/* 4. Notification Alert Bell with Badge */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="flex flex-col items-center justify-center p-1 rounded-2xl min-w-[56px] transition active:scale-95 text-slate-500 hover:text-slate-900 relative cursor-pointer"
        >
          <div className="p-1.5 rounded-xl relative hover:bg-slate-100">
            <Bell className="w-5 h-5 text-amber-600" />
            {pendingAlertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-600 text-white font-black text-[9px] rounded-full flex items-center justify-center border-2 border-white shadow-2xs animate-pulse">
                {pendingAlertCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-amber-800 tracking-tight mt-0.5">Alerts</span>
        </button>

        {/* 5. Menu Drawer / All Services */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          className="flex flex-col items-center justify-center p-1 rounded-2xl min-w-[56px] transition active:scale-95 text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
        >
          <div className="p-1.5 rounded-xl hover:bg-slate-100">
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">More</span>
        </button>
      </nav>

      {/* Slide-out Mobile Menu Drawer */}
      <MobileMenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentView={currentView}
        onNavigate={onNavigate}
      />
    </>
  );
};
