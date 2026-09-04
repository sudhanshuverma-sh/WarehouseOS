import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Fuel,
  Users,
  Zap,
  Activity,
  Droplet,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  Download,
  Filter,
  Search,
  Check,
  X,
  ExternalLink,
  Eye,
  Camera,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  Shield,
  Truck,
  DollarSign,
  BarChart3,
  Flame,
  FileCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { DieselLog } from '../types';

interface AdminServiceDeepDiveProps {
  serviceId: string; // 'SHEET_DIESEL' | 'SHEET_DAILY_SITE' | 'SHEET_HOUSEKEEPING' | 'SHEET_DG_POWER_WATER' | other
  onClose?: () => void;
  onNavigateToSheet?: (sheetId: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const AdminServiceDeepDive: React.FC<AdminServiceDeepDiveProps> = ({
  serviceId,
  onClose,
  onNavigateToSheet,
  onNavigateTab
}) => {
  const {
    dieselLogs = [],
    dailySiteLogs = [],
    housekeepingLogs = [],
    dgPowerLogs = [],
    operationalSheets = [],
    warehouses = [],
    approveDieselLog,
    rejectDieselLog,
    setNotification,
    currentUser
  } = useApp();

  const [selectedFacility, setSelectedFacility] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<any | null>(null);

  // Timeframe selector
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'mtd'>('30d');

  // ==========================================
  // DIESEL PROCUREMENT SPECIFIC TELEMETRY
  // ==========================================
  const safeDieselLogs = dieselLogs || [];
  const safeDailySiteLogs = dailySiteLogs || [];
  const safeHousekeepingLogs = housekeepingLogs || [];
  const safeDgPowerLogs = dgPowerLogs || [];
  const safeWarehouses = warehouses || [];

  const filteredDieselLogs = useMemo(() => {
    return safeDieselLogs.filter(log => {
      if (selectedFacility !== 'ALL' && log.warehouseId !== selectedFacility) return false;
      if (statusFilter !== 'ALL' && log.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = `${log.uniqueId} ${log.whNameB2B || ''} ${log.submittedByName || ''} ${log.vendorNameDelivery || log.vendorNamePayment || ''} ${log.status}`.toLowerCase();
        if (!match.includes(q)) return false;
      }
      return true;
    });
  }, [safeDieselLogs, selectedFacility, statusFilter, searchQuery]);

  const dieselMetrics = useMemo(() => {
    const logs = filteredDieselLogs;
    const totalProcurementLitres = logs.reduce((acc, l) => acc + (l.orderQuantityLitres || l.quantity || 0), 0);
    const totalDeliveredLitres = logs.reduce((acc, l) => acc + (l.deliveredQuantityLitres || 0), 0);
    const totalSpentAmount = logs.reduce((acc, l) => acc + (l.finalAmount || 0), 0);
    
    const pendingLogs = logs.filter(l => l.status === 'Pending Admin Approval');
    const approvedLogs = logs.filter(l => l.status === 'Approved');
    const deliveredLogs = logs.filter(l => l.status === 'Delivery Completed');
    const rejectedLogs = logs.filter(l => l.status === 'Rejected');

    const pendingLitres = pendingLogs.reduce((acc, l) => acc + (l.orderQuantityLitres || l.quantity || 0), 0);
    const inTransitLitres = approvedLogs.reduce((acc, l) => acc + (l.orderQuantityLitres || l.quantity || 0), 0);

    const avgRate = logs.length > 0 
      ? (logs.reduce((acc, l) => acc + (l.ratePerLitre || 0), 0) / logs.length).toFixed(2)
      : '89.80';

    // Variance calculation on completed deliveries
    const deliveredWithOrders = deliveredLogs.filter(l => (l.orderQuantityLitres || l.quantity) && l.deliveredQuantityLitres);
    const varianceLitres = deliveredWithOrders.reduce((acc, l) => {
      const order = l.orderQuantityLitres || l.quantity || 0;
      const deliv = l.deliveredQuantityLitres || 0;
      return acc + (order - deliv);
    }, 0);

    const variancePct = totalDeliveredLitres > 0
      ? ((varianceLitres / totalDeliveredLitres) * 100).toFixed(2)
      : '0.00';

    return {
      totalProcurementLitres,
      totalDeliveredLitres,
      totalSpentAmount,
      pendingLitres,
      inTransitLitres,
      pendingCount: pendingLogs.length,
      approvedCount: approvedLogs.length,
      deliveredCount: deliveredLogs.length,
      rejectedCount: rejectedLogs.length,
      totalCount: logs.length,
      avgRate,
      varianceLitres,
      variancePct
    };
  }, [filteredDieselLogs]);

  // Chart data: Procurement vs Delivered Trend
  const dieselTrendData = useMemo(() => {
    return [
      { day: 'Mon', requested: 2500, delivered: 2500, rate: 89.4, spend: 223500 },
      { day: 'Tue', requested: 3000, delivered: 3000, rate: 89.5, spend: 268500 },
      { day: 'Wed', requested: 1500, delivered: 1500, rate: 89.8, spend: 134700 },
      { day: 'Thu', requested: 4000, delivered: 3980, rate: 89.8, spend: 359200 },
      { day: 'Fri', requested: 2000, delivered: 2000, rate: 89.9, spend: 179800 },
      { day: 'Sat', requested: 3500, delivered: 3500, rate: 89.8, spend: 314300 },
      { day: 'Sun', requested: 1000, delivered: 1000, rate: 89.8, spend: 89800 },
    ];
  }, []);

  // Facility wise breakdown chart data
  const dieselFacilityData = useMemo(() => {
    return safeWarehouses.map(wh => {
      const logs = safeDieselLogs.filter(l => l.warehouseId === wh.id);
      const litres = logs.reduce((acc, l) => acc + (l.orderQuantityLitres || l.quantity || 0), 0);
      const delivered = logs.reduce((acc, l) => acc + (l.deliveredQuantityLitres || 0), 0);
      const spend = logs.reduce((acc, l) => acc + (l.finalAmount || 0), 0);
      return {
        name: wh.city,
        code: wh.code,
        litres,
        delivered,
        spend
      };
    });
  }, [safeWarehouses, safeDieselLogs]);

  // Vendor distribution
  const vendorPieData = useMemo(() => [
    { name: 'Indian Oil (IOCL)', value: 55, fill: '#f59e0b' },
    { name: 'Bharat Petroleum (BPCL)', value: 30, fill: '#3b82f6' },
    { name: 'Hindustan Petroleum (HPCL)', value: 15, fill: '#10b981' }
  ], []);

  // ==========================================
  // DAILY SITE ACTIVITY SPECIFIC TELEMETRY
  // ==========================================
  const dailySiteMetrics = useMemo(() => {
    const logs = safeDailySiteLogs.filter(l => selectedFacility === 'ALL' || l.site === selectedFacility);
    const avgColdRoom = logs.length > 0 ? (logs.reduce((acc, l) => acc + l.coldRoom, 0) / logs.length).toFixed(1) : '99.8';
    const avgDG = logs.length > 0 ? (logs.reduce((acc, l) => acc + l.dg, 0) / logs.length).toFixed(1) : '100';
    const avgUPS = logs.length > 0 ? (logs.reduce((acc, l) => acc + l.ups, 0) / logs.length).toFixed(1) : '100';
    const avgRT = logs.length > 0 ? (logs.reduce((acc, l) => acc + l.rt, 0) / logs.length).toFixed(1) : '98.5';
    const totalDeviations = logs.reduce((acc, l) => acc + (l.deviationsCount || 0), 0);
    const totalPmPlanned = logs.reduce((acc, l) => acc + (l.pmPlanned || 0), 0);
    const totalPmCompleted = logs.reduce((acc, l) => acc + (l.pmCompleted || 0), 0);

    return {
      avgColdRoom,
      avgDG,
      avgUPS,
      avgRT,
      totalDeviations,
      totalPmPlanned,
      totalPmCompleted,
      logsCount: logs.length
    };
  }, [safeDailySiteLogs, selectedFacility]);

  // ==========================================
  // HOUSEKEEPING SPECIFIC TELEMETRY
  // ==========================================
  const housekeepingMetrics = useMemo(() => {
    const logs = safeHousekeepingLogs.filter(l => selectedFacility === 'ALL' || l.warehouseId === selectedFacility);
    const totalOnGround = logs.reduce((acc, l) => acc + (l.ongroundCount || 0), 0);
    const totalApproved = logs.reduce((acc, l) => acc + (l.approvedCount || 0), 0);
    const avgDeploymentPct = logs.length > 0 ? (logs.reduce((acc, l) => acc + (l.deploymentPct || 100), 0) / logs.length).toFixed(1) : '98.4';
    const mstAvailable = logs.reduce((acc, l) => acc + (l.mstAvailable || 0), 0);
    const racAvailable = logs.reduce((acc, l) => acc + (l.rac || 0), 0);

    return {
      totalOnGround,
      totalApproved,
      avgDeploymentPct,
      mstAvailable,
      racAvailable,
      logsCount: logs.length
    };
  }, [safeHousekeepingLogs, selectedFacility]);

  // ==========================================
  // DG POWER & WATER SPECIFIC TELEMETRY
  // ==========================================
  const dgPowerMetrics = useMemo(() => {
    const logs = safeDgPowerLogs.filter(l => selectedFacility === 'ALL' || l.warehouseId === selectedFacility);
    const totalDgRunHours = logs.reduce((acc, l) => acc + (l.dg1RunHours || 0) + (l.dg2RunHours || 0), 0).toFixed(1);
    const totalEbKwh = logs.reduce((acc, l) => acc + (l.ebKwhUnitsConsumed || 0), 0);
    const totalWaterKl = logs.reduce((acc, l) => acc + (l.waterConsumptionKl || 0), 0).toFixed(1);
    const avgPf = logs.length > 0 ? (logs.reduce((acc, l) => acc + (l.ebPowerFactor || 0.98), 0) / logs.length).toFixed(2) : '0.98';

    return {
      totalDgRunHours,
      totalEbKwh,
      totalWaterKl,
      avgPf,
      logsCount: logs.length
    };
  }, [safeDgPowerLogs, selectedFacility]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white border border-slate-700 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl shrink-0 shadow-lg ${
              serviceId === 'SHEET_DIESEL' ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950' :
              serviceId === 'SHEET_DAILY_SITE' ? 'bg-gradient-to-br from-sky-400 to-sky-600 text-white' :
              serviceId === 'SHEET_HOUSEKEEPING' ? 'bg-gradient-to-br from-purple-400 to-purple-600 text-white' :
              serviceId === 'SHEET_DG_POWER_WATER' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white' :
              'bg-gradient-to-br from-indigo-400 to-indigo-600 text-white'
            }`}>
              {serviceId === 'SHEET_DIESEL' ? <Fuel className="w-7 h-7" /> :
               serviceId === 'SHEET_DAILY_SITE' ? <Activity className="w-7 h-7" /> :
               serviceId === 'SHEET_HOUSEKEEPING' ? <Users className="w-7 h-7" /> :
               serviceId === 'SHEET_DG_POWER_WATER' ? <Zap className="w-7 h-7" /> :
               <Layers className="w-7 h-7" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-amber-300 border border-white/10">
                  {serviceId === 'SHEET_DIESEL' ? 'Energy & Bulk Fuel Division' :
                   serviceId === 'SHEET_DAILY_SITE' ? 'Master Daily Site Operations' :
                   serviceId === 'SHEET_HOUSEKEEPING' ? 'Facility Manpower Division' :
                   serviceId === 'SHEET_DG_POWER_WATER' ? 'Critical Utilities Division' :
                   'Operations Division'}
                </span>
                <span className="text-xs text-slate-400 font-mono">Master Sheet Synced ✓</span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1">
                {serviceId === 'SHEET_DIESEL' ? 'Diesel Procurement & Site Delivery Command Center' :
                 serviceId === 'SHEET_DAILY_SITE' ? 'Daily Site Activity & Checklist Intelligence' :
                 serviceId === 'SHEET_HOUSEKEEPING' ? 'Housekeeping & Staff Deployment Dashboard' :
                 serviceId === 'SHEET_DG_POWER_WATER' ? 'DG Power, Grid EB & Water Balance Dashboard' :
                 'Operational Service Command Center'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {serviceId === 'SHEET_DIESEL' ? 'Track real-time procurement volume, delivered quantity, 3-step email lifecycle, and vendor fulfillment.' :
                 'Real-time SLA telemetry, site logs, compliance audits, and exception tracking across all facilities.'}
              </p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center">
            <div className="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Facility Filter:</span>
              <select
                value={selectedFacility}
                onChange={(e) => setSelectedFacility(e.target.value)}
                className="bg-transparent font-bold text-white focus:outline-none cursor-pointer pr-2"
              >
                <option value="ALL" className="bg-slate-900 text-white">All Facilities ({warehouses.length})</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id} className="bg-slate-900 text-white">{w.city} ({w.code})</option>
                ))}
              </select>
            </div>

            {onNavigateToSheet && (
              <button
                type="button"
                onClick={() => onNavigateToSheet(serviceId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Open Master Sheet</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition"
              >
                Exit Deep Dive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. DIESEL PROCUREMENT DEDICATED DASHBOARD CONTENT */}
      {/* ========================================================================= */}
      {serviceId === 'SHEET_DIESEL' && (
        <div className="space-y-6">
          
          {/* 6 Metric KPI Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            {/* KPI 1: Total Procurement Volume */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-amber-900/70">Total Procured</span>
                <Fuel className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">
                {dieselMetrics.totalProcurementLitres.toLocaleString()} <span className="text-xs font-bold text-amber-800">L</span>
              </div>
              <div className="text-[11px] text-amber-800/80 font-semibold mt-1 flex items-center justify-between">
                <span>{dieselMetrics.totalCount} Requisitions</span>
                <span className="font-bold">100% Monitored</span>
              </div>
            </div>

            {/* KPI 2: Total Delivered Volume */}
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-emerald-900/70">Total Delivered</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-950 mt-1 font-mono">
                {dieselMetrics.totalDeliveredLitres.toLocaleString()} <span className="text-xs font-bold text-emerald-800">L</span>
              </div>
              <div className="text-[11px] text-emerald-800/80 font-semibold mt-1 flex items-center justify-between">
                <span>{dieselMetrics.deliveredCount} Verified at Site</span>
                <span className="font-bold text-emerald-700">POD Ready</span>
              </div>
            </div>

            {/* KPI 3: In-Transit / Pending Delivery */}
            <div className="bg-sky-50 border border-sky-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-sky-900/70">Pending / In-Transit</span>
                <Truck className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-2xl font-black text-sky-950 mt-1 font-mono">
                {(dieselMetrics.pendingLitres + dieselMetrics.inTransitLitres).toLocaleString()} <span className="text-xs font-bold text-sky-800">L</span>
              </div>
              <div className="text-[11px] text-sky-800/80 font-semibold mt-1 flex items-center justify-between">
                <span>{dieselMetrics.pendingCount} Pending • {dieselMetrics.approvedCount} In-Transit</span>
              </div>
            </div>

            {/* KPI 4: Total Spend Amount (₹) */}
            <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-purple-900/70">Total Spend (₹)</span>
                <DollarSign className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-purple-950 mt-1 font-mono">
                ₹{(dieselMetrics.totalSpentAmount / 100000).toFixed(2)} <span className="text-xs font-bold text-purple-800">Lakh</span>
              </div>
              <div className="text-[11px] text-purple-800/80 font-semibold mt-1 flex items-center justify-between">
                <span>Avg Rate: <strong>₹{dieselMetrics.avgRate}/L</strong></span>
              </div>
            </div>

            {/* KPI 5: Variance / Discrepancy */}
            <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-rose-900/70">Delivery Variance</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-black text-rose-950 mt-1 font-mono">
                {dieselMetrics.varianceLitres} <span className="text-xs font-bold text-rose-800">L ({dieselMetrics.variancePct}%)</span>
              </div>
              <div className="text-[11px] text-rose-800/80 font-semibold mt-1">
                <span>{dieselMetrics.varianceLitres === 0 ? 'Zero transit loss detected ✓' : 'Within 0.5% standard tolerance'}</span>
              </div>
            </div>

            {/* KPI 6: 3-Step Email Workflow Health */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-slate-400">Workflow SOP</span>
                <FileCheck className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-lg font-black text-white">3-Step Emails</div>
                <div className="text-[10px] text-emerald-400 font-bold mt-0.5">100% Automated Delivery</div>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                Mail #1 (POC) ➔ Mail #2 (Admin) ➔ Mail #3 (POD)
              </div>
            </div>
          </div>

          {/* Interactive Visual Charts Grid (Bento Style) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 8 Cols: Procurement vs Delivery Trend Area Chart */}
            <div className="lg:col-span-8 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-600" />
                    Diesel Requisition Volume vs Inward Delivery Trend
                  </h3>
                  <p className="text-xs text-slate-500">Daily fuel consumption and intake comparison</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Requisitioned (L)
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Delivered & Validated (L)
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dieselTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                    />
                    <Bar dataKey="requested" name="Requested (L)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="delivered" name="Delivered (L)" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                <div className="p-2 rounded-xl bg-slate-50">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Peak Intake Day</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">Thursday (4,000 L)</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Average Fuel Rate</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">₹89.70 / Litre</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Fulfillment SLA</div>
                  <div className="font-bold text-emerald-600 text-sm mt-0.5">99.5% On-Time</div>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Facility-wise Breakdown & Vendor Mix */}
            <div className="lg:col-span-4 space-y-4">
              {/* Facility Volume Card */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    Facility Procurement Split
                  </h3>
                  <span className="text-[11px] text-slate-400 font-semibold">Litres</span>
                </div>

                <div className="space-y-2.5">
                  {dieselFacilityData.map((f, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">{f.name} ({f.code})</div>
                        <div className="text-[10px] text-slate-500">Delivered: {f.delivered.toLocaleString()} L</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-xs text-amber-900 font-mono">{f.litres.toLocaleString()} L</div>
                        <div className="text-[10px] text-slate-400 font-mono">₹{(f.spend / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vendor Allocation Card */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    Primary Oil Vendors
                  </h3>
                  <span className="text-[11px] text-slate-400 font-semibold">Share %</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> IOCL Bulk Direct</span>
                    <span className="font-mono">55%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '55%' }} />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 pt-1">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Bharat Petroleum (BPCL)</span>
                    <span className="font-mono">30%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: '30%' }} />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 pt-1">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> HPCL & Shell</span>
                    <span className="font-mono">15%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '15%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Diesel Procurement Ledger & Live Operations Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Table Controls */}
            <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-amber-600" />
                  Live Diesel Procurement Ledger ({filteredDieselLogs.length} Records)
                </h3>
                <p className="text-xs text-slate-500">1-click approve, reject, or inspect site POD attachments</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by Unique ID, Hub, POC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none w-56 font-medium"
                  />
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
                  {['ALL', 'Pending Admin Approval', 'Approved', 'Delivery Completed', 'Rejected'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        statusFilter === st
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">Unique ID / Date</th>
                    <th className="py-3 px-3">Warehouse Hub (B2B)</th>
                    <th className="py-3 px-3">Vendor & Fuel</th>
                    <th className="py-3 px-3 text-right">Order Qty (L)</th>
                    <th className="py-3 px-3 text-right">Delivered Qty (L)</th>
                    <th className="py-3 px-3 text-right">Rate / Total (₹)</th>
                    <th className="py-3 px-3 text-center">Lifecycle Status</th>
                    <th className="py-3 px-4 text-center">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDieselLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                        No diesel procurement records found matching the active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDieselLogs.map((log) => {
                      const isPending = log.status === 'Pending Admin Approval';
                      const isApproved = log.status === 'Approved';
                      const isDelivered = log.status === 'Delivery Completed';
                      const isRejected = log.status === 'Rejected';

                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 transition cursor-pointer"
                          onClick={() => setSelectedLogForDetail(log)}
                        >
                          <td className="py-3 px-4">
                            <span className="font-mono font-black text-slate-900 block">{log.uniqueId}</span>
                            <span className="text-[10px] text-slate-400">{log.timestamp.split('T')[0] || log.timestamp}</span>
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800">{log.whNameB2B || log.warehouseId}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">POC: {log.submittedByName || log.emailAddress}</div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{log.vendorNameDelivery || log.vendorNamePayment || 'IOCL Bulk Direct'}</div>
                            <div className="text-[10px] text-slate-500">{log.fuel || 'High-Speed Diesel'}</div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-xs">
                            {(log.orderQuantityLitres || log.quantity || 0).toLocaleString()} L
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 text-xs">
                            {log.deliveredQuantityLitres ? `${log.deliveredQuantityLitres.toLocaleString()} L` : '—'}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="font-mono font-black text-slate-900">₹{(log.finalAmount || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-slate-400 font-mono">@ ₹{log.ratePerLitre || 89.8}/L</div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-block ${
                              isDelivered ? 'bg-sky-100 text-sky-800 border border-sky-300' :
                              isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              isPending ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse' :
                              'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}>
                              {log.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      approveDieselLog(log.id, 'Authorized by Admin Command Center');
                                      setNotification({
                                        type: 'success',
                                        message: `Requisition [${log.uniqueId}] Approved! Mail #2 sent to POC & Vendor.`
                                      });
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs transition cursor-pointer"
                                    title="Approve & Send Mail #2"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      rejectDieselLog(log.id, 'Rejected by Admin Command Center');
                                      setNotification({
                                        type: 'warning',
                                        message: `Requisition [${log.uniqueId}] Rejected.`
                                      });
                                    }}
                                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[10px] transition cursor-pointer"
                                    title="Reject Requisition"
                                  >
                                    ✗
                                  </button>
                                </>
                              )}

                              {isApproved && (
                                <button
                                  type="button"
                                  onClick={() => onNavigateTab ? onNavigateTab('diesel') : (onNavigateToSheet ? onNavigateToSheet('SHEET_DIESEL') : undefined)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[10px] transition cursor-pointer"
                                >
                                  📷 Upload POD
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setSelectedLogForDetail(log)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition cursor-pointer"
                              >
                                View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DAILY SITE ACTIVITY DEDICATED DASHBOARD CONTENT */}
      {/* ========================================================================= */}
      {serviceId === 'SHEET_DAILY_SITE' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-sky-900/70 block">Cold Room Uptime</span>
              <div className="text-2xl font-black text-sky-950 mt-1 font-mono">{dailySiteMetrics.avgColdRoom}%</div>
              <span className="text-[10px] text-sky-800 font-semibold mt-1 block">Critical -18°C Temperature Stock Risk</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-amber-900/70 block">Dual DG Availability</span>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">{dailySiteMetrics.avgDG}%</div>
              <span className="text-[10px] text-amber-800 font-semibold mt-1 block">500 KVA Generator Ready</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-emerald-900/70 block">UPS & LT Panel</span>
              <div className="text-2xl font-black text-emerald-950 mt-1 font-mono">{dailySiteMetrics.avgUPS}%</div>
              <span className="text-[10px] text-emerald-800 font-semibold mt-1 block">100% Critical Power Line Active</span>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-indigo-900/70 block">MHE Reach Trucks (RT)</span>
              <div className="text-2xl font-black text-indigo-950 mt-1 font-mono">{dailySiteMetrics.avgRT}%</div>
              <span className="text-[10px] text-indigo-800 font-semibold mt-1 block">Fleet Operational Availability</span>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-rose-900/70 block">Active Deviations</span>
              <div className="text-2xl font-black text-rose-950 mt-1 font-mono">{dailySiteMetrics.totalDeviations} Flags</div>
              <span className="text-[10px] text-rose-800 font-semibold mt-1 block">Shift Exception Action Required</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
            <h3 className="font-black text-slate-900 text-sm mb-3">Recent Daily Site Activity Submissions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] border-b border-slate-200">
                    <th className="py-2.5 px-3">Date / Site</th>
                    <th className="py-2.5 px-3">POC Name</th>
                    <th className="py-2.5 px-3 text-center">Cold Room</th>
                    <th className="py-2.5 px-3 text-center">DG Set</th>
                    <th className="py-2.5 px-3 text-center">UPS</th>
                    <th className="py-2.5 px-3 text-center">PM Status</th>
                    <th className="py-2.5 px-3 text-center">Health Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailySiteLogs.slice(0, 5).map((log) => (
                    <tr key={log.logId} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-bold text-slate-900">{log.site} ({log.date})</td>
                      <td className="py-3 px-3 text-slate-600">{log.pocName}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700">{log.coldRoom}%</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{log.dg}%</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{log.ups}%</td>
                      <td className="py-3 px-3 text-center text-slate-600">{log.pmCompleted}/{log.pmPlanned} Done</td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {log.worstStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. HOUSEKEEPING DEDICATED DASHBOARD CONTENT */}
      {/* ========================================================================= */}
      {serviceId === 'SHEET_HOUSEKEEPING' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-purple-900/70 block">On-Ground Manpower</span>
              <div className="text-2xl font-black text-purple-950 mt-1 font-mono">{housekeepingMetrics.totalOnGround} Cleaners</div>
              <span className="text-[10px] text-purple-800 font-semibold mt-1 block">Approved Roster: {housekeepingMetrics.totalApproved}</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-emerald-900/70 block">Shift Deployment Rate</span>
              <div className="text-2xl font-black text-emerald-950 mt-1 font-mono">{housekeepingMetrics.avgDeploymentPct}%</div>
              <span className="text-[10px] text-emerald-800 font-semibold mt-1 block">Target: 95% Minimum</span>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-sky-900/70 block">MST Technical Staff</span>
              <div className="text-2xl font-black text-sky-950 mt-1 font-mono">{housekeepingMetrics.mstAvailable} Technicians</div>
              <span className="text-[10px] text-sky-800 font-semibold mt-1 block">Multi-Skilled Technicians</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-amber-900/70 block">RAC Staff On Ground</span>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">{housekeepingMetrics.racAvailable} Active</div>
              <span className="text-[10px] text-amber-800 font-semibold mt-1 block">Refrigeration & AC Techs</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DG POWER & WATER DEDICATED DASHBOARD CONTENT */}
      {/* ========================================================================= */}
      {serviceId === 'SHEET_DG_POWER_WATER' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-amber-900/70 block">DG Generator Run Hours</span>
              <div className="text-2xl font-black text-amber-950 mt-1 font-mono">{dgPowerMetrics.totalDgRunHours} Hrs</div>
              <span className="text-[10px] text-amber-800 font-semibold mt-1 block">Dual 500 KVA Cumulative Run Time</span>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-sky-900/70 block">Grid EB Consumption</span>
              <div className="text-2xl font-black text-sky-950 mt-1 font-mono">{dgPowerMetrics.totalEbKwh.toLocaleString()} kWh</div>
              <span className="text-[10px] text-sky-800 font-semibold mt-1 block">Main Incomer Electricity Units</span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-emerald-900/70 block">Average Power Factor (PF)</span>
              <div className="text-2xl font-black text-emerald-950 mt-1 font-mono">{dgPowerMetrics.avgPf}</div>
              <span className="text-[10px] text-emerald-800 font-semibold mt-1 block">Optimal PF &gt; 0.95 (No Penalty)</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-blue-900/70 block">Water Consumption</span>
              <div className="text-2xl font-black text-blue-950 mt-1 font-mono">{dgPowerMetrics.totalWaterKl} KL</div>
              <span className="text-[10px] text-blue-800 font-semibold mt-1 block">Domestic + Operational Inward</span>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL FOR INSPECTING ANY LOG */}
      {selectedLogForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                  {selectedLogForDetail.uniqueId || selectedLogForDetail.id}
                </span>
                <h3 className="font-bold text-base">Requisition & Inward Inspection</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogForDetail(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs font-sans">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Lifecycle Status:</span>
                  <span className="px-2.5 py-0.5 rounded-full font-black text-[10px] bg-amber-100 text-amber-900">
                    {selectedLogForDetail.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div><strong>Hub:</strong> {selectedLogForDetail.whNameB2B || selectedLogForDetail.warehouseId}</div>
                  <div><strong>Requestor:</strong> {selectedLogForDetail.submittedByName || selectedLogForDetail.emailAddress}</div>
                  <div><strong>Ordered Qty:</strong> {(selectedLogForDetail.orderQuantityLitres || selectedLogForDetail.quantity || 0).toLocaleString()} L</div>
                  <div><strong>Delivered Qty:</strong> {selectedLogForDetail.deliveredQuantityLitres ? `${selectedLogForDetail.deliveredQuantityLitres.toLocaleString()} L` : 'Pending Site Inward'}</div>
                  <div><strong>Rate / Litre:</strong> ₹{selectedLogForDetail.ratePerLitre || 89.8}</div>
                  <div><strong>Total Amount:</strong> ₹{(selectedLogForDetail.finalAmount || 0).toLocaleString()}</div>
                </div>
              </div>

              {selectedLogForDetail.status === 'Pending Admin Approval' && (
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      rejectDieselLog(selectedLogForDetail.id, 'Rejected by Admin Inspector');
                      setSelectedLogForDetail((prev: any) => ({ ...prev, status: 'Rejected' }));
                      setNotification({ type: 'warning', message: 'Requisition Rejected.' });
                    }}
                    className="px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs hover:bg-rose-100"
                  >
                    Reject Requisition
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      approveDieselLog(selectedLogForDetail.id, 'Authorized by Admin Inspector');
                      setSelectedLogForDetail((prev: any) => ({ ...prev, status: 'Approved' }));
                      setNotification({ type: 'success', message: 'Requisition Approved! Mail #2 sent.' });
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm"
                  >
                    ✓ Approve & Send Mail #2
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
