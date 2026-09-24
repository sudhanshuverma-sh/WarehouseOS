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
  Loader2,
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
import { BUILT_IN_FORM_SERVICES, cadenceLabel } from '../lib/services/formBuilder';
import { DIESEL_EXPORT } from '../lib/export/dieselExport';
import { EBDG_SHEET_HEADER, sheetValue, type EbDgRecord } from '../lib/ebdg/sheetWriter';
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
import { RecordCards } from './common/RecordCards';
import { ColumnsMenu, DragHandle, ExpandButton, TableFullscreen, useColumnLayout, visibleColumns } from './common/TableTools';

/**
 * Records: every entry filed in the app, one form at a time.
 *
 * The form list comes from Master Data (Service_Registry), narrowed to the
 * services this person holds; entries are narrowed to the sites they can
 * see. Pick a form, narrow by day, site, text or any column, open an entry
 * to read it in full, and export exactly what the table shows. Diesel and EB-DG
 * keep their Google Sheet's columns; Diesel keeps its approve / reject decision.
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

  const [period, setPeriod] = useState<'ALL' | 'DAY'>('ALL');
  const [day, setDay] = useState(currentDate);
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [limit, setLimit] = useState(PAGE);
  const [openRow, setOpenRow] = useState<ViewRow | null>(null);
  /** The request currently being approved or rejected, so its row can say so. */
  const [deciding, setDeciding] = useState<string | null>(null);

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
  const isEbDg = service?.code === 'EB_DG';
  // Both show their Google Sheet's own columns, first column frozen.
  const sheetShaped = isDiesel || isEbDg;
  const fields = useMemo(
    () => (service ? operationalSheets.find((s) => s.id === sheetIdFor(service.code))?.fieldsConfig ?? [] : []),
    [service, operationalSheets],
  );
  const raw = useMemo(() => (service ? entriesOf(service.code) : []), [service, entriesOf]);

  const allColumns: RecordColumn[] = useMemo(() => {
    // Diesel shows its Google Sheet's own headers and values.
    if (isDiesel) {
      return DIESEL_EXPORT.columns.map((c) => ({ key: c.header, label: c.header, value: (r: RecordRow) => c.value(r as unknown as DieselLog) }));
    }
    // EB-DG too: the EB_DG_B2B / EB_DG_B2C header, the same cells the sheet copy writes.
    if (isEbDg) {
      return EBDG_SHEET_HEADER.map((h) => ({ key: h, label: h, value: (r: RecordRow) => sheetValue(h, r as unknown as EbDgRecord) }));
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
  }, [isDiesel, isEbDg, raw, fields, siteByCode]);

  // Each form remembers its own column order and which columns are hidden.
  const { layout, move, toggle, reset, dragProps, customised } = useColumnLayout(
    `records:${service?.code ?? 'none'}`,
    useMemo(() => allColumns.map((c) => c.key), [allColumns]),
  );
  const columns = useMemo(() => visibleColumns(allColumns, layout), [allColumns, layout]);
  const [expanded, setExpanded] = useState(false);

  const viewRows: ViewRow[] = useMemo(
    () =>
      [...raw].sort(newestFirst).map((r) => {
        const v: ViewRow = { __row: r };
        for (const c of allColumns) v[c.key] = c.value(r);
        return v;
      }),
    [raw, allColumns],
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
        : allColumns.map((c) => ({
            header: c.label,
            value: (v: ViewRow) => {
              const x = v[c.key];
              if (x === undefined || x === null) return '';
              if (typeof x === 'number' || typeof x === 'string') return x;
              return typeof x === 'boolean' ? (x ? 'Yes' : 'No') : JSON.stringify(x);
            },
          })),
    }),
    [service, isDiesel, allColumns],
  );

  const decide = async (row: RecordRow, approve: boolean) => {
    const id = String(row.id);
    const label = String(row.uniqueId ?? id);
    // A decision that goes quiet gets clicked twice, and twice is a second
    // mail to the vendor. The row says it is working until it is done.
    let reason = '';
    if (!approve) {
      reason = window.prompt('Why is this request rejected?')?.trim() ?? '';
      if (!reason) return;
    }
    setDeciding(id);
    try {
      const res = approve ? await approveDieselLog(id) : await rejectDieselLog(id, reason);
      notify(
        res.success ? (approve ? 'success' : 'warning') : 'error',
        res.success ? `Request ${label} ${approve ? 'approved' : 'rejected'}` : res.message,
      );
      if (res.success) setOpenRow(null);
    } finally {
      setDeciding(null);
    }
  };

  const shown = filtered.slice(0, limit);
  const canEdit = Boolean(service && caps.canEditSchema && onEditForm);
  const editsExtras = Boolean(service && BUILT_IN_FORM_SERVICES.has(service.code));
  const hasDecision = isDiesel && caps.canApprove;

  // Date and Site stay in view while the questions scroll sideways (Diesel: its first column).
  const stickyCount = sheetShaped ? 1 : 2;
  const stickyCell = (index: number, head = false) => {
    if (index >= stickyCount) return '';
    const place = index === 0 ? `left-0 ${sheetShaped ? '' : 'w-28 min-w-28 max-w-28'}` : 'left-28';
    const edge = index === stickyCount - 1 ? 'shadow-[inset_-1px_0_0_var(--color-slate-200)]' : '';
    return `sticky ${place} ${edge} ${head ? 'z-20' : 'z-1'}`;
  };

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
        <div className="space-y-4">
          {/* Forms, above the table so the table gets the full width */}
          <nav aria-label="Forms" className="bg-white border border-slate-200 rounded-(--r-card) p-2 shadow-xs">
            <ul className="flex flex-wrap gap-1.5">
              {services.map((s) => {
                const Icon = SERVICE_ICON[s.code] ?? ClipboardList;
                const selected = s.code === service?.code;
                return (
                  <li key={s.code}>
                    <button
                      type="button"
                      onClick={() => selectForm(s.code)}
                      aria-current={selected ? 'true' : undefined}
                      className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium transition active:scale-[0.98] cursor-pointer ${
                        selected ? 'bg-(--color-ink) text-white' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-white/80' : 'text-slate-500'}`} />
                      <span className="whitespace-nowrap">{s.name}</span>
                      <span
                        className={`min-w-5 px-1.5 rounded-md font-mono text-[11px] text-center ${
                          selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {counts.get(s.code) ?? 0}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

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
                      <Pencil className="w-3.5 h-3.5" /> {editsExtras ? 'Add a question' : 'Edit form'}
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
              <TableFullscreen expanded={expanded} onCollapse={() => setExpanded(false)}>
              <div className={`bg-white border border-slate-200 rounded-(--r-card) shadow-xs overflow-hidden ${expanded ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500">
                  <span>
                    <strong className="font-mono text-slate-900">{filtered.length}</strong>
                    {narrowed && <span className="font-mono"> of {viewRows.length}</span>} {filtered.length === 1 ? 'entry' : 'entries'}
                    {activeColumnFilters > 0 && `, ${activeColumnFilters} column ${activeColumnFilters === 1 ? 'filter' : 'filters'}`}
                  </span>
                  <span className="flex items-center gap-2">
                    {filtered.length > 0 && <span className="hidden lg:inline">Select a row to see the full entry.</span>}
                    <ColumnsMenu columns={allColumns} layout={layout} onMove={move} onToggle={toggle} onReset={reset} customised={customised} />
                    <ExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
                  </span>
                </div>

                  {/* On a phone, one card per entry opening the same drawer
                      a row opens. The table here is wider than the diesel
                      ledger, and two frozen columns ate 112px of a 390px
                      screen before any data showed. The max-h below also
                      made a second scroller inside the page scroll, which a
                      thumb cannot tell apart. */}
                  <div className="md:hidden">
                    <RecordCards
                      rows={shown}
                      rowKey={(v, i) => String(v.__row.id ?? i)}
                      onOpen={(v) => setOpenRow(v)}
                      title={(v) => String(v[columns[0]?.key] ?? '-')}
                      subtitle={columns[1] ? (v) => String(v[columns[1].key] ?? '') : undefined}
                      fields={(v) =>
                        columns.slice(2, 5).map((c) => ({ label: c.label, value: String(v[c.key] ?? '-') }))
                      }
                      empty="No entries match these filters."
                    />
                  </div>

                  <div className={`hidden md:block overflow-auto ${expanded ? 'flex-1 min-h-0' : 'max-h-[70vh]'}`}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr>
                          {columns.map((c, ci) => {
                            const sorted = sort?.key === c.key ? sort.dir : null;
                            const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                            const drag = dragProps(c.key);
                            return (
                              <th
                                key={c.key}
                                scope="col"
                                {...drag}
                                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                                className={`px-3 py-2.5 text-left align-bottom font-semibold text-slate-600 bg-slate-50 border-b border-slate-200 select-none ${stickyCell(ci, true)} ${drag.className}`}
                              >
                                {/* Long questions wrap onto two lines instead of stretching the column. */}
                                <span className="flex items-end gap-1 min-w-20 max-w-40">
                                  <DragHandle />
                                  <button
                                    type="button"
                                    onClick={() => toggleSort(c.key)}
                                    title={c.label}
                                    className="group flex-1 min-w-0 inline-flex items-end gap-1 text-left leading-snug hover:text-slate-900 cursor-pointer"
                                  >
                                    <span className="line-clamp-2">{c.label}</span>
                                    <SortIcon className={`w-3 h-3 shrink-0 mb-0.5 ${sorted ? 'text-slate-900' : 'text-slate-300 group-hover:text-slate-500'}`} />
                                  </button>
                                  <ColumnFilter columnKey={c.key} label={c.label} rows={scoped} filters={columnFilters} onChange={setColumnFilters} />
                                </span>
                              </th>
                            );
                          })}
                          {hasDecision && (
                            <th scope="col" className="px-3 py-2.5 text-left align-bottom font-semibold text-slate-600 whitespace-nowrap bg-slate-50 border-b border-slate-200">
                              Decision
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody
                        key={`${service.code}-${period}-${day}-${siteFilter}-${activeColumnFilters}`}
                        className="divide-y divide-slate-100 animate-settle"
                      >
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={columns.length + (hasDecision ? 1 : 0)} className="px-3 py-3 text-xs text-slate-500">
                              {raw.length === 0 ? (
                                'No entries yet.'
                              ) : (
                                <>
                                  No entries match these filters.{' '}
                                  <button type="button" onClick={clearAll} className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
                                    Clear filters
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                        {shown.map((v, i) => (
                          <tr
                            key={String(v.__row.id ?? v.__row.Record_ID ?? i)}
                            onClick={() => setOpenRow(v)}
                            className={`group cursor-pointer transition-colors ${openRow === v ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                          >
                            {columns.map((c, ci) => (
                              <td
                                key={c.key}
                                className={`px-3 py-2 text-slate-800 whitespace-nowrap ${
                                  ci < stickyCount ? `${openRow === v ? 'bg-slate-100' : 'bg-white group-hover:bg-slate-50'} ${stickyCell(ci)}` : ''
                                }`}
                              >
                                <Cell column={c.key} value={v[c.key]} />
                              </td>
                            ))}
                            {hasDecision && (
                              <td className="px-3 py-2 whitespace-nowrap">
                                {v.__row.status === 'Pending Admin Approval' ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={deciding === String(v.__row.id)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void decide(v.__row, true);
                                      }}
                                      className="press inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-(--color-ink) text-white text-[11px] font-semibold disabled:opacity-60 cursor-pointer"
                                    >
                                      {deciding === String(v.__row.id) && <Loader2 className="w-3 h-3 animate-spin" />}
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deciding === String(v.__row.id)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void decide(v.__row, false);
                                      }}
                                      className="press h-7 px-2.5 rounded-md border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
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

                {filtered.length > limit && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
                    <span>
                      Showing <span className="font-mono">{shown.length}</span> of <span className="font-mono">{filtered.length}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE)}
                      className="press h-8 px-3 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Show {Math.min(PAGE, filtered.length - limit)} more
                    </button>
                  </div>
                )}
              </div>
              </TableFullscreen>
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
                    disabled={deciding === String(openRow.__row.id)}
                    onClick={() => void decide(openRow.__row, false)}
                    className="press h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={deciding === String(openRow.__row.id)}
                    onClick={() => void decide(openRow.__row, true)}
                    className="press inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-(--color-ink) text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    {deciding === String(openRow.__row.id) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Approve
                  </button>
                </span>
              </div>
            )}

            <dl className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100">
              {allColumns
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
            {allColumns.some((c) => describeCell(openRow[c.key]).kind === 'empty') && (
              <p className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500">Empty answers are hidden.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
