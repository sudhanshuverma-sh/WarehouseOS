import React, { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, ChevronDown, Download, FileDown, Inbox, Loader2, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { changePct, formatDate, formatMonth, formatShortDay, type PeriodFilters, type Preset, type Segment } from '../../lib/analytics/period';
import { downloadPdf, pdfFileName } from '../../lib/export/pdf';

/**
 * The neumorphic kit: the soft grey-blue look the Diesel, Daily Site Report
 * and Fire Pump dashboards share. Cards are pressed out of the surface, wells
 * pressed in, and one orange accent marks what is chosen or matters most.
 *
 * Everything here expects to sit inside <NeuPage> (the .neu-root surface);
 * the .neu-* classes live in index.css.
 */

export const NEU = {
  ink: '#2A3040',
  muted: '#5F6778',
  accent: '#F0743A',
  accentInk: '#B8531F',
  accentSoft: '#F4A57C',
  accentPale: '#F3CDB8',
  slate: '#5A6B8C',
  slate2: '#8FA3C4',
  slate3: '#C5CEDC',
  good: '#1B7A4E',
  bad: '#B23A22',
  mid: '#C79A5A',
  rule: '#D5DAE3',
  track: '#DCE1E9',
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const NeuCard: React.FC<{ className?: string; children: React.ReactNode; lift?: boolean }> = ({ className = '', children, lift }) => (
  <section className={`neu-card p-6 sm:p-7 min-w-0 flex flex-col ${lift ? 'neu-lift' : ''} ${className}`}>{children}</section>
);

/** Card heading: title, a line under it, and controls on the right. */
export const CardHead: React.FC<{ title: string; sub?: string; children?: React.ReactNode }> = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div className="flex flex-col gap-1 min-w-0">
      <h2 className="m-0 text-lg font-semibold" style={{ color: NEU.ink }}>
        {title}
      </h2>
      {sub && (
        <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
          {sub}
        </span>
      )}
    </div>
    {children}
  </div>
);

/** Section label: an orange dot, the name in capitals, a note on the right. */
export const SectionHead: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
    <div className="flex items-center gap-2.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: NEU.accent }} />
      <span className="text-sm font-bold uppercase tracking-[0.08em]" style={{ color: NEU.ink }}>
        {children}
      </span>
    </div>
    {aside && (
      <span className="text-[13px]" style={{ color: NEU.muted }}>
        {aside}
      </span>
    )}
  </div>
);

/** A pressed-in group of choices; the chosen one rises out of it. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="neu-inset inline-flex flex-wrap gap-1 p-1 rounded-[14px]" role="group">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`neu-press rounded-[11px] border-0 cursor-pointer whitespace-nowrap font-semibold ${size === 'sm' ? 'h-8 px-3 text-xs' : 'h-[34px] px-4 text-[13px]'} ${on ? 'neu-raised' : 'bg-transparent'}`}
            style={{ color: on ? NEU.accentInk : NEU.muted }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A pressed-in track with a coloured fill. */
export const Track: React.FC<{ pct: number; color: string; h?: number }> = ({ pct, color, h = 8 }) => (
  <div className="neu-inset rounded-full" style={{ height: h }}>
    <div className="rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: h, background: color }} />
  </div>
);

/** A ring chart drawn with stroke dashes; `focus` thickens one slice. */
export const Ring: React.FC<{
  size: number;
  stroke: number;
  slices: { value: number; color: string }[];
  focus?: number;
  children?: React.ReactNode;
  label: string;
}> = ({ size, stroke, slices, focus, children, label }) => {
  const r = size / 2 - stroke / 2 - 6;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((t, s) => t + s.value, 0) || 1;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="relative rounded-full shrink-0 neu-card" style={{ width: size, height: size, borderRadius: 999 }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={NEU.track} strokeWidth={stroke} />
        {slices.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = Math.max(0, len - gap);
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={focus === undefined ? stroke : focus === i ? stroke + 8 : stroke}
              strokeOpacity={focus === undefined || focus === i ? 1 : 0.35}
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-width 0.25s, stroke-opacity 0.25s' }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-0.5">{children}</div>
    </div>
  );
};

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-10 text-center text-sm" style={{ color: NEU.muted }}>
    {children}
  </p>
);

/** A round number just above `v`, for an axis. */
export function niceStep(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** A raised button that opens a pressed-out panel of choices. */
export const Drop: React.FC<{ label: string; active: string; open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode }> = ({ label, active, open, onToggle, onClose, children }) => (
  <div className="relative">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="neu-press neu-raised-sm flex items-center gap-2 h-11 pl-4 pr-3.5 rounded-[14px] border-0 text-sm font-semibold whitespace-nowrap cursor-pointer"
      style={{ background: active ? '#F6E3D8' : undefined, color: active ? NEU.accentInk : NEU.ink }}
    >
      {active ? `${label}: ${active}` : label}
      <ChevronDown className="w-4 h-4" style={{ color: NEU.muted }} />
    </button>
    {open && (
      <>
        <div className="fixed inset-0 z-50" onClick={onClose} aria-hidden="true" />
        <div className="neu-card neu-scroll absolute left-0 top-[52px] z-[60] min-w-[200px] max-h-[300px] overflow-y-auto p-2 flex flex-col gap-0.5" style={{ borderRadius: 18 }}>
          {children}
        </div>
      </>
    )}
  </div>
);

export const Option: React.FC<{ label: string; on: boolean; onPick: () => void }> = ({ label, on, onPick }) => (
  <button
    type="button"
    onClick={onPick}
    className="neu-row flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border-0 text-sm text-left whitespace-nowrap cursor-pointer"
    style={{ background: on ? '#DFE4EC' : 'transparent', color: on ? NEU.accentInk : NEU.ink, fontWeight: on ? 700 : 500 }}
  >
    {label}
    <span className="w-2 h-2 rounded-full" style={{ background: on ? NEU.accent : 'transparent' }} />
  </button>
);

export const Multi: React.FC<{
  label: string;
  options: string[];
  value: string[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onApply: (v: string[]) => void;
}> = ({ label, options, value, open, onToggle, onClose, onApply }) => {
  const [draft, setDraft] = useState<string[]>(value);
  const [q, setQ] = useState('');
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const active = value.length ? (value.length === 1 ? value[0] : `${value.length} chosen`) : '';
  return (
    <Drop
      label={label}
      active={active}
      open={open}
      onToggle={() => {
        if (!open) {
          setDraft(value);
          setQ('');
        }
        onToggle();
      }}
      onClose={onClose}
    >
      <label className="neu-inset flex items-center gap-2 h-9 px-3 mb-1 rounded-xl">
        <Search className="w-3.5 h-3.5" style={{ color: NEU.muted }} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search ${label.toLowerCase()}`}
          className="flex-1 min-w-0 border-0 outline-none bg-transparent text-[13px]"
          style={{ color: NEU.ink, fontFamily: 'inherit' }}
        />
      </label>
      <div className="w-64 max-h-56 overflow-y-auto neu-scroll">
        {shown.map((o) => {
          const on = draft.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => setDraft(on ? draft.filter((x) => x !== o) : [...draft, o])}
              className="neu-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border-0 bg-transparent text-[13px] text-left cursor-pointer"
              style={{ color: NEU.ink }}
            >
              <span className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${on ? '' : 'neu-inset'}`} style={{ background: on ? NEU.accent : undefined }}>
                {on && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="truncate">{o}</span>
            </button>
          );
        })}
        {!shown.length && (
          <p className="px-3 py-3 text-center text-[13px]" style={{ color: NEU.muted }}>
            Nothing found
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t" style={{ borderColor: NEU.rule }}>
        <div className="flex gap-1">
          <button type="button" onClick={() => setDraft(options)} className="px-2 py-1 border-0 bg-transparent text-xs font-semibold cursor-pointer" style={{ color: NEU.muted }}>
            All
          </button>
          <button type="button" onClick={() => setDraft([])} className="px-2 py-1 border-0 bg-transparent text-xs font-semibold cursor-pointer" style={{ color: NEU.muted }}>
            Clear
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onApply(draft.length === options.length ? [] : draft);
            onClose();
          }}
          className="neu-press px-3.5 py-1.5 rounded-xl border-0 text-xs font-semibold text-white cursor-pointer"
          style={{ background: NEU.accent }}
        >
          Apply
        </button>
      </div>
    </Drop>
  );
};

// ---------------------------------------------------------------------------
// Page parts: header, buttons, PDF
// ---------------------------------------------------------------------------

/** Icon tile, title and a line under it; actions on the right. */
export const NeuHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; children?: React.ReactNode }> = ({ icon, title, subtitle, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <div className="w-13.5 h-13.5 rounded-[18px] flex items-center justify-center shrink-0 neu-raised text-white" style={{ background: NEU.accent }}>
        {icon}
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <h1 className="m-0 text-2xl sm:text-[30px] leading-tight font-semibold" style={{ color: NEU.ink }}>
          {title}
        </h1>
        <span className="text-sm truncate" style={{ color: NEU.muted }}>
          {subtitle}
        </span>
      </div>
    </div>
    {children && (
      <div className="flex flex-wrap items-center gap-3.5 print:hidden" data-pdf-ignore>
        {children}
      </div>
    )}
  </div>
);

export const NeuButton: React.FC<{ onClick?: () => void; primary?: boolean; disabled?: boolean; children: React.ReactNode; title?: string }> = ({ onClick, primary, disabled, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`neu-press neu-raised flex items-center gap-2 h-11.5 px-5 rounded-2xl border-0 text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${primary ? 'text-white' : ''}`}
    style={primary ? { background: NEU.accent } : { color: NEU.ink }}
  >
    {children}
  </button>
);

/** A raised pill that only shows something, like the period in view. */
export const NeuPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="neu-raised flex items-center gap-2 h-11.5 px-5 rounded-2xl text-sm font-semibold whitespace-nowrap" style={{ color: NEU.ink }}>
    {children}
  </span>
);

/** "PDF": the page in `target` as an A4 PDF, straight to downloads. */
export const NeuPdfButton: React.FC<{ target: React.RefObject<HTMLElement | null>; title: string; subtitle?: string }> = ({ target, title, subtitle }) => {
  const { notify, currentDate } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!target.current || busy) return;
    setBusy(true);
    try {
      await downloadPdf(target.current, { title, subtitle, fileName: pdfFileName(title, currentDate) });
      notify('success', 'PDF downloaded', `${title} is in your downloads.`);
    } catch (e) {
      console.error('PDF export failed', e);
      notify('error', 'Could not make the PDF', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <NeuButton onClick={run} disabled={busy}>
      {busy ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileDown className="w-4.5 h-4.5" strokeWidth={1.9} />}
      {busy ? 'Preparing PDF' : 'PDF'}
    </NeuButton>
  );
};

/** The page's own surface: grey-blue, rounded, everything inside it neumorphic. */
export const NeuPage = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => (
  <div ref={ref} className="neu-root rounded-4xl px-4 py-6 sm:px-8 sm:py-9 flex flex-col gap-6">
    {children}
  </div>
));
NeuPage.displayName = 'NeuPage';

export const NeuEmpty: React.FC<{ title: string; body: string; action?: { label: string; onClick: () => void } }> = ({ title, body, action }) => (
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
    {action && (
      <button type="button" onClick={action.onClick} className="neu-press mt-3 h-11 px-5 rounded-2xl border-0 text-sm font-semibold text-white cursor-pointer" style={{ background: NEU.accent }}>
        {action.label}
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** Change against the previous period, pressed in, green or red by what is good. */
export const NeuDelta: React.FC<{ cur: number; prev: number | null | undefined; good: 'up' | 'down' | 'neutral' }> = ({ cur, prev, good }) => {
  const pct = changePct(cur, prev);
  if (pct === null) return null;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const color = flat || good === 'neutral' ? NEU.muted : (up && good === 'up') || (!up && good === 'down') ? NEU.good : NEU.bad;
  return (
    <span className="neu-inset inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ color }} title="Against the same number of days just before">
      {flat ? '0%' : `${up ? '▲' : '▼'} ${Math.abs(pct)}%`}
    </span>
  );
};

/** A KPI card. With `onClick` it is also a switch: the chosen one carries an orange ring. */
export const NeuKpi: React.FC<{
  label: string;
  value: string;
  sub: string;
  bar?: number;
  color?: string;
  strong?: boolean;
  active?: boolean;
  onClick?: () => void;
  delta?: React.ReactNode;
}> = ({ label, value, sub, bar, color = NEU.accent, strong, active, onClick, delta }) => {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
          {label}
        </span>
        {delta}
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="text-[28px] leading-none font-semibold truncate" style={{ color: strong || active ? NEU.accentInk : NEU.ink }}>
          {value}
        </span>
        <span className="text-[13px] truncate" style={{ color: NEU.muted }}>
          {sub}
        </span>
      </span>
      {bar !== undefined && <Track pct={bar} color={color} />}
    </>
  );
  const cls = 'neu-card neu-lift p-6 flex flex-col justify-between gap-3.5 min-w-0 text-left';
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cls} border-0 cursor-pointer`}
      style={active ? { outline: `2px solid ${NEU.accent}`, outlineOffset: -2 } : undefined}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

const shortDay = (d: string) => formatShortDay(d);

/** One figure per day: an orange line (or bars for a count). A click hands the day up. */
export function NeuDayChart<T extends { d: string }>({
  data,
  dataKey,
  format,
  kind = 'area',
  percent,
  color = NEU.accent,
  onPickDay,
  selectedDay,
}: {
  data: T[];
  dataKey: keyof T & string;
  format: (n: number) => string;
  kind?: 'area' | 'bar';
  percent?: boolean;
  color?: string;
  /** A click on a day hands it up (to rank sites for that day, say). */
  onPickDay?: (day: string) => void;
  selectedDay?: string | null;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  if (!data.length) return <Empty>Nothing filed in this period yet.</Empty>;
  const i = idx ?? data.length - 1;
  const cur = data[i] as Record<string, unknown>;
  const axis = { fontSize: 12, fill: NEU.muted, fontFamily: 'Outfit' };
  const move = (s: unknown) => {
    const n = Number((s as { activeIndex?: unknown } | null)?.activeIndex);
    if (Number.isInteger(n)) setIdx(n);
  };
  const pick = (s: unknown) => {
    move(s);
    const label = (s as { activeLabel?: unknown } | null)?.activeLabel;
    if (onPickDay && label !== undefined && label !== null) onPickDay(String(label));
  };
  const marker = selectedDay ? <ReferenceLine x={selectedDay} stroke={color} strokeWidth={2} strokeOpacity={0.5} /> : null;
  const common = { data, margin: { top: 10, right: 12, left: 0, bottom: 0 }, onMouseMove: move, onClick: pick, style: onPickDay ? { cursor: 'pointer' } : undefined };
  const x = <XAxis dataKey="d" tick={axis} tickLine={false} axisLine={false} minTickGap={16} tickFormatter={shortDay} />;
  const y = <YAxis tick={axis} tickLine={false} axisLine={false} width={46} domain={percent ? [0, 100] : undefined} allowDecimals={false} tickFormatter={(v) => (percent ? `${v}%` : String(v))} />;
  const grid = <CartesianGrid vertical={false} stroke={NEU.rule} strokeDasharray="4 6" />;
  const value = cur[dataKey] as number | null;
  return (
    <div className="flex flex-col gap-4">
      <div className="neu-inset self-start flex items-center gap-4 px-4 py-2.5 rounded-2xl">
        <span className="text-[13px]" style={{ color: NEU.muted }}>
          {formatDate(String(cur.d))}
        </span>
        <span className="text-xl font-semibold" style={{ color: NEU.accentInk }}>
          {value === null || value === undefined ? '-' : format(Number(value))}
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart {...common}>
              {grid}
              {x}
              {y}
              <Tooltip content={() => null} cursor={{ fill: 'rgba(42,48,64,0.05)' }} />
              <Bar dataKey={dataKey as string} fill={color} radius={[10, 10, 4, 4]} maxBarSize={30} animationDuration={600} />
              {marker}
            </BarChart>
          ) : (
            <AreaChart {...common}>
              <defs>
                <linearGradient id={`neu-day-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              {x}
              {y}
              <Tooltip content={() => null} cursor={{ stroke: NEU.ink, strokeDasharray: '3 4' }} />
              <Area
                type="monotone"
                dataKey={dataKey as string}
                stroke={color}
                strokeWidth={3}
                fill={`url(#neu-day-${dataKey})`}
                connectNulls
                dot={{ r: 4, fill: '#E7EBF1', stroke: color, strokeWidth: 2.5 }}
                activeDot={{ r: 8, fill: color, stroke: '#FFFFFF', strokeWidth: 3 }}
                animationDuration={600}
              />
              {marker}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** How each day's entries came out, stacked (OK and critical, say). */
export function NeuStackedDays<T extends { d: string }>({
  data,
  series,
  onPickDay,
  selectedDay,
}: {
  data: T[];
  series: { key: keyof T & string; label: string; color: string }[];
  onPickDay?: (day: string) => void;
  selectedDay?: string | null;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  if (!data.length) return <Empty>Nothing filed in this period yet.</Empty>;
  const cur = data[idx ?? data.length - 1] as Record<string, unknown>;
  const axis = { fontSize: 12, fill: NEU.muted, fontFamily: 'Outfit' };
  const move = (s: unknown) => {
    const n = Number((s as { activeIndex?: unknown } | null)?.activeIndex);
    if (Number.isInteger(n)) setIdx(n);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="neu-inset self-start flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-2xl">
        <span className="text-[13px]" style={{ color: NEU.muted }}>
          {formatDate(String(cur.d))}
        </span>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-sm font-semibold" style={{ color: NEU.ink }}>
            <span className="w-2.5 h-2.5 rounded" style={{ background: s.color }} />
            {s.label} {Number(cur[s.key] ?? 0)}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            onMouseMove={move}
            onClick={(s) => {
              move(s);
              const label = (s as { activeLabel?: unknown } | null)?.activeLabel;
              if (onPickDay && label !== undefined && label !== null) onPickDay(String(label));
            }}
            style={onPickDay ? { cursor: 'pointer' } : undefined}
          >
            <CartesianGrid vertical={false} stroke={NEU.rule} strokeDasharray="4 6" />
            <XAxis dataKey="d" tick={axis} tickLine={false} axisLine={false} minTickGap={16} tickFormatter={shortDay} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={46} allowDecimals={false} />
            <Tooltip content={() => null} cursor={{ fill: 'rgba(42,48,64,0.05)' }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key as string} stackId="day" fill={s.color} radius={i === series.length - 1 ? [10, 10, 0, 0] : 0} maxBarSize={30} animationDuration={600} />
            ))}
            {selectedDay && <ReferenceLine x={selectedDay} stroke={NEU.ink} strokeWidth={2} strokeOpacity={0.4} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A labelled bar row: name, value on the right, a track under it. */
export const NeuBarRow: React.FC<{ label: string; tag?: React.ReactNode; value: string; valueColor?: string; pct: number; color: string; note?: string }> = ({
  label,
  tag,
  value,
  valueColor = NEU.ink,
  pct,
  color,
  note,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline gap-2 text-sm">
      <span className="font-semibold" style={{ color: NEU.ink }}>
        {label}
      </span>
      {tag}
      <span className="ml-auto font-semibold" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Track pct={pct} color={color} h={9} />
      </div>
      {note && (
        <span className="w-20 text-right text-xs" style={{ color: NEU.muted }}>
          {note}
        </span>
      )}
    </div>
  </div>
);

/** Something to act on: a raised row, red when it is bad, amber when it is coming. */
export const NeuAlert: React.FC<{ icon: React.ReactNode; site: string; title: string; detail: string; tone: 'bad' | 'soon' }> = ({ icon, site, title, detail, tone }) => {
  const c = tone === 'bad' ? NEU.bad : '#9A6A12';
  return (
    <div className="neu-raised-sm flex items-center gap-3 px-3.5 py-3 rounded-2xl">
      <span className="neu-inset w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ color: c }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm font-semibold" style={{ color: NEU.ink }}>
          {site}
        </span>
        <span className="block truncate text-[13px] font-semibold" style={{ color: c }} title={title}>
          {title}
        </span>
      </span>
      <span className="max-w-28 truncate text-xs" style={{ color: NEU.muted }} title={detail}>
        {detail}
      </span>
    </div>
  );
};

/** "3 of 7 days": a small track and the words, with what it means on hover. */
export const NeuFiled: React.FC<{ filed: number; expected: number; what: string }> = ({ filed, expected, what }) => {
  const pct = expected ? Math.min(100, (filed / expected) * 100) : 0;
  const color = pct >= 90 ? NEU.good : pct >= 50 ? NEU.mid : NEU.bad;
  return (
    <span className="flex items-center gap-2.5" title={`${what} on ${filed} of the ${expected} days in this period`}>
      <span className="w-16 shrink-0">
        <Track pct={Math.max(pct, filed ? 4 : 0)} color={color} h={7} />
      </span>
      <span className="text-[13px] whitespace-nowrap" style={{ color: NEU.ink }}>
        <b className="font-semibold">{filed}</b>
        <span style={{ color: NEU.muted }}> of {expected} days</span>
      </span>
    </span>
  );
};

/** A status chip: pressed in, coloured by tone. */
export const NeuChip: React.FC<{ tone: 'ok' | 'soon' | 'bad' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => {
  const style = {
    ok: { background: '#D8EDE2', color: NEU.good },
    soon: { background: '#F6E7C9', color: '#8A5A0B' },
    bad: { background: '#F6DAD3', color: NEU.bad },
    muted: { background: 'transparent', color: NEU.muted },
  }[tone];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap ${tone === 'muted' ? 'neu-inset' : ''}`} style={style}>
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// A sortable table with a search and a CSV download
// ---------------------------------------------------------------------------

export interface NeuCol<T> {
  key: string;
  label: string;
  /** A CSS grid track: '150px', 'minmax(0,1.5fr)'. */
  width: string;
  align?: 'right';
  sort: (r: T) => number | string;
  cell: (r: T) => React.ReactNode;
  csv: (r: T) => string | number;
}

export function NeuTable<T>({
  rows,
  cols,
  rowKey,
  searchText,
  fileName,
  initialSort,
  empty,
  onPick,
}: {
  rows: T[];
  cols: NeuCol<T>[];
  /** Rows open something when given. */
  onPick?: (r: T) => void;
  rowKey: (r: T) => string;
  /** What a search matches against, per row. */
  searchText?: (r: T) => string;
  fileName: string;
  initialSort: { key: string; dir: 1 | -1 };
  empty: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key) ?? cols[0];
    return rows
      .filter((r) => !needle || !searchText || searchText(r).toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = col.sort(a);
        const y = col.sort(b);
        return typeof x === 'string' ? sort.dir * String(x).localeCompare(String(y)) : sort.dir * ((x as number) - (y as number));
      });
  }, [rows, cols, sort, needle, searchText]);
  const template = { gridTemplateColumns: cols.map((c) => c.width).join(' ') };

  const download = () => {
    const esc = (v: string | number) => {
      const t = String(v ?? '');
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = [cols.map((c) => esc(c.label)).join(','), ...shown.map((r) => cols.map((c) => esc(c.csv(r))).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <span className="text-[13px] font-medium" style={{ color: NEU.muted }}>
          Showing {shown.length} of {rows.length}
        </span>
        <div className="flex flex-wrap items-center gap-3 print:hidden" data-pdf-ignore>
          {searchText && (
            <label className="neu-inset flex items-center gap-2.5 h-11 w-full sm:w-64 px-4 rounded-[14px]">
              <Search className="w-4 h-4 shrink-0" style={{ color: NEU.muted }} />
              <span className="sr-only">Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm"
                style={{ color: NEU.ink, fontFamily: 'inherit' }}
              />
            </label>
          )}
          <NeuButton onClick={download} disabled={!shown.length}>
            <Download className="w-4 h-4" /> CSV
          </NeuButton>
        </div>
      </div>
      <div className="overflow-x-auto neu-scroll">
        <div className="min-w-[860px]">
          <div className="grid gap-4 px-7 pb-2" style={template}>
            {cols.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSort((p) => ({ key: c.key, dir: p.key === c.key ? ((-p.dir) as 1 | -1) : -1 }))}
                aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                className={`border-0 bg-transparent p-0 text-xs font-bold uppercase tracking-[0.05em] cursor-pointer ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                style={{ color: sort.key === c.key ? NEU.accentInk : NEU.muted }}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
              </button>
            ))}
          </div>
          <div data-pdf-expand className="neu-scroll max-h-[560px] overflow-y-auto px-3 py-1 flex flex-col gap-1">
            {shown.map((r, i) => (
              <div
                key={rowKey(r)}
                onClick={onPick ? () => onPick(r) : undefined}
                className={`neu-row grid gap-4 items-center px-4 py-3 rounded-[14px] shrink-0 ${i % 2 === 0 ? 'neu-inset' : ''} ${onPick ? 'cursor-pointer' : ''}`}
                style={template}
              >
                {cols.map((c) => (
                  <span key={c.key} className={`min-w-0 text-sm ${c.align === 'right' ? 'text-right' : ''}`} style={{ color: NEU.ink }}>
                    {c.cell(r)}
                  </span>
                ))}
              </div>
            ))}
            {!shown.length && <Empty>{empty}</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The period filter bar, neumorphic
// ---------------------------------------------------------------------------

const PRESET_LABEL: Record<Exclude<Preset, 'custom'>, string> = {
  today: 'Today',
  last7: '7D',
  last30: '30D',
  last90: '90D',
  currentMonth: 'This month',
  prevMonth: 'Prev month',
  all: 'All',
};

const Divider = () => <span className="hidden md:block w-px self-stretch my-1.5 mx-0.5" style={{ background: NEU.rule }} aria-hidden />;

export const NeuPeriodFilterBar: React.FC<{
  filters: PeriodFilters;
  onChange: (f: PeriodFilters) => void;
  months: string[];
  sites: { code: string; name: string }[];
  presets: Exclude<Preset, 'custom'>[];
  defaults: PeriodFilters;
}> = ({ filters, onChange, months, sites, presets, defaults }) => {
  const set = (patch: Partial<PeriodFilters>) => onChange({ ...filters, ...patch });
  const [open, setOpen] = useState<'month' | 'sites' | null>(null);
  const byName = useMemo(() => new Map(sites.map((s) => [s.name, s.code])), [sites]);
  const nameOf = useMemo(() => new Map(sites.map((s) => [s.code, s.name])), [sites]);
  const dirty = filters.sites.length > 0 || !!filters.month || filters.segment !== 'ALL' || filters.preset !== defaults.preset;
  const presetValue = filters.month ? '' : filters.preset;

  return (
    <div className="neu-card relative z-20 flex flex-wrap items-center gap-3 p-3.5 print:hidden" style={{ borderRadius: 22 }}>
      <Segmented<Segment>
        value={filters.segment}
        onChange={(s) => set({ segment: s, sites: [] })}
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'B2B', label: 'B2B' },
          { value: 'B2C', label: 'B2C' },
        ]}
      />
      <Divider />
      <Segmented<string>
        value={presetValue}
        onChange={(p) => set({ preset: p as Preset, month: '' })}
        options={[...presets.map((p) => ({ value: p, label: PRESET_LABEL[p] })), { value: 'custom', label: 'Custom' }]}
      />
      {filters.preset === 'custom' && !filters.month && (
        <div className="flex items-center gap-2">
          {(['from', 'to'] as const).map((k) => (
            <label key={k} className="neu-inset flex items-center gap-2 h-11 px-3 rounded-[14px] text-xs font-semibold" style={{ color: NEU.muted }}>
              {k === 'from' ? 'From' : 'To'}
              <input
                type="date"
                value={filters[k]}
                onChange={(e) => set({ [k]: e.target.value })}
                className="border-0 outline-none bg-transparent text-sm"
                style={{ color: NEU.ink, fontFamily: 'inherit' }}
              />
            </label>
          ))}
        </div>
      )}
      <Divider />
      <Drop label="Month" active={filters.month ? formatMonth(filters.month) : ''} open={open === 'month'} onToggle={() => setOpen(open === 'month' ? null : 'month')} onClose={() => setOpen(null)}>
        {[['', 'All months'], ...months.map((m) => [m, formatMonth(m)])].map(([v, l]) => (
          <Option
            key={v || 'all'}
            label={l}
            on={v === filters.month}
            onPick={() => {
              set({ month: v });
              setOpen(null);
            }}
          />
        ))}
      </Drop>
      <Multi
        label="Sites"
        options={sites.map((s) => s.name)}
        value={filters.sites.map((c) => nameOf.get(c) ?? c)}
        open={open === 'sites'}
        onToggle={() => setOpen(open === 'sites' ? null : 'sites')}
        onClose={() => setOpen(null)}
        onApply={(names) => set({ sites: names.map((n) => byName.get(n) ?? n) })}
      />
      {dirty && (
        <button type="button" onClick={() => onChange(defaults)} className="h-11 px-3.5 border-0 bg-transparent text-sm font-semibold cursor-pointer whitespace-nowrap" style={{ color: NEU.accentInk }}>
          Reset
        </button>
      )}
    </div>
  );
};
