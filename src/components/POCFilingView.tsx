import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Droplets,
  Flame,
  Fuel,
  Loader2,
  MapPin,
  Shield,
  Snowflake,
  Sparkles,
  Truck,
  Users,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { canSeeSite, capabilitiesFor } from '../lib/permissions';
import {
  allFilings,
  appWarehouseIdFor,
  computeSiteStatuses,
  controlRoomServices,
  controlRoomSites,
  siteMatches,
  lastDays,
  siteProgressByDay,
  filedThisPeriod,
  type ControlRoomRecords,
  type ControlRoomSite,
  type Filing,
  type SiteServiceStatus,
} from '../lib/controlRoom/siteServiceStatus';
import { AlreadyFiled, filedByLine } from './common/AlreadyFiled';
import { serviceCodeFor, sheetIdFor } from '../lib/services/serviceCodes';
import type { FieldDefinition, Shift } from '../types';
import type { EvidenceValue } from './common/EvidenceInput';
import { ServiceFieldList, collectEntry } from './forms/ServiceFieldList';

/**
 * POC Filing Desk.
 *
 * A POC sees only the site(s) they hold, and only the services Master Data
 * enables for that site (Service_Registry × Services_Enabled × their own
 * service grants). Each service says whether it is done for its period and
 * opens its form. A small dashboard shows today, the last seven days, and
 * the site's recent filings — nothing else.
 */

interface POCFilingViewProps {
  onNavigateToDatabase?: (sheetId?: string) => void;
  onNavigateToCreateForm?: () => void;
  onNavigateToForm?: (viewName: string) => void;
  onBack?: () => void;
}

/** Services with their own full forms. Everything else files through the quick form below. */
const DEDICATED_VIEW: Record<string, string> = {
  SITE_ACTIVITY: 'dailyForm',
  HOUSEKEEPING: 'housekeeping',
  EB_DG: 'ebDg',
  DIESEL: 'diesel',
  WASHING: 'washing',
  ADHOC: 'washing',
};

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
};

/** Used only when a service has no columns defined in Master Data yet. */
const DEFAULT_FIELDS: FieldDefinition[] = [
  { key: 'reading', label: 'Reading / value', type: 'text', required: true },
  { key: 'condition', label: 'Condition', type: 'select', required: true, options: ['OK', 'Minor issue', 'Needs attention'] },
  { key: 'remarks', label: 'Remarks', type: 'textarea', required: false },
];

const currentShift = (): Shift => {
  const h = new Date().getHours();
  return h >= 6 && h < 14 ? 'MORNING' : h >= 14 && h < 22 ? 'EVENING' : 'NIGHT';
};

const periodWord = (s: SiteServiceStatus) =>
  s.cadence === 'WEEKLY' ? 'this week' : s.cadence === 'MONTHLY' ? 'this month' : 'today';

const dayLetter = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);

const when = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return iso.length === 10
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const POCFilingView: React.FC<POCFilingViewProps> = ({ onNavigateToForm }) => {
  const {
    currentDate,
    currentUser,
    warehouses,
    siteMasterRows,
    serviceRegistryRows,
    operationalSheets,
    selectedWarehouseId,
    setSelectedWarehouseId,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords,
    addSheetRecord,
    notify,
  } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);

  // Sites this person may file for — their own, never anyone else's. Matched
  // by every name the site goes by, so a POC whose account says
  // WH_AP_VIZAG_B2C finds the Site_Master site ZHPL-AP-01.
  const mySites = useMemo(
    () =>
      controlRoomSites(siteMasterRows, warehouses).filter(
        (s) => caps.canViewAllSites || s.aliases.some((a) => canSeeSite(caps, a)),
      ),
    [siteMasterRows, warehouses, caps],
  );

  const [pickedSite, setPickedSite] = useState<string>('');
  const site: ControlRoomSite | undefined = useMemo(() => {
    const byId = (id: string) => mySites.find((s) => siteMatches(s, id));
    return (
      byId(pickedSite) ??
      (caps.siteScope !== 'ALL' ? byId(caps.siteScope[0]) : undefined) ??
      (selectedWarehouseId !== 'ALL' ? byId(selectedWarehouseId) : undefined) ??
      mySites[0]
    );
  }, [mySites, pickedSite, caps.siteScope, selectedWarehouseId]);

  // Services from Master Data, narrowed to what this person holds.
  const services = useMemo(() => {
    const all = controlRoomServices(serviceRegistryRows, operationalSheets);
    const held = currentUser.serviceCodes;
    return held && held !== 'ALL' ? all.filter((s) => held.includes(s.code)) : all;
  }, [serviceRegistryRows, operationalSheets, currentUser.serviceCodes]);

  const records: ControlRoomRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords],
  );

  const status = useMemo(
    () => (site ? computeSiteStatuses([site], services, records, currentDate)[0] : undefined),
    [site, services, records, currentDate],
  );

  /**
   * Who already filed each service this period. Three or four POCs share a
   * site, so "Filed today" is not enough: the next one needs the name, or
   * they file a second one to be safe.
   */
  const filedBy = useMemo(() => {
    const map = new Map<string, Filing>();
    if (!site) return map;
    for (const svc of services) {
      const hit = filedThisPeriod(svc, site, records, currentDate);
      if (hit) map.set(svc.code, hit);
    }
    return map;
  }, [services, site, records, currentDate]);

  const week = useMemo(
    () => (site ? siteProgressByDay(site, services, records, lastDays(currentDate, 7)) : []),
    [site, services, records, currentDate],
  );

  const serviceName = useMemo(() => new Map(services.map((s) => [s.code, s.name])), [services]);

  // Built from allFilings, not from a second walk over the same records.
  // The hand-rolled copy this replaces hardcoded `by: ''` for EB-DG, so
  // those rows showed a bare date while allFilings had the name all along.
  const recent = useMemo(() => {
    if (!site) return [];
    return allFilings(records)
      .filter((f) => siteMatches(site, f.site) && f.at)
      .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((f) => ({ service: serviceName.get(f.code) ?? f.code, at: f.at, by: f.by }));
  }, [site, records, serviceName]);

  // ---------------------------------------------------------------- quick form
  const [filing, setFiling] = useState<SiteServiceStatus | null>(null);
  /** The filing already covering the service this dialog is open on. */
  const openFiling = filing ? (filedBy.get(filing.code) ?? null) : null;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceValue | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justFiled, setJustFiled] = useState(false);

  const formFields = useMemo(() => {
    if (!filing) return [];
    const defined = operationalSheets.find((s) => s.id === sheetIdFor(filing.code))?.fieldsConfig;
    return defined?.length ? defined : DEFAULT_FIELDS;
  }, [filing, operationalSheets]);

  const open = (s: SiteServiceStatus) => {
    if (!site) return;
    const view = DEDICATED_VIEW[s.code];
    if (view && onNavigateToForm) {
      // The dedicated forms look the site up in the app's warehouse list.
      setSelectedWarehouseId(appWarehouseIdFor(site, warehouses));
      onNavigateToForm(view);
      return;
    }
    setFiling(s);
    setValues({});
    setEvidence({});
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filing || !site) return;
    const { data, errors: next } = collectEntry(formFields, values, evidence);
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const res = await addSheetRecord(sheetIdFor(filing.code), {
      warehouseId: site.id,
      date: currentDate,
      shift: currentShift(),
      ...data,
    });
    setSaving(false);
    if (!res.ok) return; // the reason is already on screen; the form stays filled
    notify('success', `${filing.name} filed`, `Saved for ${site.name}.`);
    // Filing is the whole job on this screen, so the button says it landed
    // before the sheet closes itself.
    setJustFiled(true);
    window.setTimeout(() => {
      setJustFiled(false);
      setFiling(null);
    }, 700);
  };

  // ---------------------------------------------------------------- render
  if (!site) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white border border-slate-200 rounded-(--r-card) p-10 text-center">
        <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="mt-2 text-sm font-semibold text-slate-800">No site is assigned to you</p>
        <p className="mt-1 text-xs text-slate-500">Ask a Super Admin to add your site in Master Data → POC Master.</p>
      </div>
    );
  }

  const due = status?.due ?? 0;
  const done = status?.done ?? 0;
  const pct = due ? Math.round((done / due) * 100) : 100;
  const pending = status?.services.filter((s) => s.state === 'pending') ?? [];
  const firstName = currentUser.fullName.split(' ')[0];
  const dateLabel = new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const ring = 2 * Math.PI * 34;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Greeting + site */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{dateLabel}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Hello, {firstName}</h1>
        </div>
        {mySites.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5" />
            {caps.canViewAllSites && !pickedSite && selectedWarehouseId === 'ALL' && (
              <span className="text-(--color-due) font-semibold">Choose a site</span>
            )}
            <select
              value={site.id}
              onChange={(e) => {
                setPickedSite(e.target.value);
                const chosen = mySites.find((s) => s.id === e.target.value);
                if (chosen) setSelectedWarehouseId(appWarehouseIdFor(chosen, warehouses));
              }}
              className="h-9 pl-2.5 pr-8 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            >
              {mySites.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {s.id}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5" /> {site.id}
          </span>
        )}
      </header>

      {/* Site dashboard */}
      <section className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-3">
        <div className="bg-(--color-ink) text-white rounded-(--r-card) p-5 flex items-center gap-5">
          <svg viewBox="0 0 80 80" className="w-24 h-24 shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="var(--color-filed)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring * (1 - pct / 100)}
            />
          </svg>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">{site.name}</div>
            <div className="mt-1 text-3xl font-bold font-mono">
              {done}<span className="text-white/40 text-xl"> / {due}</span>
            </div>
            <div className="text-sm text-white/70">
              {due === 0 ? 'Nothing due today' : pending.length === 0 ? 'All done for today' : `${pending.length} still to file`}
            </div>
            <div className="mt-1 text-[11px] text-white/40">
              {[site.city, site.zone, site.channel].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-(--r-card) p-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Last 7 days</div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const full = d.due > 0 && d.done === d.due;
              const some = d.done > 0 && !full;
              const isToday = d.day === currentDate;
              return (
                <div key={d.day} className="flex flex-col items-center gap-1.5" title={`${d.day}: ${d.done} of ${d.due} done`}>
                  <div
                    className={`w-full aspect-square max-w-9 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono ${
                      full ? 'bg-(--color-filed) text-white' : some ? 'bg-(--color-due-tint) text-(--color-due)' : 'bg-slate-100 text-slate-400'
                    } ${isToday ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                  >
                    {d.due ? d.done : '–'}
                  </div>
                  <span className={`text-[10px] ${isToday ? 'font-bold text-slate-900' : 'text-slate-400'}`}>{dayLetter(d.day)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-(--color-filed)" /> all done</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-(--color-due-tint)" /> partly</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-100" /> none</span>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Your services</h2>
          <span className="text-xs text-slate-500">{status?.services.length ?? 0} from Master Data</span>
        </div>

        {status && status.services.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-(--r-card) p-8 text-center text-sm text-slate-500">
            No services are enabled for this site in Master Data.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[...(status?.services ?? [])]
              .sort((a, b) => Number(a.state === 'done') - Number(b.state === 'done'))
              .map((s) => {
                const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
                const isDone = s.state === 'done';
                const onRequest = s.state === 'on-request';
                return (
                  <li key={s.code}>
                    <button
                      type="button"
                      onClick={() => open(s)}
                      className="group w-full flex items-center gap-3 bg-white border border-slate-200 rounded-(--r-card) p-3.5 text-left hover:border-slate-300 hover:shadow-sm transition cursor-pointer"
                    >
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isDone ? 'bg-(--color-filed-tint) text-(--color-filed)' : onRequest ? 'bg-slate-100 text-slate-600' : 'bg-(--color-due-tint) text-(--color-due)'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-900 truncate">{s.name}</span>
                        <span className="block text-[11px] text-slate-500">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 text-(--color-filed) font-medium truncate">
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              {/* The name, not just "done": the next POC
                                  needs to know who to ask. */}
                              {filedBy.get(s.code) ? filedByLine(filedBy.get(s.code)!) : `Filed ${periodWord(s)}`}
                            </span>
                          ) : onRequest ? (
                            s.count > 0 ? `${s.count} filed today · file when needed` : 'File when needed'
                          ) : (
                            <span className="inline-flex items-center gap-1 text-(--color-due) font-medium">
                              <Clock3 className="w-3 h-3" /> Due {periodWord(s)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold transition ${
                          isDone ? 'text-slate-500 group-hover:text-slate-900' : 'bg-(--color-ink) text-white'
                        }`}
                      >
                        {/* "Add" quietly filed a second one. Opening it is
                            what someone looking at a filed service wants. */}
                        {isDone ? 'Open' : 'File'} <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Recent filings */}
      <section className="bg-white border border-slate-200 rounded-(--r-card) p-4">
        <h2 className="text-sm font-semibold text-slate-900">Recent filings at {site.name}</h2>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Nothing filed yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-(--color-filed) shrink-0" />
                  <span className="truncate text-slate-800">{r.service}</span>
                </span>
                <span className="shrink-0 text-slate-400">
                  {r.by && `${r.by} · `}
                  {when(r.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick form for services without their own screen */}
      {filing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={submit}
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{filing.name}</h3>
                <p className="text-xs text-slate-500">{site.name} · {dateLabel}</p>
              </div>
              <button type="button" onClick={() => setFiling(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Silence here is what let two POCs file the same day twice.
                  The database refuses the second one now, so say so before
                  the form is filled in rather than after. */}
              {openFiling && (
                <AlreadyFiled
                  filing={openFiling}
                  amendNote="Only one entry is kept for this period. Ask them to correct it, or file this next period."
                />
              )}

              <ServiceFieldList
                fields={formFields}
                values={values}
                onValue={(key, v) => setValues((prev) => ({ ...prev, [key]: v }))}
                evidence={evidence}
                onEvidence={(key, ev) => setEvidence((prev) => ({ ...prev, [key]: ev }))}
                errors={errors}
                serviceCode={filing.code}
                siteCode={site.id}
                idPrefix="poc"
              />
            </div>

            <div className="p-5 pt-0">
              <button
                type="submit"
                disabled={saving || justFiled || Boolean(openFiling)}
                className="press inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Filing
                  </>
                ) : justFiled ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Filed
                  </>
                ) : openFiling ? (
                  'Already filed'
                ) : (
                  `File ${filing.name}`
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
