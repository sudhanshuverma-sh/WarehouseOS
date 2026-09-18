import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Database,
  Droplets,
  Flame,
  Fuel,
  Loader2,
  Pencil,
  Plus,
  Search,
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
  computeSiteStatuses,
  controlRoomServices,
  controlRoomSites,
  summarise,
  type ControlRoomRecords,
  type ControlRoomService,
} from '../lib/controlRoom/siteServiceStatus';
import { sheetIdFor } from '../lib/services/serviceCodes';
import { CADENCE_OPTIONS, OWN_SCREEN_SERVICES, cadenceLabel } from '../lib/services/formBuilder';
import type { FieldDefinition } from '../types';
import type { EvidenceValue } from './common/EvidenceInput';
import { PageHeader } from './common/PageHeader';
import { Reveal } from './common/Reveal';
import { ServiceFieldList, collectEntry } from './forms/ServiceFieldList';

/**
 * Operational Sheets: every form POCs fill, from Master Data.
 *
 * One card per active Service_Registry service, with how many questions it
 * has, how many sites filed it for the current period, and when the last
 * entry came in. Admins who may change forms build new ones or edit the
 * questions of existing ones; services with their own screens open those.
 */

interface OperationalSheetsHubProps {
  onSelectSheet: (sheetId: string) => void;
  onOpenCreateForm?: () => void;
  onEditForm?: (sheetId: string) => void;
  onOpenDatabase?: (sheetId?: string) => void;
  onBack?: () => void;
}

type CadenceFilter = 'ALL' | ControlRoomService['cadence'];

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

const PERIOD_DONE: Record<ControlRoomService['cadence'], string> = {
  DAILY: 'Done today',
  WEEKLY: 'Done this week',
  MONTHLY: 'Done this month',
  EVENT_DRIVEN: 'Filed today',
};

const when = (at: string) => {
  const d = new Date(at.length === 10 ? `${at}T00:00:00` : at);
  if (Number.isNaN(d.getTime())) return at;
  return at.length === 10
    ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const OperationalSheetsHub: React.FC<OperationalSheetsHubProps> = ({ onSelectSheet, onOpenCreateForm, onEditForm, onOpenDatabase, onBack }) => {
  const {
    currentUser,
    currentDate,
    warehouses,
    siteMasterRows,
    serviceRegistryRows,
    operationalSheets,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords,
    activeSheetId,
    setActiveSheetId,
  } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const [query, setQuery] = useState('');
  const [cadence, setCadence] = useState<CadenceFilter>('ALL');
  const [filling, setFilling] = useState<ControlRoomService | null>(null);

  const fromMasterData = serviceRegistryRows.length > 0;
  const services = useMemo(() => controlRoomServices(serviceRegistryRows, operationalSheets), [serviceRegistryRows, operationalSheets]);
  const switchedOff = serviceRegistryRows.filter((r) => r.Active !== 'Yes');
  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);

  const records: ControlRoomRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords],
  );
  const progress = useMemo(
    () => new Map(summarise(computeSiteStatuses(sites, services, records, currentDate), services).services.map((s) => [s.code, s])),
    [sites, services, records, currentDate],
  );
  const lastEntry = useMemo(() => {
    const latest = new Map<string, string>();
    for (const f of allFilings(records)) if ((latest.get(f.code) ?? '') < f.at) latest.set(f.code, f.at);
    return latest;
  }, [records]);

  const fieldsOf = (code: string): FieldDefinition[] => operationalSheets.find((s) => s.id === sheetIdFor(code))?.fieldsConfig ?? [];
  const canBuild = caps.canEditSchema;

  const q = query.trim().toLowerCase();
  const visible = services.filter((s) => (cadence === 'ALL' || s.cadence === cadence) && (!q || `${s.name} ${s.code}`.toLowerCase().includes(q)));

  const fill = (s: ControlRoomService) => {
    setActiveSheetId(sheetIdFor(s.code));
    if (OWN_SCREEN_SERVICES.has(s.code)) onSelectSheet(sheetIdFor(s.code));
    else setFilling(s);
  };

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <PageHeader
        title="Operational Sheets"
        subtitle={`${services.length} forms POCs fill, from Master Data.${canBuild ? ' Build a new one or change the questions of an existing one.' : ''}`}
        onBack={onBack}
        backLabel="Back"
        showFacilityBadge={false}
        actions={
          <>
            {onOpenDatabase && (
              <button
                type="button"
                onClick={() => onOpenDatabase()}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" /> All records
              </button>
            )}
            {canBuild && onOpenCreateForm && (
              <button
                type="button"
                onClick={onOpenCreateForm}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) active:scale-[0.98] transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New form
              </button>
            )}
          </>
        }
      />

      {!fromMasterData && (
        <div className="mb-4 flex items-start gap-2 rounded-(--r-card) border border-(--color-due) bg-(--color-due-tint) px-4 py-3 text-xs text-(--color-ink)">
          <AlertCircle className="w-4 h-4 text-(--color-due) shrink-0" />
          Master Data is not loaded, so the built-in forms are shown. Import Master Data to list your own services.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms"
            aria-label="Search forms"
            className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-slate-400"
          />
        </div>
        <div className="inline-flex flex-wrap p-1 bg-white border border-slate-200 rounded-xl" role="tablist" aria-label="How often">
          {([{ value: 'ALL', label: 'All' }, ...CADENCE_OPTIONS] as { value: CadenceFilter; label: string }[]).map((c) => (
            <button
              key={c.value}
              type="button"
              role="tab"
              aria-selected={cadence === c.value}
              onClick={() => setCadence(c.value)}
              className={`h-7 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                cadence === c.value ? 'bg-(--color-ink) text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs font-mono text-slate-500">{visible.length} forms</span>
      </div>

      <div key={`${cadence}-${q}`} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {visible.map((s, i) => {
          const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
          const ownScreen = OWN_SCREEN_SERVICES.has(s.code);
          const questions = fieldsOf(s.code).length;
          const p = progress.get(s.code) ?? { done: 0, total: 0 };
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          const last = lastEntry.get(s.code);
          const noQuestions = !ownScreen && questions === 0;
          const selected = activeSheetId === sheetIdFor(s.code);
          return (
            <Reveal
              key={s.code}
              as="article"
              index={i}
              className={`flex flex-col bg-white border rounded-(--r-card) p-5 shadow-xs hover:shadow-md transition ${
                selected ? 'border-slate-400' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="px-2 py-0.5 rounded-full border border-slate-200 text-[10px] font-semibold text-slate-600">{cadenceLabel(s.cadence)}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{s.name}</h3>
              <p className="text-[11px] font-mono text-slate-500">{s.code}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-slate-500">Questions</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {ownScreen ? 'Own screen' : noQuestions ? <span className="text-(--color-due)">None yet</span> : <span className="font-mono">{questions}</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{PERIOD_DONE[s.cadence]}</dt>
                  <dd className="mt-0.5 font-semibold font-mono text-slate-900">
                    {p.done}
                    <span className="text-slate-400"> / {p.total} sites</span>
                  </dd>
                </div>
              </dl>
              {s.cadence !== 'EVENT_DRIVEN' && (
                <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-(--color-filed)" style={{ width: `${pct}%` }} />
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">{last ? `Last entry ${when(last)}` : 'No entries yet'}</p>

              <div className="mt-auto pt-4">
                <div className="flex items-center gap-1 pt-3 border-t border-slate-100">
                  {onOpenDatabase && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSheetId(sheetIdFor(s.code));
                        onOpenDatabase(sheetIdFor(s.code));
                      }}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5" /> Records
                    </button>
                  )}
                  {canBuild && onEditForm && !ownScreen && (
                    <button
                      type="button"
                      onClick={() => onEditForm(sheetIdFor(s.code))}
                      className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        noQuestions ? 'text-(--color-ink) bg-(--color-due-tint) hover:brightness-95' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" /> {noQuestions ? 'Add questions' : 'Edit form'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fill(s)}
                    disabled={noQuestions}
                    title={noQuestions ? 'Add questions to this form first' : undefined}
                    className="group ml-auto inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-40 disabled:cursor-default active:scale-[0.98] transition cursor-pointer"
                  >
                    {ownScreen ? 'Open' : 'Fill'}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </div>
            </Reveal>
          );
        })}

        {canBuild && onOpenCreateForm && !q && cadence === 'ALL' && (
          <button
            type="button"
            onClick={onOpenCreateForm}
            className="group flex flex-col items-center justify-center text-center min-h-60 rounded-(--r-card) border-2 border-dashed border-slate-300 hover:border-slate-500 bg-transparent hover:bg-white p-6 transition cursor-pointer"
          >
            <span className="w-11 h-11 rounded-xl bg-white group-hover:bg-(--color-ink) text-slate-500 group-hover:text-white flex items-center justify-center shadow-xs transition">
              <Plus className="w-5 h-5" />
            </span>
            <span className="mt-3 text-sm font-semibold text-slate-900">New form</span>
            <span className="mt-1 max-w-56 text-xs text-slate-500">Choose the questions, preview what POCs see, and publish it to their desk.</span>
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">No forms match. Clear the search or pick another filter.</p>
      )}

      {caps.isSuperAdmin && switchedOff.length > 0 && (
        <p className="mt-6 text-xs text-slate-500">
          Switched off in Master Data: {switchedOff.map((r) => r.Service_Name || r.Service_Code).join(', ')}.
        </p>
      )}

      {filling && <FillDialog service={filling} fields={fieldsOf(filling.code)} onClose={() => setFilling(null)} />}
    </div>
  );
};

/** An admin filing a form for one of the sites they can see. */
const FillDialog: React.FC<{ service: ControlRoomService; fields: FieldDefinition[]; onClose: () => void }> = ({ service, fields, onClose }) => {
  const { currentUser, currentDate, warehouses, siteMasterRows, addSheetRecord, notify } = useApp();
  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const sites = useMemo(
    () =>
      controlRoomSites(siteMasterRows, warehouses).filter(
        (s) =>
          (caps.canViewAllSites || s.aliases.some((a) => canSeeSite(caps, a))) &&
          (s.services === 'ALL' || s.services.includes(service.code)),
      ),
    [siteMasterRows, warehouses, caps, service.code],
  );
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceValue | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justFiled, setJustFiled] = useState(false);
  const site = sites.find((s) => s.id === siteId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;
    const { data, errors: problems } = collectEntry(fields, values, evidence);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    const res = await addSheetRecord(sheetIdFor(service.code), { warehouseId: site.id, date: currentDate, ...data });
    setSaving(false);
    if (!res.ok) return;
    notify('success', `${service.name} filed`, `Saved for ${site.name}.`);
    setJustFiled(true);
    window.setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Fill ${service.name}`}>
      <form onSubmit={submit} className="animate-pop-in w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{service.name}</h3>
            <p className="text-xs text-slate-500">{new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sites.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">None of your sites run this service.</p>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label htmlFor="fill-site" className="text-xs font-semibold text-slate-700">Site</label>
                <select
                  id="fill-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-slate-400"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>
              <ServiceFieldList
                key={siteId}
                fields={fields}
                values={values}
                onValue={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
                evidence={evidence}
                onEvidence={(k, v) => setEvidence((p) => ({ ...p, [k]: v }))}
                errors={errors}
                serviceCode={service.code}
                siteCode={site?.id}
                idPrefix="fill"
              />
            </div>
            <div className="p-5 pt-0">
              <button
                type="submit"
                disabled={saving || justFiled || !site}
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
                ) : (
                  `File ${service.name}`
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};
