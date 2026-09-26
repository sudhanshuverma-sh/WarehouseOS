import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ArrowRight, CalendarDays, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { controlRoomSites } from '../../lib/controlRoom/siteServiceStatus';
import {
  computeEbDgDashboard,
  DEFAULT_EBDG_FILTERS,
  DGS,
  entriesInView,
  formatRange,
  monthsWithData,
  type EbDgDashboard as Dashboard,
  type EbDgFilters,
  type SiteInfo,
} from '../../lib/ebdg/dashboard';
import type { EbDgRow } from '../../types/ebdg';
import type { EbDgRecord } from '../../lib/ebdg/sheetWriter';
import {
  CardHead,
  NEU,
  NeuButton,
  NeuCard,
  NeuDayChart,
  NeuEmpty,
  NeuHeader,
  NeuPage,
  NeuPdfButton,
  NeuPeriodFilterBar,
  NeuPill,
  NeuStackedDays,
  SectionHead,
  Segmented,
} from '../analytics/NeuKit';
import { METRIC, type TrendMetric } from './EbDgCharts';
import { AttentionCard, DG_COLOR, DgTable, EbDgKpis, EnergyCard, SiteRanking, SitesTable, type RankBy } from './EbDgPanels';
import { EbDgSiteDrawer } from './EbDgSiteDrawer';
import { EbDgEntriesTable } from './EbDgEntriesTable';

/**
 * EB-DG dashboard: the Admin Service Hub view for EB-DG ("Site Power"), in
 * the same neumorphic look as Diesel, Daily Site Report and Fire Pump.
 *
 * Every figure comes from the EB-DG entries POCs file in the app
 * (lib/ebdg/dashboard.ts works them out); nothing here is sample data.
 *
 *  1. KPI cards; the chosen one is the figure the chart shows.
 *  2. That figure per day. Clicking a day ranks the sites for that day.
 *  3. Top 5 sites, the energy mix, and what needs acting on.
 *  4. The detail: sites, DGs and every entry with all its columns.
 * Any site, anywhere, opens its own side panel.
 */

const PRESETS = ['last7', 'last30', 'last90', 'currentMonth', 'all'] as const;

export const EbDgDashboard: React.FC<{ onOpenForm?: () => void }> = ({ onOpenForm }) => {
  const { ebdgRows, siteMasterRows, warehouses, currentDate } = useApp();
  const [filters, setFilters] = useState<EbDgFilters>(DEFAULT_EBDG_FILTERS);
  const page = useRef<HTMLDivElement>(null);
  const rows = ebdgRows as unknown as EbDgRow[];

  // Site names, cities and channels from Master Data, by any code a site goes by.
  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const siteInfo = useMemo(() => {
    const map = new Map<string, SiteInfo>();
    for (const s of sites) for (const a of [s.id, ...s.aliases]) map.set(a.toLowerCase(), { name: s.name, city: s.city, channel: s.channel });
    return (code: string) => map.get(String(code).toLowerCase());
  }, [sites]);

  const d = useMemo(() => computeEbDgDashboard(rows, siteInfo, filters, currentDate), [rows, siteInfo, filters, currentDate]);
  const months = useMemo(() => monthsWithData(rows, currentDate), [rows, currentDate]);
  // Every entry in view, exactly as filed: the Records columns, day by day.
  const entries = useMemo(() => entriesInView(ebdgRows, siteInfo, filters, currentDate), [ebdgRows, siteInfo, filters, currentDate]);
  const siteName = useCallback((code: string) => siteInfo(code)?.name ?? code, [siteInfo]);
  const siteOptions = useMemo(() => {
    const codes = [...new Set(rows.map((r) => r.Site_Code).filter(Boolean))];
    return codes
      .map((code) => ({ code, name: siteInfo(code)?.name || code, channel: siteInfo(code)?.channel ?? 'B2B' }))
      .filter((s) => filters.segment === 'ALL' || (filters.segment === 'B2C' ? s.channel === 'B2C' : s.channel !== 'B2C'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, siteInfo, filters.segment]);

  const range = formatRange(d.range);
  const subtitle = `${d.kpi.sites} ${d.kpi.sites === 1 ? 'site' : 'sites'}, ${d.kpi.rows.toLocaleString('en-IN')} daily entries, ${range}`;

  return (
    <NeuPage ref={page}>
      <NeuHeader icon={<Zap className="w-6 h-6" strokeWidth={1.9} />} title="EB-DG Site Power" subtitle={rows.length ? subtitle : 'EB and DG across every site'}>
        {rows.length > 0 && (
          <>
            <NeuPill>
              <CalendarDays className="w-4.5 h-4.5" strokeWidth={1.9} />
              {range}
            </NeuPill>
            <NeuPdfButton target={page} title="EB-DG Site Power" subtitle={subtitle} />
          </>
        )}
        {onOpenForm && (
          <NeuButton primary onClick={onOpenForm}>
            File EB-DG <ArrowRight className="w-4 h-4" />
          </NeuButton>
        )}
      </NeuHeader>

      {rows.length === 0 ? (
        <NeuEmpty title="No EB-DG entries yet" body="The dashboard fills in as sites file their daily EB-DG readings." />
      ) : (
        <>
          <NeuPeriodFilterBar filters={filters} onChange={setFilters} months={months} sites={siteOptions} presets={[...PRESETS]} defaults={DEFAULT_EBDG_FILTERS} />
          {d.kpi.rows === 0 ? (
            <NeuEmpty
              title="No entries in this period"
              body="Presets end yesterday, since sites are still filing today. Pick a wider period or a custom range."
              action={{ label: 'Show all dates', onClick: () => setFilters({ ...DEFAULT_EBDG_FILTERS, preset: 'all' }) }}
            />
          ) : (
            <Body d={d} entries={entries} siteName={siteName} range={range} />
          )}
        </>
      )}
    </NeuPage>
  );
};

type DetailTab = 'sites' | 'dgs' | 'entries';

const Body: React.FC<{ d: Dashboard; entries: EbDgRecord[]; siteName: (code: string) => string; range: string }> = ({ d, entries, siteName, range }) => {
  const [metric, setMetric] = useState<TrendMetric>('hsd');
  const [rankBy, setRankBy] = useState<RankBy>('hsd');
  const [byDg, setByDg] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [siteCode, setSiteCode] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('sites');
  const openSite = useCallback((code: string) => setSiteCode(code), []);
  const closeSite = useCallback(() => setSiteCode(null), []);
  // Picking Diesel or EB in the cards moves the top-sites switch with it.
  const pickMetric = useCallback((next: TrendMetric) => {
    setMetric(next);
    if (next === 'hsd' || next === 'grid') setRankBy(next);
  }, []);

  const dgs = DGS.filter((n) => d.units.some((u) => u.n === n));
  const canStack = (metric === 'hsd' || metric === 'hrs') && dgs.length > 1;
  const site = siteCode ? d.sites.find((s) => s.code === siteCode) : undefined;
  const openDay = day && d.daySites[day] ? day : null;
  const tag = `${d.range.from ?? 'all'}-to-${d.range.to}`;
  const m = METRIC[metric];

  return (
    <>
      <SectionHead aside={`Showing ${range}`}>Key metrics</SectionHead>
      <EbDgKpis d={d} metric={metric} onMetric={pickMetric} />

      <NeuCard>
        <CardHead title={`${m.label} per day`} sub="Pick a card above to chart it; click a day to rank the sites for that day">
          {canStack && (
            <Segmented
              value={byDg ? 'dg' : 'total'}
              onChange={(v) => setByDg(v === 'dg')}
              options={[
                { value: 'total', label: 'Total' },
                { value: 'dg', label: 'By DG' },
              ]}
            />
          )}
        </CardHead>
        {byDg && canStack ? (
          <NeuStackedDays
            data={d.daily}
            series={dgs.map((n) => ({ key: (metric === 'hsd' ? `dg${n}Hsd` : `dg${n}Hrs`) as 'dg1Hsd', label: `DG ${n}`, color: DG_COLOR[n] }))}
            onPickDay={setDay}
            selectedDay={openDay}
          />
        ) : (
          <NeuDayChart
            data={d.daily}
            dataKey={metric}
            color={metric === 'grid' ? NEU.slate : NEU.accent}
            format={m.fmt}
            kind={metric === 'spend' ? 'bar' : 'area'}
            onPickDay={setDay}
            selectedDay={openDay}
          />
        )}
      </NeuCard>

      <SectionHead>Sites, energy and what to act on</SectionHead>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <SiteRanking d={d} rankBy={rankBy} onRankBy={setRankBy} day={openDay} onClearDay={() => setDay(null)} onPick={openSite} />
        <EnergyCard d={d} />
        <div className="md:col-span-2 xl:col-span-1 grid">
          <AttentionCard d={d} onPick={openSite} />
        </div>
      </div>

      <SectionHead aside={`${d.sites.length} sites, ${d.units.length} DGs, ${entries.length} entries`}>Sites, DGs and every entry</SectionHead>
      <section className="neu-card px-3 pt-7 pb-5 flex flex-col gap-4">
        <div className="px-4">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as DetailTab)}
            options={[
              { value: 'sites', label: `Sites (${d.sites.length})` },
              { value: 'dgs', label: `DGs (${d.units.length})` },
              { value: 'entries', label: `Every entry (${entries.length})` },
            ]}
          />
        </div>
        {tab === 'sites' && <SitesTable sites={d.sites} onPick={openSite} fileName={`eb-dg-sites-${tag}`} />}
        {tab === 'dgs' && <DgTable units={d.units} onPick={openSite} fileName={`eb-dg-dgs-${tag}`} />}
        {tab === 'entries' && (
          <div className="px-4">
            <EbDgEntriesTable bare neu rows={entries} layoutKey="ebdg-dashboard:entries" siteName={siteName} fileName={`eb-dg-entries-${tag}.csv`} />
          </div>
        )}
      </section>

      <AnimatePresence>
        {site && (
          <EbDgSiteDrawer
            key={site.code}
            site={site}
            units={d.units.filter((u) => u.code === site.code).sort((a, b) => a.n - b.n)}
            days={d.siteDays[site.code] ?? []}
            entries={entries.filter((r) => r.Site_Code === site.code)}
            onClose={closeSite}
          />
        )}
      </AnimatePresence>
    </>
  );
};
