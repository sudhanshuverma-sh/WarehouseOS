import React, { useMemo, useState } from 'react';
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
  computeSiteStatuses,
  controlRoomServices,
  controlRoomSites,
  filingsFor,
  inChannel,
  periodFor,
  siteMatches,
  summarise,
  type ChannelTab,
  type ControlRoomRecords,
  type ControlRoomService,
} from '../lib/controlRoom/siteServiceStatus';
import type { ExportSpec } from '../lib/export/exporter';
import { PageHeader } from './common/PageHeader';
import { ExportPanel } from './common/ExportPanel';
import { DieselDashboard } from './diesel/DieselDashboard';

/**
 * Admin Service Hub.
 *
 * Overview: one card per active Service_Registry service — done at how many
 * sites for its period, and how many are still pending. A Service Admin sees
 * only their own services. Opening a card shows that service across sites:
 * Diesel opens the Diesel dashboard; every other service lists each site as
 * done or pending, with who filed and when.
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

const PERIOD_WORD: Record<ControlRoomService['cadence'], string> = {
  DAILY: 'today',
  WEEKLY: 'this week',
  MONTHLY: 'this month',
  EVENT_DRIVEN: 'today',
};

const when = (at: string) => {
  const d = new Date(at.length === 10 ? `${at}T00:00:00` : at);
  if (Number.isNaN(d.getTime())) return at;
  return at.length === 10
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const ChannelTabs: React.FC<{ value: ChannelTab; counts: Record<ChannelTab, number>; onChange: (t: ChannelTab) => void }> = ({ value, counts, onChange }) => (
  <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl shadow-xs" role="tablist" aria-label="Channel">
    {(['ALL', 'B2B', 'B2C'] as const).map((t) => (
      <button
        key={t}
        type="button"
        role="tab"
        aria-selected={value === t}
        onClick={() => onChange(t)}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${value === t ? 'bg-(--color-ink) text-white' : 'text-slate-600 hover:text-slate-900'}`}
      >
        {t === 'ALL' ? 'All' : t}
        <span className={`ml-1.5 font-mono ${value === t ? 'text-white/70' : 'text-slate-400'}`}>{counts[t]}</span>
      </button>
    ))}
  </div>
);

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

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const tabSites = useMemo(() => sites.filter((s) => inChannel(s, tab)), [sites, tab]);
  const tabCounts = useMemo(
    () => ({ ALL: sites.length, B2B: sites.filter((s) => inChannel(s, 'B2B')).length, B2C: sites.filter((s) => inChannel(s, 'B2C')).length }),
    [sites],
  );

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

  const statuses = useMemo(() => computeSiteStatuses(tabSites, services, records, currentDate), [tabSites, services, records, currentDate]);
  const summary = useMemo(() => summarise(statuses, services), [statuses, services]);

  const dieselToday = useMemo(() => {
    const inView = dieselLogs.filter((l) => tabSites.some((s) => siteMatches(s, l.warehouseId)));
    return {
      today: statuses.reduce((n, s) => n + (s.services.find((x) => x.code === 'DIESEL')?.count ?? 0), 0),
      awaiting: inView.filter((l) => l.status === 'Pending Admin Approval').length,
    };
  }, [dieselLogs, tabSites, statuses]);

  const dateLabel = new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const openService = services.find((s) => s.code === openCode) ?? null;

  // ------------------------------------------------------------------ service view
  if (openService) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 pb-16">
        <button
          type="button"
          onClick={() => setOpenCode(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All services
        </button>
        {openService.code === 'DIESEL' ? (
          <DieselDashboard onOpenLedger={onNavigateTab ? () => onNavigateTab('diesel') : undefined} />
        ) : (
          <ServiceSitesView
            service={openService}
            sites={sites}
            records={records}
            today={currentDate}
            dateLabel={dateLabel}
            pocRows={pocMasterRows}
            caps={caps}
          />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ overview
  const overall = summary.services.filter((s) => s.cadence !== 'EVENT_DRIVEN');
  const dueTotal = overall.reduce((n, s) => n + s.total, 0);
  const doneTotal = overall.reduce((n, s) => n + s.done, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-16">
      <PageHeader title="Admin Service Hub" subtitle={`${dateLabel} · ${services.length} services from Master Data`} onBack={onBack} backLabel="Back" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChannelTabs value={tab} counts={tabCounts} onChange={setTab} />
        <div className="text-xs text-slate-500">
          <strong className="text-slate-900 font-mono">{doneTotal}</strong> of <span className="font-mono">{dueTotal}</span> filings done across{' '}
          <strong className="text-slate-900 font-mono">{tabSites.length}</strong> sites
        </div>
      </div>

      {services.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center text-sm text-slate-500">
          No services found. Add services in Master Data → Service Registry.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {summary.services.map((s) => {
            const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
            const onRequest = s.cadence === 'EVENT_DRIVEN';
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            const pending = s.total - s.done;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => setOpenCode(s.code)}
                className="group text-left bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500">{CADENCE_LABEL[s.cadence]}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.name}</h3>

                {s.code === 'DIESEL' ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-2xl font-bold font-mono text-slate-900">{dieselToday.today}</div>
                      <div className="text-[11px] text-slate-500">requests today</div>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold font-mono ${dieselToday.awaiting ? 'text-(--color-due)' : 'text-slate-900'}`}>{dieselToday.awaiting}</div>
                      <div className="text-[11px] text-slate-500">awaiting approval</div>
                    </div>
                  </div>
                ) : onRequest ? (
                  <div className="mt-3">
                    <div className="text-2xl font-bold font-mono text-slate-900">{s.done}</div>
                    <div className="text-[11px] text-slate-500">sites filed today · filed when needed</div>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-bold font-mono text-slate-900">{s.done}</span>
                        <span className="text-sm text-slate-400 font-mono"> / {s.total}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">sites done {PERIOD_WORD[s.cadence]}</span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-slate-600">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-(--color-filed)" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {s.code === 'DIESEL' || onRequest ? (
                    <span className="text-slate-500">Requests, approvals and delivery</span>
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
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// One service across sites
// ---------------------------------------------------------------------------

interface SiteRow {
  code: string;
  name: string;
  zone: string;
  channel: string;
  poc: string;
  state: 'done' | 'pending' | 'on-request';
  count: number;
  by: string;
  at: string;
}

const ServiceSitesView: React.FC<{
  service: ControlRoomService;
  sites: ReturnType<typeof controlRoomSites>;
  records: ControlRoomRecords;
  today: string;
  dateLabel: string;
  pocRows: { Site_Code: string; POC_Name: string; Service_Codes: string; Role: string; Active: string }[];
  caps: ReturnType<typeof capabilitiesFor>;
}> = ({ service, sites, records, today, dateLabel, pocRows, caps }) => {
  const [tab, setTab] = useState<ChannelTab>('ALL');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [state, setState] = useState<'' | 'done' | 'pending'>('');

  const offered = useMemo(() => sites.filter((s) => s.services === 'ALL' || s.services.includes(service.code)), [sites, service.code]);
  const inTab = useMemo(() => offered.filter((s) => inChannel(s, tab)), [offered, tab]);
  const counts = useMemo(
    () => ({ ALL: offered.length, B2B: offered.filter((s) => inChannel(s, 'B2B')).length, B2C: offered.filter((s) => inChannel(s, 'B2C')).length }),
    [offered],
  );
  const filings = useMemo(() => filingsFor(service.code, records), [service.code, records]);
  const [from, to] = periodFor(service.cadence, today);

  const rows: SiteRow[] = useMemo(() => {
    const statuses = computeSiteStatuses(inTab, [service], records, today);
    return statuses.map(({ site, services }) => {
      const st = services[0];
      const last = filings.find((f) => siteMatches(site, f.site) && f.day >= from && f.day <= to);
      const pocs = pocRows
        .filter(
          (p) =>
            p.Active === 'Yes' &&
            p.Role === 'SITE_POC' &&
            siteMatches(site, p.Site_Code) &&
            (p.Service_Codes === 'ALL' || p.Service_Codes.split(/[,\s]+/).includes(service.code)),
        )
        .map((p) => p.POC_Name);
      return {
        code: site.id,
        name: site.name,
        zone: site.zone,
        channel: site.channel,
        poc: pocs.join(', '),
        state: st?.state ?? 'pending',
        count: st?.count ?? 0,
        by: last?.by ?? '',
        at: last?.at ?? '',
      };
    });
  }, [inTab, service, records, today, filings, from, to, pocRows]);

  const zones = useMemo(() => [...new Set(offered.map((s) => s.zone).filter(Boolean))].sort(), [offered]);
  const onRequest = service.cadence === 'EVENT_DRIVEN';
  const done = rows.filter((r) => (onRequest ? r.count > 0 : r.state === 'done')).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (zone && r.zone !== zone) return false;
        const isDone = onRequest ? r.count > 0 : r.state === 'done';
        if (state === 'done' && !isDone) return false;
        if (state === 'pending' && isDone) return false;
        if (q && !`${r.name} ${r.code} ${r.poc}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Number(a.state === 'done' || a.count > 0) - Number(b.state === 'done' || b.count > 0) || a.name.localeCompare(b.name));
  }, [rows, query, zone, state, onRequest]);

  const recent = useMemo(
    () => filings.filter((f) => inTab.some((s) => siteMatches(s, f.site))).slice(0, 8),
    [filings, inTab],
  );
  const siteName = (id: string) => inTab.find((s) => siteMatches(s, id))?.name ?? id;

  const exportSpec: ExportSpec<SiteRow> = {
    label: `${service.name} status`,
    serviceCode: service.code,
    dateOf: () => today,
    siteOf: (r) => r.code,
    columns: [
      { header: 'Site Code', value: (r) => r.code },
      { header: 'Site', value: (r) => r.name },
      { header: 'Zone', value: (r) => r.zone },
      { header: 'Channel', value: (r) => r.channel },
      { header: 'POC', value: (r) => r.poc },
      { header: 'Status', value: (r) => (onRequest ? `${r.count} today` : r.state === 'done' ? 'Done' : 'Pending') },
      { header: 'Filed By', value: (r) => r.by },
      { header: 'Filed At', value: (r) => r.at },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{service.name}</h1>
          <p className="text-xs text-slate-500">
            {CADENCE_LABEL[service.cadence]} · {dateLabel}
          </p>
        </div>
        <ChannelTabs value={tab} counts={counts} onChange={setTab} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{onRequest ? 'Filed today' : `Done ${PERIOD_WORD[service.cadence]}`}</div>
          <div className="mt-1 text-2xl font-bold font-mono text-(--color-filed)">
            {done}<span className="text-sm text-slate-400"> / {rows.length}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-(--color-filed)" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{onRequest ? 'Not filed today' : 'Pending'}</div>
          <div className={`mt-1 text-2xl font-bold font-mono ${rows.length - done ? 'text-(--color-due)' : 'text-slate-900'}`}>{rows.length - done}</div>
          <div className="text-[11px] text-slate-400">sites</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Completion</div>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900">{pct}%</div>
          <div className="text-[11px] text-slate-400">of {rows.length} sites running this service</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 items-start">
        <section className="bg-white border border-slate-200 rounded-(--r-card) shadow-xs min-w-0">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search site or POC…"
                className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-400"
              />
            </div>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg" aria-label="Zone">
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <select value={state} onChange={(e) => setState(e.target.value as '' | 'done' | 'pending')} className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg" aria-label="Status">
              <option value="">All statuses</option>
              <option value="pending">{onRequest ? 'Not filed' : 'Pending'}</option>
              <option value="done">{onRequest ? 'Filed' : 'Done'}</option>
            </select>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono">{visible.length} sites</span>
              <ExportPanel rows={visible} spec={exportSpec} caps={caps} totalCount={rows.length} />
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50">
                  <th className="px-4 py-2 font-semibold">Site</th>
                  <th className="px-4 py-2 font-semibold">POC</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Filed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No sites match these filters.</td>
                  </tr>
                ) : (
                  visible.map((r) => {
                    const isDone = onRequest ? r.count > 0 : r.state === 'done';
                    return (
                      <tr key={r.code} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {r.code}
                            {r.zone && ` · ${r.zone}`} · {r.channel}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 max-w-[12rem] truncate" title={r.poc}>{r.poc || '—'}</td>
                        <td className="px-4 py-2.5">
                          {onRequest ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">{r.count ? `${r.count} today` : 'None today'}</span>
                          ) : isDone ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-filed-tint) text-(--color-filed)">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-due-tint) text-(--color-due)">
                              <Clock3 className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {r.at ? (
                            <>
                              {r.by && <span className="text-slate-800">{r.by}</span>}
                              <span className="block text-[11px] text-slate-400">{when(r.at)}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-900">Recent entries</h2>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No entries yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {recent.map((f, i) => (
                <li key={i} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{siteName(f.site)}</span>
                    <span className="shrink-0 text-slate-400">{when(f.at)}</span>
                  </div>
                  {f.by && <div className="text-[11px] text-slate-500">{f.by}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
