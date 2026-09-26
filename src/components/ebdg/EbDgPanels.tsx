import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Fuel, Gauge, Wrench } from 'lucide-react';
import {
  attentionItems,
  formatDate,
  formatNum,
  formatRupees,
  formatShort,
  type DaySite,
  type DgUnit,
  type EbDgDashboard as Dashboard,
  type MaintenanceState,
  type SitePower,
} from '../../lib/ebdg/dashboard';
import {
  CardHead,
  Empty,
  NEU,
  NeuAlert,
  NeuCard,
  NeuChip,
  NeuDelta,
  NeuKpi,
  NeuTable,
  Ring,
  Segmented,
  Track,
  type NeuCol,
} from '../analytics/NeuKit';
import { METRIC, type TrendMetric } from './EbDgCharts';

/**
 * The EB-DG dashboard's panels in the neumorphic look shared with Diesel,
 * Daily Site Report and Fire Pump. Every figure comes from lib/ebdg/dashboard.
 */

export const coverTone = (c: number) => (c < 3 ? { tone: 'bad' as const, tag: 'URGENT' } : c < 7 ? { tone: 'soon' as const, tag: 'SOON' } : { tone: 'ok' as const, tag: 'OK' });
export const stateTone = (s: MaintenanceState) => ({ OVERDUE: 'bad', 'DUE SOON': 'soon', OK: 'ok', 'NO DATA': 'muted' } as const)[s];

/** The DG colours: DG 1 orange, DG 2 slate, DG 3 pale slate. */
export const DG_COLOR = { 1: NEU.accent, 2: NEU.slate, 3: NEU.slate2 } as const;

// ---------------------------------------------------------------------------
// KPI cards: each one also picks what the chart shows
// ---------------------------------------------------------------------------

const KPI_COLS: Record<number, string> = { 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6' };

export const EbDgKpis: React.FC<{ d: Dashboard; metric: TrendMetric; onMetric: (m: TrendMetric) => void }> = ({ d, metric, onMetric }) => {
  const k = d.kpi;
  const cards: { key: TrendMetric; value: string; sub: string; cur: number; prev?: number; good: 'up' | 'down' | 'neutral'; bar?: number }[] = [
    { key: 'hsd', value: `${formatShort(k.hsd)} L`, sub: k.hsdRate ? `₹${k.hsdRate} per litre` : `${k.sitesRanDg} sites ran a DG`, cur: k.hsd, prev: k.prev?.hsd, good: 'down' },
    { key: 'hrs', value: `${formatNum(k.dgHrs)} h`, sub: `${k.units} DGs at ${k.sitesRanDg} sites`, cur: k.dgHrs, prev: k.prev?.dgHrs, good: 'down' },
    { key: 'dgKwh', value: `${formatShort(k.dgKwh)} kWh`, sub: `${k.dgShare}% of energy`, cur: k.dgKwh, prev: k.prev?.dgKwh, good: 'down', bar: k.dgShare },
    { key: 'grid', value: `${formatShort(k.grid)} kWh`, sub: `${k.ebShare}% of energy`, cur: k.grid, prev: k.prev?.grid, good: 'neutral', bar: k.ebShare },
    ...(k.hasSolar
      ? [{ key: 'solar' as const, value: `${formatShort(k.solar)} kWh`, sub: `${k.solarShare}% of energy`, cur: k.solar, prev: k.prev?.solar, good: 'up' as const, bar: k.solarShare }]
      : []),
    { key: 'spend', value: formatRupees(k.spend), sub: k.blendedRate ? `₹${k.blendedRate} per unit` : 'EB and DG', cur: k.spend, prev: k.prev?.spend, good: 'down' },
  ];
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${KPI_COLS[cards.length] ?? 'xl:grid-cols-5'} gap-5 xl:gap-6`}>
      {cards.map((c) => (
        <NeuKpi
          key={c.key}
          label={METRIC[c.key].label}
          value={c.value}
          sub={c.sub}
          bar={c.bar}
          color={c.key === 'grid' ? NEU.slate : NEU.accent}
          active={metric === c.key}
          onClick={() => onMetric(c.key)}
          delta={<NeuDelta cur={c.cur} prev={c.prev} good={c.good} />}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Top sites: the five biggest users of diesel or of EB
// ---------------------------------------------------------------------------

export type RankBy = 'hsd' | 'grid';
const TOP = 5;

type RankRow = { code: string; site: string; value: number };

export const SiteRanking: React.FC<{
  d: Dashboard;
  rankBy: RankBy;
  onRankBy: (m: RankBy) => void;
  day: string | null;
  onClearDay: () => void;
  onPick: (code: string) => void;
}> = ({ d, rankBy, onRankBy, day, onClearDay, onPick }) => {
  const [all, setAll] = useState(false);
  const m = METRIC[rankBy];
  const rows: RankRow[] = useMemo(() => {
    const list: RankRow[] =
      day && d.daySites[day]
        ? d.daySites[day].map((s: DaySite) => ({ code: s.code, site: s.site, value: s[rankBy] }))
        : d.sites.map((s) => ({ code: s.code, site: s.site, value: s[rankBy] }));
    return list.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  }, [d, rankBy, day]);
  const total = rows.reduce((t, r) => t + r.value, 0);
  const shown = all ? rows : rows.slice(0, TOP);
  const max = rows[0]?.value || 1;

  return (
    <NeuCard>
      <CardHead
        title={day ? `Top ${TOP} sites on ${formatDate(day)}` : `Top ${TOP} sites`}
        sub={`${rankBy === 'hsd' ? 'By diesel used' : 'By EB units'}, ${rows.length} ${rows.length === 1 ? 'site' : 'sites'}`}
      >
        <div className="flex items-center gap-2">
          {day && (
            <button
              type="button"
              onClick={onClearDay}
              title="Back to the whole period"
              aria-label="Back to the whole period"
              className="neu-press neu-raised-sm w-9 h-9 rounded-xl border-0 flex items-center justify-center cursor-pointer"
              style={{ color: NEU.ink }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Segmented
            value={rankBy}
            onChange={(v) => onRankBy(v as RankBy)}
            options={[
              { value: 'hsd', label: 'Diesel' },
              { value: 'grid', label: 'EB' },
            ]}
          />
        </div>
      </CardHead>
      {!rows.length ? (
        <Empty>No {m.label.toLowerCase()} recorded {day ? 'that day' : 'in this period'}.</Empty>
      ) : (
        <>
          <div className="flex flex-col flex-1">
            {shown.map((r, i) => (
              <button
                key={r.code}
                type="button"
                onClick={() => onPick(r.code)}
                className="neu-row grid grid-cols-[22px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center px-2 py-2.5 rounded-xl border-0 bg-transparent text-left cursor-pointer"
              >
                <span className="text-[13px]" style={{ color: i < 3 ? NEU.ink : NEU.muted, fontWeight: i < 3 ? 700 : 400 }}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: NEU.ink }}>
                  {r.site}
                </span>
                <span className="text-sm font-semibold text-right whitespace-nowrap" style={{ color: NEU.ink }}>
                  {m.fmt(r.value)}
                  <span className="ml-2 text-xs font-normal" style={{ color: NEU.muted }}>
                    {total ? Math.round((r.value / total) * 100) : 0}%
                  </span>
                </span>
                <span />
                <span className="col-span-2">
                  <Track pct={(r.value / max) * 100} color={rankBy === 'hsd' ? (i < 3 ? NEU.accent : NEU.accentSoft) : i < 3 ? NEU.slate : NEU.slate2} h={9} />
                </span>
              </button>
            ))}
          </div>
          {rows.length > TOP && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 self-start border-0 bg-transparent text-sm font-semibold underline underline-offset-2 cursor-pointer" style={{ color: NEU.accentInk }}>
              {all ? `Show top ${TOP}` : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Energy mix
// ---------------------------------------------------------------------------

export const EnergyCard: React.FC<{ d: Dashboard }> = ({ d }) => {
  const k = d.kpi;
  const parts = [
    { key: 'DG', value: k.dgKwh, pct: k.dgShare, color: NEU.accent, rate: k.dgUnitRate },
    { key: 'EB', value: k.grid, pct: k.ebShare, color: NEU.slate, rate: k.ebUnitRate },
    ...(k.hasSolar ? [{ key: 'Solar', value: k.solar, pct: k.solarShare, color: '#E3B89E', rate: null as number | null }] : []),
  ];
  const times = k.dgUnitRate && k.ebUnitRate ? k.dgUnitRate / k.ebUnitRate : null;
  return (
    <NeuCard>
      <CardHead title="Energy mix" sub={`${formatShort(k.energy)} kWh in all`} />
      <div className="flex items-center gap-5">
        <Ring size={150} stroke={18} label="Energy by source" slices={parts.map((p) => ({ value: p.value, color: p.color }))}>
          <span className="text-2xl font-semibold" style={{ color: NEU.ink }}>
            {Math.round(k.dgShare)}%
          </span>
          <span className="text-[11px]" style={{ color: NEU.muted }}>
            from DG
          </span>
        </Ring>
        <div className="flex-1 min-w-0 flex flex-col">
          {parts.map((p) => (
            <div key={p.key} className="flex flex-col gap-0.5 py-2 border-t first:border-t-0" style={{ borderColor: NEU.rule }}>
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: NEU.ink }}>
                <span className="w-2.75 h-2.75 rounded" style={{ background: p.color }} />
                {p.key}
                <span className="ml-auto">{p.pct}%</span>
              </span>
              <span className="pl-5 text-xs truncate" style={{ color: NEU.muted }}>
                {formatShort(p.value)} kWh{p.rate !== null ? `, ₹${p.rate.toFixed(2)}/unit` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
      {times !== null && (
        <div className="neu-inset mt-auto px-4 py-3 rounded-2xl text-sm" style={{ color: NEU.accentInk }}>
          A DG unit costs <b className="font-semibold">{times.toFixed(1)}x</b> an EB unit.
        </div>
      )}
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

const KIND_ICON = { fuel: Fuel, bcheck: Wrench, pf: Gauge };

export const AttentionCard: React.FC<{ d: Dashboard; onPick: (code: string) => void }> = ({ d, onPick }) => {
  const items = useMemo(() => attentionItems(d), [d]);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <NeuCard>
      <CardHead title="Needs attention" sub={items.length ? `${items.length} to act on: diesel, B-checks, power factor` : 'Diesel, B-checks and power factor are fine'} />
      {!items.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-center">
          <span className="neu-inset w-12 h-12 rounded-2xl flex items-center justify-center" style={{ color: NEU.good }}>
            <CheckCircle2 className="w-6 h-6" />
          </span>
          <p className="text-base font-semibold" style={{ color: NEU.ink }}>
            All clear
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {shown.map((it, i) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <button key={`${it.kind}-${it.code}-${i}`} type="button" onClick={() => onPick(it.code)} className="neu-press border-0 bg-transparent p-0 text-left cursor-pointer">
                  <NeuAlert icon={<Icon className="w-4 h-4" />} site={it.site} title={it.title} detail={it.detail} tone={it.tone} />
                </button>
              );
            })}
          </div>
          {items.length > 4 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 self-start border-0 bg-transparent text-sm font-semibold underline underline-offset-2 cursor-pointer" style={{ color: NEU.accentInk }}>
              {all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </NeuCard>
  );
};

// ---------------------------------------------------------------------------
// Detail tables
// ---------------------------------------------------------------------------

const dash = <span style={{ color: NEU.muted }}>-</span>;

export const SitesTable: React.FC<{ sites: SitePower[]; onPick: (code: string) => void; fileName: string }> = ({ sites, onPick, fileName }) => {
  const cols: NeuCol<SitePower>[] = [
    { key: 'site', label: 'Site', width: 'minmax(0,1.4fr)', sort: (s) => s.site, cell: (s) => <span className="block truncate font-semibold">{s.site}</span>, csv: (s) => s.site },
    { key: 'city', label: 'City', width: '110px', sort: (s) => s.city, cell: (s) => <span className="block truncate" style={{ color: NEU.muted }}>{s.city || '-'}</span>, csv: (s) => s.city },
    { key: 'hsd', label: 'Diesel L', width: '96px', align: 'right', sort: (s) => s.hsd, cell: (s) => <span className="font-semibold" style={{ color: NEU.accentInk }}>{formatNum(s.hsd)}</span>, csv: (s) => s.hsd },
    { key: 'dgHrs', label: 'DG hours', width: '90px', align: 'right', sort: (s) => s.dgHrs, cell: (s) => s.dgHrs, csv: (s) => s.dgHrs },
    { key: 'dgKwh', label: 'DG kWh', width: '96px', align: 'right', sort: (s) => s.dgKwh, cell: (s) => formatNum(s.dgKwh), csv: (s) => s.dgKwh },
    { key: 'grid', label: 'EB kWh', width: '100px', align: 'right', sort: (s) => s.grid, cell: (s) => formatNum(s.grid), csv: (s) => s.grid },
    { key: 'ltrHr', label: 'L per hr', width: '84px', align: 'right', sort: (s) => s.ltrHr, cell: (s) => s.ltrHr || dash, csv: (s) => s.ltrHr },
    { key: 'stock', label: 'Diesel on site', width: '110px', align: 'right', sort: (s) => s.stock, cell: (s) => `${formatNum(s.stock)} L`, csv: (s) => s.stock },
    {
      key: 'cover',
      label: 'Cover',
      width: '100px',
      align: 'right',
      sort: (s) => s.cover ?? 1e9,
      cell: (s) => (s.cover === null ? dash : <NeuChip tone={coverTone(s.cover).tone}>{s.cover} days</NeuChip>),
      csv: (s) => s.cover ?? '',
    },
    { key: 'spend', label: 'Spend', width: '96px', align: 'right', sort: (s) => s.spend, cell: (s) => (s.spend ? formatRupees(s.spend) : dash), csv: (s) => s.spend },
  ];
  return (
    <NeuTable
      rows={sites}
      cols={cols}
      rowKey={(s) => s.code}
      searchText={(s) => `${s.site} ${s.code} ${s.city}`}
      fileName={fileName}
      initialSort={{ key: 'hsd', dir: -1 }}
      empty="No sites match."
      onPick={(s) => onPick(s.code)}
    />
  );
};

export const DgTable: React.FC<{ units: DgUnit[]; onPick: (code: string) => void; fileName: string }> = ({ units, onPick, fileName }) => {
  const cols: NeuCol<DgUnit>[] = [
    { key: 'site', label: 'Site', width: 'minmax(0,1.4fr)', sort: (u) => u.site, cell: (u) => <span className="block truncate font-semibold">{u.site}</span>, csv: (u) => u.site },
    {
      key: 'n',
      label: 'DG',
      width: '72px',
      sort: (u) => u.n,
      cell: (u) => (
        <span className="inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold text-white" style={{ background: DG_COLOR[u.n] }}>
          DG {u.n}
        </span>
      ),
      csv: (u) => `DG ${u.n}`,
    },
    { key: 'hrs', label: 'Hours', width: '84px', align: 'right', sort: (u) => u.hrs, cell: (u) => u.hrs, csv: (u) => u.hrs },
    { key: 'hsd', label: 'Diesel L', width: '96px', align: 'right', sort: (u) => u.hsd, cell: (u) => formatNum(u.hsd), csv: (u) => u.hsd },
    { key: 'ltrHr', label: 'L per hr', width: '84px', align: 'right', sort: (u) => u.ltrHr ?? -1, cell: (u) => u.ltrHr ?? dash, csv: (u) => u.ltrHr ?? '' },
    { key: 'kwhPerL', label: 'kWh per L', width: '90px', align: 'right', sort: (u) => u.kwhPerL ?? -1, cell: (u) => u.kwhPerL ?? dash, csv: (u) => u.kwhPerL ?? '' },
    { key: 'meter', label: 'Hour meter', width: '100px', align: 'right', sort: (u) => u.hourMeter ?? -1, cell: (u) => (u.hourMeter === null ? dash : formatNum(u.hourMeter)), csv: (u) => u.hourMeter ?? '' },
    { key: 'tank', label: 'Day tank', width: '90px', align: 'right', sort: (u) => u.dayTank ?? -1, cell: (u) => (u.dayTank === null ? dash : `${formatNum(u.dayTank)} L`), csv: (u) => u.dayTank ?? '' },
    {
      key: 'bcheck',
      label: 'B-check left',
      width: '130px',
      align: 'right',
      sort: (u) => u.bcheck?.remHrs ?? 1e9,
      cell: (u) => (
        <NeuChip tone={stateTone(u.state)}>
          {u.bcheck?.remHrs !== null && u.bcheck?.remHrs !== undefined ? `${formatNum(u.bcheck.remHrs)} h` : u.state === 'NO DATA' ? 'Not read' : u.state}
        </NeuChip>
      ),
      csv: (u) => u.bcheck?.remHrs ?? '',
    },
  ];
  return (
    <NeuTable
      rows={units}
      cols={cols}
      rowKey={(u) => `${u.code}-${u.n}`}
      searchText={(u) => `${u.site} ${u.code} DG ${u.n}`}
      fileName={fileName}
      initialSort={{ key: 'hrs', dir: -1 }}
      empty="No DGs match."
      onPick={(u) => onPick(u.code)}
    />
  );
};

