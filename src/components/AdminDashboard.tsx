import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Droplets,
  Flame,
  Fuel,
  Inbox,
  Search,
  Shield,
  Snowflake,
  Sparkles,
  Truck,
  Users,
  Wind,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { capabilitiesFor } from '../lib/permissions';
import {
  activityByDay,
  allFilings,
  computeSiteStatuses,
  controlRoomServices,
  controlRoomSites,
  inChannel,
  monthGrid,
  periodFor,
  siteMatches,
  sitePocs,
  summarise,
  type ChannelTab,
  type ControlRoomRecords,
  type ControlRoomService,
  type ControlRoomSite,
  type DayActivity,
  type Filing,
} from '../lib/controlRoom/siteServiceStatus';
import type { PocMaster } from '../types/masterData';
import type { ExportSpec } from '../lib/export/exporter';
import { PageHeader } from './common/PageHeader';
import { ExportPanel } from './common/ExportPanel';
import { Reveal } from './common/Reveal';
import { ColumnsMenu, DragHandle, ExpandButton, TableFullscreen, useColumnLayout, visibleColumns } from './common/TableTools';
import { DieselDashboard } from './diesel/DieselDashboard';
import { EbDgDashboard } from './ebdg/EbDgDashboard';
import { DailyReportDashboard } from './dailyReport/DailyReportDashboard';
import { FirePumpDashboard } from './firePump/FirePumpDashboard';
import { PdfButton } from './common/PdfButton';
import { LogCalendar, longDay, shortDay } from './adminHub/LogCalendar';

/**
 * Admin Service Hub.
 *
 * One chosen day drives the whole screen. The calendar shades each day by how
 * much daily work was filed; picking a day updates the service cards (done at
 * how many sites for that day's period) and the day's log of entries. A
 * Service Admin sees only their own services. Opening a card shows that
 * service across sites for the same day: Diesel opens the Diesel dashboard;
 * every other service lists each site as done or pending, with who filed.
 */

interface AdminDashboardProps {
  onNavigateTab?: (tab: string) => void;
  onBack?: () => void;
}

const SERVICE_ICON: Record<string, React.ElementType> = {
  SITE_ACTIVITY: ClipboardCheck,
  HOUSEKEEPING: Users,
  EB_DG: Zap,
  DIESEL: Fuel,
  WASHING: Droplets,
  ADHOC: Sparkles,
  COLD_ROOM: Snowflake,
  RT: Truck,
  BOPT: Truck,
  UPS: Activity,
  LT_PANEL: Zap,
  FIRE: Flame,
  HVLS: Wind,
  WATER: Droplets,
  SECURITY: Shield,
  ATTENDANCE: Users,
};

const CADENCE_LABEL: Record<ControlRoomService['cadence'], string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  EVENT_DRIVEN: 'On request',
};

const periodPhrase = (cadence: ControlRoomService['cadence'], day: string, today: string) => {
  const current = day === today;
  if (cadence === 'WEEKLY') return current ? 'this week' : 'that week';
  if (cadence === 'MONTHLY') return current ? 'this month' : 'that month';
  return current ? 'today' : `on ${shortDay(day)}`;
};

const timeOf = (at: string) => {
  if (at.length <= 10) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const daysUpTo = (month: string, today: string) =>
  monthGrid(month)
    .flat()
    .filter((d): d is string => d !== null && d <= today);

/** Site lookup by any of its codes, case-insensitive. */
const siteLookup = (sites: ControlRoomSite[]) => {
  const map = new Map<string, ControlRoomSite>();
  for (const s of sites) for (const a of [s.id, ...s.aliases]) map.set(a.toLowerCase(), s);
  return map;
};

const useActivity = (sites: ControlRoomSite[], services: ControlRoomService[], records: ControlRoomRecords, month: string, today: string) =>
  useMemo(
    () => new Map<string, DayActivity>(activityByDay(sites, services, records, daysUpTo(month, today)).map((a) => [a.day, a])),
    [sites, services, records, month, today],
  );

const ChannelTabs: React.FC<{ value: ChannelTab; counts: Record<ChannelTab, number>; onChange: (t: ChannelTab) => void }> = ({ value, counts, onChange }) => (
  <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl shadow-xs" role="tablist" aria-label="Channel">
    {(['ALL', 'B2B', 'B2C'] as const).map((t) => (
      <button
        key={t}
        type="button"
        role="tab"
        aria-selected={value === t}
        onClick={() => onChange(t)}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${value === t ? 'bg-(--color-ink) text-white' : 'text-slate-600 hover:text-slate-900'}`}
      >
        {t === 'ALL' ? 'All' : t}
        <span className={`ml-1.5 font-mono ${value === t ? 'text-white/70' : 'text-slate-400'}`}>{counts[t]}</span>
      </button>
    ))}
  </div>
);

const channelCounts = (sites: ControlRoomSite[]): Record<ChannelTab, number> => ({
  ALL: sites.length,
  B2B: sites.filter((s) => inChannel(s, 'B2B')).length,
  B2C: sites.filter((s) => inChannel(s, 'B2C')).length,
});

type LogEntry = Filing & { siteName: string; serviceName: string };

/** The chosen day's entries, newest first. */
const DayLog: React.FC<{
  title: string;
  entries: LogEntry[];
  services?: ControlRoomService[];
  onOpen?: (code: string) => void;
}> = ({ title, entries, services, onOpen }) => {
  const [only, setOnly] = useState('');
  const shown = only ? entries.filter((e) => e.code === only) : entries;
  const withEntries = services?.filter((s) => entries.some((e) => e.code === s.code)) ?? [];

  return (
    <section className="bg-white border border-slate-200 rounded-(--r-card) shadow-xs">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">
          {title} <span className="ml-1 font-mono text-xs text-slate-400">{shown.length}</span>
        </h2>
        {withEntries.length > 1 && (
          <select
            value={only}
            onChange={(e) => setOnly(e.target.value)}
            aria-label="Show entries for"
            className="h-7 max-w-40 px-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="">All services</option>
            {withEntries.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Inbox className="w-6 h-6 mx-auto text-slate-300" />
          <p className="mt-2 text-xs text-slate-500">Nothing was filed on this day.</p>
        </div>
      ) : (
        <ul className="max-h-104 overflow-y-auto px-2 py-2">
          {shown.map((e, i) => {
            const Icon = SERVICE_ICON[e.code] ?? ClipboardList;
            const body = (
              <>
                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-900 truncate">{e.siteName}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {e.serviceName}
                    {e.by && `, ${e.by}`}
                  </span>
                </span>
                {timeOf(e.at) && <span className="shrink-0 text-[11px] font-mono text-slate-500">{timeOf(e.at)}</span>}
              </>
            );
            return (
              <li key={`${e.code}-${e.site}-${e.at}-${i}`} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(e.code)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-slate-50 active:scale-[0.99] transition cursor-pointer"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateTab, onBack }) => {
  const {
    currentUser,
    currentDate,
    warehouses,
    siteMasterRows,
    serviceRegistryRows,
    operationalSheets,
    pocMasterRows,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords,
  } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const [tab, setTab] = useState<ChannelTab>('ALL');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [day, setDay] = useState(currentDate);
  const [month, setMonth] = useState(currentDate.slice(0, 7));

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const tabSites = useMemo(() => sites.filter((s) => inChannel(s, tab)), [sites, tab]);

  // A Service Admin sees their own services; a Super Admin sees them all.
  const services = useMemo(() => {
    const all = controlRoomServices(serviceRegistryRows, operationalSheets);
    const held = currentUser.serviceCodes;
    return caps.isSuperAdmin || !held || held === 'ALL' ? all : all.filter((s) => held.includes(s.code));
  }, [serviceRegistryRows, operationalSheets, currentUser.serviceCodes, caps.isSuperAdmin]);

  const records: ControlRoomRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords],
  );

  const statuses = useMemo(() => computeSiteStatuses(tabSites, services, records, day), [tabSites, services, records, day]);
  const summary = useMemo(() => summarise(statuses, services), [statuses, services]);
  const activity = useActivity(tabSites, services, records, month, currentDate);
  const dayActivity = useMemo(() => activityByDay(tabSites, services, records, [day])[0], [tabSites, services, records, day]);

  const dayEntries: LogEntry[] = useMemo(() => {
    const lookup = siteLookup(tabSites);
    const names = new Map(services.map((s) => [s.code, s.name]));
    return allFilings(records)
      .filter((f) => f.day === day && names.has(f.code) && lookup.has(f.site.toLowerCase()))
      .map((f) => ({ ...f, siteName: lookup.get(f.site.toLowerCase())!.name, serviceName: names.get(f.code)! }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [records, day, tabSites, services]);

  const awaitingApproval = useMemo(
    () => dieselLogs.filter((l) => l.status === 'Pending Admin Approval' && tabSites.some((s) => siteMatches(s, l.warehouseId))).length,
    [dieselLogs, tabSites],
  );

  const selectDay = (next: string) => {
    setDay(next);
    setMonth(next.slice(0, 7));
  };
  const openService = services.find((s) => s.code === openCode) ?? null;

  // ------------------------------------------------------------------ service view
  if (openService) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 pb-16">
        <button
          type="button"
          onClick={() => setOpenCode(null)}
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" /> All services
        </button>
        {openService.code === 'DIESEL' ? (
          <DieselDashboard onOpenLedger={onNavigateTab ? () => onNavigateTab('diesel') : undefined} />
        ) : openService.code === 'EB_DG' ? (
          <EbDgDashboard onOpenForm={onNavigateTab ? () => onNavigateTab('dgPower') : undefined} />
        ) : openService.code === 'SITE_ACTIVITY' ? (
          <DailyReportDashboard sites={sites} onOpenForm={onNavigateTab ? () => onNavigateTab('dailyForm') : undefined} />
        ) : openService.code === 'FIRE' ? (
          <FirePumpDashboard sites={sites} onOpenForm={onNavigateTab ? () => onNavigateTab('firePump') : undefined} />
        ) : (
          <ServiceSitesView
            service={openService}
            sites={sites}
            records={records}
            today={currentDate}
            day={day}
            onDay={selectDay}
            month={month}
            onMonth={setMonth}
            pocRows={pocMasterRows}
            caps={caps}
          />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ overview
  const isToday = day === currentDate;
  const dayTitle = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const dailyPct = dayActivity && dayActivity.due ? Math.round((dayActivity.done / dayActivity.due) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <PageHeader
        title="Admin Service Hub"
        subtitle={`${services.length} services from Master Data across ${tabSites.length} sites`}
        onBack={onBack}
        backLabel="Back"
        actions={<ChannelTabs value={tab} counts={channelCounts(sites)} onChange={setTab} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-4 items-start">
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-4">
          <LogCalendar month={month} onMonthChange={setMonth} selected={day} onSelect={selectDay} today={currentDate} activity={activity} mode="coverage" />
          <DayLog title={isToday ? "Today's entries" : `Entries on ${shortDay(day)}`} entries={dayEntries} services={services} onOpen={setOpenCode} />
        </aside>

        <div className="space-y-4 min-w-0">
          <section className="bg-(--color-ink) text-white rounded-(--r-card) p-5 shadow-xs">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs text-white/60">{isToday ? 'Today' : 'Looking back at'}</p>
                <h2 className="mt-0.5 text-xl font-semibold">{dayTitle}</h2>
              </div>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => selectDay(currentDate)}
                  className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold active:scale-[0.98] transition cursor-pointer"
                >
                  Back to today
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold font-mono">{dailyPct}%</div>
                <div className="text-[11px] text-white/60">daily work done</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono">
                  {dayActivity?.done ?? 0}
                  <span className="text-sm text-white/50"> / {dayActivity?.due ?? 0}</span>
                </div>
                <div className="text-[11px] text-white/60">daily filings</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono">{dayEntries.length}</div>
                <div className="text-[11px] text-white/60">entries filed</div>
              </div>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-(--color-filed) transition-[width] duration-500" style={{ width: `${dailyPct}%` }} />
            </div>
          </section>

          {services.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center text-sm text-slate-500">
              No services found. Add services in Master Data, Service Registry.
            </div>
          ) : (
            <div key={`${day}-${tab}`} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {summary.services.map((s, i) => {
                const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
                const onRequest = s.cadence === 'EVENT_DRIVEN';
                const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
                const pending = s.total - s.done;
                const requests = statuses.reduce((n, st) => n + (st.services.find((x) => x.code === s.code)?.count ?? 0), 0);
                return (
                  <Reveal key={s.code} index={i} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenCode(s.code)}
                    className="press group w-full h-full text-left bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300 transition cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 transition group-hover:bg-(--color-ink) group-hover:text-white">
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="px-2 py-0.5 rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500">{CADENCE_LABEL[s.cadence]}</span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.name}</h3>

                    {s.code === 'DIESEL' ? (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-2xl font-bold font-mono text-slate-900">{requests}</div>
                          <div className="text-[11px] text-slate-500">requests {periodPhrase('DAILY', day, currentDate)}</div>
                        </div>
                        <div>
                          <div className={`text-2xl font-bold font-mono ${awaitingApproval ? 'text-(--color-due)' : 'text-slate-900'}`}>{awaitingApproval}</div>
                          <div className="text-[11px] text-slate-500">awaiting approval now</div>
                        </div>
                      </div>
                    ) : onRequest ? (
                      <div className="mt-3">
                        <div className="text-2xl font-bold font-mono text-slate-900">{s.done}</div>
                        <div className="text-[11px] text-slate-500">sites filed {periodPhrase('DAILY', day, currentDate)}</div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                          <div>
                            <span className="text-2xl font-bold font-mono text-slate-900">{s.done}</span>
                            <span className="text-sm text-slate-400 font-mono"> / {s.total}</span>
                            <span className="ml-1.5 text-[11px] text-slate-500">sites done {periodPhrase(s.cadence, day, currentDate)}</span>
                          </div>
                          <span className="text-xs font-mono font-semibold text-slate-600">{pct}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-(--color-filed) transition-[width] duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    )}

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      {s.code === 'DIESEL' || onRequest ? (
                        <span className="text-slate-500">Filed when needed</span>
                      ) : pending > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-(--color-due)">
                          <Clock3 className="w-3.5 h-3.5" /> {pending} pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-(--color-filed)">
                          <CheckCircle2 className="w-3.5 h-3.5" /> All sites done
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-500 group-hover:text-slate-900">
                        Open <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </button>
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// One service across sites, for the chosen day
// ---------------------------------------------------------------------------

interface SiteRow {
  code: string;
  name: string;
  zone: string;
  channel: string;
  poc: string;
  done: boolean;
  count: number;
  by: string;
  at: string;
}

const ServiceSitesView: React.FC<{
  service: ControlRoomService;
  sites: ControlRoomSite[];
  records: ControlRoomRecords;
  today: string;
  day: string;
  onDay: (day: string) => void;
  month: string;
  onMonth: (month: string) => void;
  pocRows: PocMaster[];
  caps: ReturnType<typeof capabilitiesFor>;
}> = ({ service, sites, records, today, day, onDay, month, onMonth, pocRows, caps }) => {
  const [tab, setTab] = useState<ChannelTab>('ALL');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [state, setState] = useState<'' | 'done' | 'pending'>('');

  const onRequest = service.cadence === 'EVENT_DRIVEN';
  const offered = useMemo(() => sites.filter((s) => s.services === 'ALL' || s.services.includes(service.code)), [sites, service.code]);
  const inTab = useMemo(() => offered.filter((s) => inChannel(s, tab)), [offered, tab]);
  const only = useMemo(() => [service], [service]);
  const activity = useActivity(inTab, only, records, month, today);
  const [from, to] = periodFor(service.cadence, day);

  const filings: LogEntry[] = useMemo(() => {
    const lookup = siteLookup(inTab);
    return allFilings(records)
      .filter((f) => f.code === service.code && lookup.has(f.site.toLowerCase()))
      .map((f) => ({ ...f, siteName: lookup.get(f.site.toLowerCase())!.name, serviceName: service.name }))
      .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));
  }, [records, service, inTab]);

  const rows: SiteRow[] = useMemo(
    () =>
      computeSiteStatuses(inTab, only, records, day).map(({ site, services }) => {
        const count = services[0]?.count ?? 0;
        const last = filings.find((f) => siteMatches(site, f.site) && f.day >= from && f.day <= to);
        const pocs = sitePocs(site, pocRows, service.code).map((p) => p.POC_Name);
        return {
          code: site.id,
          name: site.name,
          zone: site.zone,
          channel: site.channel,
          poc: pocs.join(', '),
          done: count > 0,
          count,
          by: last?.by ?? '',
          at: last?.at ?? '',
        };
      }),
    [inTab, only, records, day, filings, from, to, pocRows, service.code],
  );

  const zones = useMemo(() => [...new Set(offered.map((s) => s.zone).filter(Boolean))].sort(), [offered]);
  const done = rows.filter((r) => r.done).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const phrase = periodPhrase(onRequest ? 'DAILY' : service.cadence, day, today);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (zone && r.zone !== zone) return false;
        if (state === 'done' && !r.done) return false;
        if (state === 'pending' && r.done) return false;
        return !q || `${r.name} ${r.code} ${r.poc}`.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(a.done) - Number(b.done) || a.name.localeCompare(b.name));
  }, [rows, query, zone, state]);

  const dayEntries = useMemo(() => filings.filter((f) => f.day === day), [filings, day]);
  const doneWord = onRequest ? 'Filed' : 'Done';
  const pendingWord = onRequest ? 'Not filed' : 'Pending';

  const [expanded, setExpanded] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const siteColumns = useMemo(
    () => [
      {
        key: 'site',
        label: 'Site',
        cell: (r: SiteRow) => (
          <>
            <div className="font-semibold text-slate-900">{r.name}</div>
            <div className="text-[11px] text-slate-500 font-mono">
              {r.code}
              {r.zone && `, ${r.zone}`}, {r.channel}
            </div>
          </>
        ),
      },
      {
        key: 'poc',
        label: 'POC',
        cell: (r: SiteRow) => (
          <span className="block max-w-48 truncate text-slate-600" title={r.poc}>
            {r.poc || '-'}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        cell: (r: SiteRow) =>
          r.done ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-(--color-filed-tint) text-(--color-ink)">
              <CheckCircle2 className="w-3 h-3 text-(--color-filed)" /> {doneWord}
              {r.count > 1 && <span className="font-mono text-slate-500">x{r.count}</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-(--color-due-tint) text-(--color-ink)">
              <Clock3 className="w-3 h-3 text-(--color-due)" /> {pendingWord}
            </span>
          ),
      },
      {
        key: 'filedBy',
        label: 'Filed by',
        cell: (r: SiteRow) =>
          r.at ? (
            <span className="block whitespace-nowrap text-slate-600">
              <span className="text-slate-800">{r.by || 'Unknown'}</span>
              <span className="block text-[11px] text-slate-500">
                {shortDay(r.at.slice(0, 10))}
                {timeOf(r.at) && `, ${timeOf(r.at)}`}
              </span>
            </span>
          ) : (
            '-'
          ),
      },
    ],
    [doneWord, pendingWord],
  );
  const { layout, move, toggle, reset, dragProps, customised } = useColumnLayout(
    `servicehub:${service.code}`,
    siteColumns.map((c) => c.key),
  );
  const shownColumns = useMemo(() => visibleColumns(siteColumns, layout), [siteColumns, layout]);

  const exportSpec: ExportSpec<SiteRow> = {
    label: `${service.name} status`,
    serviceCode: service.code,
    dateOf: () => day,
    siteOf: (r) => r.code,
    columns: [
      { header: 'Date', value: () => day },
      { header: 'Site Code', value: (r) => r.code },
      { header: 'Site', value: (r) => r.name },
      { header: 'Zone', value: (r) => r.zone },
      { header: 'Channel', value: (r) => r.channel },
      { header: 'POC', value: (r) => r.poc },
      { header: 'Status', value: (r) => (r.done ? doneWord : pendingWord) },
      { header: 'Entries', value: (r) => String(r.count) },
      { header: 'Filed By', value: (r) => r.by },
      { header: 'Filed At', value: (r) => r.at },
    ],
  };

  return (
    <div ref={page} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{service.name}</h1>
          <p className="text-xs text-slate-500">
            {CADENCE_LABEL[service.cadence]}, showing {longDay(day)}
            {day !== today && (
              <button type="button" onClick={() => onDay(today)} className="ml-2 font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
                Back to today
              </button>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChannelTabs value={tab} counts={channelCounts(offered)} onChange={setTab} />
          <PdfButton target={page} title={service.name} subtitle={`${CADENCE_LABEL[service.cadence]}, ${longDay(day)}`} />
        </div>
      </div>

      <div key={`${day}-${tab}`} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="animate-settle bg-white border border-slate-200 rounded-(--r-card) p-4">
          <div className="text-xs text-slate-500 font-semibold">
            {doneWord} {phrase}
          </div>
          <div className="mt-1 text-2xl font-bold font-mono text-(--color-filed)">
            {done}
            <span className="text-sm text-slate-400"> / {rows.length}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-(--color-filed) transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="animate-settle bg-white border border-slate-200 rounded-(--r-card) p-4" style={{ animationDelay: '30ms' }}>
          <div className="text-xs text-slate-500 font-semibold">{pendingWord}</div>
          <div className={`mt-1 text-2xl font-bold font-mono ${rows.length - done ? 'text-(--color-due)' : 'text-slate-900'}`}>{rows.length - done}</div>
          <div className="text-[11px] text-slate-500">sites</div>
        </div>
        <div className="animate-settle bg-white border border-slate-200 rounded-(--r-card) p-4" style={{ animationDelay: '60ms' }}>
          <div className="text-xs text-slate-500 font-semibold">Entries on {shortDay(day)}</div>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900">{dayEntries.length}</div>
          <div className="text-[11px] text-slate-500">
            {pct}% of {rows.length} sites covered
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-4 items-start">
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-4">
          <LogCalendar
            month={month}
            onMonthChange={onMonth}
            selected={day}
            onSelect={onDay}
            today={today}
            activity={activity}
            mode={service.cadence === 'DAILY' ? 'coverage' : 'entries'}
          />
          <DayLog title={day === today ? "Today's entries" : `Entries on ${shortDay(day)}`} entries={dayEntries} />
        </aside>

        <TableFullscreen expanded={expanded} onCollapse={() => setExpanded(false)}>
        <section className={`bg-white border border-slate-200 rounded-(--r-card) shadow-xs min-w-0 ${expanded ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search site or POC"
                aria-label="Search site or POC"
                className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-500 focus:outline-none focus:bg-white focus:border-slate-400"
              />
            </div>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg" aria-label="Zone">
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg" role="group" aria-label="Status">
              {([['', 'All'], ['pending', pendingWord], ['done', doneWord]] as const).map(([v, label]) => (
                <button
                  key={v || 'all'}
                  type="button"
                  aria-pressed={state === v}
                  onClick={() => setState(v)}
                  className={`h-8 px-3 rounded-md text-xs font-semibold transition cursor-pointer ${state === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono">{visible.length} sites</span>
              <ExportPanel rows={visible} spec={exportSpec} caps={caps} totalCount={rows.length} />
              <ColumnsMenu columns={siteColumns} layout={layout} onMove={move} onToggle={toggle} onReset={reset} customised={customised} />
              <ExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
            </span>
          </div>

          <div className={`overflow-auto ${expanded ? 'flex-1 min-h-0' : ''}`}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-[11px] text-slate-500 bg-slate-50">
                  {shownColumns.map((c) => {
                    const drag = dragProps(c.key);
                    return (
                      <th key={c.key} {...drag} className={`px-4 py-2 font-semibold whitespace-nowrap select-none ${drag.className}`}>
                        <span className="inline-flex items-center gap-1">
                          <DragHandle />
                          {c.label}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody key={`${day}-${tab}-${state}-${zone}`} className="divide-y divide-slate-100 animate-settle">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={shownColumns.length} className="px-4 py-10 text-center text-slate-500">No sites match these filters.</td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.code} className="hover:bg-slate-50 transition-colors">
                      {shownColumns.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 align-top">
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        </TableFullscreen>
      </div>
    </div>
  );
};
