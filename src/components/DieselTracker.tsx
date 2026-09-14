import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Fuel, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Building2, 
  Upload, 
  QrCode, 
  Image as ImageIcon, 
  DollarSign, 
  TrendingDown, 
  Eye, 
  Filter, 
  X, 
  Sparkles, 
  ShieldAlert,
  Camera,
  Mail,
  ExternalLink,
  ShieldCheck,
  ArrowLeft,
  Download,
  Search,
  Layers
} from 'lucide-react';
import { DieselLog, DieselValidation, DieselStatus } from '../types';
import { PageHeader } from './common/PageHeader';
import { DieselLogForm } from './forms/DieselLogForm';
import { ExportPanel } from './common/ExportPanel';
import { SheetSyncPanel } from './common/SheetSyncPanel';
import { capabilitiesFor } from '../lib/permissions';
import { DIESEL_EXPORT } from '../lib/export/dieselExport';
import { ColumnFilter } from './common/ColumnFilter';
import { applyColumnFilters, countActiveFilters, clearAllFilters, type ColumnFilters } from '../lib/table/columnFilters';

/**
 * The ledger's columns, in the order of the ZHPL Diesel master sheet, so
 * this table and the connected Google Sheet read 1:1.
 *
 * Header cells are rendered from this rather than written out one by one —
 * a filter control has to attach to each column's key, and twenty-one
 * hand-written <th> elements have no key to attach it to.
 */
const LEDGER_COLUMNS: { key: string; label: string; align?: string }[] = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'emailAddress', label: 'Email Address' },
  { key: 'entity', label: 'Entity' },
  { key: 'whNameB2B', label: 'WH NAME (B2B)' },
  { key: 'whNameB2C', label: 'WH NAME (B2C)' },
  { key: 'costCenter', label: 'COST CENTER' },
  { key: 'zone', label: 'Zone' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'type', label: 'Type' },
  { key: 'vendorNamePayment', label: 'Vendor Name(Payment)' },
  { key: 'quantity', label: 'Quantity', align: 'text-right' },
  { key: 'ratePerLitre', label: 'Rate per Litres', align: 'text-right' },
  { key: 'finalAmount', label: 'Final Amount', align: 'text-right' },
  { key: 'qrCodeImageUrl', label: 'QR Code Image', align: 'text-center' },
  { key: 'vendorNameDelivery', label: 'Vendor Name(Delivery)' },
  { key: 'orderQuantityLitres', label: 'Order Quantity', align: 'text-right' },
  { key: 'uniqueId', label: 'Unique ID' },
  { key: 'status', label: 'Status', align: 'text-center' },
  { key: 'validation', label: 'Validation', align: 'text-center' },
  { key: 'deliveredQuantityLitres', label: 'Delivered Quantity', align: 'text-right' },
  { key: 'podUrl', label: "POD's", align: 'text-center' },
];

interface DieselTrackerProps {
  onBack?: () => void;
}

export const DieselTracker: React.FC<DieselTrackerProps> = ({ onBack }) => {
  const { 
    dieselLogs, 
    emailLogs,
    createDieselLog, 
    warehouses, 
    selectedWarehouseId, 
    currentUser, 
    currentDate,
    approveDieselLog,
    rejectDieselLog
  } = useApp();

  const caps = capabilitiesFor(currentUser);

  const [viewMode, setViewMode] = useState<'dashboard' | 'form' | 'pod' | 'approval' | 'mail-logs'>('dashboard');
  const [selectedLogIdForForm, setSelectedLogIdForForm] = useState<string | undefined>(undefined);
  const [filterValidation, setFilterValidation] = useState<'ALL' | DieselValidation>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | DieselStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLogForInspection, setSelectedLogForInspection] = useState<DieselLog | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});

  // If viewMode is not dashboard, render DieselLogForm
  if (viewMode !== 'dashboard') {
    return (
      <DieselLogForm
        onBack={() => setViewMode('dashboard')}
        onSuccess={() => setViewMode('dashboard')}
        initialMode={viewMode}
        selectedLogId={selectedLogIdForForm}
      />
    );
  }

  // Filter logs by warehouse, search query, status and validation
  const scopedLogs = dieselLogs.filter(log => {
    const isWhMatched = selectedWarehouseId === 'ALL' || log.warehouseId === selectedWarehouseId;
    const isValMatched = filterValidation === 'ALL' || log.validation === filterValidation;
    const isStatusMatched = filterStatus === 'ALL' || log.status === filterStatus;
    const matchesSearch = !searchQuery || 
      (log.uniqueId?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.whNameB2B?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.vendorNamePayment?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.vendorNameDelivery?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.emailAddress?.toLowerCase().includes(searchQuery.toLowerCase()));

    return isWhMatched && isValMatched && isStatusMatched && matchesSearch;
  });

  // Per-column filters on top of the toolbar's own. What the table shows
  // is what Export writes, because both read this list.
  const filteredLogs = applyColumnFilters(
    scopedLogs as unknown as Record<string, unknown>[],
    columnFilters
  ) as unknown as DieselLog[];

  // KPI Calculations
  const totalSpend = filteredLogs.reduce((acc, log) => acc + (log.finalAmount || 0), 0);
  const totalVolumeLitres = filteredLogs.reduce((acc, log) => acc + (log.deliveredQuantityLitres || log.orderQuantityLitres || log.quantity || 0), 0);
  const discrepancyCount = filteredLogs.filter(log => log.validation === 'Partial Delivered').length;
  const pendingApprovalCount = filteredLogs.filter(log => log.status === 'Pending Admin Approval').length;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <PageHeader
        title="Diesel & Fuel Procurement"
        description="Audit ledger, volume tracking, and delivery verification for site fuel management."
        icon={Fuel}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {onBack && (
              <button
                id="btn-back-tracker"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}

            <button
              id="btn-open-camera-pod"
              onClick={() => {
                setSelectedLogIdForForm(dieselLogs[0]?.id);
                setViewMode('pod');
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-emerald-700" />
              Upload POD
            </button>

            <button
              id="btn-open-email-logs"
              onClick={() => setViewMode('mail-logs')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <Mail className="w-4 h-4 text-sky-700" />
              Email Logs ({emailLogs.length})
            </button>

            <button
              id="btn-open-diesel-form"
              onClick={() => setViewMode('form')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Requisition
            </button>
          </div>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spend */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Fuel Procurement</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            ₹{totalSpend.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across {filteredLogs.length} requisition logs</div>
        </div>

        {/* Volume Inwarded */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Fuel Volume Procured</span>
            <Fuel className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {totalVolumeLitres.toLocaleString('en-IN')} <span className="text-sm font-normal text-slate-500">Litres</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">High-Speed Diesel (BS-VI & HSD)</div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Admin Approvals</span>
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600">
            {pendingApprovalCount}
          </div>
          <button
            onClick={() => setViewMode('approval')}
            className="text-xs text-amber-700 font-semibold hover:underline mt-1 inline-block"
          >
            Review Authorization Queue &rarr;
          </button>
        </div>

        {/* Audit Discrepancies */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Audit Discrepancies</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600">
            {discrepancyCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">Tanker vs Dipstick variance flagged</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Unique ID (PZHPL/DZHPL), WH name, vendor, email..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Validation Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterValidation}
              onChange={(e) => setFilterValidation(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Validations</option>
              <option value="Verified">Verified Only</option>
              <option value="Discrepancy">Discrepancy Only</option>
              <option value="Pending Validation">Pending Validation</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="shrink-0">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Delivered">Delivered</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium shrink-0">
          Showing <strong>{filteredLogs.length}</strong> records
        </div>
      </div>

      {/* Comprehensive Ledger Table with All 21 Google Form Fields */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Procurement & Delivery Ledger
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {/* A table narrowed by a header filter looks identical to one
                with no matching data. Saying so, with one click to undo,
                is what stops "the ledger is empty" being reported as a bug. */}
            {countActiveFilters(columnFilters) > 0 ? (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="text-indigo-700 font-semibold">
                  {filteredLogs.length} of {scopedLogs.length} rows
                  {' · '}
                  {countActiveFilters(columnFilters)} filter
                  {countActiveFilters(columnFilters) === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setColumnFilters(clearAllFilters())}
                  className="text-slate-500 hover:text-slate-900 underline cursor-pointer"
                >
                  Clear
                </button>
              </span>
            ) : (
              <span className="text-xs text-slate-500">Select any record to view details</span>
            )}
            {/* Sits with the table it exports, not in the page header —
                the rows are right here, so the control that takes them
                away should be too. */}
            <ExportPanel
              rows={dieselLogs}
              spec={DIESEL_EXPORT}
              caps={caps}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px] whitespace-nowrap">
                {/* Column names & order match the ZHPL Diesel master sheet exactly, so this ledger
                    lines up 1:1 with the connected Google Sheet once live sync is on. */}
                {LEDGER_COLUMNS.map(({ key, label, align }) => (
                  <th key={key} className={`py-3 px-4 ${align ?? ''}`}>
                    <span className="inline-flex items-center">
                      {label}
                      {/* Built from scopedLogs, so a column's value list is
                          the same whichever order the columns are filtered
                          in — narrowing Status should not hide vendors that
                          would reappear once Status is cleared. */}
                      <ColumnFilter
                        columnKey={key}
                        label={label}
                        rows={scopedLogs as unknown as Record<string, unknown>[]}
                        filters={columnFilters}
                        onChange={setColumnFilters}
                      />
                    </span>
                  </th>
                ))}
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            {/* See SheetDataExplorer: keyed on the filter signature so the
                rows settle when the filter changes and stay still otherwise. */}
            <tbody
              key={JSON.stringify(
                Object.entries(columnFilters).map(([k, v]) => [k, [...v].sort()])
              )}
              className="divide-y divide-slate-100 animate-settle"
            >
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={22} className="py-8 text-center text-slate-400">
                    No diesel procurement records match your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isDiscrepancy = log.validation === 'Partial Delivered';
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                      onClick={() => setSelectedLogForInspection(log)}
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} {' '}
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Email Address */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono">{log.emailAddress || '—'}</td>

                      {/* Entity */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">{log.entity || '—'}</td>

                      {/* WH NAME (B2B) */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">{log.whNameB2B || '—'}</td>

                      {/* WH NAME (B2C) */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">{log.whNameB2C || '—'}</td>

                      {/* COST CENTER */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">{log.costCenter || '—'}</td>

                      {/* Zone */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">{log.zone || '—'}</td>

                      {/* Fuel */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">{log.fuel}</td>

                      {/* Type */}
                      <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-700">{log.type}</td>

                      {/* Vendor Name(Payment) */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800">{log.vendorNamePayment || 'N/A'}</td>

                      {/* Quantity */}
                      <td className="py-3 px-4 font-mono text-right font-semibold text-slate-800">
                        {(log.quantity || 0).toLocaleString()}
                      </td>

                      {/* Rate per Litres */}
                      <td className="py-3 px-4 font-mono text-right text-slate-600">
                        ₹{log.ratePerLitre.toFixed(2)}
                      </td>

                      {/* Final Amount */}
                      <td className="py-3 px-4 font-mono text-right font-bold text-slate-900">
                        ₹{log.finalAmount.toLocaleString('en-IN')}
                      </td>

                      {/* QR Code Image */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {log.qrCodeImageUrl ? (
                          <span className="text-emerald-600 font-bold">Attached</span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>

                      {/* Vendor Name(Delivery) */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800">{log.vendorNameDelivery || 'N/A'}</td>

                      {/* Order Quantity */}
                      <td className="py-3 px-4 font-mono text-right font-semibold text-slate-800">
                        {log.orderQuantityLitres !== undefined ? log.orderQuantityLitres.toLocaleString() : 'N/A'}
                      </td>

                      {/* Unique ID */}
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {log.uniqueId}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          log.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                          log.status === 'Delivery Completed' ? 'bg-sky-100 text-sky-800' :
                          log.status === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800 animate-pulse'
                        }`}>
                          {log.status}
                        </span>
                      </td>

                      {/* Validation */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {log.validation ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold font-mono uppercase ${
                            log.validation === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            log.validation === 'Partial Delivered' ? 'bg-amber-50 text-amber-800 border border-amber-300' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {log.validation === 'Delivered' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {log.validation === 'Partial Delivered' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                            {log.validation}
                          </span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>

                      {/* Delivered Quantity */}
                      <td className={`py-3 px-4 font-mono text-right font-bold ${
                        isDiscrepancy ? 'text-amber-700' : 'text-slate-900'
                      }`}>
                        {log.deliveredQuantityLitres !== undefined ? log.deliveredQuantityLitres.toLocaleString() : 'N/A'}
                      </td>

                      {/* POD's Proof of Delivery */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {log.podUrl ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline">
                            <Camera className="w-3.5 h-3.5" />
                            Attached
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogIdForForm(log.id);
                              setViewMode('pod');
                            }}
                            className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                          >
                            + Upload POD
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedLogForInspection(log)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                            title="Audit Inspection"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLogIdForForm(log.id);
                              setViewMode('pod');
                            }}
                            className="p-1 text-emerald-600 hover:text-emerald-800 rounded hover:bg-emerald-50"
                            title="Direct Camera POD"
                          >
                            <Camera className="w-4 h-4" />
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

      {/* Modal: Detailed POD & Audit Inspection View */}
      {selectedLogForInspection && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">Fuel Procurement Audit Record</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                    selectedLogForInspection.validation === 'Partial Delivered'
                      ? 'bg-amber-400 text-amber-950'
                      : 'bg-emerald-400 text-emerald-950'
                  }`}>
                    {selectedLogForInspection.validation}
                  </span>
                </div>
                <p className="text-xs font-mono text-indigo-300 mt-0.5">
                  Unique ID: {selectedLogForInspection.uniqueId} &bull; Thread ID: {selectedLogForInspection.threadId || '—'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedLogForInspection(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* 3-Step Lifecycle Workflow Status */}
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-indigo-300 uppercase tracking-wider">Diesel SOP Workflow (3 Email Steps)</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] ${
                    selectedLogForInspection.status === 'Approved' ? 'bg-emerald-500 text-white' :
                    selectedLogForInspection.status === 'Delivery Completed' ? 'bg-sky-500 text-white' :
                    selectedLogForInspection.status === 'Rejected' ? 'bg-rose-500 text-white' :
                    'bg-amber-500 text-white animate-pulse'
                  }`}>
                    {selectedLogForInspection.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                    <div className="font-bold text-sky-400">1. POC Requisition</div>
                    <div className="text-slate-300 text-[10px] mt-0.5">Mail #1 Sent ✓</div>
                  </div>
                  <div className={`p-2 rounded-lg border ${
                    selectedLogForInspection.status === 'Approved' || selectedLogForInspection.status === 'Delivery Completed'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                      : selectedLogForInspection.status === 'Rejected'
                      ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                      : 'bg-amber-950/60 border-amber-500 text-amber-300 animate-pulse'
                  }`}>
                    <div className="font-bold">2. Admin Approval</div>
                    <div className="text-[10px] mt-0.5">
                      {selectedLogForInspection.status === 'Pending Admin Approval' ? 'Action Required' : `${selectedLogForInspection.status} (Mail #2)`}
                    </div>
                  </div>
                  <div className={`p-2 rounded-lg border ${
                    selectedLogForInspection.status === 'Delivery Completed'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                      : selectedLogForInspection.status === 'Approved'
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-slate-800/40 border-slate-800 text-slate-500'
                  }`}>
                    <div className="font-bold">3. POD Validation</div>
                    <div className="text-[10px] mt-0.5">
                      {selectedLogForInspection.status === 'Delivery Completed' ? 'Verified (Mail #3)' : selectedLogForInspection.status === 'Approved' ? 'Ready for POD' : 'Locked'}
                    </div>
                  </div>
                </div>

                {selectedLogForInspection.status === 'Pending Admin Approval' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await rejectDieselLog(selectedLogForInspection.id, 'Rejected by Admin from Audit View');
                        if (res.success) setSelectedLogForInspection(prev => res.log ?? (prev ? { ...prev, status: 'Rejected' } : null));
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                    >
                      Reject (Trigger Mail #2)
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await approveDieselLog(selectedLogForInspection.id, 'Authorized by Admin from Audit View');
                        if (res.success) {
                          setSelectedLogForInspection(prev =>
                            res.log ?? (prev ? { ...prev, status: prev.type === 'Delivery Only' ? 'Ready for Delivery' : 'Payment Processing' } : null)
                          );
                        }
                      }}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                    >
                      Approve & Authorize (Trigger Mail #2)
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Warehouse (B2B)</span>
                  <span className="font-bold text-slate-800">{selectedLogForInspection.whNameB2B || selectedLogForInspection.warehouseId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Fuel Grade</span>
                  <span className="font-bold text-slate-800">{selectedLogForInspection.fuel}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Rate per Litre</span>
                  <span className="font-bold text-slate-800 font-mono">₹{selectedLogForInspection.ratePerLitre.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Ordered Quantity</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {(selectedLogForInspection.orderQuantityLitres || selectedLogForInspection.quantity || 0).toLocaleString()} L
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Delivered Quantity</span>
                  <span className={`font-bold font-mono ${
                    selectedLogForInspection.validation === 'Partial Delivered' ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {selectedLogForInspection.deliveredQuantityLitres !== undefined
                      ? `${selectedLogForInspection.deliveredQuantityLitres.toLocaleString()} L`
                      : 'Pending Delivery'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Final Invoice Total</span>
                  <span className="font-bold text-indigo-700 text-sm font-mono">
                    ₹{selectedLogForInspection.finalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Attachments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    Proof of Delivery (POD) Snapshot
                  </span>
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-48 flex items-center justify-center">
                    {selectedLogForInspection.podUrl ? (
                      <img 
                        src={selectedLogForInspection.podUrl} 
                        alt="Proof of delivery" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="text-center p-4 space-y-2">
                        <span className="text-xs text-slate-400 block">No POD Captured Yet</span>
                        <button
                          onClick={() => {
                            setSelectedLogIdForForm(selectedLogForInspection.id);
                            setSelectedLogForInspection(null);
                            setViewMode('pod');
                          }}
                          className="text-xs font-bold text-emerald-600 hover:underline bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200"
                        >
                          + Open Camera POD
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    Vendor Invoice QR / Voucher
                  </span>
                  <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-48 flex items-center justify-center">
                    {selectedLogForInspection.qrCodeImageUrl ? (
                      <img 
                        src={selectedLogForInspection.qrCodeImageUrl} 
                        alt="Invoice QR Code" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span className="text-xs text-slate-400">No QR Voucher Attached</span>
                    )}
                  </div>
                </div>
              </div>

              {selectedLogForInspection.notes && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1">
                  <strong className="text-amber-900 block">Audit Trail & Site Notes:</strong>
                  <p className="text-amber-800">{selectedLogForInspection.notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedLogIdForForm(selectedLogForInspection.id);
                  setSelectedLogForInspection(null);
                  setViewMode('pod');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:underline"
              >
                <Camera className="w-3.5 h-3.5" />
                Upload New POD Snapshot
              </button>

              <button
                onClick={() => setSelectedLogForInspection(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
