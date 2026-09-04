import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  ChevronRight,
  Send,
  X,
  Smartphone,
  Sparkles,
  ArrowRight,
  ClipboardCheck,
  Fuel,
  Users,
  Zap,
  Droplet,
  Info
} from 'lucide-react';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToForm?: (viewName: string) => void;
}

export interface SmartAlert {
  id: string;
  type: 'MISSED_SHIFT' | 'PENDING_TODAY' | 'CRITICAL_DEVIATION' | 'APPROVAL_NEEDED' | 'REMINDER';
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  targetView: string;
  serviceId?: string;
  facility: string;
  facilityCode: string;
  shift?: string;
  deadline?: string;
  actionText: string;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  onNavigateToForm
}) => {
  const {
    currentUser,
    warehouses,
    currentDate,
    selectedShift,
    dailySiteLogs,
    sheetRecords,
    dieselLogs,
    setNotification
  } = useApp();

  const [filterType, setFilterType] = useState<'ALL' | 'ACTIONABLE' | 'MISSED'>('ALL');

  // Compute all smart alerts for the logged in user / site POC
  const smartAlerts = useMemo(() => {
    const alerts: SmartAlert[] = [];
    const userWhId = currentUser.warehouseId || 'WH_001';
    const wh = warehouses.find(w => w.id === userWhId) || warehouses[0];

    // 1. Daily Site Activity Checklist Status Check
    const siteDailyLogs = dailySiteLogs.filter(l => l.site === wh.id && l.date === currentDate);
    if (siteDailyLogs.length === 0) {
      alerts.push({
        id: 'alert_daily_site_pending',
        type: 'PENDING_TODAY',
        urgency: 'HIGH',
        title: 'Daily Site Activity Report Missing!',
        description: `You haven't submitted today's (${currentDate}) mandatory 43-point checklist for ${wh.city} (${wh.code}). Please submit before shift handover.`,
        targetView: 'dailyForm',
        serviceId: 'SHEET_DAILY_SITE',
        facility: wh.city,
        facilityCode: wh.code,
        deadline: 'Before 02:00 PM',
        actionText: '⚡ Complete 43-Point Checklist'
      });
    }

    // 2. Housekeeping Shift Manpower Check
    const hkRecords = (sheetRecords['SHEET_HOUSEKEEPING'] || []).filter(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (hkRecords.length === 0) {
      alerts.push({
        id: 'alert_hk_pending',
        type: 'MISSED_SHIFT',
        urgency: 'HIGH',
        title: 'Morning Housekeeping Headcount Unfiled',
        description: `Contractor roster (SMS / Vedanta) attendance for Morning shift is still not recorded at ${wh.name}.`,
        targetView: 'housekeeping',
        serviceId: 'SHEET_HOUSEKEEPING',
        facility: wh.city,
        facilityCode: wh.code,
        deadline: 'Overdue by 45 mins',
        actionText: '👥 Record On-Ground Staff'
      });
    }

    // 3. DG Power, EB Units & Water Balance
    const dgRecords = (sheetRecords['SHEET_DG_POWER_WATER'] || []).filter(
      r => (r.warehouseId === wh.id || r.warehouseId === wh.code) && r.date === currentDate
    );
    if (dgRecords.length === 0) {
      alerts.push({
        id: 'alert_dg_pending',
        type: 'PENDING_TODAY',
        urgency: 'MEDIUM',
        title: 'Daily DG Run Hours & EB Units Pending',
        description: `Dual 500 KVA generator fuel level, run hours, and main incomer grid kWh meters need to be updated.`,
        targetView: 'dgPower',
        serviceId: 'SHEET_DG_POWER_WATER',
        facility: wh.city,
        facilityCode: wh.code,
        deadline: 'Shift End (02:00 PM)',
        actionText: '⚡ Log Utility Meters'
      });
    }

    // 4. Diesel Inward Verification & POD Upload (If any approved order needs site confirmation)
    const pendingDeliveries = dieselLogs.filter(
      d => d.warehouseId === wh.id && d.status === 'Approved'
    );
    pendingDeliveries.forEach(d => {
      alerts.push({
        id: `alert_diesel_pod_${d.id}`,
        type: 'APPROVAL_NEEDED',
        urgency: 'HIGH',
        title: `Diesel Tanker Inward POD Required (${d.uniqueId})`,
        description: `Admin approved ${(d.orderQuantityLitres || d.quantity || 0).toLocaleString()} L order. Please take a photo of the physical invoice/dipstick to complete Step 3.`,
        targetView: 'diesel',
        serviceId: 'SHEET_DIESEL',
        facility: wh.city,
        facilityCode: wh.code,
        actionText: '📷 Snap POD & Confirm Litres'
      });
    });

    // 5. If Super Admin is viewing, add nationwide missing summary alerts
    if (currentUser.role === 'SUPER_ADMIN') {
      const missingCount = warehouses.length - dailySiteLogs.filter(l => l.date === currentDate).length;
      if (missingCount > 0) {
        alerts.push({
          id: 'alert_nationwide_missing',
          type: 'CRITICAL_DEVIATION',
          urgency: 'HIGH',
          title: `${missingCount} Facilities Missing Daily Logs`,
          description: `Out of ${warehouses.length} warehouse hubs, ${missingCount} hubs have not submitted today's operational telemetry. Send an automated nudge!`,
          targetView: 'adminDashboard',
          facility: 'Nationwide Network',
          facilityCode: 'ALL',
          actionText: '📢 Broadcast WhatsApp/Email Nudge'
        });
      }
    }

    return alerts;
  }, [currentUser, warehouses, currentDate, dailySiteLogs, sheetRecords, dieselLogs]);

  const filteredAlerts = useMemo(() => {
    if (filterType === 'ACTIONABLE') return smartAlerts.filter(a => a.urgency === 'HIGH');
    if (filterType === 'MISSED') return smartAlerts.filter(a => a.type === 'MISSED_SHIFT' || a.type === 'PENDING_TODAY');
    return smartAlerts;
  }, [smartAlerts, filterType]);

  if (!isOpen) return null;

  const handleSendNudge = (e: React.MouseEvent, alert: SmartAlert) => {
    e.stopPropagation();
    setNotification({
      type: 'success',
      message: `🔔 WhatsApp & Email notification alert sent to POC at ${alert.facility}!`
    });
  };

  const handleAction = (alert: SmartAlert) => {
    onClose();
    if (onNavigateToForm) {
      onNavigateToForm(alert.targetView);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Phone optimized bottom sheet / desktop centered modal */}
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200 flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 relative">
              <Bell className="w-5 h-5" />
              {smartAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white font-black text-[9px] rounded-full flex items-center justify-center border-2 border-slate-900">
                  {smartAlerts.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                Action Alerts & Filing Reminders
              </h3>
              <p className="text-[11px] text-slate-300">
                {smartAlerts.length === 0
                  ? 'All forms and shift checklists are up to date! 🎉'
                  : `${smartAlerts.length} operational items require your attention`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Filter Tabs */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
                filterType === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Alerts ({smartAlerts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('ACTIONABLE')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition ${
                filterType === 'ACTIONABLE'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              Urgent High
            </button>
          </div>

          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden sm:inline">
            Live Site Pulse
          </span>
        </div>

        {/* Notification Alert List */}
        <div className="p-4 space-y-3 overflow-y-auto divide-y divide-slate-100 flex-1">
          {filteredAlerts.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="font-bold text-slate-800 text-sm">No Pending Alerts</div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Great job! All operational logs and service forms have been completed for your shift.
              </p>
            </div>
          ) : (
            filteredAlerts.map(alert => {
              const isUrgent = alert.urgency === 'HIGH';

              return (
                <div
                  key={alert.id}
                  onClick={() => handleAction(alert)}
                  className="pt-3 first:pt-0 group cursor-pointer"
                >
                  <div className={`p-3.5 rounded-2xl border transition-all ${
                    isUrgent
                      ? 'bg-rose-50/60 border-rose-200 hover:border-rose-300 hover:shadow-xs'
                      : 'bg-amber-50/60 border-amber-200 hover:border-amber-300 hover:shadow-xs'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                          isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-900">
                              {alert.title}
                            </span>
                            {alert.deadline && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800">
                                {alert.deadline}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {alert.description}
                          </p>

                          <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {alert.facility} ({alert.facilityCode})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Button */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between">
                      <span className="text-[11px] font-black text-indigo-700 group-hover:underline flex items-center gap-1">
                        {alert.actionText} <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>

                      {currentUser.role === 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          onClick={(e) => handleSendNudge(e, alert)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Nudge POC</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info banner */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            Reminders auto-sync every shift
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-slate-700 hover:text-slate-900"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
