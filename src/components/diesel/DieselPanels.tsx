import React, { useMemo, useState } from 'react';
import { Building2, Map as MapIcon, Scale, TrendingUp, Truck } from 'lucide-react';
import {
  formatLitresShort,
  formatRupeesExact,
  formatRupeesShort,
  type DieselDashboardData,
  type Insight,
  type MonthPoint,
  type WarehouseBar,
  type WarehouseRow,
} from '../../lib/diesel/dashboard';

/** Building blocks of the Diesel dashboard: cards, lists and tables. */

export const Card: React.FC<{ title?: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  actions,
  className = '',
  children,
}) => (
  <section className={`bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs break-inside-avoid min-w-0 ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {title && <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-wrap items-center gap-2 pt-2">
    <span className="w-1 h-4 rounded-full bg-(--color-filed)" />
    <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{children}</h2>
    {aside && <div className="ml-auto text-[11px] text-slate-500 font-mono">{aside}</div>}
  </div>
);

export const Tabs = <const T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) => (
  <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold print:hidden" role="tablist">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${value === o.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const KpiCard: React.FC<{ label: string; value: number; sub: string; accent: string }> = ({ label, value, sub, accent }) => (
  <div className="relative bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs overflow-hidden break-inside-avoid" title={formatRupeesExact(value)}>
    <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1.5 text-2xl font-bold font-mono tracking-tight" style={{ color: accent }}>
      {formatRupeesShort(value)}
    </div>
    <div className="mt-1 text-[11px] text-slate-500 font-mono">{sub}</div>
  </div>
);

export const FuelCard: React.FC<{ label: string; qty: number; amount: number; orders: number; accent: string }> = ({ label, qty, amount, orders, accent }) => (
  <div className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs border-l-4 break-inside-avoid" style={{ borderLeftColor: accent }}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold tracking-wide" style={{ color: accent }}>{label}</span>
      <span className="text-[11px] text-slate-400 font-mono">{orders.toLocaleString('en-IN')} orders</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-8">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quantity</div>
        <div className="text-xl font-bold font-mono" style={{ color: accent }}>{formatLitresShort(qty)}</div>
      </div>
      <div title={formatRupeesExact(amount)}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount</div>
        <div className="text-xl font-bold font-mono text-slate-900">{formatRupeesShort(amount)}</div>
      </div>
    </div>
  </div>
);

export const TopWarehouseBars: React.FC<{ data: DieselDashboardData['topWarehouses'] }> = ({ data }) => {
  const [tab, setTab] = useState<'all' | 'b2b' | 'b2c'>('all');
  const list: WarehouseBar[] = data[tab];
  const max = Math.max(1, ...list.map((w) => w.spend));

  return (
    <Card
      title="Top warehouses by spend"
      actions={<Tabs<'all' | 'b2b' | 'b2c'> value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'b2b', label: 'B2B' }, { value: 'b2c', label: 'B2C' }]} />}
    >
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">No warehouse data.</p>
      ) : (
        <ol className="space-y-2">
          {list.map((w, i) => (
            <li key={w.name} className="flex items-center gap-2.5 text-xs">
              <span className="w-4 text-right text-[10px] font-mono text-slate-400">{i + 1}</span>
              <span className="w-32 sm:w-40 truncate text-slate-700" title={w.name}>{w.name}</span>
              <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full bg-(--color-late)" style={{ width: `${(w.spend / max) * 100}%`, opacity: 1 - i * 0.06 }} />
              </span>
              <span className="w-20 text-right font-mono text-slate-700" title={formatRupeesExact(w.spend)}>{formatRupeesShort(w.spend)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
};

const Progress: React.FC<{ label: string; value: number; good: boolean }> = ({ label, value, good }) => (
  <div className="mt-3">
    <div className="flex justify-between text-[11px] text-slate-500 mb-1 font-medium">
      <span>{label}</span>
      <span className="font-mono">{value}%</span>
    </div>
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${good ? 'bg-(--color-filed)' : 'bg-(--color-due)'}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);

export const QuickStats: React.FC<{ kpi: DieselDashboardData['kpi'] }> = ({ kpi }) => {
  const rows: [string, string][] = [
    ['Records', kpi.records.toLocaleString('en-IN')],
    ['Approved', kpi.approved.toLocaleString('en-IN')],
    ['Rejected', kpi.rejected.toLocaleString('en-IN')],
    ['Pending approval', kpi.pending.toLocaleString('en-IN')],
    ['Qty Ordered', formatLitresShort(kpi.totalQty)],
    ['Qty Delivered', formatLitresShort(kpi.deliveredQty)],
    ['Warehouses', String(kpi.warehouseCount)],
    ['Vendors', String(kpi.vendorCount)],
    ['Avg Rate', `₹${kpi.avgRate}/L`],
  ];
  return (
    <Card title="Quick stats">
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1.5 text-xs">
            <dt className="text-slate-600">{k}</dt>
            <dd className="font-mono font-semibold text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <Progress label="Delivery rate" value={kpi.deliveryRate} good={kpi.deliveryRate >= 70} />
      <Progress label="Approval rate" value={kpi.approvalRate} good />
    </Card>
  );
};

const TAG_STYLE = {
  BEST: 'bg-(--color-filed-tint) text-(--color-filed)',
  MID: 'bg-(--color-due-tint) text-(--color-due)',
  HIGH: 'bg-(--color-missing-tint) text-(--color-missing)',
} as const;

export const RateList: React.FC<{ rows: DieselDashboardData['vendorRates'] }> = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.rate));
  return (
    <Card title="Avg rate per litre (₹)">
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">No rate data.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.name} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="w-4 text-[10px] font-mono text-slate-400">{i + 1}</span>
              <span className="flex-1 truncate text-slate-700" title={r.name}>{r.name}</span>
              <span className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                <span className="block h-full bg-slate-400" style={{ width: `${(r.rate / max) * 100}%` }} />
              </span>
              <span className="w-16 text-right font-mono font-semibold text-slate-900">₹{r.rate.toFixed(2)}</span>
              <span className={`w-11 text-center rounded px-1 py-0.5 text-[9px] font-bold ${TAG_STYLE[r.tag]}`}>{r.tag}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
};

const INSIGHT_ICON: Record<Insight['icon'], React.ElementType> = {
  zone: MapIcon,
  warehouse: Building2,
  split: Scale,
  trend: TrendingUp,
  vendor: Truck,
};

export const Insights: React.FC<{ items: Insight[] }> = ({ items }) => (
  <Card title="Business insights">
    {items.length === 0 ? (
      <p className="text-xs text-slate-400 py-4">No insights for this selection.</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {items.map((it, i) => {
          const Icon = INSIGHT_ICON[it.icon];
          return (
            <li key={i} className="flex items-start gap-2.5 py-2 text-xs text-slate-600 leading-relaxed">
              <Icon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
              <span>
                {it.before}
                <strong className="text-slate-900 font-semibold">{it.strong}</strong>
                {it.after}
              </span>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);

const ZONE_CHIP: Record<string, string> = {
  North: 'bg-(--color-zone-north-tint) text-slate-800',
  South: 'bg-(--color-zone-south-tint) text-slate-800',
  East: 'bg-(--color-zone-east-tint) text-slate-800',
  West: 'bg-(--color-zone-west-tint) text-slate-800',
  Central: 'bg-(--color-zone-central-tint) text-slate-800',
};

export const WarehouseTable: React.FC<{ rows: WarehouseRow[]; limit?: number; maxHeight?: string }> = ({ rows, limit, maxHeight = '22rem' }) => {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="overflow-auto border border-slate-200 rounded-lg print:max-h-none print:overflow-visible" style={{ maxHeight }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50 z-10">
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-bold">#</th>
            <th className="px-3 py-2 font-bold">Cost center</th>
            <th className="px-3 py-2 font-bold">Warehouse</th>
            <th className="px-3 py-2 font-bold">Zone</th>
            <th className="px-3 py-2 font-bold text-right">Spend</th>
            <th className="px-3 py-2 font-bold">% of spend</th>
            <th className="px-3 py-2 font-bold text-right">Qty (L)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shown.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-slate-400">No warehouses.</td>
            </tr>
          ) : (
            shown.map((r, i) => (
              <tr key={r.name} className="hover:bg-slate-50 whitespace-nowrap">
                <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{r.costCenter || '—'}</td>
                <td className="px-3 py-2 text-slate-800 max-w-[14rem] truncate" title={r.name}>{r.name}</td>
                <td className="px-3 py-2">
                  {r.zone ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ZONE_CHIP[r.zone] ?? 'bg-slate-100 text-slate-700'}`}>{r.zone}</span> : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono" title={formatRupeesExact(r.spend)}>{formatRupeesShort(r.spend)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span className="block h-full bg-(--color-late)" style={{ width: `${Math.min(100, r.share)}%` }} />
                    </span>
                    <span className="font-mono text-slate-600">{r.share.toFixed(2)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatLitresShort(r.qty)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export const MonthComparison: React.FC<{ months: MonthPoint[] }> = ({ months }) => {
  const defaults = useMemo(() => {
    const n = months.length;
    return [0, 1, 2].map((i) => months[Math.max(0, n - 3 + i)]?.month ?? '');
  }, [months]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const selection = picked && picked.every((m) => months.some((x) => x.month === m)) ? picked : defaults;
  const cols = selection.map((m) => months.find((x) => x.month === m));

  const metrics: [string, (m: MonthPoint) => string][] = [
    ['Total spend', (m) => formatRupeesShort(m.spend)],
    ['Volume (litres)', (m) => formatLitresShort(m.qty)],
    ['B2B spend', (m) => formatRupeesShort(m.b2b)],
    ['B2C spend', (m) => formatRupeesShort(m.b2c)],
    ['Active vendors', (m) => String(m.vendors)],
    ['Warehouses served', (m) => String(m.warehouses)],
    ['Delivery rate', (m) => `${m.deliveryRate}%`],
  ];

  return (
    <Card
      title="Compare 3 months"
      actions={
        months.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {[0, 1, 2].map((slot) => (
              <select
                key={slot}
                value={selection[slot]}
                onChange={(e) => {
                  const next = [...selection];
                  next[slot] = e.target.value;
                  setPicked(next);
                }}
                className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-slate-400"
              >
                {months.map((m) => (
                  <option key={m.month} value={m.month}>{m.month}</option>
                ))}
              </select>
            ))}
          </div>
        )
      }
    >
      {months.length === 0 ? (
        <p className="text-xs text-slate-400 py-4">No monthly data.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left font-bold">Metric</th>
                {selection.map((m, i) => (
                  <th key={i} className="px-3 py-2 text-right font-bold">{m || '—'}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.map(([label, f]) => (
                <tr key={label}>
                  <td className="px-3 py-2 font-semibold text-slate-700">{label}</td>
                  {cols.map((c, i) => (
                    <td key={i} className="px-3 py-2 text-right font-mono text-slate-800">{c ? f(c) : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
