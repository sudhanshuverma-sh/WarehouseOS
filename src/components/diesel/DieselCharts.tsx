import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatLitresShort, formatRupeesShort, percent, type MonthPoint } from '../../lib/diesel/dashboard';
import { Card, Tabs } from './DieselPanels';

/** The Diesel dashboard's charts. Colours come from the app's palette. */

export const CHART_COLORS = ['#4f9377', '#7ba9d8', '#cf7841', '#a08fd6', '#c99a34', '#ca5a75', '#63c19f', '#e8a86f', '#1b2b25', '#e590a4'];

const axis = { fontSize: 10, fill: '#64748b' };
const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' };

type MonthlyMode = 'spend' | 'b2b' | 'b2c' | 'qty';

export const MonthlyTrendChart: React.FC<{ months: MonthPoint[] }> = ({ months }) => {
  const [mode, setMode] = useState<MonthlyMode>('spend');
  const color = mode === 'b2b' ? '#7ba9d8' : mode === 'b2c' ? '#4f9377' : '#cf7841';

  return (
    <Card
      title="Monthly spend trend"
      actions={
        <Tabs<MonthlyMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'spend', label: 'Total' },
            { value: 'b2b', label: 'B2B' },
            { value: 'b2c', label: 'B2C' },
            { value: 'qty', label: 'Qty' },
          ]}
        />
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef2f0" />
            <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="left"
              tick={axis}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => (mode === 'qty' ? formatLitresShort(v) : formatRupeesShort(v))}
            />
            {mode !== 'qty' && (
              <YAxis yAxisId="right" orientation="right" tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatLitresShort(v)} />
            )}
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) =>
                name === 'Litres' || mode === 'qty' ? formatLitresShort(Number(value)) : formatRupeesShort(Number(value))
              }
            />
            <Bar yAxisId="left" dataKey={mode} name={mode === 'qty' ? 'Litres' : 'Spend'} radius={[5, 5, 0, 0]} maxBarSize={38}>
              {months.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={i === months.length - 1 ? 1 : 0.55} />
              ))}
            </Bar>
            {mode !== 'qty' && (
              <Line yAxisId="right" type="monotone" dataKey="qty" name="Litres" stroke="#a08fd6" strokeWidth={2} dot={{ r: 3 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export const ZoneDonut: React.FC<{ zones: { name: string; spend: number }[] }> = ({ zones }) => {
  const total = zones.reduce((s, z) => s + z.spend, 0);
  return (
    <Card title="Zone-wise breakdown">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={zones} dataKey="spend" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="#fff">
              {zones.map((z, i) => (
                <Cell key={z.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatRupeesShort(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
        {zones.map((z, i) => (
          <span key={z.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <strong className="text-slate-800">{z.name}</strong> {percent(z.spend, total)}%
          </span>
        ))}
      </div>
    </Card>
  );
};

export const WeeklySpendChart: React.FC<{ weeks: { label: string; spend: number }[] }> = ({ weeks }) => (
  <Card title="Weekly spend trend">
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dieselWeekly" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cf7841" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#cf7841" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eef2f0" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatRupeesShort(v)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatRupeesShort(Number(v))} />
          <Area type="monotone" dataKey="spend" name="Spend" stroke="#cf7841" strokeWidth={2} fill="url(#dieselWeekly)" dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </Card>
);

export const HorizontalBars: React.FC<{
  title: string;
  rows: { name: string; count: number; spend: number }[];
  valueKey: 'count' | 'spend';
}> = ({ title, rows, valueKey }) => (
  <Card title={title}>
    {rows.length === 0 ? (
      <p className="text-xs text-slate-400 py-6 text-center">No vendor data.</p>
    ) : (
      <div style={{ height: Math.max(160, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="#eef2f0" />
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => (valueKey === 'spend' ? formatRupeesShort(v) : String(v))} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ ...axis, fill: '#334155' }}
              tickLine={false}
              axisLine={false}
              width={118}
              tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v) => (valueKey === 'spend' ? formatRupeesShort(Number(v)) : `${Number(v).toLocaleString('en-IN')} orders`)}
            />
            <Bar dataKey={valueKey} radius={[0, 5, 5, 0]} maxBarSize={18}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}
  </Card>
);

export const MiniDonut: React.FC<{ title: string; data: { name: string; value: number }[]; colors: string[] }> = ({ title, data, colors }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">{title}</h4>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={total ? data : [{ name: 'None', value: 1 }]} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" stroke="#fff">
                {(total ? data : [{ name: 'None', value: 1 }]).map((d, i) => (
                  <Cell key={d.name} fill={total ? colors[i % colors.length] : '#e2e8f0'} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 min-w-0 divide-y divide-slate-100">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="font-mono">
                <strong className="text-slate-900">{d.value.toLocaleString('en-IN')}</strong>{' '}
                <span className="text-slate-400">{percent(d.value, total)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
