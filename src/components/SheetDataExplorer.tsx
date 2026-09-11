import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { canSeeSite, capabilitiesFor, resolveSiteFilter } from '../lib/permissions';
import {
  Database,
  Search,
  Filter,
  Download,
  Plus,
  Table,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  Layers,
  ChevronRight,
  Sparkles,
  Calendar,
  Building2,
  Clock,
  UserCheck,
  Eye,
  RefreshCw,
  X,
  SlidersHorizontal,
  Trash2,
  HelpCircle,
  Check,
  Settings2,
  Copy,
  ChevronDown,
  ShieldCheck,
  Lock,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  ArrowLeft
} from 'lucide-react';
import { Shift, FieldDefinition, User } from '../types';
import { PageHeader } from './common/PageHeader';
import { ExportPanel } from './common/ExportPanel';

/**
 * Diesel & Fuel Procurement Sheet — column key order and display labels match the real
 * ZHPL master sheet CSV header exactly (same order, same names), so this Database Explorer,
 * the Diesel Ledger, and the connected Google Sheet all read identically side by side.
 */
const DIESEL_COLUMN_ORDER = [
  'timestamp', 'emailAddress', 'entity', 'whNameB2B', 'whNameB2C', 'costCenter', 'zone',
  'fuel', 'type', 'vendorNamePayment', 'quantity', 'ratePerLitre', 'finalAmount',
  'qrCodeImageUrl', 'vendorNameDelivery', 'orderQuantityLitres', 'uniqueId', 'status',
  'validation', 'deliveredQuantityLitres', 'podUrl'
];

const DIESEL_COLUMN_LABELS: Record<string, string> = {
  timestamp: 'Timestamp',
  emailAddress: 'Email Address',
  entity: 'Entity',
  whNameB2B: 'WH NAME (B2B)',
  whNameB2C: 'WH NAME (B2C)',
  costCenter: 'COST CENTER',
  zone: 'Zone',
  fuel: 'Fuel',
  type: 'Type',
  vendorNamePayment: 'Vendor Name(Payment)',
  quantity: 'Quantity',
  ratePerLitre: 'Rate per Litres',
  finalAmount: 'Final Amount',
  qrCodeImageUrl: 'QR Code Image',
  vendorNameDelivery: 'Vendor Name(Delivery)',
  orderQuantityLitres: 'Order Quantity',
  uniqueId: 'Unique ID',
  status: 'Status',
  validation: 'Validation',
  deliveredQuantityLitres: 'Delivered Quantity',
  podUrl: "POD's"
};

interface SheetDataExplorerProps {
  onBack?: () => void;
  onNavigateToCreateForm?: () => void;
  onNavigateToDiesel?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const SheetDataExplorer: React.FC<SheetDataExplorerProps> = ({
  onBack,
  onNavigateToCreateForm,
  onNavigateToDiesel,
  onNavigateTab
}) => {
  const {
    operationalSheets,
    activeSheetId,
    setActiveSheetId,
    dailySiteLogs,
    dieselLogs,
    sheetRecords,
    addSheetRecord,
    exportSheetData,
    updateSheetColumns,
    addColumnToSheet,
    removeColumnFromSheet,
    warehouses,
    currentUser,
    selectedWarehouseId,
    currentDate,
    setCurrentDate,
    selectedShift,
    setSelectedShift,
    getAssignedServicesForUser,
    isServiceAccessible,
    setNotification,
    approveDieselLog,
    rejectDieselLog
  } = useApp();

  // Role Scoping: Determine which sheets this user can access
  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const isSuperAdmin = caps.isSuperAdmin;
  const isPoc = caps.isPoc;
  const assignedServiceIds = useMemo(() => {
    return getAssignedServicesForUser(currentUser);
  }, [currentUser, getAssignedServicesForUser]);

  // Available sheets for the user
  const accessibleSheets = useMemo(() => {
    if (isSuperAdmin) return operationalSheets;
    const allowedSet = new Set(assignedServiceIds);
    return operationalSheets.filter(s => allowedSet.has(s.id));
  }, [operationalSheets, assignedServiceIds, isSuperAdmin]);

  // Selected sheet state (ensure it falls back to first accessible sheet)
  const [selectedSheetId, setSelectedSheetId] = useState<string>(() => {
    if (activeSheetId && (isSuperAdmin || assignedServiceIds.includes(activeSheetId))) {
      return activeSheetId;
    }
    return accessibleSheets[0]?.id || 'SHEET_DAILY_SITE';
  });

  // Mode: Day-Wise vs Total Cumulative
  const [logViewMode, setLogViewMode] = useState<'DAY_WISE' | 'TOTAL_CUMULATIVE'>('DAY_WISE');
  const [filterDate, setFilterDate] = useState<string>(currentDate);
  const [filterShift, setFilterShift] = useState<string>('ALL');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('ALL');

  // Everything below reads the SCOPED filter, never the raw one. A POC's
  // "My Site Records" is filtered to their assigned hub, which is what the
  // sidebar has always claimed it did.
  const effectiveWarehouseFilter = useMemo(
    () => resolveSiteFilter(caps, filterWarehouse),
    [caps, filterWarehouse]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modals & Panels
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [activeRecordDetail, setActiveRecordDetail] = useState<any | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colKey: string; val: any } | null>(null);

  // New column creation state
  const [newColLabel, setNewColLabel] = useState('');
  const [newColKey, setNewColKey] = useState('');
  const [newColType, setNewColType] = useState<FieldDefinition['type']>('text');
  const [newColUnit, setNewColUnit] = useState('');
  const [newColDefault, setNewColDefault] = useState('');

  // Quick Row Add State
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});

  // Current sheet metadata
  const currentSheetDef = useMemo(() => {
    return operationalSheets.find(s => s.id === selectedSheetId) || operationalSheets[0];
  }, [operationalSheets, selectedSheetId]);

  // Extract raw records for current sheet
  const rawRecords = useMemo(() => {
    if (selectedSheetId === 'SHEET_DAILY_SITE') {
      return dailySiteLogs;
    }
    if (selectedSheetId === 'SHEET_DIESEL') {
      return dieselLogs;
    }
    return sheetRecords[selectedSheetId] || [];
  }, [selectedSheetId, dailySiteLogs, dieselLogs, sheetRecords]);

  // Filtered rows based on View Mode (Day-Wise vs Total Cumulative), Warehouse, Shift, Search
  const filteredRows = useMemo(() => {
    let list = rawRecords.filter((row: any) => {
      // Day-Wise Filter
      if (logViewMode === 'DAY_WISE') {
        const rowDate = row.date || (row.timestamp ? row.timestamp.split('T')[0] : '');
        if (filterDate && rowDate && rowDate !== filterDate) {
          return false;
        }
      }

      // Warehouse filter. `effectiveWarehouseFilter` has already been forced
      // back inside the user's own scope, so a POC cannot widen this to 'ALL'
      // via a stale filter value. The row-level canSeeSite() check below is the
      // belt to that braces: it holds even for rows whose site never appears in
      // the dropdown.
      const whId = row.site || row.warehouseId;
      if (!canSeeSite(caps, whId)) {
        return false;
      }
      if (effectiveWarehouseFilter !== 'ALL' && whId !== effectiveWarehouseFilter) {
        return false;
      }

      // Shift filter
      if (filterShift !== 'ALL' && row.shift && row.shift !== filterShift) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = JSON.stringify(row).toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });

    // Sorting
    if (sortColumn) {
      list = [...list].sort((a: any, b: any) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [rawRecords, logViewMode, filterDate, filterShift, effectiveWarehouseFilter, caps, searchQuery, sortColumn, sortDirection]);

  // Extract columns
  const columns = useMemo(() => {
    if (selectedSheetId === 'SHEET_DIESEL') {
      return DIESEL_COLUMN_ORDER;
    }
    if (filteredRows.length === 0) {
      if (currentSheetDef?.fieldsConfig && currentSheetDef.fieldsConfig.length > 0) {
        return ['date', 'warehouseId', 'shift', ...currentSheetDef.fieldsConfig.map(f => f.key), 'submittedByName', 'status'];
      }
      return ['id', 'date', 'warehouseId', 'shift', 'status', 'submittedByName', 'remarks'];
    }
    const set = new Set<string>();
    // Primary structural columns first
    ['id', 'date', 'warehouseId', 'site', 'shift'].forEach(k => {
      if (filteredRows.some(r => r[k] !== undefined)) set.add(k);
    });

    filteredRows.forEach(r => {
      Object.keys(r).forEach(k => {
        if (k !== 'activities' && k !== 'dataPayload' && typeof r[k] !== 'object') {
          set.add(k);
        }
      });
    });
    return Array.from(set);
  }, [selectedSheetId, filteredRows, currentSheetDef]);

  // Column letters (Excel style: A, B, C, D...)
  const getExcelColName = (n: number) => {
    let ordA = 'A'.charCodeAt(0);
    let ordZ = 'Z'.charCodeAt(0);
    let len = ordZ - ordA + 1;
    let s = '';
    while (n >= 0) {
      s = String.fromCharCode((n % len) + ordA) + s;
      n = Math.floor(n / len) - 1;
    }
    return s;
  };

  /**
   * The export definition for whichever service is open.
   *
   * Built from `columns` — every field the sheet defines — so each service
   * exports its own complete header without a hand-maintained list per
   * service that would drift the moment someone adds a field.
   */
  const exportSpec = useMemo(
    () => ({
      label: currentSheetDef?.title ?? 'records',
      serviceCode: currentSheetDef?.code ?? selectedSheetId ?? 'RECORDS',
      dateOf: (r: Record<string, any>) => r.date as string | undefined,
      siteOf: (r: Record<string, any>) => (r.site || r.warehouseId) as string | undefined,
      columns: columns.map(key => ({
        header: key,
        value: (r: Record<string, any>) => r[key] ?? '',
      })),
    }),
    [columns, currentSheetDef, selectedSheetId]
  );

  const exportSites = useMemo(
    () =>
      warehouses
        .filter(w => canSeeSite(caps, w.id))
        .map(w => ({ code: w.id, label: `${w.id} — ${w.name}` })),
    [warehouses, caps]
  );

  // Visible columns filter state
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});
  const visibleColumns = useMemo(() => {
    return columns.filter(c => !hiddenCols[c]);
  }, [columns, hiddenCols]);

  const toggleColVisibility = (col: string) => {
    setHiddenCols(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const handleSort = (colKey: string) => {
    if (sortColumn === colKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
      }
    } else {
      setSortColumn(colKey);
      setSortDirection('asc');
    }
  };

  // Copy table to clipboard
  const handleCopyClipboard = () => {
    const header = visibleColumns.map(c => (selectedSheetId === 'SHEET_DIESEL' ? (DIESEL_COLUMN_LABELS[c] || c) : c)).join('\t');
    const rows = filteredRows.map(r => visibleColumns.map(c => r[c] ?? '').join('\t')).join('\n');
    const tsv = `${header}\n${rows}`;
    navigator.clipboard.writeText(tsv);
    setNotification({
      type: 'success',
      message: `Copied ${filteredRows.length} rows to clipboard in TSV format!`
    });
  };

  // Calculate Excel Formula Summary Stats for numeric columns
  const numericStats = useMemo(() => {
    const stats: Record<string, { sum: number; avg: number; min: number; max: number; count: number }> = {};
    visibleColumns.forEach(col => {
      let sum = 0;
      let count = 0;
      let min = Infinity;
      let max = -Infinity;
      let isNumericCol = true;

      filteredRows.forEach(row => {
        const val = row[col];
        if (val !== undefined && val !== null && val !== '') {
          const num = Number(val);
          if (!isNaN(num)) {
            sum += num;
            count++;
            if (num < min) min = num;
            if (num > max) max = num;
          } else {
            isNumericCol = false;
          }
        }
      });

      if (isNumericCol && count > 0) {
        stats[col] = {
          sum: Math.round(sum * 100) / 100,
          avg: Math.round((sum / count) * 100) / 100,
          min,
          max,
          count
        };
      }
    });
    return stats;
  }, [filteredRows, visibleColumns]);

  // Handle Add Row Submission
  const handleAddRowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const wh = warehouses.find(w => w.id === (newRowData.warehouseId || warehouses[0].id));
    const payload = {
      ...newRowData,
      date: newRowData.date || currentDate,
      warehouseId: wh?.id || 'WH_FN_02',
      warehouseCode: wh?.code || 'WH-FN-02',
      shift: newRowData.shift || selectedShift,
      submittedByName: currentUser.fullName,
      status: newRowData.status || 'Verified'
    };

    addSheetRecord(selectedSheetId, payload);
    setNotification({
      type: 'success',
      message: `Row added to ${currentSheetDef.title} successfully.`
    });
    setIsAddRowOpen(false);
    setNewRowData({});
  };

  // Handle Add Custom Column
  const handleAddCustomColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColKey.trim() || !newColLabel.trim()) return;

    const newField: FieldDefinition = {
      key: newColKey.trim().replace(/\s+/g, '_').toLowerCase(),
      label: newColLabel.trim(),
      type: newColType,
      required: false,
      unit: newColUnit || undefined,
      defaultValue: newColDefault || undefined
    };

    addColumnToSheet(selectedSheetId, newField);
    setNewColKey('');
    setNewColLabel('');
    setNewColUnit('');
    setNewColDefault('');
    setIsSchemaModalOpen(false);
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto font-sans pb-16">
      {/* Top Header Banner */}
      <PageHeader
        title="Enterprise Excel Data Log Sheet"
        subtitle={
          isSuperAdmin
            ? 'Super Admin Full Access: Viewing, querying, and auditing logs across all 15 operational services nationwide.'
            : isPoc
            ? 'Site POC Access: Viewing and filing every service sheet for your own site.'
            : `Admin Scoped Access (${currentUser.department || 'Assigned Services'}): You have full access across all 12 warehouse facilities for your assigned services.`
        }
        categoryBadge={isSuperAdmin ? 'Super Admin Mode' : isPoc ? 'Site POC Mode' : 'Admin Scoped Mode'}
        categoryColor={
          isSuperAdmin
            ? 'bg-purple-100 text-purple-900 border-purple-300'
            : isPoc
            ? 'bg-teal-100 text-teal-900 border-teal-300'
            : 'bg-amber-100 text-amber-900 border-amber-300'
        }
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Operational Records' },
          { label: 'Excel Log Explorer' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Copy visible grid to clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Copy TSV</span>
            </button>
            <button
              onClick={() => exportSheetData(selectedSheetId, 'csv')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Download Microsoft Excel compatible CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => exportSheetData(selectedSheetId, 'json')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              title="Export structured JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">JSON</span>
            </button>
            <button
              onClick={() => setIsAddRowOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Row</span>
            </button>
          </div>
        }
      />

      {/* Role Scoping Notice Bar */}
      {!isSuperAdmin && (
        <div className={`border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${isPoc ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-4 h-4 shrink-0 ${isPoc ? 'text-teal-700' : 'text-amber-700'}`} />
            <div>
              <span className={`font-bold ${isPoc ? 'text-teal-950' : 'text-amber-950'}`}>
                {isPoc ? 'Site POC Access: ' : 'Assigned Services Access: '}
              </span>
              <span className={isPoc ? 'text-teal-800' : 'text-amber-800'}>
                {isPoc
                  ? 'You can view and file every service sheet for your own site.'
                  : <>You can audit & analyze your assigned services ({accessibleSheets.map(s => s.title.split(' ')[0]).join(', ')}) across all nationwide warehouses.</>
                }
              </span>
            </div>
          </div>
          <span className={`font-extrabold px-2.5 py-0.5 rounded-full text-[10px] uppercase self-start sm:self-auto ${isPoc ? 'bg-teal-200/70 text-teal-900' : 'bg-amber-200/70 text-amber-900'}`}>
            {accessibleSheets.length} {isPoc ? 'Sheets Available' : 'Services Assigned'}
          </span>
        </div>
      )}

      {/* Service / Sheet Selector Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
            Operational Sheet Selector ({accessibleSheets.length} Available)
          </span>
          <button
            onClick={() => setIsSchemaModalOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Customize Columns</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {accessibleSheets.map(sheet => {
            const isSelected = sheet.id === selectedSheetId;
            return (
              <button
                key={sheet.id}
                onClick={() => {
                  setSelectedSheetId(sheet.id);
                  setActiveSheetId(sheet.id);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{sheet.title}</span>
                <span
                  className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                    isSelected ? 'bg-slate-800 text-amber-300' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {sheet.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Excel Sheet Controls & Filters Ribbon */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-4">
        {/* Top Controls: Mode Switcher + Warehouse + Date + Shift + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Mode Switcher: Day-Wise vs Total Cumulative */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setLogViewMode('DAY_WISE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                logViewMode === 'DAY_WISE'
                  ? 'bg-white text-teal-900 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              <span>📅 Day-Wise View</span>
            </button>
            <button
              onClick={() => setLogViewMode('TOTAL_CUMULATIVE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                logViewMode === 'TOTAL_CUMULATIVE'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>📊 Total All-Time Log</span>
            </button>
          </div>

          {/* Filters Filter Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Picker (in Day-Wise mode) */}
            {logViewMode === 'DAY_WISE' && (
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
                />
              </div>
            )}

            {/* Warehouse filter — a picker for whoever spans sites, a locked
                label for anyone pinned to one. Offering a POC a site they
                cannot see would be a control that does nothing. */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              {caps.canViewAllSites ? (
                <select
                  value={filterWarehouse}
                  onChange={e => setFilterWarehouse(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
                >
                  <option value="ALL">All Warehouses ({warehouses.length} Hubs)</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} - {w.city}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-bold text-slate-800 inline-flex items-center gap-1">
                  {warehouses.find(w => w.id === effectiveWarehouseFilter)?.code || effectiveWarehouseFilter}
                  <Lock className="w-3 h-3 text-slate-400" />
                </span>
              )}
            </div>

            {/* Shift Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={filterShift}
                onChange={e => setFilterShift(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL">All Shifts</option>
                <option value="MORNING">Morning Shift</option>
                <option value="EVENING">Evening Shift</option>
                <option value="NIGHT">Night Shift</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search cells, remarks, ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Excel Spreadsheet Grid Display */}
      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Spreadsheet Top Info Ribbon */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-900">
              {currentSheetDef.title} ({currentSheetDef.code})
            </span>
            <span className="text-slate-400">•</span>
            <span>
              Showing <strong>{filteredRows.length}</strong> record(s)
            </span>
            <span className="text-slate-400">•</span>
            <span className="font-semibold text-teal-700">
              Mode: {logViewMode === 'DAY_WISE' ? `Day-Wise (${filterDate})` : 'Total Cumulative All-Time'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedSheetId === 'SHEET_DIESEL' && (
              <span className="text-[11px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md border border-amber-200">
                Step 2 Active: Click Approve/Reject in table to trigger Mail #2
              </span>
            )}
            <span className="text-[11px] text-slate-400">Click any cell or row to inspect</span>

            {/* Exports the COMPLETE header for whichever service is open —
                `columns`, not `visibleColumns`. Hiding a column is a
                viewing preference; it should not quietly decide what the
                recipient of the file is allowed to see. */}
            <ExportPanel
              rows={filteredRows}
              spec={exportSpec}
              caps={caps}
              sites={exportSites}
            />
          </div>
        </div>

        {/* The Excel Table Grid */}
        <div className="overflow-x-auto max-h-[580px] overflow-y-auto relative">
          <table className="w-full text-xs text-left border-collapse border-slate-300 font-mono">
            {/* Excel Column Letters Header Row */}
            <thead className="bg-slate-200 text-slate-600 sticky top-0 z-20 select-none">
              <tr className="border-b border-slate-300">
                {/* Row Number Column */}
                <th className="w-12 py-1 px-2 text-center text-[10px] font-black border-r border-slate-300 bg-slate-300 text-slate-700">
                  #
                </th>
                {visibleColumns.map((col, idx) => (
                  <th
                    key={`excel-letter-${col}`}
                    className="py-1 px-3 text-center text-[10px] font-black uppercase border-r border-slate-300 bg-slate-200 text-slate-600"
                  >
                    {getExcelColName(idx)}
                  </th>
                ))}
                <th className="py-1 px-2 text-center text-[10px] font-black uppercase bg-slate-200 text-slate-600">
                  Action
                </th>
              </tr>

              {/* Data Column Names Header Row */}
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-sans">
                <th className="w-12 py-2 px-2 text-center text-xs font-black border-r border-slate-300 bg-slate-200 text-slate-700">
                  Row
                </th>
                {visibleColumns.map(col => {
                  const isSorted = sortColumn === col;
                  return (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="py-2 px-3 text-xs font-bold border-r border-slate-300 hover:bg-slate-200 cursor-pointer transition select-none"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate">{selectedSheetId === 'SHEET_DIESEL' ? (DIESEL_COLUMN_LABELS[col] || col) : col}</span>
                        <ArrowUpDown
                          className={`w-3 h-3 ${isSorted ? 'text-teal-700 font-black' : 'text-slate-400'}`}
                        />
                      </div>
                    </th>
                  );
                })}
                <th className="py-2 px-3 text-center text-xs font-bold bg-slate-100">
                  Inspect
                </th>
              </tr>
            </thead>

            {/* Grid Data Rows */}
            <tbody className="divide-y divide-slate-200 font-sans">
              {filteredRows.length > 0 ? (
                filteredRows.map((row, rowIdx) => {
                  return (
                    <tr
                      key={row.id || rowIdx}
                      className="hover:bg-teal-50/60 transition group even:bg-slate-50/70"
                    >
                      {/* Row Index Number */}
                      <td className="py-2 px-2 text-center text-[11px] font-bold font-mono text-slate-500 bg-slate-100/80 border-r border-slate-300 select-none">
                        {rowIdx + 1}
                      </td>

                      {/* Cells */}
                      {visibleColumns.map(colKey => {
                        const val = row[colKey];
                        const isSelected =
                          selectedCell?.rowIdx === rowIdx && selectedCell?.colKey === colKey;

                        let displayVal = val;
                        if (val === undefined || val === null) {
                          displayVal = selectedSheetId === 'SHEET_DIESEL'
                            ? <span className="text-slate-400 italic">N/A</span>
                            : <span className="text-slate-300 italic font-mono">-</span>;
                        } else if (typeof val === 'boolean') {
                          displayVal = val ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                              TRUE
                            </span>
                          ) : (
                            <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                              FALSE
                            </span>
                          );
                        } else if ((colKey === 'status' || colKey === 'validation') && selectedSheetId === 'SHEET_DIESEL') {
                          displayVal = (
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                val === 'Rejected' || val === 'Not Delivered'
                                  ? 'bg-rose-100 text-rose-800'
                                  : val === 'Pending Admin Approval' || val === 'Pending Validation' || val === 'Partial Delivery' || val === 'Partial Delivered'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {String(val)}
                            </span>
                          );
                        } else if (colKey === 'status' || colKey === 'worstStatus') {
                          displayVal = (
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                String(val).toLowerCase().includes('clear') ||
                                String(val).toLowerCase().includes('active') ||
                                String(val).toLowerCase().includes('verified')
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : String(val).toLowerCase().includes('partial') ||
                                    String(val).toLowerCase().includes('warning')
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {String(val)}
                            </span>
                          );
                        } else if (typeof val === 'number') {
                          displayVal = <span className="font-mono font-bold text-slate-900">{val}</span>;
                        }

                        return (
                          <td
                            key={colKey}
                            onClick={() => setSelectedCell({ rowIdx, colKey, val })}
                            onDoubleClick={() => setActiveRecordDetail(row)}
                            className={`py-2 px-3 text-xs border-r border-slate-200 truncate max-w-[200px] cursor-pointer ${
                              isSelected ? 'bg-teal-100 ring-2 ring-teal-500 z-10' : ''
                            }`}
                            title={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                          >
                            {displayVal}
                          </td>
                        );
                      })}

                      {/* Row Action */}
                      <td className="py-2 px-3 text-center border-slate-200">
                        {selectedSheetId === 'SHEET_DIESEL' ? (
                          <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                            {row.status === 'Pending Admin Approval' ? (
                              // Exactly two decision options — no other status is choosable here.
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const res = approveDieselLog(row.id);
                                    setNotification({
                                      type: res.success ? 'success' : 'error',
                                      message: res.success ? `Requisition [${row.uniqueId || row.id}] Approved! Mail #2 sent to POC & Vendor.` : res.message
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-xs transition cursor-pointer"
                                  title="Approve"
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const reason = window.prompt('Rejection reason (required):');
                                    if (!reason || !reason.trim()) return;
                                    const res = rejectDieselLog(row.id, reason.trim());
                                    setNotification({
                                      type: res.success ? 'warning' : 'error',
                                      message: res.success ? `Requisition [${row.uniqueId || row.id}] Rejected! Mail #2 sent.` : res.message
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold transition cursor-pointer"
                                  title="Reject"
                                >
                                  ✗ Reject
                                </button>
                              </>
                            ) : row.status === 'Ready for Delivery' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onNavigateToDiesel) onNavigateToDiesel();
                                  else if (onNavigateTab) onNavigateTab('diesel');
                                }}
                                className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition cursor-pointer"
                                title="Awaiting POC delivery validation"
                              >
                                📷 Awaiting POD
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setActiveRecordDetail(row)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer"
                            >
                              Inspect
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveRecordDetail(row)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                      <div className="font-bold text-slate-600">No matching records found in spreadsheet</div>
                      <div className="text-xs text-slate-400">
                        Adjust your date ({filterDate}), warehouse filter, or switch to "Total All-Time Log" mode.
                      </div>
                      <button
                        onClick={() => {
                          setLogViewMode('TOTAL_CUMULATIVE');
                          setFilterWarehouse('ALL');
                          setSearchQuery('');
                        }}
                        className="mt-2 px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Switch to Total All-Time Log
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Excel Status Bar & Formula Summary at Bottom */}
        <div className="bg-slate-800 text-white px-4 py-2.5 border-t border-slate-700 flex flex-wrap items-center justify-between text-xs gap-3 font-mono">
          <div className="flex items-center gap-4 text-slate-300">
            <span>
              COUNT: <strong className="text-white font-black">{filteredRows.length}</strong>
            </span>
            {selectedCell && (
              <span className="bg-slate-700 px-2 py-0.5 rounded text-amber-300">
                Cell: Row {selectedCell.rowIdx + 1} [{selectedCell.colKey}]: {String(selectedCell.val ?? 'null')}
              </span>
            )}
          </div>

          {/* Aggregated formulas for active numeric stats */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
            {(Object.entries(numericStats) as [string, { sum: number; avg: number; min: number; max: number; count: number }][]).slice(0, 3).map(([col, st]) => (
              <div key={col} className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-0.5 rounded">
                <span className="text-amber-400 font-bold uppercase">{col}:</span>
                <span>Sum={st.sum}</span>
                <span className="text-slate-400">|</span>
                <span>Avg={st.avg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Record Inspection Modal / Drawer */}
      {activeRecordDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                  {currentSheetDef.code} • Spreadsheet Record Detail
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Log Entry: {activeRecordDetail.id || `${activeRecordDetail.date} - ${activeRecordDetail.warehouseId || activeRecordDetail.site}`}
                </h3>
              </div>
              <button
                onClick={() => setActiveRecordDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Facility</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {activeRecordDetail.warehouseName || activeRecordDetail.warehouseId || activeRecordDetail.site}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Date / Timestamp</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {activeRecordDetail.date || activeRecordDetail.timestamp}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Shift</div>
                  <div className="text-xs font-bold text-slate-900 mt-0.5">
                    {activeRecordDetail.shift || 'General'}
                  </div>
                </div>
              </div>

              {/* Diesel Requisition 3-Step Lifecycle Card */}
              {(selectedSheetId === 'SHEET_DIESEL' || activeRecordDetail.uniqueId) && (
                <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-indigo-300 uppercase tracking-wider">Diesel SOP Workflow (3 Triggers)</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      activeRecordDetail.status === 'Rejected' ? 'bg-rose-500 text-white' :
                      activeRecordDetail.status === 'Pending Admin Approval' ? 'bg-amber-500 text-white animate-pulse' :
                      'bg-emerald-500 text-white'
                    }`}>
                      Current Status: {activeRecordDetail.status || 'Pending Admin Approval'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                    <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                      <div className="font-bold text-sky-400">1. POC Form</div>
                      <div className="text-slate-300 text-[10px] mt-0.5">Mail #1 Sent ✓</div>
                    </div>
                    <div className={`p-2 rounded-lg border ${
                      activeRecordDetail.status === 'Rejected'
                        ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                        : activeRecordDetail.status === 'Pending Admin Approval'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-300 animate-pulse'
                        : 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                    }`}>
                      <div className="font-bold">2. Admin Approval</div>
                      <div className="text-[10px] mt-0.5">
                        {activeRecordDetail.status === 'Pending Admin Approval' ? 'Action Required (Sheet)' : `${activeRecordDetail.status} (Mail #2)`}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg border ${
                      activeRecordDetail.status === 'Delivery Completed' || activeRecordDetail.status === 'Partial Delivery' || activeRecordDetail.status === 'Not Delivered'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                        : activeRecordDetail.status === 'Ready for Delivery'
                        ? 'bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-800/40 border-slate-800 text-slate-500'
                    }`}>
                      <div className="font-bold">3. POD Upload</div>
                      <div className="text-[10px] mt-0.5">
                        {['Delivery Completed', 'Partial Delivery', 'Not Delivered'].includes(activeRecordDetail.status)
                          ? 'Validated (Mail #3)'
                          : activeRecordDetail.status === 'Ready for Delivery' ? 'Awaiting POC' : 'Locked'}
                      </div>
                    </div>
                  </div>

                  {/* Exactly two decision options — no other status is choosable here. */}
                  {activeRecordDetail.status === 'Pending Admin Approval' && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Rejection reason (required):');
                          if (!reason || !reason.trim()) return;
                          const res = rejectDieselLog(activeRecordDetail.id, reason.trim());
                          if (res.success) setActiveRecordDetail((prev: any) => ({ ...prev, status: 'Rejected' }));
                          setNotification({
                            type: res.success ? 'warning' : 'error',
                            message: res.success ? `Requisition [${activeRecordDetail.uniqueId || activeRecordDetail.id}] Rejected! Mail #2 sent to POC.` : res.message
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = approveDieselLog(activeRecordDetail.id);
                          if (res.success) {
                            const nextStatus = activeRecordDetail.type === 'Delivery Only' ? 'Ready for Delivery' : 'Payment Processing';
                            setActiveRecordDetail((prev: any) => ({ ...prev, status: nextStatus }));
                          }
                          setNotification({
                            type: res.success ? 'success' : 'error',
                            message: res.success ? `Requisition [${activeRecordDetail.uniqueId || activeRecordDetail.id}] Approved! Mail #2 sent to POC & Vendor.` : res.message
                          });
                        }}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* All fields grid */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
                  Spreadsheet Key-Value Matrix
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {Object.entries(activeRecordDetail).map(([k, v]) => {
                    if (typeof v === 'object') return null;
                    return (
                      <div key={k} className="px-3.5 py-2 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600">{k}</span>
                        <span className="font-mono text-slate-900 font-semibold">{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveRecordDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Row Modal */}
      {isAddRowOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                  {currentSheetDef.code}
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Add Record to {currentSheetDef.title}
                </h3>
              </div>
              <button
                onClick={() => setIsAddRowOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRowSubmit} className="space-y-3.5 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Facility</label>
                  <select
                    value={newRowData.warehouseId || warehouses[0].id}
                    onChange={e => setNewRowData({ ...newRowData, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Shift</label>
                  <select
                    value={newRowData.shift || selectedShift}
                    onChange={e => setNewRowData({ ...newRowData, shift: e.target.value as Shift })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  >
                    <option value="MORNING">Morning Shift</option>
                    <option value="EVENING">Evening Shift</option>
                    <option value="NIGHT">Night Shift</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={newRowData.date || currentDate}
                  onChange={e => setNewRowData({ ...newRowData, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>

              {/* Dynamic inputs based on fieldsConfig */}
              {currentSheetDef.fieldsConfig?.slice(0, 4).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {f.label} {f.unit ? `(${f.unit})` : ''}
                  </label>
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    placeholder={`Enter ${f.label}...`}
                    value={newRowData[f.key] || ''}
                    onChange={e => setNewRowData({ ...newRowData, [f.key]: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Remarks / Audit Note</label>
                <textarea
                  rows={2}
                  placeholder="Enter remarks..."
                  value={newRowData.remarks || ''}
                  onChange={e => setNewRowData({ ...newRowData, remarks: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRowOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Insert Row</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schema & Column Customizer Modal */}
      {isSchemaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                  Schema Customizer
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Add New Column to {currentSheetDef.title}
                </h3>
              </div>
              <button
                onClick={() => setIsSchemaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomColumn} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Column Display Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tank Fuel Density, Water PH Level..."
                  value={newColLabel}
                  onChange={e => {
                    setNewColLabel(e.target.value);
                    if (!newColKey) {
                      setNewColKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Field Key (JSON)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. fuel_density"
                    value={newColKey}
                    onChange={e => setNewColKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data Type</label>
                  <select
                    value={newColType}
                    onChange={e => setNewColType(e.target.value as FieldDefinition['type'])}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  >
                    <option value="text">Text (String)</option>
                    <option value="number">Numeric (Number)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="boolean">Boolean (True/False)</option>
                    <option value="temperature">Temperature (°C)</option>
                    <option value="time">Time</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measurement (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Litres, kWh, kg/m³, °C, Pax"
                  value={newColUnit}
                  onChange={e => setNewColUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSchemaModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Append Column to Sheet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
