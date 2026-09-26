import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatShortDay } from '../../lib/analytics/period';
import { formatDate, formatNum, formatRupees, formatShort, type SiteDay } from '../../lib/ebdg/dashboard';
import { NEU } from '../analytics/NeuKit';

/** The EB-DG figures by name, and the site side panel's chart, in the neumorphic palette. */

export type TrendMetric = 'hsd' | 'hrs' | 'dgKwh' | 'grid' | 'solar' | 'spend';

export const METRIC: Record<TrendMetric, { label: string; unit: string; fmt: (n: number) => string }> = {
  hsd: { label: 'Diesel used', unit: 'L', fmt: (n) => `${formatNum(n)} L` },
  hrs: { label: 'DG hours', unit: 'h', fmt: (n) => `${n.toLocaleString('en-IN')} h` },
  dgKwh: { label: 'DG units', unit: 'kWh', fmt: (n) => `${formatNum(n)} kWh` },
  grid: { label: 'EB units', unit: 'kWh', fmt: (n) => `${formatNum(n)} kWh` },
  solar: { label: 'Solar', unit: 'kWh', fmt: (n) => `${formatNum(n)} kWh` },
  spend: { label: 'Spend', unit: '₹', fmt: (n) => formatRupees(n) },
};

const axis = { fontSize: 12, fill: NEU.muted, fontFamily: 'Outfit' };

/** One site: diesel bars and EB units over its days. */
export const SiteDailyChart: React.FC<{ days: SiteDay[] }> = ({ days }) => {
  const data = [...days].reverse();
  if (!data.length) return <p className="py-8 text-center text-sm" style={{ color: NEU.muted }}>No days filed in this period.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={NEU.rule} strokeDasharray="4 6" />
          <XAxis dataKey="d" tick={axis} tickLine={false} axisLine={false} minTickGap={16} tickFormatter={formatShortDay} />
          <YAxis yAxisId="l" tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatShort(Number(v))} />
          <YAxis yAxisId="k" orientation="right" tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatShort(Number(v))} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 14, border: 'none', background: '#E7EBF1', boxShadow: '6px 6px 14px #C8CED8, -6px -6px 14px #FFFFFF', fontFamily: 'Outfit' }}
            labelFormatter={(l) => formatDate(String(l))}
            formatter={(v, n) => [n === 'Diesel' ? `${formatNum(Number(v))} L` : `${formatNum(Number(v))} kWh`, String(n)]}
            cursor={{ fill: 'rgba(42,48,64,0.05)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Outfit' }} iconSize={10} verticalAlign="top" height={26} />
          <Bar yAxisId="l" dataKey="hsd" name="Diesel" fill={NEU.accent} radius={[8, 8, 3, 3]} maxBarSize={22} />
          <Line yAxisId="k" type="monotone" dataKey="grid" name="EB units" stroke={NEU.slate} strokeWidth={2.5} dot={{ r: 3, fill: '#E7EBF1', stroke: NEU.slate, strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
