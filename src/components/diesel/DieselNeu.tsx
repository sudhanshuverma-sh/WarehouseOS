import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Search } from 'lucide-react';
import {
  formatLitresShort,
  formatRupeesExact,
  formatRupeesShort,
  percent,
  type DieselDashboardData,
  type MonthPoint,
  type WarehouseRow,
} from '../../lib/diesel/dashboard';

/**
 * The Diesel Procurement dashboard in its neumorphic look: cards pressed out
 * of a soft grey-blue surface, wells pressed in, and one orange accent for
 * whatever is chosen or matters most. Every section reads DieselDashboardData
 * (lib/diesel/dashboard.ts); nothing here is sample data.
 *
 * Styling comes from the .neu-* classes in index.css, scoped under .neu-root.
 */

import { CardHead, Empty, NEU, NeuCard, Ring, Segmented, Track, niceStep } from '../analytics/NeuKit';

export { NEU, SectionHead } from '../analytics/NeuKit';

// ---------------------------------------------------------------------------
// Key metrics
// ---------------------------------------------------------------------------

export const KpiRow: React.FC<{ d: DieselDashboardData; entity: string }> = ({ d, entity }) => {
  const k = d.kpi;
  const total = k.totalSpend || 1;
  const cards = [
    { label: entity ? `${entity} spend` : 'Total spend', value: k.totalSpend, sub: `${formatLitresShort(k.totalQty)} total`, strong: true },
    { label: 'B2B spend', value: k.b2bSpend, sub: `${percent(k.b2bSpend, k.totalSpend)}% of total, ${formatLitresShort(k.b2bQty)}`, bar: (k.b2bSpend / total) * 100, color: NEU.accent },
    { label: 'B2C spend', value: k.b2cSpend, sub: `${percent(k.b2cSpend, k.totalSpend)}% of total, ${formatLitresShort(k.b2cQty)}`, bar: (k.b2cSpend / total) * 100, color: NEU.slate },
    { label: 'Diesel', value: d.fuel.diesel.amount, sub: `Quantity ${formatLitresShort(d.fuel.diesel.qty)}`, bar: (d.fuel.diesel.amount / total) * 100, color: NEU.accent },
    { label: 'DEF', value: d.fuel.def.amount, sub: `Quantity ${formatLitresShort(d.fuel.def.qty)}`, bar: (d.fuel.def.amount / total) * 100, color: NEU.slate },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 xl:gap-6">
      {cards.map((c) => (
        <div key={c.label} className="neu-card neu-lift p-6 flex flex-col justify-between gap-3.5 min-w-0" title={formatRupeesExact(c.value)}>
          <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
            {c.label}
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="text-[28px] 2xl:text-[30px] leading-none font-semibold truncate" style={{ color: c.strong ? NEU.accentInk : NEU.ink }}>
              {formatRupeesShort(c.value)}
            </span>
            <span className="text-[13px] truncate" style={{ color: NEU.muted }}>
              {c.sub}
            </span>
          </div>
          {c.bar !== undefined && <Track pct={c.bar} color={c.color!} />}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Spend analysis
// ---------------------------------------------------------------------------

export const MonthlyTrend: React.FC<{ months: MonthPoint[] }> = ({ months }) => {
  const [mode, setMode] = useState<'spend' | 'qty'>('spend');
  const shown = months.slice(-8);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = shown.find((m) => m.month === picked) ?? shown[shown.length - 1];
  const val = (m: MonthPoint) => (mode === 'spend' ? m.spend : m.qty);
  const fmt = mode === 'spend' ? formatRupeesShort : formatLitresShort;
  const max = Math.max(0, ...shown.map(val));
  const step = niceStep(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peak = shown.reduce<MonthPoint | null>((p, m) => (!p || val(m) > val(p) ? m : p), null);
  const PH = 230;

  return (
    <NeuCard>
      <CardHead
        title="Monthly spend trend"
        sub={peak ? `${mode === 'spend' ? 'Spend' : 'Litres ordered'} per month, peak ${peak.month} at ${fmt(val(peak))}` : 'No months yet'}
      >
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as typeof mode)}
          options={[
            { value: 'spend', label: 'Spend' },
            { value: 'qty', label: 'Quantity' },
          ]}
        />
      </CardHead>
      {!shown.length ? (
        <Empty>No monthly data in this selection.</Empty>
      ) : (
        <div className="relative pl-14" style={{ height: PH + 40 }}>
          {ticks.map((t) => (
            <div key={t} className="absolute left-14 right-0 border-t border-dashed" style={{ bottom: (t / top) * PH + 40, borderColor: NEU.rule }}>
              <span className="absolute -left-14 -top-2.5 w-12 text-right text-xs" style={{ color: NEU.muted }}>
                {t === 0 ? '0' : fmt(t)}
              </span>
            </div>
          ))}
          <div className="relative grid items-end" style={{ height: PH, gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
            {shown.map((m, i) => {
              const on = m === sel;
              const latest = i === shown.length - 1;
              return (
                <div key={m.month} className="relative flex flex-col items-center justify-end gap-2" style={{ height: PH }}>
                  {on && (
                    <div className="px-3 py-1.5 rounded-xl text-[13px] font-semibold whitespace-nowrap text-white" style={{ background: NEU.ink }}>
                      {fmt(val(m))}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`${m.month}: ${fmt(val(m))}`}
                    aria-pressed={on}
                    onClick={() => setPicked(m.month)}
                    onMouseEnter={() => setPicked(m.month)}
                    className="border-0 cursor-pointer neu-raised-sm w-[70%] max-w-[54px]"
                    style={{
                      height: Math.max(4, (val(m) / top) * PH),
                      borderRadius: '14px 14px 8px 8px',
                      background: on ? NEU.accent : latest ? NEU.accentSoft : NEU.accentPale,
                      transition: 'height 0.35s ease, background 0.2s',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="grid mt-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
            {shown.map((m) => (
              <span key={m.month} className="text-center text-[13px] truncate" style={{ fontWeight: m === sel ? 700 : 500, color: m === sel ? NEU.ink : NEU.muted }}>
                {m.month.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      )}
    </NeuCard>
  );
};

const ZONE_COLORS = [NEU.accent, NEU.slate, NEU.slate2, NEU.slate3, '#E3B89E', '#A9B6CC'];

export const ZoneBreakdown: React.FC<{ zones: DieselDashboardData['zones'] }> = ({ zones }) => {
  const list = [...zones].filter((z) => z.spend > 0).sort((a, b) => b.spend - a.spend);
  const total = list.reduce((t, z) => t + z.spend, 0) || 1;
  const [focus, setFocus] = useState(0);
  const f = list[Math.min(focus, list.length - 1)];
  return (
    <NeuCard>
      <CardHead title="Zone-wise breakdown" sub="Tap a zone to focus" />
      {!list.length ? (
        <Empty>No zones in this selection.</Empty>
      ) : (
        <>
          <div className="self-center mb-5">
            <Ring size={200} stroke={22} focus={focus} label="Spend by zone" slices={list.map((z, i) => ({ value: z.spend, color: ZONE_COLORS[i % ZONE_COLORS.length] }))}>
              <span className="text-[26px] font-semibold" style={{ color: NEU.ink }}>
                {percent(f.spend, total)}%
              </span>
              <span className="text-[13px] font-semibold" style={{ color: NEU.ink }}>
                {f.name}
              </span>
              <span className="text-xs" style={{ color: NEU.muted }}>
                {formatRupeesShort(f.spend)}
              </span>
            </Ring>
          </div>
          <div className="flex flex-col gap-1.5">
            {list.map((z, i) => (
              <button
                key={z.name}
                type="button"
                onClick={() => setFocus(i)}
                onMouseEnter={() => setFocus(i)}
                className={`neu-press flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] border-0 cursor-pointer text-left ${i === focus ? 'neu-raised' : 'bg-transparent'}`}
              >
                <span className="w-3 h-3 rounded" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                <span className="flex-1 text-sm font-semibold" style={{ color: NEU.ink }}>
                  {z.name}
                </span>
                <span className="text-[13px]" style={{ color: NEU.muted }}>
                  {formatRupeesShort(z.spend)}
                </span>
                <span className="w-14 text-right text-sm font-semibold" style={{ color: NEU.ink }}>
                  {percent(z.spend, total)}%
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </NeuCard>
  );
};

export const WeeklyTrend: React.FC<{ weeks: DieselDashboardData['weekly'] }> = ({ weeks }) => {
  const [idx, setIdx] = useState<number | null>(null);
  const i = idx ?? weeks.length - 1;
  const w = weeks[i];
  const prev = i > 0 ? weeks[i - 1] : null;
  const delta = w && prev && prev.spend > 0 ? Math.round(((w.spend - prev.spend) / prev.spend) * 100) : null;
  return (
    <NeuCard>
      <CardHead title="Weekly spend trend" sub="Hover or tap a week">
        {w && (
          <div className="neu-inset flex items-center gap-4 px-4 py-2.5 rounded-2xl">
            <span className="text-[13px]" style={{ color: NEU.muted }}>
              {w.label}
            </span>
            <span className="text-xl font-semibold" style={{ color: NEU.accentInk }}>
              {formatRupeesShort(w.spend)}
            </span>
            {delta !== null && (
              <span className="text-[13px] font-semibold" style={{ color: delta < 0 ? NEU.bad : NEU.good }}>
                {delta < 0 ? '▼' : '▲'} {Math.abs(delta)}% vs prev
              </span>
            )}
          </div>
        )}
      </CardHead>
      {!weeks.length ? (
        <Empty>No weekly data in this selection.</Empty>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={weeks}
              margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
              onMouseMove={(s) => {
                const n = Number((s as { activeIndex?: unknown } | null)?.activeIndex);
                if (Number.isInteger(n)) setIdx(n);
              }}
              onClick={(s) => {
                const n = Number((s as { activeIndex?: unknown } | null)?.activeIndex);
                if (Number.isInteger(n)) setIdx(n);
              }}
            >
              <defs>
                <linearGradient id="neu-week" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NEU.accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={NEU.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={NEU.rule} strokeDasharray="4 6" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: NEU.muted, fontFamily: 'Outfit' }} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis tick={{ fontSize: 12, fill: NEU.muted, fontFamily: 'Outfit' }} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => formatRupeesShort(Number(v))} />
              <Tooltip content={() => null} cursor={{ stroke: NEU.ink, strokeDasharray: '3 4' }} />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={NEU.accent}
                strokeWidth={3}
                fill="url(#neu-week)"
                dot={{ r: 4, fill: '#E7EBF1', stroke: NEU.accent, strokeWidth: 2.5 }}
                activeDot={{ r: 8, fill: NEU.accent, stroke: '#FFFFFF', strokeWidth: 3 }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Warehouse performance
// ---------------------------------------------------------------------------

export const TopWarehouses: React.FC<{ rows: WarehouseRow[] }> = ({ rows }) => {
  const [by, setBy] = useState<'spend' | 'qty'>('spend');
  const list = useMemo(() => [...rows].sort((a, b) => (by === 'spend' ? b.spend - a.spend : b.qty - a.qty)).slice(0, 10), [rows, by]);
  const max = Math.max(1, ...list.map((r) => (by === 'spend' ? r.spend : r.qty)));
  return (
    <NeuCard>
      <CardHead title="Top warehouses" sub={`Top ${list.length} of ${rows.length} by ${by === 'spend' ? 'spend' : 'litres'}`}>
        <Segmented
          value={by}
          onChange={(v) => setBy(v as typeof by)}
          options={[
            { value: 'spend', label: 'By spend' },
            { value: 'qty', label: 'By quantity' },
          ]}
        />
      </CardHead>
      {!list.length ? (
        <Empty>No warehouses in this selection.</Empty>
      ) : (
        <div className="flex flex-col">
          {list.map((r, i) => {
            const v = by === 'spend' ? r.spend : r.qty;
            return (
              <div key={r.name} className="neu-row grid grid-cols-[26px_minmax(0,11rem)_minmax(0,1fr)_88px] gap-3.5 items-center px-2 py-2 rounded-xl">
                <span className="text-[13px]" style={{ color: NEU.muted }}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: NEU.ink }} title={r.name}>
                  {r.name}
                </span>
                <Track pct={(v / max) * 100} color={i < 3 ? NEU.accent : NEU.accentSoft} h={10} />
                <span className="text-sm font-semibold text-right" style={{ color: NEU.ink }} title={by === 'spend' ? formatRupeesExact(v) : undefined}>
                  {by === 'spend' ? formatRupeesShort(v) : formatLitresShort(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </NeuCard>
  );
};

export const QuickStats: React.FC<{ kpi: DieselDashboardData['kpi'] }> = ({ kpi }) => {
  const tiles: [string, string][] = [
    ['Records', kpi.records.toLocaleString('en-IN')],
    ['Approved', kpi.approved.toLocaleString('en-IN')],
    ['Rejected', kpi.rejected.toLocaleString('en-IN')],
    ['Pending', kpi.pending.toLocaleString('en-IN')],
    ['Qty ordered', formatLitresShort(kpi.totalQty)],
    ['Qty delivered', formatLitresShort(kpi.deliveredQty)],
    ['Warehouses', String(kpi.warehouseCount)],
    ['Vendors', String(kpi.vendorCount)],
  ];
  return (
    <NeuCard>
      <CardHead title="Quick stats" sub={`Average rate ₹${kpi.avgRate}/L`} />
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="neu-inset flex flex-col gap-1 px-4 py-3.5 rounded-2xl">
            <span className="text-xs" style={{ color: NEU.muted }}>
              {label}
            </span>
            <span className="text-[19px] font-semibold" style={{ color: NEU.ink }}>
              {value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-4">
        {[
          { label: 'Delivery rate', value: kpi.deliveryRate, color: NEU.slate },
          { label: 'Approval rate', value: kpi.approvalRate, color: NEU.good },
        ].map((r) => (
          <div key={r.label} className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: NEU.muted }}>{r.label}</span>
              <span className="font-semibold" style={{ color: NEU.ink }}>
                {r.value}%
              </span>
            </div>
            <Track pct={r.value} color={r.color} h={10} />
          </div>
        ))}
      </div>
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Vendor intelligence
// ---------------------------------------------------------------------------

export const VendorShare: React.FC<{ byCount: DieselDashboardData['vendorsByCount']; bySpend: DieselDashboardData['vendorsBySpend'] }> = ({ byCount, bySpend }) => {
  const [by, setBy] = useState<'count' | 'spend'>('count');
  const list = (by === 'count' ? byCount : bySpend).slice(0, 10);
  const all = by === 'count' ? byCount : bySpend;
  const total = all.reduce((t, v) => t + (by === 'count' ? v.count : v.spend), 0) || 1;
  const max = Math.max(1, ...list.map((v) => (by === 'count' ? v.count : v.spend)));
  const lead = list[0];
  return (
    <NeuCard>
      <CardHead
        title="Vendor share"
        sub={lead ? `${by === 'count' ? 'Orders' : 'Spend'} per vendor, ${lead.name} leads (${Math.round(((by === 'count' ? lead.count : lead.spend) / total) * 100)}%)` : 'No vendors'}
      />
      <div className="mb-4">
        <Segmented
          value={by}
          onChange={(v) => setBy(v as typeof by)}
          options={[
            { value: 'count', label: 'Orders' },
            { value: 'spend', label: 'Spend' },
          ]}
        />
      </div>
      {!list.length ? (
        <Empty>No vendors in this selection.</Empty>
      ) : (
        <div className="flex flex-col">
          {list.map((v, i) => {
            const n = by === 'count' ? v.count : v.spend;
            return (
              <div key={v.name} className="neu-row grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_72px] gap-3 items-center px-1.5 py-2 rounded-xl">
                <span className="text-[13px] font-semibold truncate" style={{ color: NEU.ink }} title={v.name}>
                  {v.name}
                </span>
                <Track pct={(n / max) * 100} color={i === 0 ? NEU.accent : NEU.slate2} h={9} />
                <span className="text-[13px] text-right" style={{ color: NEU.ink }}>
                  {by === 'count' ? n.toLocaleString('en-IN') : formatRupeesShort(n)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </NeuCard>
  );
};

const SplitRing: React.FC<{ title: string; parts: { label: string; value: number; color: string }[]; centre: string; caption: string }> = ({ title, parts, centre, caption }) => {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
        {title}
      </span>
      <div className="flex items-center gap-5">
        <Ring size={132} stroke={15} label={title} slices={parts.map((p) => ({ value: p.value, color: p.color }))}>
          <span className="text-lg font-semibold" style={{ color: NEU.ink }}>
            {centre}
          </span>
          <span className="text-[11px]" style={{ color: NEU.muted }}>
            {caption}
          </span>
        </Ring>
        <div className="flex-1 min-w-0 flex flex-col">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2.5 py-2 border-t" style={{ borderColor: NEU.rule }}>
              <span className="w-[11px] h-[11px] rounded" style={{ background: p.color }} />
              <span className="flex-1 text-sm truncate" style={{ color: NEU.ink }}>
                {p.label}
              </span>
              <span className="text-sm font-semibold" style={{ color: NEU.ink }}>
                {p.value.toLocaleString('en-IN')}
              </span>
              <span className="w-12 text-right text-[13px]" style={{ color: NEU.muted }}>
                {percent(p.value, total)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const OrderFuelType: React.FC<{ d: DieselDashboardData }> = ({ d }) => {
  const orders = d.orderType.delivery + d.orderType.payment;
  const fuel = d.fuelType.diesel + d.fuelType.def;
  return (
    <NeuCard>
      <CardHead title="Order & fuel type" sub="Share of orders" />
      <div className="flex flex-col gap-6">
        <SplitRing
          title="Order type"
          centre={d.orderType.delivery.toLocaleString('en-IN')}
          caption="delivery"
          parts={[
            { label: 'Diesel delivery', value: d.orderType.delivery, color: NEU.accent },
            { label: 'Payments only', value: d.orderType.payment, color: NEU.slate },
          ]}
        />
        <SplitRing
          title="Fuel type"
          centre={`${fuel ? percent(d.fuelType.diesel, fuel) : 0}%`}
          caption="diesel"
          parts={[
            { label: 'Diesel', value: d.fuelType.diesel, color: NEU.accent },
            { label: 'DEF', value: d.fuelType.def, color: NEU.slate },
          ]}
        />
        {orders === 0 && <Empty>No orders in this selection.</Empty>}
      </div>
    </NeuCard>
  );
};

export const RateList: React.FC<{ rows: DieselDashboardData['vendorRates'] }> = ({ rows }) => {
  const list = [...rows].sort((a, b) => a.rate - b.rate).slice(0, 10);
  const max = Math.max(1, ...list.map((r) => r.rate));
  const TAG = {
    BEST: { bg: '#D8EDE2', fg: NEU.good, bar: NEU.good, inset: false },
    MID: { bg: 'transparent', fg: NEU.muted, bar: NEU.mid, inset: true },
    HIGH: { bg: '#F6DAD3', fg: NEU.bad, bar: NEU.bad, inset: false },
  } as const;
  return (
    <NeuCard>
      <CardHead title="Avg rate per litre (₹)" sub="Lowest first" />
      {!list.length ? (
        <Empty>No rates in this selection.</Empty>
      ) : (
        <div className="flex flex-col">
          {list.map((r, i) => {
            const t = TAG[r.tag];
            return (
              <div key={r.name} className="neu-row grid grid-cols-[22px_minmax(0,1fr)_64px_72px_50px] gap-2.5 items-center px-1.5 py-2 rounded-xl">
                <span className="text-xs" style={{ color: NEU.muted }}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: NEU.ink }} title={r.name}>
                  {r.name}
                </span>
                <Track pct={(r.rate / max) * 100} color={t.bar} h={7} />
                <span className="text-sm font-semibold text-right" style={{ color: NEU.ink }}>
                  ₹{r.rate.toFixed(2)}
                </span>
                <span className={`justify-self-end px-2 py-0.5 rounded-lg text-[11px] font-bold ${t.inset ? 'neu-inset' : ''}`} style={{ background: t.bg, color: t.fg }}>
                  {r.tag}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Every warehouse
// ---------------------------------------------------------------------------

const ZONE_DOT: Record<string, string> = { North: NEU.accent, West: NEU.slate, South: NEU.slate2, East: NEU.slate3, Central: '#E3B89E' };

export const WarehouseTable: React.FC<{ rows: WarehouseRow[] }> = ({ rows }) => {
  const [zone, setZone] = useState('All');
  const [q, setQ] = useState('');
  const zones = useMemo(() => ['All', ...[...new Set(rows.map((r) => r.zone).filter(Boolean))].sort()], [rows]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (zone === 'All' || r.zone === zone) && (!needle || r.name.toLowerCase().includes(needle) || (r.costCenter || '').toLowerCase().includes(needle)));
  const maxShare = Math.max(0.01, ...rows.map((r) => r.share));
  const COLS = 'grid-cols-[44px_150px_minmax(0,1.5fr)_100px_110px_minmax(0,1.2fr)_96px]';

  return (
    <section className="neu-card px-3 pt-7 pb-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold" style={{ color: NEU.ink }}>
            All warehouses
          </h2>
          <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
            Showing {shown.length} of {rows.length} warehouses
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <Segmented value={zone} onChange={setZone} options={zones.map((z) => ({ value: z, label: z }))} />
          <label className="neu-inset flex items-center gap-2.5 h-11 w-full sm:w-72 px-4 rounded-[14px]">
            <Search className="w-4 h-4 shrink-0" style={{ color: NEU.muted }} />
            <span className="sr-only">Search warehouses</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search warehouse or cost center"
              className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm"
              style={{ color: NEU.ink, fontFamily: 'inherit' }}
            />
          </label>
        </div>
      </div>
      <div className="overflow-x-auto neu-scroll">
        <div className="min-w-[820px]">
          <div className={`grid ${COLS} gap-4 px-7 pb-2`}>
            {['#', 'Cost center', 'Warehouse', 'Zone', 'Spend', '% of spend', 'Qty (L)'].map((h, i) => (
              <span key={h} className={`text-xs font-bold uppercase tracking-[0.05em] ${i === 4 || i === 6 ? 'text-right' : ''}`} style={{ color: NEU.muted }}>
                {h}
              </span>
            ))}
          </div>
          <div data-pdf-expand className="neu-scroll max-h-[640px] overflow-y-auto px-3 py-1 flex flex-col gap-1">
            {shown.map((r, i) => (
              <div key={`${r.name}-${i}`} className={`neu-row grid ${COLS} gap-4 items-center px-4 py-3 rounded-[14px] shrink-0 ${i % 2 === 0 ? 'neu-inset' : ''}`}>
                <span className="text-[13px]" style={{ color: NEU.muted }}>
                  {rows.indexOf(r) + 1}
                </span>
                <span className="text-[13px] font-medium truncate" style={{ color: NEU.accentInk }} title={r.costCenter}>
                  {r.costCenter || '-'}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: NEU.ink }} title={r.name}>
                  {r.name}
                </span>
                <span className="flex items-center gap-2 text-[13px]" style={{ color: NEU.ink }}>
                  <span className="w-[9px] h-[9px] rounded-full" style={{ background: ZONE_DOT[r.zone] ?? NEU.slate3 }} />
                  {r.zone || '-'}
                </span>
                <span className="text-sm font-semibold text-right" style={{ color: NEU.ink }} title={formatRupeesExact(r.spend)}>
                  {formatRupeesShort(r.spend)}
                </span>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1">
                    <Track pct={Math.max((r.share / maxShare) * 100, 1.5)} color={NEU.accent} h={7} />
                  </div>
                  <span className="w-11 text-right text-xs" style={{ color: NEU.muted }}>
                    {r.share.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[13px] text-right" style={{ color: NEU.ink }}>
                  {formatLitresShort(r.qty)}
                </span>
              </div>
            ))}
            {!shown.length && <Empty>No warehouses match your search.</Empty>}
          </div>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Month comparison
// ---------------------------------------------------------------------------

type Kind = 'pct' | 'abs' | 'pts';

export const MonthCompare: React.FC<{ months: MonthPoint[] }> = ({ months }) => {
  const latest = months[months.length - 1];
  const bases = months.slice(-3, -1);
  const [baseName, setBaseName] = useState<string | null>(null);
  const base = bases.find((m) => m.month === baseName) ?? bases[bases.length - 1];
  const cols = [...bases, latest].filter(Boolean) as MonthPoint[];

  const metrics: { label: string; get: (m: MonthPoint) => number; fmt: (n: number) => string; kind: Kind }[] = [
    { label: 'Total spend', get: (m) => m.spend, fmt: formatRupeesShort, kind: 'pct' },
    { label: 'Volume (litres)', get: (m) => m.qty, fmt: formatLitresShort, kind: 'pct' },
    { label: 'B2B spend', get: (m) => m.b2b, fmt: formatRupeesShort, kind: 'pct' },
    { label: 'B2C spend', get: (m) => m.b2c, fmt: formatRupeesShort, kind: 'pct' },
    { label: 'Active vendors', get: (m) => m.vendors, fmt: (n) => String(n), kind: 'abs' },
    { label: 'Warehouses served', get: (m) => m.warehouses, fmt: (n) => String(n), kind: 'abs' },
    { label: 'Delivery rate', get: (m) => m.deliveryRate, fmt: (n) => `${n}%`, kind: 'pts' },
  ];
  const change = (a: number, c: number, kind: Kind) => {
    if (kind === 'pct') {
      if (!a) return { text: '-', good: true };
      const p = ((c - a) / a) * 100;
      return { text: `${p >= 0 ? '+' : '-'}${Math.abs(p).toFixed(1)}%`, good: p >= 0 };
    }
    const p = c - a;
    return { text: `${p >= 0 ? '+' : '-'}${kind === 'pts' ? Math.abs(p).toFixed(1) + ' pts' : Math.abs(p)}`, good: p >= 0 };
  };
  const GRID = { gridTemplateColumns: `minmax(0,1.5fr) repeat(${cols.length}, minmax(0,1fr)) 130px` };

  return (
    <section className="neu-card px-3 pt-7 pb-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold" style={{ color: NEU.ink }}>
            Compare {cols.length} months
          </h2>
          <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
            {latest && base ? `${latest.month} vs ${base.month}` : 'Needs two months of requests'}
          </span>
        </div>
        {bases.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
              Compare with
            </span>
            <Segmented value={base?.month ?? ''} onChange={setBaseName} options={bases.map((m) => ({ value: m.month, label: m.month }))} />
          </div>
        )}
      </div>
      {!latest || !base ? (
        <Empty>Month comparison appears once there are two months of requests.</Empty>
      ) : (
        <div className="overflow-x-auto neu-scroll">
          <div className="min-w-[640px]">
            <div className="grid gap-4 px-7 pb-1" style={GRID}>
              <span className="text-xs font-bold uppercase tracking-[0.05em]" style={{ color: NEU.muted }}>
                Metric
              </span>
              {cols.map((m) => (
                <span
                  key={m.month}
                  className="text-xs font-bold uppercase tracking-[0.05em] text-right"
                  style={{ color: m === latest ? NEU.accentInk : m === base ? NEU.ink : NEU.muted }}
                >
                  {m.month}
                </span>
              ))}
              <span className="text-xs font-bold uppercase tracking-[0.05em] text-right" style={{ color: NEU.muted }}>
                Change
              </span>
            </div>
            <div className="flex flex-col gap-1 px-3">
              {metrics.map((mt) => {
                const ch = change(mt.get(base), mt.get(latest), mt.kind);
                return (
                  <div key={mt.label} className="neu-row grid gap-4 items-center px-4 py-3 rounded-[14px]" style={GRID}>
                    <span className="text-sm font-semibold" style={{ color: NEU.ink }}>
                      {mt.label}
                    </span>
                    {cols.map((m) => (
                      <span
                        key={m.month}
                        className={`text-right ${m === latest ? 'text-[15px] font-semibold' : 'text-sm'}`}
                        style={{ color: m === latest ? NEU.ink : NEU.muted }}
                      >
                        {mt.fmt(mt.get(m))}
                      </span>
                    ))}
                    <span className="neu-inset justify-self-end px-2.5 py-1 rounded-[10px] text-[13px] font-bold" style={{ color: ch.good ? NEU.good : NEU.bad }}>
                      {ch.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
