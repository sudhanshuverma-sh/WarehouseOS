import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  ExternalLink,
  Flame,
  Fuel,
  Inbox,
  Lock,
  Pencil,
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
import { controlRoomServices, controlRoomSites, siteMatches, type ControlRoomSite } from '../lib/controlRoom/siteServiceStatus';
import { serviceCodeFor, sheetIdFor } from '../lib/services/serviceCodes';
import { OWN_SCREEN_SERVICES, cadenceLabel } from '../lib/services/formBuilder';
import { DIESEL_EXPORT } from '../lib/export/dieselExport';
import type { ExportSpec } from '../lib/export/exporter';
import { applyColumnFilters, clearAllFilters, countActiveFilters, type ColumnFilters } from '../lib/table/columnFilters';
import {
  columnsFor,
  compareCells,
  dayOf,
  describeCell,
  isStatusColumn,
  newestFirst,
  siteOf,
  statusTone,
  type RecordColumn,
  type RecordRow,
  type StatusTone,
} from '../lib/records/recordTable';
import type { DieselLog } from '../types';
import { PageHeader } from './common/PageHeader';
import { ExportPanel } from './common/ExportPanel';
import { ColumnFilter } from './common/ColumnFilter';

/**
 * Records: every entry filed in the app, one form at a time.
 *
 * The form list comes from Master Data (Service_Registry), narrowed to the
 * services this person holds; entries are narrowed to the sites they can
 * see. Pick a form, narrow by day, site, text or any column, open an entry
 * to read it in full, and export exactly what the table shows. Diesel keeps
 * its sheet's columns and its approve / reject decision.
 */

interface SheetDataExplorerProps {
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
  onEditForm?: (sheetId: string) => void;
}

type ViewRow = Record<string, unknown> & { __row: RecordRow };

const PAGE = 200;

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

const TONE: Record<StatusTone | 'none', string> = {
  good: 'bg-(--color-filed-tint)',
  wait: 'bg-(--color-due-tint)',
  bad: 'bg-(--color-missing-tint)',
  none: 'bg-slate-100',
};

const CONTROL = 'h-9 px-3 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400';

const Cell: React.FC<{ column: string; value: unknown; full?: boolean }> = ({ column, value, full }) => {
  const cell = describeCell(value);
  if (cell.kind === 'empty') return <span className="text-slate-400">-</span>;
  if (isStatusColumn(column)) {
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold text-(--color-ink) whitespace-nowrap ${TONE[statusTone(value) ?? 'none']}`}>
        {cell.text}
      </span>
    );
  }
  if (cell.kind === 'link') {
    return (
      <a
        href={cell.text}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
      >
        Open link <ExternalLink className="w-3 h-3" />
      </a>
    );
  }
  if (cell.kind === 'number') return <span className="font-mono tabular-nums">{cell.text}</span>;
  if (full) return <span className="break-words whitespace-pre-wrap">{cell.text}</span>;
  return (
    <span className="block max-w-60 truncate" title={cell.text}>
      {cell.text}
    </span>
  );
};

export const SheetDataExplorer: React.FC<SheetDataExplorerProps> = ({ onBack, onNavigateTab, onEditForm }) => {
  const {
    currentUser,
    currentDate,
    warehouses,
    siteMasterRows,
    serviceRegistryRows,
    operationalSheets,
    activeSheetId,
    setActiveSheetId,
    dailySiteLogs,
    dieselLogs,
    ebdgRows,
    sheetRecords,
    approveDieselLog,
    rejectDieselLog,
    notify,
  } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);

  // Forms from Master Data, narrowed to the services this person holds.
  const services = useMemo(() => {
    const all = controlRoomServices(serviceRegistryRows, operationalSheets);
    const held = currentUser.serviceCodes;
    return caps.isSuperAdmin || !held || held === 'ALL' ? all : all.filter((s) => held.includes(s.code));
  }, [serviceRegistryRows, operationalSheets, currentUser.serviceCodes, caps.isSuperAdmin]);

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const siteByCode = useMemo(() => {
    const map = new Map<string, ControlRoomSite>();
    for (const s of sites) for (const a of [s.id, ...s.aliases]) map.set(a.toLowerCase(), s);
    return map;
  }, [sites]);
  const mySites = useMemo(
    () => sites.filter((s) => caps.canViewAllSites || s.aliases.some((a) => canSeeSite(caps, a))),
    [sites, caps],
  );

  // Entries at a site this person may see, by any name the site goes by.
  const canSee = useCallback(
    (id: string) =>
      caps.canViewAllSites || canSeeSite(caps, id) || (siteByCode.get(id.toLowerCase())?.aliases.some((a) => canSeeSite(caps, a)) ?? false),
    [caps, siteByCode],
  );

  const entriesOf = useCallback(
    (code: string): RecordRow[] => {
      const rows: RecordRow[] =
        code === 'SITE_ACTIVITY'
          ? (dailySiteLogs as unknown as RecordRow[])
          : code === 'DIESEL'
            ? (dieselLogs as unknown as RecordRow[])
            : code === 'EB_DG'
              ? (ebdgRows as unknown as RecordRow[])
              : ((sheetRecords[sheetIdFor(code)] ?? []) as RecordRow[]);
      return rows.filter((r) => canSee(siteOf(r)));
    },
    [dailySiteLogs, dieselLogs, ebdgRows, sheetRecords, canSee],
  );

  const counts = useMemo(() => new Map(services.map((s) => [s.code, entriesOf(s.code).length])), [services, entriesOf]);

  const [code, setCode] = useState(() => (activeSheetId ? serviceCodeFor(activeSheetId) : ''));
  const service = services.find((s) => s.code === code) ?? services[0];
  const selectForm = (next: string) => {
    setCode(next);
    setActiveSheetId(sheetIdFor(next));
  };

  const [railQuery, setRailQuery] = useState('');
  const [period, setPeriod] = useState<'ALL' | 'DAY'>('ALL');
  const [day, setDay] = useState(currentDate);
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [limit, setLimit] = useState(PAGE);
  const [openRow, setOpenRow] = useState<ViewRow | null>(null);

  // A filter on a column the next form does not have would empty the table for no visible reason.
  useEffect(() => {
    setColumnFilters({});
    setSort(null);
    setLimit(PAGE);
    setOpenRow(null);
  }, [service?.code]);

  useEffect(() => {
    if (!openRow) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenRow(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openRow]);

  const isDiesel = service?.code === 'DIESEL';
  const fields = useMemo(
    () => (service ? operationalSheets.find((s) => s.id === sheetIdFor(service.code))?.fieldsConfig ?? [] : []),
    [service, operationalSheets],
  );
  const raw = useMemo(() => (service ? entriesOf(service.code) : []), [service, entriesOf]);

  const columns: RecordColumn[] = useMemo(() => {
    // Diesel shows its Google Sheet's own headers and values.
    if (isDiesel) {
      return DIESEL_EXPORT.columns.map((c) => ({ key: c.header, label: c.header, value: (r: RecordRow) => c.value(r as unknown as DieselLog) }));
    }
    return columnsFor(raw, fields).map((c) =>
      c.key === 'site'
        ? {
            ...c,
            value: (r: RecordRow) => {
              const id = siteOf(r);
              return siteByCode.get(id.toLowerCase())?.name ?? id;
            },
          }
        : c,
    );
  }, [isDiesel, raw, fields, siteByCode]);

  const viewRows: ViewRow[] = useMemo(
    () =>
      [...raw].sort(newestFirst).map((r) => {
        const v: ViewRow = { __row: r };
        for (const c of columns) v[c.key] = c.value(r);
        return v;
      }),
    [raw, columns],
  );

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const site = siteFilter === 'ALL' ? null : mySites.find((s) => s.id === siteFilter);
    return viewRows.filter((v) => {
      if (period === 'DAY' && dayOf(v.__row) !== day) return false;
      if (site && !siteMatches(site, siteOf(v.__row))) return false;
      return !q || JSON.stringify(v).toLowerCase().includes(q);
    });
  }, [viewRows, period, day, siteFilter, mySites, query]);

  const filtered = useMemo(() => {
    const list = applyColumnFilters(scoped, columnFilters);
    if (!sort) return list;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const c = compareCells(a[sort.key], b[sort.key]);
      // Blanks stay last whichever way the column is sorted.
      const blank = describeCell(a[sort.key]).kind === 'empty' || describeCell(b[sort.key]).kind === 'empty';
      return blank ? c : c * dir;
    });
  }, [scoped, columnFilters, sort]);

  const activeColumnFilters = countActiveFilters(columnFilters);
  const narrowed = period === 'DAY' || siteFilter !== 'ALL' || query.trim() !== '' || activeColumnFilters > 0;

  const clearAll = () => {
    setPeriod('ALL');
    setSiteFilter('ALL');
    setQuery('');
    setColumnFilters(clearAllFilters());
  };

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const exportSpec: ExportSpec<ViewRow> = useMemo(
    () => ({
      label: service?.name ?? 'records',
      serviceCode: service?.code ?? 'RECORDS',
      dateOf: (v) => dayOf(v.__row),
      siteOf: (v) => siteOf(v.__row),
      columns: isDiesel
        ? DIESEL_EXPORT.columns.map((c) => ({ ...c, value: (v: ViewRow) => c.value(v.__row as unknown as DieselLog) }))
        : columns.map((c) => ({
            header: c.label,
            value: (v: ViewRow) => {
              const x = v[c.key];
              if (x === undefined || x === null) return '';
              if (typeof x === 'number' || typeof x === 'string') return x;
              return typeof x === 'boolean' ? (x ? 'Yes' : 'No') : JSON.stringify(x);
            },
          })),
    }),
    [service, isDiesel, columns],
  );

  const decide = async (row: RecordRow, approve: boolean) => {
    const id = String(row.id);
    const label = String(row.uniqueId ?? id);
    if (approve) {
      const res = await approveDieselLog(id);
      notify(res.success ? 'success' : 'error', res.success ? `Request ${label} approved` : res.message);
      if (res.success) setOpenRow(null);
      return;
    }
    const reason = window.prompt('Why is this request rejected?');
    if (!reason?.trim()) return;
    const res = await rejectDieselLog(id, reason.trim());
    notify(res.success ? 'warning' : 'error', res.success ? `Request ${label} rejected` : res.message);
    if (res.success) setOpenRow(null);
  };

  const railServices = services.filter((s) => !railQuery.trim() || s.name.toLowerCase().includes(railQuery.trim().toLowerCase()));
  const shown = filtered.slice(0, limit);
  const canEdit = Boolean(service && caps.canEditSchema && onEditForm && !OWN_SCREEN_SERVICES.has(service.code));

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <PageHeader
        title="Records"
        subtitle="Every entry filed in the app, one form at a time."
        onBack={onBack}
        backLabel="Back"
        showFacilityBadge={false}
      />

      {services.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center">
          <Inbox className="w-7 h-7 mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-800">No forms to show</p>
          <p className="mt-1 text-xs text-slate-500">Forms appear here once they are in Master Data and assigned to you.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-4 items-start">
          {/* Forms */}
          <aside className="lg:sticky lg:top-4">
            <div className="lg:hidden">
              <label htmlFor="records-form" className="block text-xs font-semibold text-slate-700 mb-1.5">Form</label>
              <select id="records-form" value={service?.code} onChange={(e) => selectForm(e.target.value)} className={`${CONTROL} w-full`}>
                {services.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({counts.get(s.code) ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <nav aria-label="Forms" className="hidden lg:block bg-white border border-slate-200 rounded-(--r-card) p-2 shadow-xs">
              <div className="flex items-center justify-between px-2 pt-1 pb-2">
                <h2 className="text-sm font-semibold text-slate-900">Forms</h2>
                <span className="text-xs font-mono text-slate-500">{services.length}</span>
              </div>
              {services.length > 8 && (
                <div className="relative px-1 pb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-2.5 text-slate-400" />
                  <input
                    value={railQuery}
                    onChange={(e) => setRailQuery(e.target.value)}
                    placeholder="Find a form"
                    aria-label="Find a form"
                    className={`${CONTROL} w-full h-8 pl-7 placeholder:text-slate-500`}
                  />
                </div>
              )}
              <ul className="max-h-[70vh] overflow-y-auto space-y-0.5">
                {railServices.map((s) => {
                  const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
                  const selected = s.code === service?.code;
                  return (
                    <li key={s.code}>
                      <button
                        type="button"
                        onClick={() => selectForm(s.code)}
                        aria-current={selected ? 'true' : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition active:scale-[0.99] cursor-pointer ${
                          selected ? 'bg-(--color-ink) text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-white/80' : 'text-slate-500'}`} />
                        <span className="flex-1 min-w-0 truncate font-medium">{s.name}</span>
                        <span className={`font-mono text-[11px] ${selected ? 'text-white/70' : 'text-slate-500'}`}>{counts.get(s.code) ?? 0}</span>
                      </button>
                    </li>
                  );
                })}
                {railServices.length === 0 && <li className="px-2.5 py-3 text-xs text-slate-500">No form matches.</li>}
              </ul>
            </nav>
          </aside>

          {service && (
            <section className="min-w-0 space-y-3">
              {/* Form header */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{service.name}</h2>
                  <p className="text-xs text-slate-500">
                    {cadenceLabel(service.cadence)}, {raw.length} {raw.length === 1 ? 'entry' : 'entries'} you can see
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isDiesel && onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab('diesel')}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Fuel className="w-3.5 h-3.5" /> Diesel ledger
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onEditForm?.(sheetIdFor(service.code))}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit form
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white border border-slate-200 rounded-(--r-card) p-3 shadow-xs flex flex-wrap items-center gap-2">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg" role="group" aria-label="Period">
                  {(
                    [
                      ['ALL', 'All time'],
                      ['DAY', 'One day'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={period === value}
                      onClick={() => setPeriod(value)}
                      className={`h-8 px-3 rounded-md text-xs font-semibold transition cursor-pointer ${
                        period === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {period === 'DAY' && (
                  <input type="date" value={day} max={currentDate} onChange={(e) => setDay(e.target.value)} aria-label="Day" className={CONTROL} />
                )}

                {mySites.length > 1 ? (
                  <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Site" className={`${CONTROL} max-w-56`}>
                    <option value="ALL">All sites ({mySites.length})</option>
                    {mySites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : mySites[0] ? (
                  <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <Lock className="w-3 h-3 text-slate-500" /> {mySites[0].name}
                  </span>
                ) : null}

                <div className="relative flex-1 min-w-44">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search entries"
                    aria-label="Search entries"
                    className={`${CONTROL} w-full pl-8 pr-8 placeholder:text-slate-500`}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {narrowed && (
                  <button type="button" onClick={clearAll} className="h-9 px-2 text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer">
                    Clear filters
                  </button>
                )}
                <ExportPanel rows={filtered} spec={exportSpec} caps={caps} totalCount={viewRows.length} />
              </div>

              {/* Table */}
              <div className="bg-white border border-slate-200 rounded-(--r-card) shadow-xs overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500">
                  <span>
                    <strong className="font-mono text-slate-900">{filtered.length}</strong>
                    {narrowed && <span className="font-mono"> of {viewRows.length}</span>} {filtered.length === 1 ? 'entry' : 'entries'}
                    {activeColumnFilters > 0 && `, ${activeColumnFilters} column ${activeColumnFilters === 1 ? 'filter' : 'filters'}`}
                  </span>
                  <span className="hidden sm:inline">Select a row to see the full entry.</span>
                </div>

                {filtered.length === 0 ? (
                  <div className="px-4 py-14 text-center">
                    <Inbox className="w-7 h-7 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {raw.length === 0 ? `No entries for ${service.name} yet` : 'No entries match these filters'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {raw.length === 0 ? 'Entries appear here as soon as POCs file this form.' : 'Try another day or site, or clear the filters.'}
                    </p>
                    {raw.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="mt-3 h-9 px-4 rounded-lg bg-(--color-ink) text-white text-xs font-semibold active:scale-[0.98] transition cursor-pointer"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[65vh]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr>
                          {columns.map((c) => {
                            const sorted = sort?.key === c.key ? sort.dir : null;
                            const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                            return (
                              <th
                                key={c.key}
                                scope="col"
                                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                                className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleSort(c.key)}
                                    className="group inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                  >
                                    {c.label}
                                    <SortIcon className={`w-3 h-3 ${sorted ? 'text-slate-900' : 'text-slate-300 group-hover:text-slate-500'}`} />
                                  </button>
                                  <ColumnFilter columnKey={c.key} label={c.label} rows={scoped} filters={columnFilters} onChange={setColumnFilters} />
                                </span>
                              </th>
                            );
                          })}
                          {isDiesel && caps.canApprove && (
                            <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">
                              Decision
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody
                        key={`${service.code}-${period}-${day}-${siteFilter}-${activeColumnFilters}`}
                        className="divide-y divide-slate-100 animate-settle"
                      >
                        {shown.map((v, i) => (
                          <tr
                            key={String(v.__row.id ?? v.__row.Record_ID ?? i)}
                            onClick={() => setOpenRow(v)}
                            className={`cursor-pointer transition-colors ${openRow === v ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                          >
                            {columns.map((c) => (
                              <td key={c.key} className="px-3 py-2.5 text-slate-800 whitespace-nowrap">
                                <Cell column={c.key} value={v[c.key]} />
                              </td>
                            ))}
                            {isDiesel && caps.canApprove && (
                              <td className="px-3 py-2 whitespace-nowrap">
                                {v.__row.status === 'Pending Admin Approval' ? (
                                  <span className="inline-flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void decide(v.__row, true);
                                      }}
                                      className="h-7 px-2.5 rounded-md bg-(--color-ink) text-white text-[11px] font-semibold active:scale-[0.97] transition cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void decide(v.__row, false);
                                      }}
                                      className="h-7 px-2.5 rounded-md border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-50 active:scale-[0.97] transition cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {filtered.length > limit && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
                    <span>
                      Showing <span className="font-mono">{shown.length}</span> of <span className="font-mono">{filtered.length}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE)}
                      className="h-8 px-3 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                    >
                      Show {Math.min(PAGE, filtered.length - limit)} more
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Entry details */}
      {openRow && service && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Entry details">
          <button type="button" aria-label="Close" onClick={() => setOpenRow(null)} className="absolute inset-0 bg-slate-950/40 cursor-default" />
          <div className="animate-fade-in-up relative w-full sm:max-w-md h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{service.name}</p>
                <h3 className="text-base font-semibold text-slate-900 truncate">
                  {siteByCode.get(siteOf(openRow.__row).toLowerCase())?.name ?? (siteOf(openRow.__row) || 'Entry')}
                </h3>
                <p className="text-xs text-slate-500">{dayOf(openRow.__row)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenRow(null)}
                aria-label="Close details"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isDiesel && caps.canApprove && openRow.__row.status === 'Pending Admin Approval' && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 bg-(--color-due-tint) border-b border-slate-100">
                <span className="text-xs font-semibold text-(--color-ink)">Waiting for your decision</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(openRow.__row, false)}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(openRow.__row, true)}
                    className="h-8 px-3 rounded-lg bg-(--color-ink) text-white text-xs font-semibold active:scale-[0.98] transition cursor-pointer"
                  >
                    Approve
                  </button>
                </span>
              </div>
            )}

            <dl className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100">
              {columns
                .filter((c) => describeCell(openRow[c.key]).kind !== 'empty')
                .map((c) => (
                  <div key={c.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2.5 text-xs">
                    <dt className="text-slate-500">{c.label}</dt>
                    <dd className="text-slate-900">
                      <Cell column={c.key} value={openRow[c.key]} full />
                    </dd>
                  </div>
                ))}
            </dl>
            {columns.some((c) => describeCell(openRow[c.key]).kind === 'empty') && (
              <p className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500">Empty answers are hidden.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
