import React from 'react';
import { ArrowLeft, Home, ChevronRight, Building2, ShieldCheck, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: any;
  categoryBadge?: string;
  categoryColor?: string;
  onBack?: () => void;
  backLabel?: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  actions?: React.ReactNode;
  showFacilityBadge?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  description,
  icon: IconComponent,
  categoryBadge,
  categoryColor = 'bg-teal-50 text-teal-700 border-teal-200',
  onBack,
  backLabel = 'Back',
  breadcrumbs,
  actions,
  showFacilityBadge = true
}) => {
  const displaySubtitle = subtitle || description;
  const { currentUser, warehouses, selectedWarehouseId } = useApp();
  const activeWh = warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      {/* Top Nav: Back Button & Breadcrumbs */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar py-0.5">
          {onBack && (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition shadow-2xs group cursor-pointer shrink-0"
              title="Return to previous screen"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>{backLabel}</span>
            </button>
          )}

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                  {crumb.onClick ? (
                    <button
                      onClick={crumb.onClick}
                      type="button"
                      className="hover:text-teal-700 hover:underline transition truncate max-w-[120px] sm:max-w-none cursor-pointer"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="text-slate-800 font-semibold truncate max-w-[140px] sm:max-w-none">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
        </div>

        {/* User Role & Facility Context Indicator */}
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {showFacilityBadge && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl font-medium text-slate-600">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              <span>
                {currentUser.role === 'SITE_POC' ? (
                  <strong className="text-slate-900">{activeWh?.code} • {activeWh?.city}</strong>
                ) : (
                  <span>
                    Facility: <strong className="text-slate-900">{selectedWarehouseId === 'ALL' ? 'All Hubs' : activeWh?.code}</strong>
                  </span>
                )}
              </span>
            </div>
          )}

          <div
            className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl text-[10px] sm:text-[11px] font-extrabold border ${
              currentUser.role === 'SUPER_ADMIN'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-teal-50 text-teal-700 border-teal-200'
            }`}
          >
            {currentUser.role === 'SUPER_ADMIN' ? (
              <>
                <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600" />
                <span>Super Admin</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-600" />
                <span>Site POC</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {IconComponent && (
              <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700">
                <IconComponent className="w-5 h-5" />
              </div>
            )}
            {categoryBadge && (
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider border ${categoryColor}`}
              >
                {categoryBadge}
              </span>
            )}
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              {title}
            </h1>
          </div>
          {displaySubtitle && (
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              {displaySubtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1 sm:pt-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
