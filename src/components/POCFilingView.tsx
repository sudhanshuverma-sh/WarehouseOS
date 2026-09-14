import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ClipboardCheck,
  Users,
  Zap,
  Fuel,
  Droplet,
  Wrench,
  ThermometerSnowflake,
  Truck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Calendar,
  Clock,
  Building2,
  PlusCircle,
  Database,
  ChevronRight,
  Check,
  Activity,
  FileSpreadsheet,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Flame,
  Search,
  Filter,
  BarChart2,
  TrendingUp,
  Cpu,
  BatteryCharging,
  ShieldAlert,
  Wind,
  Lock,
  RefreshCw,
  Eye,
  CheckSquare,
  X,
  Send,
  Gauge
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { PageHeader } from './common/PageHeader';
import { Shift, DieselLog } from '../types';

interface POCFilingViewProps {
  onNavigateToDatabase?: (sheetId?: string) => void;
  onNavigateToCreateForm?: () => void;
  onNavigateToForm?: (viewName: string) => void;
  onBack?: () => void;
}

export const POCFilingView: React.FC<POCFilingViewProps> = ({
  onNavigateToDatabase,
  onNavigateToCreateForm,
  onNavigateToForm,
  onBack
}) => {
  const {
    currentDate,
    setCurrentDate,
    selectedWarehouseId,
    setSelectedWarehouseId,
    warehouses,
    currentUser,
    users,
    dailySiteLogs,
    sheetRecords,
    dieselLogs,
    addSheetRecord,
    notify
  } = useApp();

  // Active warehouse: for POC, use their assigned site or current selection
  const activeWh = useMemo(() => {
    if (currentUser.warehouseId) {
      return warehouses.find(w => w.id === currentUser.warehouseId) || warehouses[0];
    }
    return warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];
  }, [warehouses, currentUser.warehouseId, selectedWarehouseId]);

  // Current operating shift, derived from time of day
  const selectedShift: Shift = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'MORNING';
    if (hour >= 14 && hour < 22) return 'EVENING';
    return 'NIGHT';
  }, []);

  // Category filter state & search
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chartView, setChartView] = useState<'POWER' | 'TEMP' | 'STAFF'>('POWER');

  // Generic Filing Modal State for ANY of the 15 services
  const [activeFilingModal, setActiveFilingModal] = useState<{
    sheetKey: string;
    code: string;
    title: string;
    category: string;
    icon: any;
    adminName: string;
  } | null>(null);

  // Dynamic Form State for Modal Submissions
  const [modalFormData, setModalFormData] = useState<Record<string, any>>({});

  // Filter site specific logs
  const siteDailyLogs = useMemo(() => dailySiteLogs.filter(l => l.site === activeWh.id), [dailySiteLogs, activeWh.id]);
  const siteDieselLogs = useMemo(() => dieselLogs.filter(d => d.warehouseId === activeWh.id), [dieselLogs, activeWh.id]);

  // Master definition of all 15 Operational Services
  const allServicesList = useMemo(() => {
    // Determine filed statuses
    const isSiteReportFiled = siteDailyLogs.some(l => l.date === currentDate);
    const isHkFiled = (sheetRecords['SHEET_HOUSEKEEPING'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isDgPowerFiled = (sheetRecords['SHEET_DG_POWER_WATER'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isDieselFiled = siteDieselLogs.some(d => d.timestamp.startsWith(currentDate));
    const isWashingFiled = (sheetRecords['SHEET_WASHING'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isAdhocFiled = (sheetRecords['SHEET_ADHOC'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isColdFiled = (sheetRecords['SHEET_COLD'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isRtFiled = (sheetRecords['SHEET_RT'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isBoptFiled = (sheetRecords['SHEET_BOPT'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isUpsFiled = (sheetRecords['SHEET_UPS'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isLtFiled = (sheetRecords['SHEET_LT'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isFireFiled = (sheetRecords['SHEET_FIRE'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isHvlsFiled = (sheetRecords['SHEET_HVLS'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isWaterFiled = (sheetRecords['SHEET_WATER'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );
    const isSecFiled = (sheetRecords['SHEET_SECURITY'] || []).some(
      r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
    );

    return [
      {
        id: 'dailyForm',
        sheetKey: 'SHEET_DAILY_SITE',
        title: 'Daily Site Activity Report (Master)',
        subtitle: '43-parameter master log covering utility availability, routine equipment checks, PM & open tickets',
        code: 'OPS_01_SITE',
        category: 'Daily Operations',
        adminName: 'Operations & Facilities Admin',
        adminEmail: 'ops.admin@grofers.com',
        icon: ClipboardCheck,
        color: 'from-teal-600 to-emerald-700',
        badgeColor: 'bg-teal-100 text-teal-900 border-teal-200',
        isFiled: isSiteReportFiled,
        frequency: 'Every Shift',
        fieldsCount: 43,
        primaryStat: isSiteReportFiled ? '100% Verified' : 'Pending Shift File',
        metricType: 'percentage'
      },
      {
        id: 'housekeeping',
        sheetKey: 'SHEET_HOUSEKEEPING',
        title: 'Housekeeping Deployment & Agency Roster',
        subtitle: 'SMS & Vedanta contractor roster, onground headcount, MST available & deployment % tracking',
        code: 'OPS_02_HK',
        category: 'Daily Operations',
        adminName: 'Housekeeping Admin',
        adminEmail: 'housekeeping.admin@zomato.com',
        icon: Users,
        color: 'from-indigo-600 to-violet-700',
        badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-200',
        isFiled: isHkFiled,
        frequency: 'Shift Start',
        fieldsCount: 16,
        primaryStat: '18 / 18 Staff (100%)',
        metricType: 'count'
      },
      {
        id: 'dgPower',
        sheetKey: 'SHEET_DG_POWER_WATER',
        title: 'Daily DG (500 KVA x2), EB Grid & Water',
        subtitle: 'Dual 500 KVA DG fuel levels, run hours, DEF stock, EB kWh units, PF & water KL meters',
        code: 'OPS_03_DG_PWR',
        category: 'Energy & Utilities',
        adminName: 'EB-DG Power Admin',
        adminEmail: 'ebdg.admin@zomato.com',
        icon: Zap,
        color: 'from-amber-600 to-yellow-600',
        badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
        isFiled: isDgPowerFiled,
        frequency: 'Shift Handover',
        fieldsCount: 28,
        primaryStat: '1,450 L Diesel • 0.98 PF',
        metricType: 'energy'
      },
      {
        id: 'diesel',
        sheetKey: 'SHEET_DIESEL',
        title: 'Diesel & Fuel Procurement Inward',
        subtitle: 'Tanker inward logs, dipstick vs flowmeter verification, invoice POD & automated vendor triggers',
        code: 'OPS_04_DSL',
        category: 'Energy & Utilities',
        adminName: 'Anshul & Varun (Fuel Admin)',
        adminEmail: 'anshul.varun@zomato.com',
        icon: Fuel,
        color: 'from-orange-600 to-amber-700',
        badgeColor: 'bg-orange-100 text-orange-900 border-orange-200',
        isFiled: isDieselFiled,
        frequency: 'Per Delivery',
        fieldsCount: 21,
        primaryStat: siteDieselLogs[0] ? `${siteDieselLogs[0].deliveredQuantityLitres || siteDieselLogs[0].orderQuantityLitres || 500} L Received` : 'Ready for Inward',
        metricType: 'fuel'
      },
      {
        id: 'washing',
        sheetKey: 'SHEET_WASHING',
        title: 'Crate Washing & Sanitization Sheet',
        subtitle: 'Sanitized crate counts, chemical dosing (PPM), wash bay nozzle pressure & dry inventory',
        code: 'OPS_05_WASH',
        category: 'Daily Operations',
        adminName: 'Operations Admin',
        adminEmail: 'ops.admin@grofers.com',
        icon: Droplet,
        color: 'from-sky-600 to-blue-700',
        badgeColor: 'bg-sky-100 text-sky-900 border-sky-200',
        isFiled: isWashingFiled,
        frequency: 'Per Shift',
        fieldsCount: 12,
        primaryStat: '1,240 Crates • 120 PPM',
        metricType: 'crates'
      },
      {
        id: 'washing',
        sheetKey: 'SHEET_ADHOC',
        title: 'Adhoc Tasks, Maintenance & CAPEX',
        subtitle: 'Emergency civil/electrical repairs, contractor work permits, billing estimates & signoffs',
        code: 'OPS_06_ADHOC',
        category: 'Daily Operations',
        adminName: 'Operations Admin',
        adminEmail: 'ops.admin@grofers.com',
        icon: Wrench,
        color: 'from-rose-600 to-pink-700',
        badgeColor: 'bg-rose-100 text-rose-900 border-rose-200',
        isFiled: isAdhocFiled,
        frequency: 'Realtime Adhoc',
        fieldsCount: 14,
        primaryStat: '0 Critical Tickets',
        metricType: 'status'
      },
      {
        id: 'coldroom_modal',
        sheetKey: 'SHEET_COLD',
        title: 'Cold Room & Chiller Temperature Log',
        subtitle: 'Zone A (Dairy/Produce 2-4°C), Zone B (Deep Freezer -18°C), defrost cycle & strip curtains',
        code: 'OPS_07_COLD',
        category: 'Daily Operations',
        adminName: 'Cold Room Admin',
        adminEmail: 'coldroom.admin@zomato.com',
        icon: ThermometerSnowflake,
        color: 'from-cyan-600 to-teal-700',
        badgeColor: 'bg-cyan-100 text-cyan-900 border-cyan-200',
        isFiled: isColdFiled,
        frequency: 'Hourly / Per Shift',
        fieldsCount: 14,
        primaryStat: 'Chiller: 3.2°C • Freezer: -18.5°C',
        metricType: 'temperature'
      },
      {
        id: 'rt_modal',
        sheetKey: 'SHEET_RT',
        title: 'RT (Reach Truck) Fleet Inspection',
        subtitle: 'Mast lifting pressure, hydraulic fluid levels, drive tire condition & battery gravity checks',
        code: 'OPS_08_RT',
        category: 'MHE & Fleet',
        adminName: 'MHE Fleet Admin',
        adminEmail: 'mhe.admin@zomato.com',
        icon: Truck,
        color: 'from-blue-600 to-indigo-700',
        badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
        isFiled: isRtFiled,
        frequency: 'Pre-Shift Daily',
        fieldsCount: 12,
        primaryStat: '8 / 8 Reach Trucks Ready',
        metricType: 'fleet'
      },
      {
        id: 'bopt_modal',
        sheetKey: 'SHEET_BOPT',
        title: 'BOPT Pallet Truck & Stackers Sheet',
        subtitle: 'Tiller emergency switch, brake shoe wear, horn/beacon, castor wheels & charging connectors',
        code: 'OPS_09_BOPT',
        category: 'MHE & Fleet',
        adminName: 'MHE Fleet Admin',
        adminEmail: 'mhe.admin@zomato.com',
        icon: Cpu,
        color: 'from-violet-600 to-purple-700',
        badgeColor: 'bg-violet-100 text-violet-900 border-violet-200',
        isFiled: isBoptFiled,
        frequency: 'Pre-Shift Daily',
        fieldsCount: 10,
        primaryStat: '14 BOPT Units Active',
        metricType: 'fleet'
      },
      {
        id: 'ups_modal',
        sheetKey: 'SHEET_UPS',
        title: 'UPS & Battery Bank Health Sheet',
        subtitle: 'Inverter load %, DC bus voltage, cell terminal corrosion, float voltage & room temperature',
        code: 'OPS_10_UPS',
        category: 'Energy & Utilities',
        adminName: 'EB-DG Power Admin',
        adminEmail: 'ebdg.admin@zomato.com',
        icon: BatteryCharging,
        color: 'from-emerald-600 to-teal-700',
        badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
        isFiled: isUpsFiled,
        frequency: 'Daily',
        fieldsCount: 11,
        primaryStat: '100% UPS Availability',
        metricType: 'power'
      },
      {
        id: 'lt_modal',
        sheetKey: 'SHEET_LT',
        title: 'LT Panel & Capacitor Bank Log',
        subtitle: 'Main incoming ACB breaker status, busbar thermography, APFC automatic stage firing & harmonics',
        code: 'OPS_11_LT',
        category: 'Energy & Utilities',
        adminName: 'EB-DG Power Admin',
        adminEmail: 'ebdg.admin@zomato.com',
        icon: Sliders,
        color: 'from-slate-700 to-slate-900',
        badgeColor: 'bg-slate-200 text-slate-900 border-slate-300',
        isFiled: isLtFiled,
        frequency: 'Daily Shift End',
        fieldsCount: 9,
        primaryStat: 'ACB 1 & 2 Closed • 0.99 PF',
        metricType: 'electrical'
      },
      {
        id: 'fire_modal',
        sheetKey: 'SHEET_FIRE',
        title: 'Fire Safety & Hydrant System Sheet',
        subtitle: 'Jockey pump pressure (7.0 kg/cm²), diesel engine start test, hose reel boxes & emergency exits',
        code: 'OPS_12_FIRE',
        category: 'EHS & Facilities',
        adminName: 'EHS & Security Admin',
        adminEmail: 'ehs.admin@zomato.com',
        icon: ShieldAlert,
        color: 'from-red-600 to-rose-700',
        badgeColor: 'bg-red-100 text-red-900 border-red-200',
        isFiled: isFireFiled,
        frequency: 'Daily / Weekly',
        fieldsCount: 13,
        primaryStat: '7.2 kg/cm² Hydrant Line',
        metricType: 'safety'
      },
      {
        id: 'hvls_modal',
        sheetKey: 'SHEET_HVLS',
        title: 'HVLS Ceiling Fans & Ventilation',
        subtitle: 'VFD drive frequency (Hz), guy-wire safety cable tension, blade wobble & reverse airflow mode',
        code: 'OPS_13_HVLS',
        category: 'EHS & Facilities',
        adminName: 'Facilities Admin',
        adminEmail: 'facilities.admin@zomato.com',
        icon: Wind,
        color: 'from-teal-600 to-cyan-700',
        badgeColor: 'bg-teal-100 text-teal-900 border-teal-200',
        isFiled: isHvlsFiled,
        frequency: 'Daily',
        fieldsCount: 8,
        primaryStat: '6 / 6 HVLS Running',
        metricType: 'ventilation'
      },
      {
        id: 'water_modal',
        sheetKey: 'SHEET_WATER',
        title: 'Water Coolers & Commercial RO Plant',
        subtitle: 'TDS output (PPM), UV sterilizer active, chiller tank temperature (12°C) & filter pressure',
        code: 'OPS_14_WATER',
        category: 'EHS & Facilities',
        adminName: 'Facilities Admin',
        adminEmail: 'facilities.admin@zomato.com',
        icon: Droplet,
        color: 'from-blue-500 to-cyan-600',
        badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
        isFiled: isWaterFiled,
        frequency: 'Daily',
        fieldsCount: 8,
        primaryStat: '45 PPM RO Pure Water',
        metricType: 'water'
      },
      {
        id: 'security_modal',
        sheetKey: 'SHEET_SECURITY',
        title: 'Security Gate & Incident Register',
        subtitle: 'Truck inward/outward reconciliation, high-value cage seal serial numbers & CCTV uptime',
        code: 'OPS_15_SEC',
        category: 'Daily Operations',
        adminName: 'EHS & Security Admin',
        adminEmail: 'ehs.admin@zomato.com',
        icon: Lock,
        color: 'from-purple-600 to-indigo-800',
        badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
        isFiled: isSecFiled,
        frequency: 'Shift Handover',
        fieldsCount: 12,
        primaryStat: '32 Inward Trucks Verified',
        metricType: 'security'
      }
    ];
  }, [siteDailyLogs, siteDieselLogs, sheetRecords, activeWh.id, activeWh.code, currentDate]);

  // Filing completion progress
  const filedServicesCount = useMemo(() => {
    return allServicesList.filter(s => s.isFiled).length;
  }, [allServicesList]);

  const completionPercentage = Math.round((filedServicesCount / allServicesList.length) * 100);

  // Filtered Services based on Category and Search
  const filteredServices = useMemo(() => {
    return allServicesList.filter(service => {
      const matchesCategory =
        selectedCategory === 'ALL' || service.category.toUpperCase().includes(selectedCategory);
      const matchesSearch =
        searchQuery === '' ||
        service.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.adminName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [allServicesList, selectedCategory, searchQuery]);

  // Mock Graph Data for Graphical Analytics Representation
  const powerTrendData = [
    { time: '06:00', gridKwh: 310, dgHours: 0.0, fuelBurn: 0 },
    { time: '09:00', gridKwh: 540, dgHours: 0.5, fuelBurn: 40 },
    { time: '12:00', gridKwh: 680, dgHours: 1.0, fuelBurn: 85 },
    { time: '15:00', gridKwh: 720, dgHours: 1.5, fuelBurn: 120 },
    { time: '18:00', gridKwh: 610, dgHours: 0.5, fuelBurn: 40 },
    { time: '21:00', gridKwh: 490, dgHours: 0.0, fuelBurn: 0 },
    { time: '00:00', gridKwh: 380, dgHours: 0.0, fuelBurn: 0 }
  ];

  const temperatureData = [
    { time: '06:00', chiller: 3.1, freezer: -18.8, ambient: 24.5 },
    { time: '09:00', chiller: 3.4, freezer: -18.2, ambient: 27.2 },
    { time: '12:00', chiller: 3.8, freezer: -17.9, ambient: 31.0 },
    { time: '15:00', chiller: 3.6, freezer: -18.1, ambient: 32.5 },
    { time: '18:00', chiller: 3.2, freezer: -18.4, ambient: 29.0 },
    { time: '21:00', chiller: 3.0, freezer: -18.7, ambient: 26.2 },
    { time: '00:00', chiller: 2.9, freezer: -19.0, ambient: 24.0 }
  ];

  const attendanceData = [
    { category: 'General HK', approved: 14, actual: 14 },
    { category: 'MST Techs', approved: 3, actual: 3 },
    { category: 'MHE Drivers', approved: 8, actual: 8 },
    { category: 'Security', approved: 6, actual: 6 },
    { category: 'Supervisors', approved: 2, actual: 2 }
  ];

  // Handler for launching either direct full view or interactive modal
  const handleLaunchService = (service: typeof allServicesList[0]) => {
    // If dedicated full view exists, navigate to it
    if (['dailyForm', 'housekeeping', 'dgPower', 'diesel', 'washing'].includes(service.id) && onNavigateToForm) {
      onNavigateToForm(service.id);
    } else {
      // Launch standard interactive modal
      setActiveFilingModal({
        sheetKey: service.sheetKey,
        code: service.code,
        title: service.title,
        category: service.category,
        icon: service.icon,
        adminName: service.adminName
      });
      // Pre-fill modal data
      setModalFormData({
        reading1: 'Normal',
        metric1: '100',
        remarks: 'All parameters verified on-ground in optimal operating thresholds.',
        status: 'Compliant'
      });
    }
  };

  // Submit Generic Modal
  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFilingModal) return;

    const filing = activeFilingModal;
    void addSheetRecord(filing.sheetKey, {
      warehouseId: activeWh.id,
      warehouseCode: activeWh.code,
      warehouseName: activeWh.name,
      date: currentDate,
      shift: 'Daily Log',
      submittedBy: currentUser.fullName,
      timestamp: new Date().toISOString(),
      ...modalFormData
    }).then(res => {
      // On failure the reason is already on screen and the modal stays open,
      // so what the POC typed is not lost.
      if (!res.ok) return;
      notify(
        'success',
        `${filing.code} Logged Successfully!`,
        `Record updated for ${activeWh.name}. Synced to ${filing.adminName}.`
      );
      setActiveFilingModal(null);
    });
  };

  // Pending validation items for today
  const isSiteReportFiled = siteDailyLogs.some(l => l.date === currentDate);
  const isDieselFiled = siteDieselLogs.some(d => d.timestamp.startsWith(currentDate));
  const isHkFiled = (sheetRecords['SHEET_HOUSEKEEPING'] || []).some(
    r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
  );
  const isDgPowerFiled = (sheetRecords['SHEET_DG_POWER_WATER'] || []).some(
    r => (r.warehouseId === activeWh.id || r.warehouseId === activeWh.code) && r.date === currentDate
  );

  const pendingValidations = [
    !isSiteReportFiled && { id: 'dailyForm', label: 'Daily Site Master (43 Pts)', icon: ClipboardCheck, color: 'bg-teal-600' },
    !isDieselFiled && { id: 'diesel', label: 'Diesel Fuel & Inward', icon: Fuel, color: 'bg-amber-600' },
    !isHkFiled && { id: 'housekeeping', label: 'Housekeeping Roster', icon: Users, color: 'bg-purple-600' },
    !isDgPowerFiled && { id: 'dgPower', label: 'DG, EB & Water Log', icon: Zap, color: 'bg-emerald-600' }
  ].filter(Boolean) as Array<{ id: string; label: string; icon: any; color: string }>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* 1. Universal Clean Page Header */}
      <PageHeader
        title={`${activeWh.name} Operations Hub`}
        subtitle={`Centralized operations & facility console for ${activeWh.city} hub (${activeWh.code}). Complete real-time graphical telemetry, filing status, and all 15 operational services.`}
        categoryBadge={currentUser.role === 'SITE_POC' ? 'Assigned Facility' : 'POC Operations Desk'}
        categoryColor="bg-teal-50 text-teal-700 border-teal-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: activeWh.city },
          { label: 'All 15 Operational Services' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigateToDatabase && onNavigateToDatabase()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>Data Explorer</span>
            </button>
            {currentUser.role === 'SUPER_ADMIN' && onNavigateToCreateForm && (
              <button
                onClick={onNavigateToCreateForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Custom Sheet</span>
              </button>
            )}
          </div>
        }
      />

      {/* 2. Real-Time Daily Validation & Compliance Alert Notification */}
      {pendingValidations.length > 0 ? (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400/80 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md font-black animate-bounce">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-md uppercase tracking-wider">
                    Action Required Today ({currentDate})
                  </span>
                  <span className="text-xs font-bold text-amber-900">
                    {pendingValidations.length} Pending Daily Filing{pendingValidations.length > 1 ? 's' : ''} for {activeWh.name}
                  </span>
                </div>
                <p className="text-xs text-amber-950/80 mt-1 font-medium leading-relaxed">
                  Daily logs for this site must be validated and signed off before end of day to avoid operational audit flags. Click below to submit immediately:
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {pendingValidations.map(item => (
                <button
                  key={item.id}
                  onClick={() => onNavigateToForm && onNavigateToForm(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 ${item.color} hover:opacity-90 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>File {item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-black text-emerald-950">
                All Core Daily Operations Validated & Logged for Today ({currentDate})
              </span>
              <p className="text-[11px] text-emerald-800 font-medium">
                {activeWh.name} is 100% compliant. Master Checklist, Diesel Logs, and Utilities verified on-ground.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-lg uppercase">
            Compliant
          </span>
        </div>
      )}

      {/* 3. Facility Operational Status & Live Telemetry Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-md relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-md font-mono text-xs font-black">
                {activeWh.code || 'HUB-SITE'}
              </span>
              <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-md text-xs font-semibold">
                Cost Center: {activeWh.costCenter || `CC-${activeWh.code}`}
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Telemetry Stream Live
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {activeWh.name}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeWh.address || `${activeWh.city}, ${activeWh.state || 'India'}`} • Channel: {activeWh.channel || 'B2B & B2C'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Entity: <strong>{activeWh.entity || 'Zomato & Grofers Supply Chain'}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>POC: <strong>{activeWh.sitePocName || currentUser.fullName}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>Date: <strong className="text-teal-300">{currentDate}</strong></span>
              </div>
            </div>
          </div>

          {/* Graphical Radial / Progress Meter */}
          <div className="bg-slate-800/90 border border-slate-700/80 p-4 rounded-xl shrink-0 min-w-[280px] space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-300">Daily Services Compliance</span>
              <span className="text-teal-400 font-extrabold">{completionPercentage}% Completed</span>
            </div>

            <div className="w-full bg-slate-700/80 h-3 rounded-full overflow-hidden p-0.5 border border-slate-600/50">
              <div
                className="bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>{filedServicesCount} of {allServicesList.length} services filed</span>
              <span className={completionPercentage === 100 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {completionPercentage === 100 ? '✓ Complete' : `${allServicesList.length - filedServicesCount} Pending`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Telemetry & Live Status Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Power & Grid */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-amber-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Grid & DG</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            0.98 PF
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>22.5 hrs Grid Uptime</span>
          </div>
        </div>

        {/* Metric 2: DG Fuel Reserve */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-orange-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>DG Fuel</span>
            <Fuel className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            1,450 L
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>82% Tank Capacity</span>
          </div>
        </div>

        {/* Metric 3: Cold Room */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-cyan-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Cold Room</span>
            <ThermometerSnowflake className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            3.2°C
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Freezer -18.5°C Normal</span>
          </div>
        </div>

        {/* Metric 4: Housekeeping */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-indigo-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Staff Roster</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            18 / 18
          </div>
          <div className="text-[10px] text-indigo-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>100% Deployed (SMS)</span>
          </div>
        </div>

        {/* Metric 5: MHE Fleet */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-blue-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>MHE Fleet</span>
            <Truck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            8 RT • 14 BOPT
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>100% Ready Uptime</span>
          </div>
        </div>

        {/* Metric 6: Fire Safety */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs hover:border-red-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Fire Hydrant</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            7.2 kg/cm²
          </div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Jockey Pump Prime</span>
          </div>
        </div>
      </div>

      {/* 4. Graphical Visualizations & Interactive Operational Charts */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <h3 className="font-extrabold text-sm text-slate-900">
                Graphical Facility Telemetry & Trend Analytics
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live graphical telemetry parameters across power generation, cold chain compliance, and manpower deployment.
            </p>
          </div>

          {/* Chart View Switcher Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
            <button
              onClick={() => setChartView('POWER')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                chartView === 'POWER' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Power & Fuel Curve
            </button>
            <button
              onClick={() => setChartView('TEMP')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                chartView === 'TEMP' ? 'bg-white text-cyan-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cold Chain Stability (°C)
            </button>
            <button
              onClick={() => setChartView('STAFF')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                chartView === 'STAFF' ? 'bg-white text-indigo-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Staff Deployment Roster
            </button>
          </div>
        </div>

        {/* Dynamic Chart Display */}
        <div className="h-64 w-full">
          {chartView === 'POWER' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gridKwhGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="fuelBurnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="gridKwh" name="EB Grid Units (kWh)" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#gridKwhGrad)" />
                <Area type="monotone" dataKey="fuelBurn" name="DG Fuel Consumed (L)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#fuelBurnGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {chartView === 'TEMP' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={temperatureData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={[-22, 35]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="chiller" name="Chiller Zone (Safe: 2-4°C)" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="freezer" name="Deep Freezer (Safe: <-18°C)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="ambient" name="Ambient Facility Temp (°C)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}

          {chartView === 'STAFF' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="category" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="approved" name="Approved Headcount" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="actual" name="Actual Onground Deployed" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 5. Master Operational Services Hub (All 15 Services) */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" />
              <span>Operational Services & Filing Sheets ({allServicesList.length} Active Services)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Select any operational service card below to launch its dedicated filing form or log quick parameters.
            </p>
          </div>

          {/* Search Bar & Category Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search services, codes or admins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 w-56 font-medium"
              />
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs">
              {['ALL', 'ENERGY', 'DAILY', 'MHE', 'EHS'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    selectedCategory === cat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'ALL' ? 'All (15)' : cat === 'ENERGY' ? 'Energy (4)' : cat === 'DAILY' ? 'Daily (5)' : cat === 'MHE' ? 'MHE (2)' : 'EHS (4)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Service Cards Grid (All 15 Services) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service, idx) => {
            const Icon = service.icon;
            return (
              <div
                key={idx}
                className={`bg-white rounded-2xl p-5 border transition-all duration-200 shadow-2xs hover:shadow-md flex flex-col justify-between relative overflow-hidden group ${
                  service.isFiled ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200 hover:border-teal-500'
                }`}
              >
                {/* Status Indicator Ribbon */}
                {service.isFiled && (
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[9px] font-black uppercase px-3 py-0.5 rounded-bl-xl shadow-xs flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>Logged Today</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => handleLaunchService(service)}
                      className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${service.color} text-white flex items-center justify-center cursor-pointer shadow-xs group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono font-black text-slate-400">
                      {service.code}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${service.badgeColor}`}>
                        {service.category}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        • {service.frequency}
                      </span>
                    </div>

                    <h4
                      onClick={() => handleLaunchService(service)}
                      className="text-base font-extrabold text-slate-900 mt-1.5 group-hover:text-teal-700 transition cursor-pointer"
                    >
                      {service.title}
                    </h4>

                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {service.subtitle}
                    </p>

                    <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                      <span>Admin: <strong className="text-slate-700">{service.adminName}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-bold text-[11px]">
                    {service.primaryStat}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onNavigateToDatabase && onNavigateToDatabase(service.sheetKey)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                      title="View Sheet Database Records"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLaunchService(service)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer shadow-xs ${
                        service.isFiled
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-teal-600 hover:bg-teal-700 text-white'
                      }`}
                    >
                      <span>{service.isFiled ? 'Update Form' : 'Fill Form'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Recent Operational Records Log Table */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>Recent Activity & Filing Records ({activeWh.code})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Audited operational logs transmitted from this facility to Central Control.
            </p>
          </div>
          <button
            onClick={() => onNavigateToDatabase && onNavigateToDatabase()}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
          >
            <span>Open in Excel Grid Log Explorer</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Date / Shift</th>
                <th className="py-2.5 px-3">Sheet Name</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Logged By</th>
                <th className="py-2.5 px-3">Key Metric / Summary</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {siteDailyLogs.length > 0 ? (
                siteDailyLogs.slice(0, 4).map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {log.date} <span className="text-[10px] text-slate-400 font-normal">({selectedShift})</span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800">
                      Daily Site Activity (43-Col)
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        log.worstStatus === 'clear' ? 'bg-emerald-100 text-emerald-800' :
                        log.worstStatus === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.worstStatus === 'clear' ? 'Clear' : `${log.deviationsCount || 0} Deviation(s)`}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium">
                      {(log as any).submittedByName || log.pocName || activeWh.sitePocName || 'Site POC'}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {(log as any).notes || (log as any).highlights || 'All routine checks completed & verified'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onNavigateToDatabase && onNavigateToDatabase('SHEET_DAILY_SITE')}
                        className="text-teal-700 hover:text-teal-800 font-bold hover:underline"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                    No activity logs filed yet for today. Use any form above to record shift parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. Comprehensive Interactive Modal for Any Service (Clean English UI)    */}
      {/* ========================================================================= */}
      {activeFilingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white rounded-t-3xl flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center font-bold">
                  {React.createElement(activeFilingModal.icon, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-teal-500/30 text-teal-200 rounded">
                      {activeFilingModal.code}
                    </span>
                    <h3 className="font-black text-sm text-white">{activeFilingModal.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeWh.name} ({activeWh.code}) • Shift: {selectedShift}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveFilingModal(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4 text-xs font-sans">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600 font-bold">Assigned Admin:</span>
                <span className="font-black text-slate-900">{activeFilingModal.adminName}</span>
              </div>

              <div className="space-y-1">
                <label className="font-extrabold text-slate-800 text-xs">
                  Operational Reading / Primary Metric Value
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 100% / Normal / 3.2°C / 1,450 L"
                  value={modalFormData.metric1 || ''}
                  onChange={(e) => setModalFormData({ ...modalFormData, metric1: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-extrabold text-slate-800 text-xs">
                  Equipment Status & Compliance
                </label>
                <select
                  value={modalFormData.status || 'Compliant'}
                  onChange={(e) => setModalFormData({ ...modalFormData, status: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-teal-500"
                >
                  <option value="Compliant">Compliant / Optimal (100% Ready)</option>
                  <option value="Minor Deviation">Minor Deviation (Maintenance Scheduled)</option>
                  <option value="Critical Outage">Critical Outage / Attention Required</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-extrabold text-slate-800 text-xs">
                  Shift Supervisor Remarks & Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter onground verification details, calibration readings or handover notes..."
                  value={modalFormData.remarks || ''}
                  onChange={(e) => setModalFormData({ ...modalFormData, remarks: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-black text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Submit Operational Record to {activeFilingModal.adminName}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
