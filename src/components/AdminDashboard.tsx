import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Building2,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Users,
  Fuel,
  Zap,
  Droplet,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Plus,
  Mail,
  Phone,
  Layers,
  Activity,
  Award,
  RefreshCw,
  Bell,
  Sliders,
  SlidersHorizontal,
  Share2,
  FileText,
  UserCheck
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
  Cell
} from 'recharts';
import { ServiceAssignment, DailySiteLog, HousekeepingLog, DGPowerWaterLog, DieselLog } from '../types';
import { PageHeader } from './common/PageHeader';
import { AdminServiceDeepDive } from './AdminServiceDeepDive';

interface AdminDashboardProps {
  onNavigateTab?: (tab: string) => void;
  onBack?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab, onBack }) => {
  const {
    currentUser,
    users = [],
    warehouses = [],
    serviceAssignments = [],
    updateServiceAssignment,
    dailySiteLogs = [],
    housekeepingLogs = [],
    dgPowerLogs = [],
    dieselLogs = [],
    currentDate,
    setCurrentDate,
    setNotification
  } = useApp();

  // Admin filter: Which Admin Lead is being viewed (Default to Sudhanshu Verma / Current User)
  const [selectedAdminId, setSelectedAdminId] = useState<string>('usr_super_01');
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>('ALL');
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('today');

  // Selected Service for the Right Inspection Pane
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  
  // Dedicated Service Deep-Dive Mode (e.g. 'SHEET_DIESEL', 'SHEET_DAILY_SITE', etc.)
  const [activeDeepDiveService, setActiveDeepDiveService] = useState<string | null>(null);

  // Verification & Audit Signoff Modal
  const [isSignoffModalOpen, setIsSignoffModalOpen] = useState(false);
  const [signoffNotes, setSignoffNotes] = useState('');
  const [signoffStatus, setSignoffStatus] = useState<'Verified' | 'Discrepancy'>('Verified');

  // New Event / Milestone Modal
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('14:30');
  const [newEventSite, setNewEventSite] = useState(warehouses[0]?.id || 'WH_FN_02');

  // AI Diagnostic Drawer / State
  const [isAIDiagnosticOpen, setIsAIDiagnosticOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Dynamic audit schedule events
  const [auditEvents, setAuditEvents] = useState([
    { id: 'EVT_01', time: '07:00', title: 'Morning Shift Handover & Headcount Audit', site: 'Farukhnagar Master DC (FN2)', service: 'Housekeeping & Security', status: 'Completed', icon: Users, color: 'text-emerald-700 bg-emerald-100' },
    { id: 'EVT_02', time: '09:30', title: 'DG Fuel Dipstick & Tank Level Calibration', site: 'Facility_Bangalore B4', service: 'DG Power & Water', status: 'Completed', icon: Zap, color: 'text-amber-700 bg-amber-100' },
    { id: 'EVT_03', time: '11:45', title: 'Bulk Diesel Inward & Flowmeter Verification', site: 'Delhi Hub (D1)', service: 'Diesel & Fuel', status: 'In-Progress', icon: Fuel, color: 'text-blue-700 bg-blue-100' },
    { id: 'EVT_04', time: '15:00', title: 'Cold Room Deep Freezer Defrost Audit (-18°C)', site: 'Facility_Hyderabad H3', service: 'Cold Room & Chiller', status: 'Upcoming', icon: Activity, color: 'text-purple-700 bg-purple-100' },
    { id: 'EVT_05', time: '18:30', title: 'Crate Sanitization PPM & Wash Bay Pressure', site: 'Farukhnagar Master DC (FN2)', service: 'Crate Washing', status: 'Upcoming', icon: Droplet, color: 'text-teal-700 bg-teal-100' }
  ]);

  // Distinct Admin Supervisors
  const distinctAdmins = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    
    // Add all Admin users from AppContext users
    users
      .filter(u => u.role === 'SUPER_ADMIN' || u.role === 'SERVICE_ADMIN' || u.role === 'WAREHOUSE_ADMIN')
      .forEach(u => {
        map.set(u.id, { id: u.id, name: u.fullName, email: u.email });
      });

    // Also populate from serviceAssignments
    serviceAssignments.forEach(s => {
      if (s.adminLeadId && s.adminLeadName && !map.has(s.adminLeadId)) {
        map.set(s.adminLeadId, { id: s.adminLeadId, name: s.adminLeadName, email: s.adminLeadEmail });
      }
    });

    return Array.from(map.values());
  }, [users, serviceAssignments]);

  const activeAdmin = useMemo(() => {
    return distinctAdmins.find(a => a.id === selectedAdminId) || distinctAdmins[0];
  }, [distinctAdmins, selectedAdminId]);

  // Filtered Services assigned to the selected Admin
  const adminAssignedServices = useMemo(() => {
    const selectedUser = users.find(u => u.id === selectedAdminId);
    const isSuper = selectedUser?.role === 'SUPER_ADMIN' || selectedAdminId === 'usr_super_01' || selectedAdminId === 'ALL';

    return serviceAssignments.filter(s => {
      // If not super admin, filter by admin lead id, email or assigned service IDs
      if (!isSuper) {
        const matchesId = s.adminLeadId === selectedAdminId;
        const matchesEmail = s.adminLeadEmail?.toLowerCase() === selectedUser?.email.toLowerCase();
        const matchesAssigned = selectedUser?.assignedServiceIds?.includes(s.serviceId);
        if (!matchesId && !matchesEmail && !matchesAssigned) {
          return false;
        }
      }

      // Facility filter
      if (selectedFacilityFilter !== 'ALL' && s.warehouseId !== selectedFacilityFilter) {
        return false;
      }

      // Category filter
      if (selectedServiceCategory !== 'ALL' && s.serviceCategory !== selectedServiceCategory && s.serviceId !== selectedServiceCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${s.serviceName} ${s.serviceCode} ${s.warehouseName} ${s.primaryPocName} ${s.serviceCategory}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [serviceAssignments, selectedAdminId, users, selectedFacilityFilter, selectedServiceCategory, searchQuery]);

  // Set default selected service if none selected or if current selection is invalid
  const activeService = useMemo(() => {
    if (selectedServiceId) {
      const found = adminAssignedServices.find(s => s.id === selectedServiceId);
      if (found) return found;
    }
    return adminAssignedServices[0] || serviceAssignments[0];
  }, [adminAssignedServices, selectedServiceId, serviceAssignments]);

  // Service-specific real telemetry calculation based on the active service
  const serviceTelemetry = useMemo(() => {
    if (!activeService) return null;

    const sId = activeService.serviceId;
    const whId = activeService.warehouseId;

    if (sId === 'SHEET_DIESEL') {
      const logs = dieselLogs.filter(d => whId === 'GLOBAL_ALL' || d.warehouseId === whId);
      const totalOrdered = logs.reduce((sum, d) => sum + (d.orderQuantityLitres || 0), 0);
      const totalDelivered = logs.reduce((sum, d) => sum + (d.deliveredQuantityLitres || 0), 0);
      const avgRate = logs.length > 0 ? (logs.reduce((sum, d) => sum + (d.ratePerLitre || 0), 0) / logs.length).toFixed(1) : '89.4';
      const verifiedCount = logs.filter(d => d.validation === 'Delivered').length;
      return {
        type: 'DIESEL',
        title: 'Diesel Inward & Bulk Tank Stock',
        primaryMetric: `${totalDelivered.toLocaleString()} Liters`,
        subLabel: 'Total Diesel Received (MTD)',
        kpi1: { label: 'Avg Fuel Rate', value: `₹${avgRate}/L` },
        kpi2: { label: 'Variance Discrepancy', value: `${totalOrdered - totalDelivered} L`, color: totalOrdered === totalDelivered ? 'text-emerald-700' : 'text-amber-700' },
        kpi3: { label: 'Audit Verification Rate', value: `${logs.length > 0 ? Math.round((verifiedCount / logs.length) * 100) : 100}%` },
        latestLog: logs[0]
      };
    }

    if (sId === 'SHEET_HOUSEKEEPING') {
      const logs = (housekeepingLogs || []).filter(h => whId === 'GLOBAL_ALL' || h.warehouseId === whId);
      const latest = logs[0] || { ongroundCount: 18, approvedCount: 18, mstAvailable: 2, rac: 1, hkSupervisor: 1, agency: 'SMS', deploymentPct: 100 };
      const avgDeploy = logs.length > 0 ? Math.round(logs.reduce((sum, l) => sum + (l.deploymentPct || 100), 0) / logs.length) : 98;
      return {
        type: 'HOUSEKEEPING',
        title: 'Housekeeping Deployment & Agency Roster',
        primaryMetric: `${latest.ongroundCount} on Ground`,
        subLabel: `Approved Headcount: ${latest.approvedCount} (${latest.agency})`,
        kpi1: { label: 'Shift Deployment %', value: `${latest.deploymentPct}%`, color: latest.deploymentPct >= 95 ? 'text-emerald-700' : 'text-rose-700' },
        kpi2: { label: 'MST / RAC Staff Available', value: `${latest.mstAvailable} MST • ${latest.rac} RAC` },
        kpi3: { label: 'HK Supervisors On Duty', value: `${latest.hkSupervisor} Active` },
        latestLog: latest
      };
    }

    if (sId === 'SHEET_DG_POWER_WATER') {
      const logs = (dgPowerLogs || []).filter(g => whId === 'GLOBAL_ALL' || g.warehouseId === whId);
      const latest = logs[0] || { dg1RunHours: 3.5, dg2RunHours: 1.2, ebKwhUnitsConsumed: 1420, ebPowerFactor: 0.98, govtSupplyHours: 21.5, waterConsumptionKl: 18.5 };
      return {
        type: 'DG_POWER',
        title: 'DG Sets, Grid EB Power & Water Balance',
        primaryMetric: `${(latest.dg1RunHours + latest.dg2RunHours).toFixed(1)} Run Hrs`,
        subLabel: 'Total Dual 500 KVA Generator Run Time',
        kpi1: { label: 'Grid EB Consumption', value: `${latest.ebKwhUnitsConsumed} Units` },
        kpi2: { label: 'Power Factor (PF)', value: `${latest.ebPowerFactor}`, color: latest.ebPowerFactor >= 0.95 ? 'text-emerald-700' : 'text-amber-700' },
        kpi3: { label: 'Daily Water Used', value: `${latest.waterConsumptionKl} KL` },
        latestLog: latest
      };
    }

    // Default / Master Daily Site Log
    const logs = (dailySiteLogs || []).filter(d => whId === 'GLOBAL_ALL' || d.site === whId);
    const latest = logs[0] || { ups: 100, dg: 100, coldRoom: 100, rt: 100, deviationsCount: 0, worstStatus: 'clear' as const };
    const ltPanelVal = (latest as any).ltPanel ?? 100;
    return {
      type: 'DAILY_SITE',
      title: 'Master Site Activity & Utility Uptime',
      primaryMetric: `${latest.coldRoom}% Cold Room Uptime`,
      subLabel: 'Critical Temperature & Chiller Reliability',
      kpi1: { label: 'UPS & LT Panel Uptime', value: `${latest.ups}% • ${ltPanelVal}%` },
      kpi2: { label: 'MHE Reach Trucks (RT)', value: `${latest.rt}% Fleet Ready` },
      kpi3: { label: 'Active Deviations', value: `${latest.deviationsCount} Flags`, color: latest.deviationsCount === 0 ? 'text-emerald-700' : 'text-rose-700' },
      latestLog: latest
    };
  }, [activeService, dieselLogs, housekeepingLogs, dgPowerLogs, dailySiteLogs]);

  // Chart Data: Hourly / Daily Performance for the Pastel Bento Chart (Yellow Tile)
  const barChartData = useMemo(() => [
    { time: '06:00', volume: 85, benchmark: 90, label: 'Shift 1' },
    { time: '09:00', volume: 140, benchmark: 110, label: 'Peak Ops' },
    { time: '12:00', volume: 195, benchmark: 150, highlight: true, label: 'Audit Midday' },
    { time: '15:00', volume: 130, benchmark: 120, label: 'Shift 2' },
    { time: '18:00', volume: 165, benchmark: 140, label: 'Evening' },
    { time: '21:00', volume: 95, benchmark: 100, label: 'Night Handover' }
  ], []);

  // Chart Data: Smooth Sparkline Area for Pink Bento Chart
  const sparklineData = useMemo(() => [
    { time: '10:00', val: 24, efficiency: 94 },
    { time: '10:30', val: 28, efficiency: 95 },
    { time: '11:00', val: 22, efficiency: 96 },
    { time: '11:30', val: 35, efficiency: 93 },
    { time: '12:00', val: 48, efficiency: 98, peak: true },
    { time: '12:30', val: 31, efficiency: 96 },
    { time: '13:00', val: 26, efficiency: 95 },
    { time: '13:30', val: 29, efficiency: 97 }
  ], []);

  // Execute Digital Verification Stamp
  const handleConfirmSignoff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeService) return;

    updateServiceAssignment(activeService.id, {
      status: signoffStatus === 'Verified' ? 'ACTIVE' : 'AUDIT_PENDING',
      notes: `${signoffNotes} [Signed by ${activeAdmin.name} on ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`
    });

    setNotification({
      type: signoffStatus === 'Verified' ? 'success' : 'warning',
      message: `Audit status stamped as "${signoffStatus}" for ${activeService.serviceName} at ${activeService.warehouseName}.`
    });

    setIsSignoffModalOpen(false);
  };

  // Add Operational Milestone
  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const wh = warehouses.find(w => w.id === newEventSite);
    const newEvt = {
      id: `EVT_${Date.now()}`,
      time: newEventTime,
      title: newEventTitle,
      site: wh?.name || newEventSite,
      service: activeService?.serviceName || 'Operations Check',
      status: 'Upcoming',
      icon: Activity,
      color: 'text-indigo-700 bg-indigo-100'
    };

    setAuditEvents(prev => [newEvt, ...prev]);
    setNotification({
      type: 'success',
      message: `Added new milestone "${newEventTitle}" for ${newEventTime}.`
    });
    setNewEventTitle('');
    setIsEventModalOpen(false);
  };

  // Run AI Health & Anomaly Diagnostics
  const handleRunAIDiagnostic = () => {
    setIsAnalyzing(true);
    setIsAIDiagnosticOpen(true);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 800);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* Top Header Banner with Role and Back Navigation */}
      <PageHeader
        title="Admin Intelligence & Service-Wise Operational Hub"
        subtitle={`Service accountability dashboard for ${activeAdmin.name}. Monitor assigned telemetry, review site POC logs, and execute shift audit sign-offs.`}
        categoryBadge="Admin Control Center"
        categoryColor="bg-amber-100 text-amber-900 border-amber-300"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Administration' },
          { label: 'Admin Service Dashboard' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunAIDiagnostic}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-100" />
              <span>AI Anomaly Radar</span>
            </button>
            <button
              onClick={() => onNavigateTab && onNavigateTab('serviceAssignments')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Configure Assignments</span>
            </button>
          </div>
        }
      />

      {/* Top Prominent Service Dashboard Navigation Bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2">Service Views:</span>
        <button
          type="button"
          onClick={() => setActiveDeepDiveService(null)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            activeDeepDiveService === null
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Multi-Service Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDeepDiveService('SHEET_DIESEL')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            activeDeepDiveService === 'SHEET_DIESEL'
              ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-300'
              : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80'
          }`}
        >
          <Fuel className="w-3.5 h-3.5 text-amber-600" />
          <span>Diesel Procurement (Total & Delivered)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] bg-amber-200 text-amber-950 font-black">LIVE</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDeepDiveService('SHEET_DAILY_SITE')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            activeDeepDiveService === 'SHEET_DAILY_SITE'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200/80'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-sky-600" />
          <span>Daily Site Activity & Checklist</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDeepDiveService('SHEET_HOUSEKEEPING')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            activeDeepDiveService === 'SHEET_HOUSEKEEPING'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200/80'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-purple-600" />
          <span>Housekeeping & Manpower</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDeepDiveService('SHEET_DG_POWER_WATER')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            activeDeepDiveService === 'SHEET_DG_POWER_WATER'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-600" />
          <span>DG Power, Grid EB & Water</span>
        </button>
      </div>

      {/* Conditionally render Dedicated Deep Dive Dashboard or General Overview */}
      {activeDeepDiveService ? (
        <AdminServiceDeepDive
          serviceId={activeDeepDiveService}
          onClose={() => setActiveDeepDiveService(null)}
          onNavigateToSheet={() => onNavigateTab && onNavigateTab('database')}
          onNavigateTab={onNavigateTab}
        />
      ) : (
      /* Main Bento Aesthetic Canvas (Matching Uploaded Soft Dashboard Theme) */
      <div className="bg-[#FAF9F5] p-5 sm:p-7 rounded-3xl border border-amber-200/50 shadow-sm space-y-6">
        
        {/* Top Floating Search & Service Filter Pills */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search bar pill with embedded category tags */}
          <div className="flex-1 bg-white rounded-2xl p-1.5 pl-4 border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search service, POC name, facility, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[140px] text-xs bg-transparent focus:outline-none text-slate-800 font-medium placeholder:text-slate-400"
            />
            <div className="hidden sm:flex items-center gap-1 border-l border-slate-200 pl-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">In:</span>
              <button
                onClick={() => setSelectedServiceCategory('ALL')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                  selectedServiceCategory === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedServiceCategory('Daily Operations')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                  selectedServiceCategory === 'Daily Operations' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Daily Ops
              </button>
              <button
                onClick={() => setSelectedServiceCategory('Energy & Fuel')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                  selectedServiceCategory === 'Energy & Fuel' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Energy & Fuel
              </button>
              <button
                onClick={() => setSelectedServiceCategory('Manpower')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                  selectedServiceCategory === 'Manpower' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Manpower
              </button>
            </div>
          </div>

          {/* Right Toolbar: Admin Lead Persona Dropdown */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <div className="text-left">
                <span className="text-[9px] font-extrabold uppercase text-slate-400 block leading-tight">Admin In-Charge</span>
                <select
                  value={selectedAdminId}
                  onChange={(e) => setSelectedAdminId(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">All Admin Leads (Full Network)</option>
                  {distinctAdmins.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-2xs">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <div className="text-left">
                <span className="text-[9px] font-extrabold uppercase text-slate-400 block leading-tight">Facility</span>
                <select
                  value={selectedFacilityFilter}
                  onChange={(e) => setSelectedFacilityFilter(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">All 4 Facilities</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.city} ({w.code})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Big Greeting Card with Friendly Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Good day, {activeAdmin.name.split(' ')[0]}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              You have <strong className="text-slate-900">{adminAssignedServices.length} assigned services</strong> across <strong className="text-slate-900">{warehouses.length} facilities</strong>. {auditEvents.filter(e => e.status !== 'Completed').length} live verification milestones require your review today.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSelectedServiceCategory('ALL')}
              className="text-xs font-extrabold text-slate-700 hover:text-slate-900 underline flex items-center gap-1 cursor-pointer"
            >
              <span>Show all services ({serviceAssignments.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Pastel Bento KPI Cards (Yellow, Pink, Olive, Sky Blue) + Right-side Shift Calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left 8 Cols: 2x2 Pastel Bento Grid */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* 1. Yellow Bento Card: Primary Service Turnout & Volume */}
            <div className="bg-[#FEF7D9] rounded-3xl p-5 border border-amber-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden group hover:shadow-xs transition duration-200">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-300/20 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-black text-amber-950/80 uppercase tracking-wider block">Service Output & Uptime:</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-amber-950 tracking-tight">
                      {serviceTelemetry?.primaryMetric || '14 Sites'}
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-900/70 font-semibold block mt-0.5">
                    {serviceTelemetry?.subLabel || 'Active Shifts Monitored'}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-2xl bg-amber-400/30 flex items-center justify-center text-amber-950 font-black">
                  <Activity className="w-4 h-4" />
                </div>
              </div>

              {/* Mini Custom Bar Chart in Yellow Bento */}
              <div className="mt-4 pt-3 border-t border-amber-300/40">
                <div className="h-20 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#78350f', fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                      />
                      <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                        {barChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.highlight ? '#1c1917' : '#f59e0b'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-amber-950/80 mt-1">
                  <span>07:30 AM (Shift Start)</span>
                  <button
                    type="button"
                    onClick={() => setActiveDeepDiveService(activeService?.serviceId || 'SHEET_DIESEL')}
                    className="bg-amber-400/60 hover:bg-amber-400 px-2 py-0.5 rounded-full text-amber-950 font-black cursor-pointer transition"
                  >
                    Open Deep Dive Dashboard ➔
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Soft Pink Bento Card: Efficiency & Sparkline Trend */}
            <div className="bg-[#FDE2EC] rounded-3xl p-5 border border-rose-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden group hover:shadow-xs transition duration-200">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-300/20 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-black text-rose-950/80 uppercase tracking-wider block">Consumption & Trend:</span>
                    <div className="flex items-baseline gap-3 mt-1.5 text-xs text-rose-950">
                      <div>
                        <span className="font-extrabold text-base block font-mono">24 min</span>
                        <span className="text-[10px] text-rose-900/60 uppercase font-bold">Average</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-base block font-mono">15 min</span>
                        <span className="text-[10px] text-rose-900/60 uppercase font-bold">Minimum</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-base block font-mono">01:30 h</span>
                        <span className="text-[10px] text-rose-900/60 uppercase font-bold">Maximum</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-2xl bg-rose-400/30 flex items-center justify-center text-rose-950 font-black">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Smooth Area Curve in Pink Bento */}
              <div className="mt-3 pt-2">
                <div className="h-16 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#e11d48" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#e11d48" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="val" stroke="#be123c" strokeWidth={2.5} fillOpacity={1} fill="url(#roseGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-rose-950/70">
                  <span>10:30</span>
                  <span>11:30</span>
                  <span className="text-rose-950 font-black">• 12:00</span>
                  <span>13:00</span>
                  <span>13:30</span>
                </div>
              </div>
            </div>

            {/* 3. Soft Olive / Green Bento Card: Health Condition Index */}
            <div className="bg-[#E3EBD7] rounded-3xl p-5 border border-emerald-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden group hover:shadow-xs transition duration-200">
              <div>
                <span className="text-xs font-black text-emerald-950/80 uppercase tracking-wider block">By Health & Compliance:</span>
                <div className="flex items-baseline gap-4 mt-2">
                  <div>
                    <span className="text-2xl font-black text-emerald-950">14 Sites</span>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block tracking-wider">STABLE (100%)</span>
                  </div>
                  <div>
                    <span className="text-2xl font-black text-amber-900">3 Sites</span>
                    <span className="text-[10px] font-bold text-amber-800 uppercase block tracking-wider">FAIR REVIEW</span>
                  </div>
                  <div>
                    <span className="text-2xl font-black text-rose-900">1 Site</span>
                    <span className="text-[10px] font-bold text-rose-800 uppercase block tracking-wider">CRITICAL RISK</span>
                  </div>
                </div>
              </div>

              {/* Progress visual bar */}
              <div className="space-y-1.5 mt-3 pt-2 border-t border-emerald-300/40">
                <div className="flex items-center justify-between text-[10px] font-bold text-emerald-950/80">
                  <span>Audit Pass Rate</span>
                  <span className="font-mono font-black">94.8% SLA Met</span>
                </div>
                <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden flex">
                  <div className="bg-emerald-700 h-full" style={{ width: '78%' }} />
                  <div className="bg-amber-500 h-full" style={{ width: '16%' }} />
                  <div className="bg-rose-500 h-full" style={{ width: '6%' }} />
                </div>
              </div>
            </div>

            {/* 4. Soft Sky / Lavender Blue Bento Card: Sessions & Response SLAs */}
            <div className="bg-[#DFECF8] rounded-3xl p-5 border border-sky-200/80 shadow-2xs flex flex-col justify-between relative overflow-hidden group hover:shadow-xs transition duration-200">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-black text-sky-950/80 uppercase tracking-wider block">Filing Sessions & SLAs:</span>
                    <div className="flex items-baseline gap-3 mt-1.5 text-xs text-sky-950">
                      <div>
                        <span className="font-extrabold text-base block font-mono">03:45 h</span>
                        <span className="text-[10px] text-sky-900/60 uppercase font-bold">Avg Filing Window</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-base block font-mono">02:00 min</span>
                        <span className="text-[10px] text-sky-900/60 uppercase font-bold">Fastest POC</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-base block font-mono">00:24 h</span>
                        <span className="text-[10px] text-sky-900/60 uppercase font-bold">SLA Buffer</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-2xl bg-sky-400/30 flex items-center justify-center text-sky-950 font-black">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold text-sky-950 mt-3 pt-2 border-t border-sky-300/40">
                <span className="flex items-center gap-1 text-sky-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  All 4 Hubs On-Time Today
                </span>
                <span className="bg-sky-200/70 px-2 py-0.5 rounded-full text-[10px] font-mono">
                  SLA: 2.0h
                </span>
              </div>
            </div>

          </div>

          {/* Right 4 Cols: Interactive Shift Calendar & Scheduled Audits */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">August 2026</span>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Month Mini Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 pt-3">
                <span>MO</span><span>TU</span><span>WE</span><span>TH</span><span>FR</span><span>SA</span><span>SU</span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-700 pt-2">
                <span className="text-slate-300">28</span>
                <span className="text-slate-300">29</span>
                <span className="text-slate-300">30</span>
                <span className="text-slate-300">31</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>

                <span>4</span>
                <span>5</span>
                <span>6</span>
                <span>7</span>
                <span>8</span>
                <span>9</span>
                <span>10</span>

                <span>11</span>
                <span>12</span>
                <span>13</span>
                <span>14</span>
                <span>15</span>
                <span>16</span>
                <span>17</span>

                <span>18</span>
                <span className="bg-slate-900 text-white rounded-full flex items-center justify-center w-7 h-7 mx-auto shadow-2xs font-black">19</span>
                <span className="relative font-black text-amber-600">
                  20
                  <span className="w-1 h-1 bg-amber-500 rounded-full absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                </span>
                <span>21</span>
                <span>22</span>
                <span>23</span>
                <span>24</span>
              </div>
            </div>

            {/* Quick Add Event Trigger */}
            <div className="pt-4 border-t border-slate-100 mt-3">
              <button
                onClick={() => setIsEventModalOpen(true)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>+ Schedule Shift Audit Milestone</span>
              </button>
            </div>
          </div>

        </div>

        {/* Split Section: Assigned Services List (Left) + Service & Audit Detail Inspector (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
          
          {/* Left Column (5 Cols): Assigned Services Accordion List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                <span>My Assigned Services ({adminAssignedServices.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold">Click to inspect</span>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {adminAssignedServices.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  No services found matching the active filters.
                </div>
              ) : (
                adminAssignedServices.map((service) => {
                  const isSelected = activeService?.id === service.id;
                  const isAudit = service.status === 'AUDIT_PENDING';

                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : isAudit
                          ? 'bg-amber-50/80 hover:bg-amber-100/70 border-amber-200 text-slate-800'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950'
                            : service.serviceId === 'SHEET_DIESEL'
                            ? 'bg-blue-100 text-blue-700'
                            : service.serviceId === 'SHEET_HOUSEKEEPING'
                            ? 'bg-purple-100 text-purple-700'
                            : service.serviceId === 'SHEET_DG_POWER_WATER'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {service.serviceId === 'SHEET_DIESEL' ? (
                            <Fuel className="w-4 h-4" />
                          ) : service.serviceId === 'SHEET_HOUSEKEEPING' ? (
                            <Users className="w-4 h-4" />
                          ) : service.serviceId === 'SHEET_DG_POWER_WATER' ? (
                            <Zap className="w-4 h-4" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {service.serviceName}
                          </div>
                          <div className={`text-[11px] flex items-center gap-1.5 mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            <span className="font-semibold">{service.warehouseName}</span>
                            <span>•</span>
                            <span className="truncate max-w-[100px]">POC: {service.primaryPocName.split(' ')[0]}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border block ${
                          isSelected
                            ? 'bg-slate-800 text-amber-300 border-slate-700'
                            : service.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {service.status}
                        </span>
                        <span className={`text-[10px] font-mono mt-1 block ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                          SLA: {service.slaHours}h
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column (7 Cols): Comprehensive Service & Audit Inspector (Pink Highlighted Card) */}
          <div className="lg:col-span-7">
            {activeService ? (
              <div className="bg-[#FCE8F0] rounded-3xl p-6 border border-rose-200/90 shadow-2xs space-y-5">
                
                {/* Inspector Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-rose-300/40">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200/80 text-rose-950 font-bold">
                        {activeService.serviceCode}
                      </span>
                      <span className="text-[10px] font-bold text-rose-800 bg-rose-200/50 px-2 py-0.5 rounded-full">
                        {activeService.serviceCategory}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-rose-950 mt-1">
                      {activeService.serviceName}
                    </h3>
                    <p className="text-xs text-rose-900/70 font-semibold mt-0.5">
                      Facility: <strong>{activeService.warehouseName}</strong> ({activeService.warehouseCode})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsSignoffModalOpen(true)}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                      <span>Audit Sign-off</span>
                    </button>
                  </div>
                </div>

                {/* Assigned Site POC Contact Card */}
                <div className="bg-white/80 backdrop-blur-xs rounded-2xl p-4 border border-rose-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center font-black text-xs shrink-0">
                      {activeService.primaryPocName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-rose-900/60 uppercase block">Assigned Site POC</span>
                      <span className="font-extrabold text-xs text-slate-900">{activeService.primaryPocName}</span>
                      <span className="text-[11px] text-slate-500 block font-mono">{activeService.primaryPocEmail}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`mailto:${activeService.primaryPocEmail}?subject=Operational Review: ${activeService.serviceName}`}
                      className="p-2 bg-white rounded-xl text-slate-700 hover:text-indigo-600 border border-slate-200 shadow-2xs transition"
                      title="Email Site POC"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`tel:+919876543210`}
                      className="p-2 bg-white rounded-xl text-slate-700 hover:text-emerald-600 border border-slate-200 shadow-2xs transition"
                      title="Call Site POC"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Dynamic Telemetry Readings for Selected Service */}
                {serviceTelemetry && (
                  <div className="space-y-3">
                    <span className="text-xs font-black text-rose-950 uppercase tracking-wider block">
                      Live Telemetry & Shift Verification ({serviceTelemetry.title})
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white/80 p-3.5 rounded-2xl border border-rose-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">{serviceTelemetry.kpi1.label}</span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block font-mono">{serviceTelemetry.kpi1.value}</span>
                      </div>

                      <div className="bg-white/80 p-3.5 rounded-2xl border border-rose-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">{serviceTelemetry.kpi2.label}</span>
                        <span className={`text-sm font-black mt-0.5 block font-mono ${serviceTelemetry.kpi2.color || 'text-slate-900'}`}>
                          {serviceTelemetry.kpi2.value}
                        </span>
                      </div>

                      <div className="bg-white/80 p-3.5 rounded-2xl border border-rose-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">{serviceTelemetry.kpi3.label}</span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block font-mono">{serviceTelemetry.kpi3.value}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Handover & Operating Notes */}
                <div className="bg-rose-100/50 rounded-2xl p-3.5 border border-rose-200/80 text-xs text-rose-950 leading-relaxed">
                  <strong className="block mb-1 text-[11px] uppercase tracking-wider text-rose-900">Governance & Escalation Protocol:</strong>
                  {activeService.notes || 'Routine daily monitoring. In case of unresolved telemetry deviation > 2 hours, notify regional technical head immediately.'}
                </div>

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-300/40">
                  <span className="text-[11px] text-rose-900/70 font-mono">
                    Last Verified: {new Date().toLocaleDateString('en-GB')} • Shift Morning
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveDeepDiveService(activeService.serviceId)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Open Dedicated {activeService.serviceName.split(' ')[0]} Dashboard ➔</span>
                    </button>
                    <button
                      onClick={() => onNavigateTab && onNavigateTab('database')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>View Sheet Data</span>
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center text-slate-400 text-xs">
                Select a service from the list on the left to inspect telemetry.
              </div>
            )}
          </div>

        </div>

        {/* Operational Timeline: Today's Shift Milestones */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="font-black text-xs uppercase tracking-wider text-slate-900">
                Today's Shift Timeline & Scheduled Audit Milestones
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-semibold">
              Live automated schedule
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {auditEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black font-mono text-slate-900">{evt.time}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                    evt.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : evt.status === 'In-Progress' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {evt.status}
                  </span>
                </div>
                <div className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                  {evt.title}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  {evt.site}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      )}

      {/* MODAL: Audit Verification & Digital Sign-off */}
      {isSignoffModalOpen && activeService && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300 font-bold">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Digital Audit Sign-off</h3>
                  <p className="text-xs text-indigo-200/80">{activeService.serviceName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsSignoffModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSignoff} className="p-6 space-y-4 text-xs font-sans">
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400">Target Facility</span>
                <div className="font-bold text-slate-800 text-xs">{activeService.warehouseName}</div>
                <div className="text-slate-500">Site POC: {activeService.primaryPocName}</div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Verification Outcome</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignoffStatus('Verified')}
                    className={`py-2 px-3 rounded-xl font-bold border text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      signoffStatus === 'Verified'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-400 ring-2 ring-emerald-300'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Approve & Verify</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSignoffStatus('Discrepancy')}
                    className={`py-2 px-3 rounded-xl font-bold border text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      signoffStatus === 'Discrepancy'
                        ? 'bg-amber-50 text-amber-800 border-amber-400 ring-2 ring-amber-300'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Flag Variance</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Admin Audit Remarks / Notes</label>
                <textarea
                  rows={3}
                  value={signoffNotes}
                  onChange={(e) => setSignoffNotes(e.target.value)}
                  placeholder="e.g. Verified fuel receipt readings and tank flowmeter logs. All parameters within tolerance."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-amber-500 font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSignoffModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-amber-400" />
                  Apply Digital Sign-off Stamp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Shift Audit Milestone */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Schedule Audit Milestone</h3>
                  <p className="text-xs text-indigo-200/80">Add operational check event to timeline</p>
                </div>
              </div>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMilestone} className="p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Milestone Title *</label>
                <input
                  type="text"
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="e.g. DG Battery Voltage Calibration"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Scheduled Time</label>
                  <input
                    type="time"
                    required
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Target Facility</label>
                  <select
                    value={newEventSite}
                    onChange={(e) => setNewEventSite(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.city} ({w.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Save Milestone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: AI Anomaly Radar & Operational Diagnostics */}
      {isAIDiagnosticOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="p-5 bg-gradient-to-r from-amber-500 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">AI Operational Anomaly Radar</h3>
                  <p className="text-xs text-amber-100">Live predictive telemetry scan</p>
                </div>
              </div>
              <button
                onClick={() => setIsAIDiagnosticOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {isAnalyzing ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                  <span>Scanning 4 facilities and 15 operational data sheets...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Diesel Fuel Rates & POD Verification: OPTIMAL</span>
                    </div>
                    <p className="text-emerald-800 text-[11px] leading-relaxed">
                      Zero rate variance detected across Delhi and Farukhnagar bulk deliveries. All POD gate passes validated.
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-amber-900 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Housekeeping Evening Shift Turnout at Kolkata K6</span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      Vedanta agency turnout is at 91.2% (shortage of 2 cleaners on ground). Recommend requesting buffer deployment for night sorting.
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center gap-2 text-blue-900 font-bold">
                      <Zap className="w-4 h-4 text-blue-600" />
                      <span>DG B-Check Due Timer in Bangalore B4</span>
                    </div>
                    <p className="text-blue-800 text-[11px] leading-relaxed">
                      Dual 500 KVA DG 01 has accumulated 218.4 run hours. B-Check scheduled within 31.6 hours.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsAIDiagnosticOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
              >
                Close Diagnostic Radar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
