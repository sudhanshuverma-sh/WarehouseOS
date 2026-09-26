import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_PERIOD_FILTERS, formatDate, formatRange, monthsOf, type PeriodFilters } from '../../lib/analytics/period';
import type { AnalyticsSite } from '../../lib/analytics/sites';
import { computeDailySiteDashboard, reportAvailability, type DailyMetric, type DailySiteDashboard, type DailySiteRow } from '../../lib/dailySite/dashboard';
import type { SiteHealth } from '../../lib/dailySite/scoring';
import type { DailySiteLog } from '../../types';
import {
  CardHead,
  Empty,
  NEU,
  NeuAlert,
  NeuBarRow,
  NeuButton,
  NeuCard,
  NeuChip,
  NeuDayChart,
  NeuDelta,
  NeuEmpty,
  NeuFiled,
  NeuHeader,
  NeuKpi,
  NeuPage,
  NeuPdfButton,
  NeuPeriodFilterBar,
  NeuPill,
  NeuTable,
  Ring,
  SectionHead,
  Segmented,
  type NeuCol,
} from '../analytics/NeuKit';

/**
 * Daily Site Report dashboard: the Admin Service Hub view for the Daily Site
 * Activity Report, in the same neumorphic look as Diesel. Every figure comes
 * from the reports POCs file (lib/dailySite/dashboard.ts); nothing here is
 * sample data.
 *
 * Five KPI cards (each one also picks what the chart shows), the chosen
 * figure per day, then equipment, routines and PM, what needs acting on, and
 * the sites and reports behind it all.
 */

const LABEL: Record<DailyMetric, string> = {
  filing: 'Reports filed',
  utility: 'Utility uptime',
  mhe: 'MHE uptime',
  routine: 'Routine checks',
  critical: 'Critical days',
};
const HEALTH: Record<SiteHealth, { tone: 'ok' | 'soon' | 'bad' | 'muted'; label: string }> = {
  clear: { tone: 'ok', label: 'Clear' },
  partial: { tone: 'soon', label: 'Partial' },
  critical: { tone: 'bad', label: 'Critical' },
  missing: { tone: 'muted', label: 'Missing' },
};
const PRESETS = ['today', 'last7', 'last30', 'currentMonth', 'all'] as const;
const DEFAULTS: PeriodFilters = { ...DEFAULT_PERIOD_FILTERS, preset: 'last7' };
const toneOf = (v: number, warn = 95, bad = 75) => (v < bad ? NEU.bad : v < warn ? NEU.mid : NEU.good);
const pct = (n: number | null) => (n === null ? '-' : `${n % 1 ? n.toFixed(1) : n}%`);

export const DailyReportDashboard: React.FC<{ sites: AnalyticsSite[]; onOpenForm?: () => void }> = ({ sites, onOpenForm }) => {
  const { dailySiteLogs, currentDate } = useApp();
  const [filters, setFilters] = useState<PeriodFilters>(DEFAULTS);
  const page = useRef<HTMLDivElement>(null);

  const offered = useMemo(() => sites.filter((s) => s.services === 'ALL' || s.services.includes('SITE_ACTIVITY')), [sites]);
  const d = useMemo(() => computeDailySiteDashboard(dailySiteLogs, sites, filters, currentDate), [dailySiteLogs, sites, filters, currentDate]);
  const months = useMemo(() => monthsOf(dailySiteLogs.map((l) => l.date), currentDate), [dailySiteLogs, currentDate]);
  const siteOptions = useMemo(
    () =>
      offered
        .filter((s) => filters.segment === 'ALL' || (filters.segment === 'B2C' ? s.channel === 'B2C' : s.channel !== 'B2C'))
        .map((s) => ({ code: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [offered, filters.segment],
  );
  const range = formatRange(d.range);
  const subtitle = `${d.sites.length} ${d.sites.length === 1 ? 'site' : 'sites'}, ${d.kpi.filed.toLocaleString('en-IN')} reports, ${range}`;

  return (
    <NeuPage ref={page}>
      <NeuHeader icon={<ClipboardCheck className="w-6 h-6" strokeWidth={1.9} />} title="Daily Site Report" subtitle={subtitle}>
        <NeuPill>
          <CalendarDays className="w-4.5 h-4.5" strokeWidth={1.9} />
          {range}
        </NeuPill>
        <NeuPdfButton target={page} title="Daily Site Report" subtitle={subtitle} />
        {onOpenForm && (
          <NeuButton primary onClick={onOpenForm}>
            File report <ArrowRight className="w-4 h-4" />
          </NeuButton>
        )}
      </NeuHeader>

      {dailySiteLogs.length === 0 ? (
        <NeuEmpty title="No daily reports yet" body="The dashboard fills in as sites file their Daily Site Activity Report." />
      ) : (
        <>
          <NeuPeriodFilterBar filters={filters} onChange={setFilters} months={months} sites={siteOptions} presets={[...PRESETS]} defaults={DEFAULTS} />
          <Body d={d} range={range} />
        </>
      )}
    </NeuPage>
  );
};

const Body: React.FC<{ d: DailySiteDashboard; range: string }> = ({ d, range }) => {
  const [metric, setMetric] = useState<DailyMetric>('filing');
  const [tab, setTab] = useState<'sites' | 'reports'>('sites');
  const k = d.kpi;
  const p = k.prev;
  const tag = `${d.range.from ?? 'all'}-to-${d.range.to}`;

  const kpis: { key: DailyMetric; value: string; sub: string; bar?: number; cur: number; prev?: number | null; good: 'up' | 'down' }[] = [
    { key: 'filing', value: `${k.filingRate}%`, sub: `${k.filed} of ${k.expected} expected`, bar: k.filingRate, cur: k.filingRate, prev: p?.filingRate, good: 'up' },
    { key: 'utility', value: pct(k.utility), sub: 'UPS, DG, cold room and more', bar: k.utility ?? 0, cur: k.utility ?? 0, prev: p?.utility, good: 'up' },
    { key: 'mhe', value: pct(k.mhe), sub: 'RT, BOPT, stackers, VRC', bar: k.mhe ?? 0, cur: k.mhe ?? 0, prev: p?.mhe, good: 'up' },
    { key: 'routine', value: pct(k.routine), sub: k.pm !== null ? `PM ${k.pm}% complete` : 'Done out of due', bar: k.routine ?? 0, cur: k.routine ?? 0, prev: p?.routine, good: 'up' },
    { key: 'critical', value: String(k.critical), sub: `${k.partial} partial, ${k.clear} clear`, cur: k.critical, prev: p?.critical, good: 'down' },
  ];

  return (
    <>
      <SectionHead aside={`Showing ${range}`}>Key metrics</SectionHead>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 xl:gap-6">
        {kpis.map((c) => (
          <NeuKpi
            key={c.key}
            label={LABEL[c.key]}
            value={c.value}
            sub={c.sub}
            bar={c.bar}
            color={c.bar !== undefined ? toneOf(c.bar) : undefined}
            active={metric === c.key}
            onClick={() => setMetric(c.key)}
            delta={<NeuDelta cur={c.cur} prev={c.prev} good={c.good} />}
          />
        ))}
      </div>

      <NeuCard>
        <CardHead title={`${LABEL[metric]} per day`} sub="Pick a card above to chart it; hover or tap a day for its figure" />
        <NeuDayChart
          data={d.daily}
          dataKey={metric}
          kind={metric === 'critical' ? 'bar' : 'area'}
          percent={metric !== 'critical'}
          format={metric === 'critical' ? (n) => `${Math.round(n)} critical` : (n) => `${n.toFixed(1)}%`}
        />
      </NeuCard>

      <SectionHead>Equipment, routines and what to act on</SectionHead>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <Equipment d={d} />
        <Routines d={d} />
        <div className="md:col-span-2 xl:col-span-1 grid">
          <Attention items={d.attention} />
        </div>
      </div>

      <SectionHead aside={`${d.sites.length} sites, ${d.entries.length} reports`}>Sites and reports</SectionHead>
      <section className="neu-card px-3 pt-7 pb-5 flex flex-col gap-4">
        <div className="px-4">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { value: 'sites', label: `Sites (${d.sites.length})` },
              { value: 'reports', label: `Reports (${d.entries.length})` },
            ]}
          />
        </div>
        {tab === 'sites' ? <SitesTable rows={d.sites} tag={tag} /> : <ReportsTable rows={d.entries} tag={tag} />}
      </section>
    </>
  );
};

/** Every piece of kit, weakest first. */
const Equipment: React.FC<{ d: DailySiteDashboard }> = ({ d }) => {
  const [all, setAll] = useState(false);
  const shown = all ? d.assets : d.assets.slice(0, 6);
  return (
    <NeuCard>
      <CardHead title="Equipment uptime" sub="Weakest first" />
      {!d.entries.length ? (
        <Empty>No reports in this period.</Empty>
      ) : (
        <>
          <div className="flex flex-col gap-4 flex-1">
            {shown.map((a) => (
              <NeuBarRow
                key={a.key}
                label={a.label}
                tag={a.critical && a.avg < 100 ? <NeuChip tone="bad">Stock risk</NeuChip> : <span className="text-[11px] font-semibold uppercase" style={{ color: NEU.muted }}>{a.group}</span>}
                value={`${a.avg.toFixed(1)}%`}
                valueColor={toneOf(a.avg)}
                pct={a.avg}
                color={toneOf(a.avg)}
                note={a.down ? `${a.down} down` : 'no dips'}
              />
            ))}
          </div>
          {d.assets.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 self-start border-0 bg-transparent text-sm font-semibold underline underline-offset-2 cursor-pointer" style={{ color: NEU.accentInk }}>
              {all ? 'Show fewer' : `Show all ${d.assets.length}`}
            </button>
          )}
        </>
      )}
    </NeuCard>
  );
};

/** The four routine checks, and preventive maintenance. */
const Routines: React.FC<{ d: DailySiteDashboard }> = ({ d }) => {
  const k = d.kpi;
  return (
    <NeuCard>
      <CardHead title="Routine checks and PM" sub="Done out of due" />
      <div className="flex flex-col gap-4">
        {d.routines.map((r) => (
          <NeuBarRow
            key={r.key}
            label={r.label}
            value={pct(r.rate)}
            valueColor={r.rate === null ? NEU.muted : toneOf(r.rate, 95, 85)}
            pct={r.rate ?? 0}
            color={r.rate === null ? NEU.slate3 : toneOf(r.rate, 95, 85)}
            note={r.notDone ? `${r.notDone} missed` : 'none missed'}
          />
        ))}
      </div>
      <div className="mt-auto pt-6 flex items-center gap-5">
        <Ring size={116} stroke={13} label={`Preventive maintenance ${k.pm ?? 0}% complete`} slices={[{ value: k.pmCompleted, color: NEU.accent }, { value: Math.max(k.pmPlanned - k.pmCompleted, 0), color: 'transparent' }]}>
          <span className="text-lg font-semibold" style={{ color: NEU.ink }}>
            {k.pm === null ? '-' : `${k.pm}%`}
          </span>
          <span className="text-[11px]" style={{ color: NEU.muted }}>
            PM done
          </span>
        </Ring>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold" style={{ color: NEU.ink }}>
            Preventive maintenance
          </span>
          <span className="text-[13px]" style={{ color: NEU.muted }}>
            {k.pmCompleted} of {k.pmPlanned} jobs completed
          </span>
        </div>
      </div>
    </NeuCard>
  );
};

const Attention: React.FC<{ items: DailySiteDashboard['attention'] }> = ({ items }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <NeuCard>
      <CardHead title="Needs attention" sub={items.length ? `${items.length} to act on, worst first` : 'Every latest report is clean'} />
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
            {shown.map((it, i) => (
              <NeuAlert
                key={`${it.code}-${i}`}
                icon={it.title.startsWith('Blocked') || it.title.includes('not done') ? <Wrench className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                site={it.site}
                title={it.title}
                detail={it.detail}
                tone={it.tone}
              />
            ))}
          </div>
          {items.length > 5 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 self-start border-0 bg-transparent text-sm font-semibold underline underline-offset-2 cursor-pointer" style={{ color: NEU.accentInk }}>
              {all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </NeuCard>
  );
};

const pctCell = (n: number | null, warn = 95) =>
  n === null ? <span style={{ color: NEU.muted }}>-</span> : <span className="font-semibold" style={{ color: n < warn ? NEU.bad : NEU.ink }}>{pct(n)}</span>;

const SitesTable: React.FC<{ rows: DailySiteRow[]; tag: string }> = ({ rows, tag }) => {
  const cols: NeuCol<DailySiteRow>[] = [
    { key: 'name', label: 'Site', width: 'minmax(0,1.4fr)', sort: (r) => r.name, cell: (r) => <span className="block truncate font-semibold">{r.name}</span>, csv: (r) => r.name },
    { key: 'city', label: 'City', width: '110px', sort: (r) => r.city, cell: (r) => <span className="block truncate" style={{ color: NEU.muted }}>{r.city || '-'}</span>, csv: (r) => r.city },
    { key: 'filed', label: 'Days filed', width: '190px', sort: (r) => (r.expected ? r.filed / r.expected : 0), cell: (r) => <NeuFiled filed={r.filed} expected={r.expected} what="Reports filed" />, csv: (r) => `${r.filed} of ${r.expected}` },
    { key: 'utility', label: 'Utility', width: '84px', align: 'right', sort: (r) => r.utility ?? -1, cell: (r) => pctCell(r.utility), csv: (r) => r.utility ?? '' },
    { key: 'mhe', label: 'MHE', width: '84px', align: 'right', sort: (r) => r.mhe ?? -1, cell: (r) => pctCell(r.mhe), csv: (r) => r.mhe ?? '' },
    { key: 'routine', label: 'Routine', width: '84px', align: 'right', sort: (r) => r.routine ?? -1, cell: (r) => pctCell(r.routine, 90), csv: (r) => r.routine ?? '' },
    { key: 'pm', label: 'PM', width: '70px', align: 'right', sort: (r) => r.pm ?? -1, cell: (r) => pctCell(r.pm, 80), csv: (r) => r.pm ?? '' },
    { key: 'critical', label: 'Critical', width: '80px', align: 'right', sort: (r) => r.critical, cell: (r) => <span className="font-semibold" style={{ color: r.critical ? NEU.bad : NEU.ink }}>{r.critical}</span>, csv: (r) => r.critical },
    {
      key: 'latest',
      label: 'Latest report',
      width: '190px',
      sort: (r) => r.latest?.date ?? '',
      cell: (r) =>
        r.latest ? (
          <span className="flex items-center gap-2">
            <NeuChip tone={HEALTH[r.latest.status].tone}>{HEALTH[r.latest.status].label}</NeuChip>
            <span className="text-[13px]" style={{ color: NEU.muted }}>
              {formatDate(r.latest.date)}
            </span>
          </span>
        ) : (
          <NeuChip tone="muted">Not filed</NeuChip>
        ),
      csv: (r) => (r.latest ? `${HEALTH[r.latest.status].label} ${r.latest.date}` : 'Not filed'),
    },
  ];
  return (
    <NeuTable
      rows={rows}
      cols={cols}
      rowKey={(r) => r.code}
      searchText={(r) => `${r.name} ${r.code} ${r.city}`}
      fileName={`daily-site-report-sites-${tag}`}
      initialSort={{ key: 'critical', dir: -1 }}
      empty="No sites match."
    />
  );
};

type ReportRow = DailySiteLog & { siteName: string };

const ReportsTable: React.FC<{ rows: ReportRow[]; tag: string }> = ({ rows, tag }) => {
  const cols: NeuCol<ReportRow>[] = [
    { key: 'date', label: 'Date', width: '120px', sort: (r) => r.date, cell: (r) => formatDate(r.date), csv: (r) => r.date },
    { key: 'site', label: 'Site', width: 'minmax(0,1.3fr)', sort: (r) => r.siteName, cell: (r) => <span className="block truncate font-semibold">{r.siteName}</span>, csv: (r) => r.siteName },
    { key: 'poc', label: 'Filed by', width: 'minmax(0,1fr)', sort: (r) => r.pocName, cell: (r) => <span className="block truncate">{r.pocName || '-'}</span>, csv: (r) => r.pocName },
    { key: 'utility', label: 'Utility', width: '84px', align: 'right', sort: (r) => reportAvailability(r).utility, cell: (r) => pctCell(reportAvailability(r).utility), csv: (r) => reportAvailability(r).utility },
    { key: 'mhe', label: 'MHE', width: '84px', align: 'right', sort: (r) => reportAvailability(r).mhe, cell: (r) => pctCell(reportAvailability(r).mhe), csv: (r) => reportAvailability(r).mhe },
    { key: 'dev', label: 'Deviations', width: '96px', align: 'right', sort: (r) => r.deviationsCount, cell: (r) => r.deviationsCount, csv: (r) => r.deviationsCount },
    { key: 'status', label: 'Status', width: '100px', sort: (r) => r.worstStatus, cell: (r) => <NeuChip tone={HEALTH[r.worstStatus].tone}>{HEALTH[r.worstStatus].label}</NeuChip>, csv: (r) => HEALTH[r.worstStatus].label },
    {
      key: 'notes',
      label: 'Highlights',
      width: 'minmax(0,1.5fr)',
      sort: (r) => r.highlights ?? '',
      cell: (r) => (
        <span className="block truncate" style={{ color: NEU.muted }} title={r.highlights}>
          {r.highlights || '-'}
        </span>
      ),
      csv: (r) => r.highlights ?? '',
    },
  ];
  return (
    <NeuTable
      rows={rows}
      cols={cols}
      rowKey={(r) => r.logId}
      searchText={(r) => `${r.siteName} ${r.pocName} ${r.highlights ?? ''}`}
      fileName={`daily-site-reports-${tag}`}
      initialSort={{ key: 'date', dir: -1 }}
      empty="No reports match."
    />
  );
};
