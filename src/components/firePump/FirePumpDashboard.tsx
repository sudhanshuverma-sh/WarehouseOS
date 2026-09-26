import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, Flame, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_PERIOD_FILTERS, formatDate, formatRange, formatShortDay, monthsOf, type PeriodFilters } from '../../lib/analytics/period';
import type { AnalyticsSite } from '../../lib/analytics/sites';
import { computeFirePumpDashboard, type FireMetric, type FirePumpDashboard as Dashboard, type FireSiteRow } from '../../lib/firePump/dashboard';
import type { FirePumpLog } from '../../lib/firePump/records';
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
  NeuStackedDays,
  NeuTable,
  SectionHead,
  Segmented,
  type NeuCol,
} from '../analytics/NeuKit';

/**
 * Fire Pump Healthiness dashboard: the Admin Service Hub view for the fire
 * pump check, in the same neumorphic look as Diesel. Every figure comes from
 * the checks filed in WarehouseOS (lib/firePump/dashboard.ts); nothing here
 * is sample data.
 *
 * KPI cards (four of them also pick what the chart shows), the chosen figure
 * per day, then the checks that fail most, where each site stands, what needs
 * acting on, and the sites and checks behind it all.
 */

const LABEL: Record<FireMetric, string> = { filing: 'Checks filed', healthy: 'Healthy', critical: 'Critical checks', pressure: 'Hydrant pressure' };
const PRESETS = ['today', 'last7', 'last30', 'currentMonth', 'all'] as const;
const DEFAULTS: PeriodFilters = { ...DEFAULT_PERIOD_FILTERS, preset: 'last7' };
const OK_COLOR = NEU.slate2;

export const FirePumpDashboard: React.FC<{ sites: AnalyticsSite[]; onOpenForm?: () => void }> = ({ sites, onOpenForm }) => {
  const { firePumpLogs, currentDate } = useApp();
  const [filters, setFilters] = useState<PeriodFilters>(DEFAULTS);
  const page = useRef<HTMLDivElement>(null);

  const offered = useMemo(() => sites.filter((s) => s.services === 'ALL' || s.services.includes('FIRE')), [sites]);
  const d = useMemo(() => computeFirePumpDashboard(firePumpLogs, sites, filters, currentDate), [firePumpLogs, sites, filters, currentDate]);
  const months = useMemo(() => monthsOf(firePumpLogs.map((l) => l.date), currentDate), [firePumpLogs, currentDate]);
  const siteOptions = useMemo(
    () =>
      offered
        .filter((s) => filters.segment === 'ALL' || (filters.segment === 'B2C' ? s.channel === 'B2C' : s.channel !== 'B2C'))
        .map((s) => ({ code: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [offered, filters.segment],
  );
  const range = formatRange(d.range);
  const subtitle = `${d.sites.length} ${d.sites.length === 1 ? 'site' : 'sites'}, ${d.kpi.filed.toLocaleString('en-IN')} checks, ${range}`;

  return (
    <NeuPage ref={page}>
      <NeuHeader icon={<Flame className="w-6 h-6" strokeWidth={1.9} />} title="Fire Pump Healthiness" subtitle={subtitle}>
        <NeuPill>
          <CalendarDays className="w-4.5 h-4.5" strokeWidth={1.9} />
          {range}
        </NeuPill>
        <NeuPdfButton target={page} title="Fire Pump Healthiness" subtitle={subtitle} />
        {onOpenForm && (
          <NeuButton primary onClick={onOpenForm}>
            File check <ArrowRight className="w-4 h-4" />
          </NeuButton>
        )}
      </NeuHeader>

      {firePumpLogs.length === 0 ? (
        <NeuEmpty title="No fire pump checks yet" body="The dashboard fills in as sites file their Fire Pump Healthiness check." />
      ) : (
        <>
          <NeuPeriodFilterBar filters={filters} onChange={setFilters} months={months} sites={siteOptions} presets={[...PRESETS]} defaults={DEFAULTS} />
          <Body d={d} range={range} />
        </>
      )}
    </NeuPage>
  );
};

const Body: React.FC<{ d: Dashboard; range: string }> = ({ d, range }) => {
  const [metric, setMetric] = useState<FireMetric>('healthy');
  const [tab, setTab] = useState<'sites' | 'checks'>('sites');
  const k = d.kpi;
  const p = k.prev;
  const tag = `${d.range.from ?? 'all'}-to-${d.range.to}`;
  const healthyColor = (v: number) => (v >= 95 ? NEU.good : v >= 80 ? NEU.mid : NEU.bad);

  return (
    <>
      <SectionHead aside={`Showing ${range}`}>Key metrics</SectionHead>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5 xl:gap-6">
        <NeuKpi
          label={LABEL.filing}
          value={`${k.filingRate}%`}
          sub={`${k.filed} of ${k.expected} expected`}
          bar={k.filingRate}
          color={healthyColor(k.filingRate)}
          active={metric === 'filing'}
          onClick={() => setMetric('filing')}
          delta={<NeuDelta cur={k.filingRate} prev={p?.filingRate} good="up" />}
        />
        <NeuKpi
          label={LABEL.healthy}
          value={k.healthyRate === null ? '-' : `${k.healthyRate}%`}
          sub={`${k.ok} checks OK`}
          bar={k.healthyRate ?? 0}
          color={healthyColor(k.healthyRate ?? 0)}
          active={metric === 'healthy'}
          onClick={() => setMetric('healthy')}
          delta={<NeuDelta cur={k.healthyRate ?? 0} prev={p?.healthyRate} good="up" />}
        />
        <NeuKpi
          label={LABEL.critical}
          value={String(k.critical)}
          sub={`${k.openIssues} checks failing right now`}
          active={metric === 'critical'}
          onClick={() => setMetric('critical')}
          delta={<NeuDelta cur={k.critical} prev={p?.critical} good="down" />}
        />
        <NeuKpi
          label={LABEL.pressure}
          value={k.pressure === null ? '-' : `${k.pressure} bar`}
          sub="Average header pressure"
          active={metric === 'pressure'}
          onClick={() => setMetric('pressure')}
          delta={<NeuDelta cur={k.pressure ?? 0} prev={p?.pressure} good="neutral" />}
        />
        <NeuKpi label="Sites failing now" value={String(k.criticalNow)} sub={`of ${d.sites.length} sites, by their latest check`} strong={k.criticalNow > 0} />
      </div>

      <NeuCard>
        <CardHead
          title={metric === 'pressure' ? 'Hydrant pressure per day' : metric === 'filing' ? 'Checks filed per day' : 'Check results per day'}
          sub="Pick a card above to chart it; hover or tap a day for its figure"
        />
        {metric === 'pressure' ? (
          <NeuDayChart data={d.daily} dataKey="pressure" format={(n) => `${n.toFixed(1)} bar`} />
        ) : metric === 'filing' ? (
          <NeuDayChart data={d.daily} dataKey="filing" percent format={(n) => `${Math.round(n)}% filed`} />
        ) : (
          <NeuStackedDays
            data={d.daily}
            series={[
              { key: 'ok', label: 'OK', color: OK_COLOR },
              { key: 'critical', label: 'Critical', color: NEU.bad },
            ]}
          />
        )}
      </NeuCard>

      <SectionHead>Checks, sites and what to act on</SectionHead>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <FailingChecks d={d} />
        <SiteBoard rows={d.sites} />
        <div className="md:col-span-2 xl:col-span-1 grid">
          <Attention items={d.attention} />
        </div>
      </div>

      <SectionHead aside={`${d.sites.length} sites, ${d.entries.length} checks`}>Sites and checks</SectionHead>
      <section className="neu-card px-3 pt-7 pb-5 flex flex-col gap-4">
        <div className="px-4">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { value: 'sites', label: `Sites (${d.sites.length})` },
              { value: 'checks', label: `Checks (${d.entries.length})` },
            ]}
          />
        </div>
        {tab === 'sites' ? <SitesTable rows={d.sites} tag={tag} /> : <ChecksTable rows={d.entries} tag={tag} />}
      </section>
    </>
  );
};

/** Which parts of the fire system fail most often. */
const FailingChecks: React.FC<{ d: Dashboard }> = ({ d }) => {
  const asked = d.checks.filter((c) => c.asked > 0);
  return (
    <NeuCard>
      <CardHead title="Checks that fail most" sub="Share of checks failed" />
      {!asked.length ? (
        <Empty>No checks in this period.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {asked.map((c) => (
            <NeuBarRow
              key={c.key}
              label={c.label}
              tag={<span className="text-[11px] font-semibold uppercase" style={{ color: NEU.muted }}>{c.group}</span>}
              value={`${c.failRate}%`}
              valueColor={c.failed ? NEU.bad : NEU.good}
              pct={c.failed ? Math.max(c.failRate, 3) : 0}
              color={NEU.bad}
              note={`${c.failed} of ${c.asked}`}
            />
          ))}
        </div>
      )}
    </NeuCard>
  );
};

/** Where every site stands at its latest check. */
const SiteBoard: React.FC<{ rows: FireSiteRow[] }> = ({ rows }) => {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  const failing = rows.filter((r) => r.latest?.status === 'CRITICAL').length;
  const healthy = rows.filter((r) => r.latest?.status === 'OK').length;
  const unchecked = rows.length - failing - healthy;
  return (
    <NeuCard>
      <CardHead title="Where each site stands" sub="By its latest check" />
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { n: healthy, label: 'Healthy', color: NEU.good },
          { n: failing, label: 'Failing', color: NEU.bad },
          { n: unchecked, label: 'Not checked', color: NEU.muted },
        ].map((b) => (
          <div key={b.label} className="neu-inset flex flex-col gap-1 px-3.5 py-3 rounded-2xl">
            <span className="text-xs" style={{ color: NEU.muted }}>
              {b.label}
            </span>
            <span className="text-xl font-semibold" style={{ color: b.color }}>
              {b.n}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 flex-1">
        {shown.map((r) => (
          <div key={r.code} className="neu-row flex items-center gap-3 px-2 py-2 rounded-xl">
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-semibold" style={{ color: NEU.ink }}>
                {r.name}
              </span>
              <span className="block truncate text-xs" style={{ color: NEU.muted }}>
                {r.latest ? (r.latest.failed.length ? r.latest.failed.join(', ') : 'All checks OK') : 'No check in this period'}
              </span>
            </span>
            {r.latest ? (
              <span className="flex flex-col items-end gap-1">
                <NeuChip tone={r.latest.status === 'CRITICAL' ? 'bad' : 'ok'}>{r.latest.status === 'CRITICAL' ? 'Critical' : 'OK'}</NeuChip>
                <span className="text-[11px]" style={{ color: NEU.muted }}>
                  {formatShortDay(r.latest.date)}
                </span>
              </span>
            ) : (
              <NeuChip tone="muted">Not checked</NeuChip>
            )}
          </div>
        ))}
      </div>
      {rows.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 self-start border-0 bg-transparent text-sm font-semibold underline underline-offset-2 cursor-pointer" style={{ color: NEU.accentInk }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </NeuCard>
  );
};

const Attention: React.FC<{ items: Dashboard['attention'] }> = ({ items }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <NeuCard>
      <CardHead title="Needs attention" sub={items.length ? `${items.length} to act on, worst first` : 'Every site checked and healthy'} />
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
                icon={it.tone === 'bad' ? <ShieldAlert className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
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

const statusChip = (s: 'OK' | 'CRITICAL') => <NeuChip tone={s === 'CRITICAL' ? 'bad' : 'ok'}>{s === 'CRITICAL' ? 'Critical' : 'OK'}</NeuChip>;
const bar = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `${n} bar`);

const SitesTable: React.FC<{ rows: FireSiteRow[]; tag: string }> = ({ rows, tag }) => {
  const cols: NeuCol<FireSiteRow>[] = [
    { key: 'name', label: 'Site', width: 'minmax(0,1.3fr)', sort: (r) => r.name, cell: (r) => <span className="block truncate font-semibold">{r.name}</span>, csv: (r) => r.name },
    { key: 'city', label: 'City', width: '110px', sort: (r) => r.city, cell: (r) => <span className="block truncate" style={{ color: NEU.muted }}>{r.city || '-'}</span>, csv: (r) => r.city },
    { key: 'filed', label: 'Days checked', width: '190px', sort: (r) => (r.expected ? r.filed / r.expected : 0), cell: (r) => <NeuFiled filed={r.filed} expected={r.expected} what="Checks filed" />, csv: (r) => `${r.filed} of ${r.expected}` },
    { key: 'critical', label: 'Critical', width: '80px', align: 'right', sort: (r) => r.critical, cell: (r) => <span className="font-semibold" style={{ color: r.critical ? NEU.bad : NEU.ink }}>{r.critical}</span>, csv: (r) => r.critical },
    {
      key: 'status',
      label: 'Latest check',
      width: '180px',
      sort: (r) => (r.latest ? (r.latest.status === 'CRITICAL' ? 0 : 2) : 1),
      cell: (r) =>
        r.latest ? (
          <span className="flex items-center gap-2">
            {statusChip(r.latest.status)}
            <span className="text-[13px]" style={{ color: NEU.muted }}>
              {formatDate(r.latest.date)}
            </span>
          </span>
        ) : (
          <NeuChip tone="muted">Not checked</NeuChip>
        ),
      csv: (r) => (r.latest ? `${r.latest.status} ${r.latest.date}` : 'Not checked'),
    },
    {
      key: 'failed',
      label: 'Failing now',
      width: 'minmax(0,1.5fr)',
      sort: (r) => r.latest?.failed.length ?? 0,
      cell: (r) => (
        <span className="block truncate" style={{ color: r.latest?.failed.length ? NEU.bad : NEU.muted }} title={r.latest?.failed.join(', ')}>
          {r.latest?.failed.join(', ') || '-'}
        </span>
      ),
      csv: (r) => r.latest?.failed.join('; ') ?? '',
    },
    { key: 'pressure', label: 'Pressure', width: '90px', align: 'right', sort: (r) => r.latest?.pressure ?? -1, cell: (r) => bar(r.latest?.pressure), csv: (r) => r.latest?.pressure ?? '' },
    { key: 'by', label: 'Checked by', width: 'minmax(0,1fr)', sort: (r) => r.latest?.by ?? '', cell: (r) => <span className="block truncate">{r.latest?.by || '-'}</span>, csv: (r) => r.latest?.by ?? '' },
  ];
  return (
    <NeuTable
      rows={rows}
      cols={cols}
      rowKey={(r) => r.code}
      searchText={(r) => `${r.name} ${r.code} ${r.city}`}
      fileName={`fire-pump-sites-${tag}`}
      initialSort={{ key: 'status', dir: 1 }}
      empty="No sites match."
    />
  );
};

type CheckRow = FirePumpLog & { siteName: string; failed: string[] };

const ChecksTable: React.FC<{ rows: CheckRow[]; tag: string }> = ({ rows, tag }) => {
  const cols: NeuCol<CheckRow>[] = [
    { key: 'date', label: 'Date', width: '120px', sort: (r) => r.date, cell: (r) => formatDate(r.date), csv: (r) => r.date },
    { key: 'site', label: 'Site', width: 'minmax(0,1.3fr)', sort: (r) => r.siteName, cell: (r) => <span className="block truncate font-semibold">{r.siteName}</span>, csv: (r) => r.siteName },
    { key: 'by', label: 'Checked by', width: 'minmax(0,1fr)', sort: (r) => r.submittedByName ?? '', cell: (r) => <span className="block truncate">{r.submittedByName || r.submittedBy || '-'}</span>, csv: (r) => r.submittedByName ?? '' },
    { key: 'status', label: 'Result', width: '100px', sort: (r) => r.overallStatus, cell: (r) => statusChip(r.overallStatus === 'CRITICAL' ? 'CRITICAL' : 'OK'), csv: (r) => r.overallStatus },
    {
      key: 'failed',
      label: 'Failed checks',
      width: 'minmax(0,1.8fr)',
      sort: (r) => r.failed.length,
      cell: (r) => (
        <span className="block truncate" style={{ color: r.failed.length ? NEU.bad : NEU.muted }} title={r.failed.join(', ')}>
          {r.failed.join(', ') || 'None'}
        </span>
      ),
      csv: (r) => r.failed.join('; '),
    },
    { key: 'pressure', label: 'Pressure', width: '90px', align: 'right', sort: (r) => Number(r.hydrantPressureBar ?? -1), cell: (r) => bar(r.hydrantPressureBar), csv: (r) => r.hydrantPressureBar ?? '' },
  ];
  return (
    <NeuTable
      rows={rows}
      cols={cols}
      rowKey={(r) => r.id}
      searchText={(r) => `${r.siteName} ${r.submittedByName ?? ''} ${r.failed.join(' ')}`}
      fileName={`fire-pump-checks-${tag}`}
      initialSort={{ key: 'date', dir: -1 }}
      empty="No checks match."
    />
  );
};
