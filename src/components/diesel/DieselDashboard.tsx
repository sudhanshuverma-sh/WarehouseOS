import React, { useMemo, useState } from 'react';
import { ArrowRight, Fuel, Inbox, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  computeDieselDashboard,
  dieselFilterOptions,
  EMPTY_DIESEL_FILTERS,
  filterDieselLogs,
  formatDay,
  formatLitresShort,
  percent,
  type DieselDashboardFilters,
} from '../../lib/diesel/dashboard';
import { CHART_COLORS, HorizontalBars, MiniDonut, MonthlyTrendChart, WeeklySpendChart, ZoneDonut } from './DieselCharts';
import { DieselFilterBar } from './DieselFilterBar';
import {
  Card,
  FuelCard,
  Insights,
  KpiCard,
  MonthComparison,
  QuickStats,
  RateList,
  SectionTitle,
  TopWarehouseBars,
  WarehouseTable,
} from './DieselPanels';

/**
 * Diesel Procurement dashboard — the Admin → service view for Diesel.
 *
 * Every figure is computed from the diesel requests the signed-in admin can
 * see (lib/diesel/dashboard.ts); nothing here is sample data. Filters narrow
 * the requests first, then the whole dashboard is recomputed from them.
 */
export const DieselDashboard: React.FC<{ onOpenLedger?: () => void }> = ({ onOpenLedger }) => {
  const { dieselLogs } = useApp();
  const [filters, setFilters] = useState<DieselDashboardFilters>(EMPTY_DIESEL_FILTERS);

  const options = useMemo(() => dieselFilterOptions(dieselLogs), [dieselLogs]);
  const filtered = useMemo(() => filterDieselLogs(dieselLogs, filters), [dieselLogs, filters]);
  const d = useMemo(() => computeDieselDashboard(filtered), [filtered]);
  const { kpi } = d;

  const generated = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Fuel className="w-5 h-5 text-(--color-late)" /> Diesel Procurement Dashboard
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">Generated {generated} · from diesel requests filed in WarehouseOS</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" /> Print / Save PDF
        </button>
        {onOpenLedger && (
          <button
            type="button"
            onClick={onOpenLedger}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            Open diesel ledger <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (dieselLogs.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <div className="flex flex-col items-center text-center py-12 gap-2">
            <Inbox className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No diesel requests yet</p>
            <p className="text-xs text-slate-500 max-w-sm">
              The dashboard fills in as POCs file diesel requests in the app. Every figure here comes from those requests.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <DieselFilterBar filters={filters} options={options} onChange={setFilters} />

      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-12 gap-2">
            <Inbox className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No requests match these filters</p>
            <button type="button" onClick={() => setFilters(EMPTY_DIESEL_FILTERS)} className="text-xs font-semibold text-(--color-filed) underline cursor-pointer">
              Clear all filters
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* 1. Key performance metrics */}
          <SectionTitle
            aside={
              <>
                {kpi.firstDay && `Showing: ${formatDay(kpi.firstDay)} → ${formatDay(kpi.lastDay)} · `}
                {kpi.records.toLocaleString('en-IN')} records
                {kpi.duplicatesRemoved > 0 && ` (${kpi.duplicatesRemoved} duplicate${kpi.duplicatesRemoved > 1 ? 's' : ''} removed)`}
              </>
            }
          >
            Key performance metrics
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label={filters.entity ? `${filters.entity} spend` : 'Total spend'} value={kpi.totalSpend} sub={`${formatLitresShort(kpi.totalQty)} total`} accent="#cf7841" />
            <KpiCard label="B2B spend" value={kpi.b2bSpend} sub={`${percent(kpi.b2bSpend, kpi.totalSpend)}% of total · ${formatLitresShort(kpi.b2bQty)}`} accent="#3f79b5" />
            <KpiCard label="B2C spend" value={kpi.b2cSpend} sub={`${percent(kpi.b2cSpend, kpi.totalSpend)}% of total · ${formatLitresShort(kpi.b2cQty)}`} accent="#4f9377" />
          </div>

          {/* 2. Fuel breakdown */}
          <SectionTitle aside="Diesel vs DEF">Fuel breakdown</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FuelCard label="DIESEL" {...d.fuel.diesel} accent="#cf7841" />
            <FuelCard label="DEF" {...d.fuel.def} accent="#8a6fcc" />
          </div>

          {/* 3. Spend analysis */}
          <SectionTitle>Spend analysis</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <MonthlyTrendChart months={d.monthly} />
            <ZoneDonut zones={d.zones} />
          </div>
          <WeeklySpendChart weeks={d.weekly} />

          {/* 4. Warehouse performance */}
          <SectionTitle>Warehouse performance</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-3">
            <TopWarehouseBars data={d.topWarehouses} />
            <QuickStats kpi={kpi} />
          </div>

          {/* 5. Vendor intelligence */}
          <SectionTitle>Vendor intelligence</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <HorizontalBars title="Vendor transaction share" rows={d.vendorsByCount} valueKey="count" />
            <Card>
              <div className="space-y-5">
                <MiniDonut
                  title="Order type"
                  data={[
                    { name: 'Delivery Only', value: d.orderType.delivery },
                    { name: 'Payment Only', value: d.orderType.payment },
                  ]}
                  colors={['#3f79b5', '#cf7841']}
                />
                <MiniDonut
                  title="Fuel type"
                  data={[
                    { name: 'Diesel', value: d.fuelType.diesel },
                    { name: 'DEF', value: d.fuelType.def },
                  ]}
                  colors={['#cf7841', '#8a6fcc']}
                />
              </div>
            </Card>
            <RateList rows={d.vendorRates} />
          </div>
          <Insights items={d.insights} />

          {/* 6. Warehouse analytics */}
          <SectionTitle>Warehouse analytics</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-[2.2fr_1fr] gap-3">
            <Card title="Top warehouses by spend">
              <WarehouseTable rows={d.warehouses} limit={20} />
            </Card>
            <HorizontalBars title="Vendor spend share" rows={d.vendorsBySpend} valueKey="spend" />
          </div>

          {/* 7. Month comparison */}
          <SectionTitle>Month comparison</SectionTitle>
          <MonthComparison months={d.monthly} />

          {/* 8. Every warehouse */}
          <Card
            title="All warehouses — complete list"
            actions={<span className="text-[11px] text-slate-500 font-mono">{d.warehouses.length} warehouses total</span>}
          >
            <WarehouseTable rows={d.warehouses} maxHeight="28rem" />
          </Card>

          <p className="text-[10px] text-slate-400 text-center" style={{ color: CHART_COLORS[8] + '99' }}>
            Status counts the admin decision (Approved / Rejected / Pending). Delivered litres follow the POC’s validation.
          </p>
        </>
      )}
    </div>
  );
};
