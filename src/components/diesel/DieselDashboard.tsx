import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Download, FileDown, Fuel, Inbox, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  channelOf,
  computeDieselDashboard,
  DATE_PRESETS,
  dieselFilterOptions,
  EMPTY_DIESEL_FILTERS,
  filterDieselLogs,
  formatDay,
  indiaDay,
  statusOf,
  vendorOf,
  warehouseOf,
  type DieselDashboardFilters,
} from '../../lib/diesel/dashboard';
import { downloadPdf, pdfFileName } from '../../lib/export/pdf';
import type { DieselLog } from '../../types';
import {
  KpiRow,
  MonthCompare,
  MonthlyTrend,
  NEU,
  OrderFuelType,
  QuickStats,
  RateList,
  SectionHead,
  TopWarehouses,
  VendorShare,
  WarehouseTable,
  WeeklyTrend,
  ZoneBreakdown,
} from './DieselNeu';
import { DieselNeuFilterBar } from './DieselNeuFilterBar';

/**
 * Diesel Procurement dashboard: the Admin Service Hub view for Diesel, in the
 * neumorphic look (soft grey-blue surface, raised cards, pressed-in wells,
 * one orange accent).
 *
 * Every figure is computed from the diesel requests the signed-in admin can
 * see (lib/diesel/dashboard.ts); nothing here is sample data. Filters narrow
 * the requests first, then the whole dashboard is recomputed from them.
 */
export const DieselDashboard: React.FC<{ onOpenLedger?: () => void }> = ({ onOpenLedger }) => {
  const { dieselLogs, notify, currentDate } = useApp();
  const [filters, setFilters] = useState<DieselDashboardFilters>(EMPTY_DIESEL_FILTERS);
  const [busy, setBusy] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  const options = useMemo(() => dieselFilterOptions(dieselLogs), [dieselLogs]);
  const filtered = useMemo(() => filterDieselLogs(dieselLogs, filters), [dieselLogs, filters]);
  const d = useMemo(() => computeDieselDashboard(filtered), [filtered]);
  const { kpi } = d;

  const generated = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const range = kpi.firstDay ? `${formatDay(kpi.firstDay)} to ${formatDay(kpi.lastDay)}` : 'No dates';
  const presetLabel = filters.month || (filters.preset ? DATE_PRESETS.find((p) => p.value === filters.preset)?.label : '') || 'All dates';
  const subtitle = `Generated ${generated}, ${kpi.records.toLocaleString('en-IN')} records${kpi.duplicatesRemoved ? ` (${kpi.duplicatesRemoved} duplicates removed)` : ''}`;

  const pdf = async () => {
    if (!page.current || busy) return;
    setBusy(true);
    try {
      await downloadPdf(page.current, { title: 'Diesel Procurement Dashboard', subtitle: `${range}, ${kpi.records.toLocaleString('en-IN')} records`, fileName: pdfFileName('Diesel Procurement Dashboard', currentDate) });
      notify('success', 'PDF downloaded', 'The Diesel Procurement dashboard is in your downloads.');
    } catch (e) {
      console.error('PDF export failed', e);
      notify('error', 'Could not make the PDF', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-[54px] h-[54px] rounded-[18px] flex items-center justify-center shrink-0 neu-raised" style={{ background: NEU.accent }}>
          <Fuel className="w-6 h-6 text-white" strokeWidth={1.9} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="m-0 text-2xl sm:text-[30px] leading-tight font-semibold" style={{ color: NEU.ink }}>
            Diesel Procurement Dashboard
          </h1>
          <span className="text-sm truncate" style={{ color: NEU.muted }}>
            {subtitle}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3.5 print:hidden" data-pdf-ignore>
        <span className="neu-raised flex items-center gap-2 h-[46px] px-5 rounded-2xl text-sm font-semibold" style={{ color: NEU.ink }}>
          <CalendarDays className="w-[18px] h-[18px]" strokeWidth={1.9} />
          {presetLabel}
        </span>
        <button
          type="button"
          onClick={pdf}
          disabled={busy}
          className="neu-press neu-raised flex items-center gap-2 h-[46px] px-5 rounded-2xl border-0 text-sm font-semibold cursor-pointer disabled:cursor-wait"
          style={{ color: NEU.ink }}
        >
          {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <FileDown className="w-[18px] h-[18px]" strokeWidth={1.9} />}
          {busy ? 'Preparing PDF' : 'PDF'}
        </button>
        <button
          type="button"
          onClick={() => exportCsv(filtered, pdfFileName('diesel-requests', currentDate))}
          disabled={!filtered.length}
          className="neu-press neu-raised flex items-center gap-2 h-[46px] px-5 rounded-2xl border-0 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          style={{ background: NEU.accent }}
        >
          <Download className="w-[18px] h-[18px]" strokeWidth={1.9} /> Export CSV
        </button>
        {onOpenLedger && (
          <button
            type="button"
            onClick={onOpenLedger}
            className="neu-press neu-raised flex items-center gap-2 h-[46px] px-5 rounded-2xl border-0 text-sm font-semibold cursor-pointer"
            style={{ color: NEU.ink }}
          >
            Ledger <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const empty = (title: string, body: string, action?: React.ReactNode) => (
    <div className="neu-card flex flex-col items-center text-center py-14 px-6 gap-2">
      <span className="neu-inset w-14 h-14 rounded-2xl flex items-center justify-center">
        <Inbox className="w-6 h-6" style={{ color: NEU.muted }} />
      </span>
      <p className="mt-2 text-base font-semibold" style={{ color: NEU.ink }}>
        {title}
      </p>
      <p className="text-sm max-w-sm" style={{ color: NEU.muted }}>
        {body}
      </p>
      {action}
    </div>
  );

  return (
    <div ref={page} className="neu-root rounded-[32px] px-4 py-6 sm:px-8 sm:py-9 flex flex-col gap-6">
      {header}

      {dieselLogs.length === 0 ? (
        empty('No diesel requests yet', 'The dashboard fills in as POCs file diesel requests in the app. Every figure here comes from those requests.')
      ) : (
        <>
          <DieselNeuFilterBar filters={filters} options={options} onChange={setFilters} />

          {filtered.length === 0 ? (
            empty(
              'No requests match these filters',
              'Try a wider period or clear a filter.',
              <button
                type="button"
                onClick={() => setFilters(EMPTY_DIESEL_FILTERS)}
                className="neu-press mt-3 h-11 px-5 rounded-2xl border-0 text-sm font-semibold text-white cursor-pointer"
                style={{ background: NEU.accent }}
              >
                Clear all filters
              </button>,
            )
          ) : (
            <>
              <SectionHead aside={`Showing ${range}`}>Key performance metrics &amp; fuel breakdown</SectionHead>
              <KpiRow d={d} entity={filters.entity} />

              <SectionHead>Spend analysis</SectionHead>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
                <MonthlyTrend months={d.monthly} />
                <ZoneBreakdown zones={d.zones} />
              </div>
              <WeeklyTrend weeks={d.weekly} />

              <SectionHead>Warehouse performance</SectionHead>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
                <TopWarehouses rows={d.warehouses} />
                <QuickStats kpi={kpi} />
              </div>

              <SectionHead>Vendor intelligence</SectionHead>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)] gap-6">
                <VendorShare byCount={d.vendorsByCount} bySpend={d.vendorsBySpend} />
                <OrderFuelType d={d} />
                <div className="md:col-span-2 xl:col-span-1 grid">
                  <RateList rows={d.vendorRates} />
                </div>
              </div>

              <SectionHead aside={`${d.warehouses.length} warehouses total`}>Warehouse analytics</SectionHead>
              <WarehouseTable rows={d.warehouses} />

              <SectionHead>Month comparison</SectionHead>
              <MonthCompare months={d.monthly} />

              <p className="text-xs text-center" style={{ color: NEU.muted }}>
                Status counts the admin decision (Approved, Rejected, Pending). Delivered litres follow the POC's validation.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
};

/** The requests in view as a CSV, one row each. */
function exportCsv(rows: DieselLog[], fileName: string) {
  const cols: [string, (l: DieselLog) => string | number][] = [
    ['Unique ID', (l) => l.uniqueId],
    ['Date', (l) => indiaDay(l.timestamp)],
    ['Warehouse', (l) => warehouseOf(l)],
    ['Cost center', (l) => l.costCenter ?? ''],
    ['Zone', (l) => l.zone ?? ''],
    ['B2B / B2C', (l) => channelOf(l)],
    ['Vendor', (l) => vendorOf(l)],
    ['Fuel', (l) => l.fuel],
    ['Type', (l) => l.type],
    ['Quantity (L)', (l) => l.quantity ?? ''],
    ['Delivered (L)', (l) => l.deliveredQuantityLitres ?? ''],
    ['Rate per litre', (l) => l.ratePerLitre ?? ''],
    ['Amount', (l) => l.finalAmount ?? ''],
    ['Status', (l) => statusOf(l)],
    ['Requested by', (l) => l.submittedByName ?? ''],
  ];
  const esc = (v: string | number) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [cols.map(([h]) => esc(h)).join(','), ...rows.map((l) => cols.map(([, get]) => esc(get(l))).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
