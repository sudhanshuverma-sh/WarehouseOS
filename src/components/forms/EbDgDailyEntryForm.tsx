import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PageHeader } from '../common/PageHeader';
import {
  Zap, Fuel, Droplet, Sun, Gauge, AlertTriangle, CheckCircle2, Save, Lock, Info, RefreshCw, Link2, Download
} from 'lucide-react';
import {
  EbDgChannel, EbDgInput, EbDgRow, EbDgSeedOpenings, Num, SiteDgConfig
} from '../../types/ebdg';
import { calculate, validate, ValidationIssue, addDays, isBlank } from '../../lib/ebdg/calculate';
import { ebDgRepository } from '../../lib/ebdg/repository';
import { getSiteDgConfig } from '../../lib/ebdg/siteDgConfig';
// The editable-field list, the blank-start rule, and the carried constants all
// live in one place — pinned against the Column_Guide by columnContract.test.ts,
// so the form cannot drift into offering a calculated column as an input box.
import { createEmptyInput as emptyInput, prefillConstants, rowToInput } from '../../lib/ebdg/input';
import { getEbDgWebhookUrl, setEbDgWebhookUrl, rowsToCsv } from '../../lib/ebdg/sheetWriter';
import { capabilitiesFor } from '../../lib/permissions';
import { Toggle } from '../common/Toggle';
import { useExtraQuestions } from './ExtraQuestions';

interface EbDgDailyEntryFormProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

const draftKey = (siteCode: string, date: string) => `wos_ebdg_draft_${siteCode}_${date}`;

/** Blank in, blank out — clearing the box records "not read", not zero. */
function NumberField({ label, value, onChange, unit, step = 'any', highlight, hint }: {
  label: string; value: Num; onChange: (v: Num) => void; unit?: string; step?: string; highlight?: 'add' | 'sub'; hint?: string;
}) {
  return (
    <div>
      <label className="block text-slate-500 font-semibold mb-1 text-[11px] uppercase tracking-wide">{label}{unit ? ` (${unit})` : ''}</label>
      <input
        type="number"
        step={step}
        value={value === '' ? '' : value}
        placeholder="—"
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm ${highlight === 'add' ? 'text-emerald-700' : highlight === 'sub' ? 'text-rose-700' : 'text-slate-900'}`}
      />
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

/** Renders a blank cell as an em dash so "not filled" never looks like 0. */
const show = (v: unknown): React.ReactNode => (isBlank(v) ? '—' : String(v));

function ReadonlyStat({ label, value, unit, caption }: { label: string; value: unknown; unit?: string; caption?: string }) {
  return (
    <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
        <Lock className="w-3 h-3" /> {label}
      </div>
      {/* The unit rides along only when there's a value, so a blank reads '—', never '— L'. */}
      <div className="text-sm font-black text-slate-900 mt-1">{show(value)}{!isBlank(value) && unit ? ` ${unit}` : ''}</div>
      {caption && <div className="text-[10px] text-slate-400 mt-0.5">{caption}</div>}
    </div>
  );
}

/** A one-time first-entry seed box. Clearing it means "unknown", not zero. */
function SeedField({ label, value, onChange, type = 'number' }: {
  label: string; value: Num | string | undefined; onChange: (v: number | string | undefined) => void; type?: 'number' | 'date';
}) {
  return (
    <div>
      <label className="block text-amber-700 font-semibold mb-1 text-[11px] uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        placeholder="—"
        onChange={e => onChange(e.target.value === '' ? undefined : type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full font-bold px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm"
      />
    </div>
  );
}

const B_CHECK_BADGE: Record<string, string> = {
  'OK': 'bg-emerald-100 text-emerald-800',
  'DUE SOON': 'bg-amber-100 text-amber-800',
  'DUE NOW': 'bg-rose-100 text-rose-800'
};

function DgBlock({
  n, config, input, setInput, prev, seed, setSeed, date
}: {
  n: 1 | 2 | 3;
  config: SiteDgConfig;
  input: EbDgInput;
  setInput: React.Dispatch<React.SetStateAction<EbDgInput>>;
  prev: EbDgRow | null;
  seed: EbDgSeedOpenings;
  setSeed: React.Dispatch<React.SetStateAction<EbDgSeedOpenings>>;
  date: string;
}) {
  // Hooks must run unconditionally — decide whether to render AFTER them.
  const preview = useMemo(
    () => calculate(input, prev, config, { siteCode: 'PREVIEW', whCode: '', zone: '', date, submittedBy: '' }, seed),
    [input, prev, config, date, seed]
  );

  if (config.DG_Count < n) return null;

  const k = (suffix: string) => `DG${n}_${suffix}` as keyof EbDgInput;
  const openingHsdKey = `DG${n}_HSD_Opening` as keyof EbDgSeedOpenings;
  const openingKwhKey = `DG${n}_KWH_Opening` as keyof EbDgSeedOpenings;
  const seedBCheckHrsKey = `DG${n}_B_Check_Last_Hrs` as keyof EbDgSeedOpenings;
  const seedBCheckDateKey = `DG${n}_B_Check_Last_Date` as keyof EbDgSeedOpenings;

  const val = (suffix: string): Num => input[k(suffix)] as Num;
  const seedNum = (key: keyof EbDgSeedOpenings): Num => (seed[key] as Num) ?? '';
  const status = preview[`DG${n}_B_Check_Status` as keyof EbDgRow] as string;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Fuel className="w-4 h-4 text-amber-600" /> DG {n}
        </h2>
        {status && (
          // The only pulsing thing in the app, deliberately. A DG past its
          // 500 hours or 365 days is the one state here that should pull
          // your eye before you finish reading the panel; put this on three
          // more things and it stops meaning anything.
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${B_CHECK_BADGE[status] || 'bg-slate-100 text-slate-700'} ${
              status === 'DUE NOW' ? 'animate-attention' : ''
            }`}
          >
            B-Check: {status}
          </span>
        )}
      </div>

      {/* Openings — read-only, or a one-time seed on the very first entry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {prev ? (
          <>
            <ReadonlyStat label="HSD Opening" value={preview[`DG${n}_HSD_Opening` as keyof EbDgRow]} caption={`from ${prev.Date}`} />
            <ReadonlyStat label="KWH Opening" value={preview[`DG${n}_KWH_Opening` as keyof EbDgRow]} caption={`from ${prev.Date}`} />
          </>
        ) : (
          <>
            <div>
              <label className="block text-amber-700 font-semibold mb-1 text-[11px] uppercase tracking-wide">HSD Opening — first entry</label>
              <input type="number" value={seedNum(openingHsdKey)} placeholder="—"
                onChange={e => setSeed(s => ({ ...s, [openingHsdKey]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full font-bold px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm" />
            </div>
            <div>
              <label className="block text-amber-700 font-semibold mb-1 text-[11px] uppercase tracking-wide">KWH Opening — first entry</label>
              <input type="number" value={seedNum(openingKwhKey)} placeholder="—"
                onChange={e => setSeed(s => ({ ...s, [openingKwhKey]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full font-bold px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm" />
            </div>
          </>
        )}
        <NumberField label="HSD Added" unit="L" highlight="add" value={val('HSD_Added')} onChange={v => setInput(s => ({ ...s, [k('HSD_Added')]: v }))} />
        <NumberField label="HSD Closing (dip)" unit="L" value={val('HSD_Closing')} onChange={v => setInput(s => ({ ...s, [k('HSD_Closing')]: v }))} />
      </div>

      {/* First entry only: start the B-check chain, so the badge means something
          from day one instead of reading DUE NOW against no history. */}
      {!prev && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-amber-100">
          <div>
            <label className="block text-amber-700 font-semibold mb-1 text-[11px] uppercase tracking-wide">Last B-check at (hrs)</label>
            <input type="number" value={seedNum(seedBCheckHrsKey)} placeholder="—"
              onChange={e => setSeed(s => ({ ...s, [seedBCheckHrsKey]: e.target.value === '' ? undefined : Number(e.target.value) }))}
              className="w-full font-bold px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm" />
          </div>
          <div>
            <label className="block text-amber-700 font-semibold mb-1 text-[11px] uppercase tracking-wide">Last B-check date</label>
            <input type="date" value={(seed[seedBCheckDateKey] as string) ?? ''}
              onChange={e => setSeed(s => ({ ...s, [seedBCheckDateKey]: e.target.value || undefined }))}
              className="w-full font-bold px-3 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm" />
          </div>
          <div className="sm:col-span-2 text-[10px] text-amber-700 self-end pb-2">
            Hour-meter reading and date of this DG's last B-check. Leave blank if genuinely unknown — the status badge stays empty until there's a history to measure against.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
        <NumberField label="KWH Closing (meter)" value={val('KWH_Closing')} onChange={v => setInput(s => ({ ...s, [k('KWH_Closing')]: v }))} />
        <NumberField label="Run Hrs today" unit="decimal hrs" step="0.1" hint="Decimal, not h:mm — 24 min = 0.4" value={val('Run_Hrs')} onChange={v => setInput(s => ({ ...s, [k('Run_Hrs')]: v }))} />
        <NumberField label="Hour Meter (cumulative)" step="0.1" value={val('Hour_Meter')} onChange={v => setInput(s => ({ ...s, [k('Hour_Meter')]: v }))} />
        <div>
          <label className="block text-slate-500 font-semibold mb-1 text-[11px] uppercase tracking-wide">B-Check done today?</label>
          <select
            value={input[k('B_Check_Done_Today')] as string}
            onChange={e => setInput(s => ({ ...s, [k('B_Check_Done_Today')]: e.target.value }))}
            className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
          >
            <option value="No">No</option>
            <option value="Yes">Yes — done today</option>
          </select>
        </div>
      </div>

      {/* Live preview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
        <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
          <span className="text-[10px] font-bold text-amber-800 uppercase">HSD Consumption</span>
          <div className="text-base font-black text-amber-900 mt-1">{show(preview[`DG${n}_HSD_Consumption` as keyof EbDgRow])}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase">KWH Consumption</span>
          <div className="text-base font-black text-slate-900 mt-1">{show(preview[`DG${n}_KWH_Consumption` as keyof EbDgRow])}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Unit / Ltr</span>
          <div className="text-base font-black text-slate-900 mt-1">{preview[`DG${n}_Unit_Per_Ltr` as keyof EbDgRow]}</div>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Ltr / Hr</span>
          <div className="text-base font-black text-slate-900 mt-1">{preview[`DG${n}_Ltr_Per_Hr` as keyof EbDgRow]}</div>
        </div>
      </div>
    </div>
  );
}

export const EbDgDailyEntryForm: React.FC<EbDgDailyEntryFormProps> = ({ onBack, onSuccess }) => {
  const { currentUser, warehouses, currentDate, notify } = useApp();

  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const activeWh = warehouses.find(w => w.id === currentUser.warehouseId) || warehouses[0];
  const siteCode = activeWh?.id || '';
  const whCode = activeWh?.code || '';
  const zone = activeWh?.zone || '';
  const channel: EbDgChannel = activeWh?.channel === 'B2C' ? 'EB_DG_B2C' : 'EB_DG_B2B';
  const config = useMemo(() => getSiteDgConfig(siteCode), [siteCode]);

  const [date, setDate] = useState<string>(currentDate);
  const [input, setInput] = useState<EbDgInput>(emptyInput);
  const [seed, setSeed] = useState<EbDgSeedOpenings>({});
  const [prevRow, setPrevRow] = useState<EbDgRow | null>(null);
  const [existingRow, setExistingRow] = useState<EbDgRow | null>(null);
  const [isBackdated, setIsBackdated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string>(() => getEbDgWebhookUrl());
  const [urlDraft, setUrlDraft] = useState<string>(() => getEbDgWebhookUrl());
  const [showSyncSetup, setShowSyncSetup] = useState(false);

  // Questions an admin added to this service after the screen was built.
  const extras = useExtraQuestions('EB_DG', siteCode);

  // Load previous row, any existing entry for this date, draft, and the
  // back-dated-entry flag whenever site or date changes.
  useEffect(() => {
    if (!siteCode || !date) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [prev, existing, laterExists] = await Promise.all([
        ebDgRepository.getPreviousRow(siteCode, date, channel),
        ebDgRepository.getRowByDate(siteCode, date, channel),
        ebDgRepository.hasLaterRows(siteCode, date, channel)
      ]);
      if (cancelled) return;
      setPrevRow(prev);
      setExistingRow(existing);
      setIsBackdated(laterExists);

      const draftRaw = localStorage.getItem(draftKey(siteCode, date));
      if (existing) {
        setInput(rowToInput(existing));
      } else if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw);
          setInput(prefillConstants({ ...emptyInput(), ...draft.input }, prev));
          setSeed(draft.seed || {});
        } catch {
          setInput(prefillConstants(emptyInput(), prev));
        }
      } else {
        setInput(prefillConstants(emptyInput(), prev));
        setSeed({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteCode, date, channel]);

  // Autosave a local draft — warehouse connectivity is unreliable.
  useEffect(() => {
    if (!siteCode || !date || loading) return;
    localStorage.setItem(draftKey(siteCode, date), JSON.stringify({ input, seed }));
  }, [siteCode, date, input, seed, loading]);

  const meta = useMemo(() => ({ siteCode, whCode, zone, date, submittedBy: currentUser.email }), [siteCode, whCode, zone, date, currentUser.email]);

  const preview = useMemo(() => calculate(input, prevRow, config, meta, seed), [input, prevRow, config, meta, seed]);
  const issues: ValidationIssue[] = useMemo(() => validate(input, prevRow, config, date, seed), [input, prevRow, config, date, seed]);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const canSubmit = errors.length === 0 && (warnings.length === 0 || overrideWarnings) && !isSubmitting;

  /**
   * Downloads this site's rows in the destination tab's exact column order,
   * header included — the path that works before an Apps Script deployment
   * exists. Paste-special into the tab, or File → Import → Append.
   */
  const handleExportCsv = async () => {
    const rows = await ebDgRepository.listBySite(siteCode, channel, 500);
    if (rows.length === 0) {
      notify('info', 'Nothing to export yet', 'Save an entry first.');
      return;
    }
    // Oldest first, so the tab reads chronologically after an append.
    const ordered = [...rows].reverse();
    const blob = new Blob([rowsToCsv(ordered)], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${channel}_${siteCode}_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    notify('success', 'CSV exported', `${ordered.length} row(s) in ${channel} column order.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const extraAnswers = extras.collect();
    if (!extraAnswers) {
      notify('error', 'More questions', 'Please answer the questions at the end of the form.');
      return;
    }

    setIsSubmitting(true);
    const row = calculate(input, prevRow, config, meta, seed);
    const result = await ebDgRepository.submit(row, channel, extraAnswers);
    setIsSubmitting(false);
    if (!result.success) {
      notify('error', 'Could not save', result.message);
      return;
    }
    localStorage.removeItem(draftKey(siteCode, date));
    setExistingRow(row);
    setSubmitted(true);
    notify('success', result.mode === 'updated' ? 'Entry updated' : 'Entry saved', result.message);
    onSuccess?.();
  };

  if (!activeWh) {
    return <div className="p-8 text-center text-sm text-slate-400">No warehouse assigned to your account.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="EB-DG Daily Entry"
        subtitle={`Electricity Board, Diesel Generator, and Water readings for ${activeWh.name} — routes to ${channel}.`}
        categoryBadge={channel}
        categoryColor="bg-amber-50 text-amber-700 border-amber-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[{ label: 'Portal', onClick: onBack }, { label: 'Energy & Utilities' }, { label: 'EB-DG Daily Entry' }]}
        actions={
          <div className="flex items-center gap-3">
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Grid Reliability</span>
              <div className="text-lg font-black text-emerald-600">{preview.Grid_Supply_Pct}%</div>
            </div>
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Blended Rate</span>
              <div className="text-lg font-black text-slate-900">₹{preview.Blended_Rate_Per_Unit}</div>
            </div>
          </div>
        }
      />

      {/* Site & Date */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-slate-400 block">Site</span><span className="font-semibold text-slate-800">{activeWh.name} ({siteCode})</span></div>
          <div><span className="text-slate-400 block">WH Code</span><span className="font-semibold text-slate-800">{whCode}</span></div>
          <div><span className="text-slate-400 block">Zone</span><span className="font-semibold text-slate-800">{zone}</span></div>
          <div>
            <label className="text-slate-400 block mb-1">Date</label>
            <input type="date" value={date} max={currentDate} onChange={e => setDate(e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-semibold" />
          </div>
        </div>

        {!prevRow && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>No previous entry found for this site — this is treated as the <strong>first-ever entry</strong>. Opening balances above are editable one time only.</span>
          </div>
        )}
        {prevRow && prevRow.Date !== addDays(date, -1) && (
          <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>There's a gap since the last entry — carrying forward from <strong>{prevRow.Date}</strong>, not {addDays(date, -1)}.</span>
          </div>
        )}
        {isBackdated && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Later rows already exist for this site after {date}. Saving this back-dated entry means those later rows' opening balances will need recalculating.</span>
          </div>
        )}
        {existingRow && !submitted && (
          <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>An entry already exists for {date} (<strong>{existingRow.Record_ID}</strong>) — you're editing it. Saving updates that row; it never creates a duplicate.</span>
          </div>
        )}

        {/* Where the row goes. Admin-only: a site POC files readings, they never
            point the app at a different spreadsheet. Entries always save on this
            device first, so a dropped warehouse link never costs a reading —
            this panel only configures the onward push. */}
        {caps.canConfigureIntegrations && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Sheet sync → {channel}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowSyncSetup(v => !v)}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 underline cursor-pointer">
                {webhookUrl ? 'Change URL' : 'Set up'}
              </button>
              <button type="button" onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>

          <div className={`text-[11px] ${webhookUrl ? 'text-emerald-700' : 'text-amber-700'}`}>
            {webhookUrl
              ? 'Connected — each save is pushed to the tab, matched on Record_ID.'
              : 'Not connected. Entries save on this device; use Export CSV to load them into the tab, or deploy scripts/EbDg_Code.gs and paste its /exec URL here.'}
          </div>

          {showSyncSetup && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                placeholder="https://script.google.com/…/exec"
                className="flex-1 min-w-[240px] px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
              />
              <button type="button"
                onClick={() => { setEbDgWebhookUrl(urlDraft); setWebhookUrl(urlDraft.trim()); setShowSyncSetup(false); notify('success', 'Sheet sync updated', urlDraft.trim() ? `Saves now push to ${channel}.` : 'Sheet sync turned off.'); }}
                className="px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer">
                Save URL
              </button>
            </div>
          )}
        </div>
        )}

        {/* A POC gets confirmation of where their entry lands, with no controls
            to change it — the destination is a master-data decision. */}
        {!caps.canConfigureIntegrations && (
          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Filed to <strong className="text-slate-700">{channel}</strong> for {activeWh.name}. Your entry saves even if the site link drops.
          </div>
        )}
      </div>

      {submitted ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm border-t-8 border-t-emerald-600 p-7 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Entry saved</h2>
          <p className="text-sm text-slate-600">
            <strong className="font-mono text-emerald-700">{existingRow?.Record_ID}</strong> is recorded in {channel}.
          </p>
          <button onClick={() => setSubmitted(false)} className="text-sm font-semibold text-emerald-700 hover:underline cursor-pointer">
            + Edit this entry again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {[1, 2, 3].map(n => (
            <DgBlock key={n} n={n as 1 | 2 | 3} config={config} input={input} setInput={setInput} prev={prevRow} seed={seed} setSeed={setSeed} date={date} />
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {config.Has_DEF === 'Yes' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Droplet className="w-4 h-4 text-cyan-600" /> DEF (Diesel Exhaust Fluid)</h2>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {prevRow
                    ? <ReadonlyStat label="Opening" value={preview.DEF_Opening} unit="L" caption={`from ${prevRow.Date}`} />
                    : <SeedField label="DEF Opening — first entry" value={seed.DEF_Opening} onChange={v => setSeed(s => ({ ...s, DEF_Opening: v as number | undefined }))} />}
                  <NumberField label="Added" unit="L" highlight="add" value={input.DEF_Added} onChange={v => setInput(s => ({ ...s, DEF_Added: v }))} />
                  <NumberField label="Closing" unit="L" value={input.DEF_Closing} onChange={v => setInput(s => ({ ...s, DEF_Closing: v }))} />
                  <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-200">
                    <span className="text-[10px] font-bold text-cyan-800 uppercase">Used</span>
                    <div className="text-base font-black text-cyan-900 mt-1">{show(preview.DEF_Used)}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Gauge className="w-4 h-4 text-teal-600" /> Water (KL)</h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {prevRow
                  ? <ReadonlyStat label="Opening" value={preview.Water_Opening} unit="KL" caption={`from ${prevRow.Date}`} />
                  : <SeedField label="Water Opening — first entry" value={seed.Water_Opening} onChange={v => setSeed(s => ({ ...s, Water_Opening: v as number | undefined }))} />}
                <NumberField label="Closing (meter)" unit="KL" step="0.1" value={input.Water_Closing} onChange={v => setInput(s => ({ ...s, Water_Closing: v }))} />
                <NumberField label="Raw water procured" unit="KL, tankers" step="0.1" value={input.Raw_Water_Procured_KL} onChange={v => setInput(s => ({ ...s, Raw_Water_Procured_KL: v }))} />
                <div className="bg-teal-50 p-2.5 rounded-xl border border-teal-200">
                  <span className="text-[10px] font-bold text-teal-800 uppercase">Consumed</span>
                  <div className="text-base font-black text-teal-900 mt-1">{show(preview.Water_Consumed)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* HSD bulk tank */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Fuel className="w-4 h-4 text-amber-600" /> HSD Bulk Tank</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {prevRow
                ? <ReadonlyStat label="Opening" value={preview.HSD_Tank_Opening} unit="L" caption={`from ${prevRow.Date}`} />
                : <SeedField label="Opening — first entry" value={seed.HSD_Tank_Opening} onChange={v => setSeed(s => ({ ...s, HSD_Tank_Opening: v as number | undefined }))} />}
              <NumberField label="Received" unit="L" highlight="add" value={input.HSD_Received_Ltr} onChange={v => setInput(s => ({ ...s, HSD_Received_Ltr: v }))} />
              <NumberField label="Rate" unit="₹/L" step="0.01" hint={prevRow ? `carried from ${prevRow.Date} — edit if changed` : undefined} value={input.HSD_Rate} onChange={v => setInput(s => ({ ...s, HSD_Rate: v }))} />
              <NumberField label="Closing (dip)" unit="L" value={input.HSD_Tank_Closing} onChange={v => setInput(s => ({ ...s, HSD_Tank_Closing: v }))} />
              <div className="bg-slate-900 text-white p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-amber-300 uppercase">Amount</span>
                <div className="text-base font-black mt-1">₹{preview.HSD_Amount.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>

          {/* Grid / EB */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Grid Power (EB)</h2>
              <span className="text-xs text-slate-500 font-semibold">
                Units consumed: <strong className="text-slate-900">{show(preview.Grid_KWH_Consumed)} kWh</strong>
                {' · '}PF: <strong className={preview.Grid_PF && preview.Grid_PF < 0.9 ? 'text-rose-600' : 'text-emerald-600'}>{preview.Grid_PF}</strong>
                {preview.Grid_PF > 0 && preview.Grid_PF < 0.9 && <span className="text-rose-600"> (penalty risk)</span>}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {prevRow
                ? <ReadonlyStat label="KWH Opening" value={preview.Grid_KWH_Opening} caption={`from ${prevRow.Date}`} />
                : <SeedField label="KWH Opening — first entry" value={seed.Grid_KWH_Opening} onChange={v => setSeed(s => ({ ...s, Grid_KWH_Opening: v as number | undefined }))} />}
              <NumberField label="KWH Closing" value={input.Grid_KWH_Closing} onChange={v => setInput(s => ({ ...s, Grid_KWH_Closing: v }))} />
              <NumberField label="Multiplying Factor" step="1" hint={prevRow ? `carried from ${prevRow.Date}` : 'often 20'} value={input.Grid_MF} onChange={v => setInput(s => ({ ...s, Grid_MF: v }))} />
              <NumberField label="Rate" unit="₹/unit" step="0.01" hint={prevRow ? `carried from ${prevRow.Date} — edit if changed` : undefined} value={input.EB_Rate_Per_Unit} onChange={v => setInput(s => ({ ...s, EB_Rate_Per_Unit: v }))} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
              {prevRow
                ? <ReadonlyStat label="KVAH Opening" value={preview.Grid_KVAH_Opening} caption={`from ${prevRow.Date}`} />
                : <SeedField label="KVAH Opening — first entry" value={seed.Grid_KVAH_Opening} onChange={v => setSeed(s => ({ ...s, Grid_KVAH_Opening: v as number | undefined }))} />}
              <NumberField label="KVAH Closing" value={input.Grid_KVAH_Closing} onChange={v => setInput(s => ({ ...s, Grid_KVAH_Closing: v }))} />
              <NumberField label="Supply Hrs" step="0.1" value={input.Grid_Supply_Hrs} onChange={v => setInput(s => ({ ...s, Grid_Supply_Hrs: v }))} />
              <NumberField label="Power Cuts (count)" step="1" value={input.EB_Power_Cuts} onChange={v => setInput(s => ({ ...s, EB_Power_Cuts: v }))} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
              <NumberField label="Max Load" unit="KW" step="0.1" value={input.Max_Load_KW} onChange={v => setInput(s => ({ ...s, Max_Load_KW: v }))} />
              <ReadonlyStat label="Grid Supply %" value={`${preview.Grid_Supply_Pct}%`} />
              <ReadonlyStat label="DG Supply %" value={`${preview.DG_Supply_Pct}%`} />
              <ReadonlyStat label="EB Amount" value={`₹${preview.EB_Amount.toLocaleString('en-IN')}`} />
            </div>
          </div>

          {config.Has_Solar === 'Yes' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Sun className="w-4 h-4 text-amber-400" /> Solar</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {prevRow
                  ? <ReadonlyStat label="Opening" value={preview.Solar_Opening} caption={`from ${prevRow.Date}`} />
                  : <SeedField label="Opening — first entry" value={seed.Solar_Opening} onChange={v => setSeed(s => ({ ...s, Solar_Opening: v as number | undefined }))} />}
                <NumberField label="Closing" value={input.Solar_Closing} onChange={v => setInput(s => ({ ...s, Solar_Closing: v }))} />
                <NumberField label="Rate" unit="₹/unit" step="0.01" hint={prevRow ? `carried from ${prevRow.Date} — edit if changed` : undefined} value={input.Solar_Rate_Per_Unit} onChange={v => setInput(s => ({ ...s, Solar_Rate_Per_Unit: v }))} />
                <ReadonlyStat label="Generated" value={preview.Solar_Generated} />
              </div>
            </div>
          )}

          {/* Totals summary */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><div className="text-[10px] text-amber-300 uppercase font-semibold">Total HSD Used</div><div className="text-lg font-black">{preview.Total_HSD_Consumption} L</div></div>
            <div><div className="text-[10px] text-amber-300 uppercase font-semibold">Total kWh (all sources)</div><div className="text-lg font-black">{preview.Total_KWH_All_Sources}</div></div>
            <div><div className="text-[10px] text-amber-300 uppercase font-semibold">Total Amount</div><div className="text-lg font-black">₹{preview.Total_Amount.toLocaleString('en-IN')}</div></div>
            <div><div className="text-[10px] text-amber-300 uppercase font-semibold">Blended Rate</div><div className="text-lg font-black">₹{preview.Blended_Rate_Per_Unit}/unit</div></div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Remark</label>
            <textarea value={input.Remark} onChange={e => setInput(s => ({ ...s, Remark: e.target.value }))} rows={2}
              placeholder="Optional notes — required if overriding a warning below…"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm" />
          </div>

          {extras.node}

          {/* Validation */}
          {errors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1.5">
              {errors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-rose-800"><AlertTriangle className="w-4 h-4 shrink-0" /> {e.message}</div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 shrink-0" /> {w.message}</div>
              ))}
              {/* A switch rather than a checkbox: this is a setting being
                  turned on, not a field being filled, and a screen reader
                  should say "on"/"off" rather than "checked". Caution tone —
                  overriding a warning is not a success state. */}
              <div className="pt-1">
                <Toggle
                  checked={overrideWarnings}
                  onChange={setOverrideWarnings}
                  disabled={!input.Remark.trim()}
                  size="sm"
                  tone="caution"
                  label="I've reviewed these warnings and want to submit anyway"
                  description={!input.Remark.trim() ? 'Add a Remark first' : undefined}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {onBack ? (
              <button type="button" onClick={onBack} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition">Cancel</button>
            ) : <div />}
            <button type="submit" disabled={!canSubmit}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2">
              {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> {existingRow ? 'Update Entry' : 'Save Entry'}</>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
