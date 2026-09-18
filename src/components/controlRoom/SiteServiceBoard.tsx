import React, { useMemo, useState } from 'react';
import { Building2, CheckCircle2, CircleDashed, Clock3, Search, X } from 'lucide-react';
import {
  inChannel,
  sortByAttention,
  summarise,
  type ChannelTab,
  type ControlRoomService,
  type SiteState,
  type SiteStatus,
  type SiteServiceStatus,
} from '../../lib/controlRoom/siteServiceStatus';
import { Reveal } from '../common/Reveal';

/**
 * The Control Room board: every site, and inside each site every service
 * with done / not done. What needs attention sorts to the top.
 */

interface Props {
  statuses: SiteStatus[];
  services: ControlRoomService[];
  dateLabel: string;
  usingMasterData: boolean;
  onOpenSite: (siteId: string) => void;
}

const STATE_META: Record<SiteState, { label: string; accent: string; chip: string }> = {
  complete: { label: 'Complete', accent: 'bg-(--color-filed)', chip: 'bg-(--color-filed-tint) text-(--color-filed)' },
  partial: { label: 'In progress', accent: 'bg-(--color-due)', chip: 'bg-(--color-due-tint) text-(--color-due)' },
  'not-started': { label: 'Not started', accent: 'bg-(--color-missing)', chip: 'bg-(--color-missing-tint) text-(--color-missing)' },
};

const ServiceChip: React.FC<{ s: SiteServiceStatus }> = ({ s }) => {
  if (s.state === 'on-request') {
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
        {s.count > 0 ? `${s.count} today` : 'None today'}
      </span>
    );
  }
  return s.state === 'done' ? (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-filed-tint) text-(--color-filed)">
      <CheckCircle2 className="w-3 h-3" /> Done
    </span>
  ) : (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-due-tint) text-(--color-due)">
      <Clock3 className="w-3 h-3" /> Pending
    </span>
  );
};

const cadenceHint = (c: ControlRoomService['cadence']) =>
  c === 'WEEKLY' ? 'this week' : c === 'MONTHLY' ? 'this month' : c === 'EVENT_DRIVEN' ? 'on request' : 'today';

const SiteCard: React.FC<{ status: SiteStatus; highlight?: string; onOpen: () => void }> = ({ status, highlight, onOpen }) => {
  const { site, services, due, done, state } = status;
  const meta = STATE_META[state];
  const pct = due ? Math.round((done / due) * 100) : 100;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="press group relative w-full h-full text-left bg-white border border-slate-200 rounded-(--r-card) p-4 pl-5 shadow-xs hover:shadow-md hover:border-slate-300 transition overflow-hidden flex flex-col cursor-pointer"
    >
      <span className={`absolute left-0 inset-y-0 w-1 ${meta.accent}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate" title={site.name}>{site.name}</div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            {site.id}
            {site.city && ` · ${site.city}`}
            {site.zone && ` · ${site.zone}`}
          </div>
        </div>
        <span className="shrink-0 px-1.5 py-0.5 rounded-md border border-slate-200 text-[10px] font-bold text-slate-500">
          {site.channel}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className={`px-2 py-0.5 rounded-full font-semibold ${meta.chip}`}>{meta.label}</span>
          <span className="font-mono text-slate-600">
            <strong className="text-slate-900">{done}</strong> of {due} done
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${meta.accent}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
        {services.map((s) => (
          <li
            key={s.code}
            className={`flex items-center justify-between gap-2 text-xs rounded-md ${highlight === s.code ? 'bg-slate-50 -mx-1.5 px-1.5 py-0.5' : ''}`}
          >
            <span className="truncate text-slate-700" title={`${s.name} — due ${cadenceHint(s.cadence)}`}>{s.name}</span>
            <ServiceChip s={s} />
          </li>
        ))}
        {services.length === 0 && <li className="text-xs text-slate-400">No services enabled for this site.</li>}
      </ul>
    </button>
  );
};

export const SiteServiceBoard: React.FC<Props> = ({ statuses, services, dateLabel, usingMasterData, onOpenSite }) => {
  const [tab, setTab] = useState<ChannelTab>('ALL');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [stateFilter, setStateFilter] = useState<'' | SiteState>('');
  const [serviceFilter, setServiceFilter] = useState('');

  const tabCounts = useMemo(
    () => ({
      ALL: statuses.length,
      B2B: statuses.filter((s) => inChannel(s.site, 'B2B')).length,
      B2C: statuses.filter((s) => inChannel(s.site, 'B2C')).length,
    }),
    [statuses],
  );

  const inTab = useMemo(() => statuses.filter((s) => inChannel(s.site, tab)), [statuses, tab]);
  const summary = useMemo(() => summarise(inTab, services), [inTab, services]);
  const zones = useMemo(() => [...new Set(statuses.map((s) => s.site.zone).filter(Boolean))].sort(), [statuses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortByAttention(
      inTab.filter((s) => {
        if (zone && s.site.zone !== zone) return false;
        if (stateFilter && s.state !== stateFilter) return false;
        if (serviceFilter) {
          const svc = s.services.find((x) => x.code === serviceFilter);
          if (!svc || svc.state !== 'pending') return false;
        }
        if (q && !`${s.site.name} ${s.site.id} ${s.site.whCode} ${s.site.city}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    );
  }, [inTab, zone, stateFilter, serviceFilter, query]);

  const filtersOn = Boolean(query || zone || stateFilter || serviceFilter);

  const tiles: { label: string; value: number; tone: string; icon: React.ElementType; filter: '' | SiteState }[] = [
    { label: 'Sites', value: summary.sites, tone: 'text-slate-900', icon: Building2, filter: '' },
    { label: 'Complete', value: summary.complete, tone: 'text-(--color-filed)', icon: CheckCircle2, filter: 'complete' },
    { label: 'In progress', value: summary.partial, tone: 'text-(--color-due)', icon: Clock3, filter: 'partial' },
    { label: 'Not started', value: summary.notStarted, tone: 'text-(--color-missing)', icon: CircleDashed, filter: 'not-started' },
  ];

  if (statuses.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center">
        <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="mt-2 text-sm font-semibold text-slate-700">No sites loaded</p>
        <p className="text-xs text-slate-500 mt-1">Import Master Data (Site_Master) to track every site here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Channel tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl shadow-xs" role="tablist" aria-label="Channel">
          {(['ALL', 'B2B', 'B2C'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === t ? 'bg-(--color-ink) text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'ALL' ? 'All' : t}
              <span className={`ml-1.5 font-mono ${tab === t ? 'text-white/70' : 'text-slate-400'}`}>{tabCounts[t]}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {dateLabel} · {usingMasterData ? 'Sites and services from Master Data' : 'Showing app warehouses — import Master Data for the full network'}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          const active = t.filter !== '' && stateFilter === t.filter;
          return (
            <Reveal key={t.label} index={i} className="min-w-0">
            <button
              type="button"
              onClick={() => setStateFilter(t.filter === '' || active ? '' : t.filter)}
              className={`press w-full h-full text-left bg-white border rounded-(--r-card) p-4 shadow-xs transition cursor-pointer ${
                active ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t.label}
                <Icon className={`w-4 h-4 ${t.tone}`} />
              </div>
              <div className={`mt-1 text-2xl font-bold font-mono ${t.tone}`}>{t.value}</div>
              {t.filter !== '' && (
                <div className="text-[11px] text-slate-400 font-mono">
                  {summary.sites ? Math.round((t.value / summary.sites) * 100) : 0}% of sites
                </div>
              )}
            </button>
            </Reveal>
          );
        })}
      </div>

      {/* Service progress */}
      <div className="bg-white border border-slate-200 rounded-(--r-card) p-3 shadow-xs">
        <div className="flex items-center justify-between px-1 pb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Services</h3>
          <span className="text-[11px] text-slate-400">Tap a service to see sites where it is pending</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {summary.services.map((s) => {
            const onRequest = s.cadence === 'EVENT_DRIVEN';
            const active = serviceFilter === s.code;
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            return (
              <button
                key={s.code}
                type="button"
                disabled={onRequest}
                onClick={() => setServiceFilter(active ? '' : s.code)}
                title={onRequest ? `${s.name} is filed on request — ${s.done} of ${s.total} sites filed today` : `${s.name}: done at ${s.done} of ${s.total} sites (${cadenceHint(s.cadence)})`}
                className={`shrink-0 w-44 text-left rounded-xl border px-3 py-2 transition ${
                  active ? 'border-slate-900 ring-1 ring-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                } ${onRequest ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className="text-xs font-semibold text-slate-800 truncate">{s.name}</div>
                <div className="mt-0.5 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>
                    {onRequest ? 'filed today' : 'done'} <strong className="text-slate-900">{s.done}</strong>/{s.total}
                  </span>
                  <span>{onRequest ? '' : `${pct}%`}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${onRequest ? 'bg-slate-300' : 'bg-(--color-filed)'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search site name, code or city…"
            className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
          />
        </div>
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
          aria-label="Zone"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as '' | SiteState)}
          className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="not-started">Not started</option>
          <option value="partial">In progress</option>
          <option value="complete">Complete</option>
        </select>
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setZone('');
              setStateFilter('');
              setServiceFilter('');
            }}
            className="h-9 px-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500 font-mono">
          {visible.length} of {inTab.length} sites
        </span>
      </div>

      {/* Sites */}
      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center text-sm text-slate-500">
          No sites match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {visible.map((s, i) => (
            <Reveal key={s.site.id} index={i} className="min-w-0">
              <SiteCard status={s} highlight={serviceFilter} onOpen={() => onOpenSite(s.site.id)} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
};
