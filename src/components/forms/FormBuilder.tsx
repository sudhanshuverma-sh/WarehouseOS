import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  GripVertical,
  Hash,
  Heading,
  Link2,
  List,
  Loader2,
  Percent,
  Plus,
  Smartphone,
  Table,
  Thermometer,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { FieldDefinition, FieldType, OperationalSheetDef } from '../../types';
import type { Cadence } from '../../types/masterData';
import { cadenceFor } from '../../lib/api/adapters';
import { controlRoomSites } from '../../lib/controlRoom/siteServiceStatus';
import { serviceCodeFor, sheetIdFor } from '../../lib/services/serviceCodes';
import {
  CADENCE_OPTIONS,
  FIELD_TYPES,
  FORM_TEMPLATES,
  BUILT_IN_FORM_SERVICES,
  blankField,
  builtInFields,
  extraFields,
  cleanForSave,
  columnsToFields,
  copyField,
  dropRefs,
  fieldKeyFrom,
  fieldTypeLabel,
  isNumericType,
  parseList,
  problemCount,
  renameRefs,
  serviceCodeFrom,
  validateDraft,
  withType,
  type DraftProblems,
} from '../../lib/services/formBuilder';
import type { EvidenceValue } from '../common/EvidenceInput';
import { answersOf, canBranchOn } from '../../lib/services/formLogic';
import { exportFormJson, importForm, type ImportResult } from '../../lib/services/formImport';
import { ServiceFieldList } from './ServiceFieldList';

/**
 * Form builder: create a new operational form POCs fill, or change the
 * questions of an existing one.
 *
 * Left, the form: name, how often it is filed, and its questions. Right, a
 * live preview rendered by the same component the POC desk uses. Publishing
 * creates the Service_Registry row and its questions (service_form); editing
 * keeps each saved question's internal name, so past entries stay linked.
 *
 * Beyond one box per question: section headings, questions asked only after
 * a certain answer (show-if), answers that open a follow-up comment or photo
 * and count as an issue, drag to reorder, and a form pasted in as HTML or
 * JSON — for instance one an AI assistant wrote — or exported as JSON.
 */

interface FormBuilderProps {
  editSheetId?: string;
  onClose: () => void;
  onSaved: (sheetId: string) => void;
}

const TYPE_ICON: Record<FieldType, React.ElementType> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  percentage: Percent,
  temperature: Thermometer,
  boolean: CheckSquare,
  select: List,
  date: Calendar,
  time: Clock,
  evidence: Link2,
  section: Heading,
};

const INPUT =
  'w-full h-9 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200';
const LABEL = 'block text-xs font-semibold text-slate-700 mb-1.5';
const ICON_BUTTON =
  'w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-[0.94] transition cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent';

const NO_PROBLEMS: DraftProblems = { fields: {} };

export const FormBuilder: React.FC<FormBuilderProps> = ({ editSheetId, onClose, onSaved }) => {
  const { operationalSheets, serviceRegistryRows, siteMasterRows, warehouses, currentDate, addOperationalSheet, updateOperationalSheet } = useApp();

  // Captured once, so a catalog reload never resets a half-edited form.
  const [editing] = useState<OperationalSheetDef | undefined>(() =>
    editSheetId ? operationalSheets.find((s) => s.id === editSheetId) : undefined,
  );
  const mode: 'create' | 'edit' = editing ? 'edit' : 'create';
  const editCode = editing ? serviceCodeFor(editing.id) : '';
  const [registered] = useState(() => serviceRegistryRows.find((r) => r.Service_Code === editCode));
  const [savedKeys] = useState(() => new Set(editing?.fieldsConfig?.map((f) => f.key) ?? []));

  // A service with its own screen keeps that screen; here we add to it. Its
  // built-in columns are what that screen already asks for — held aside, never
  // edited, and put back untouched on publish.
  const builtIn = Boolean(editing && BUILT_IN_FORM_SERVICES.has(editCode));
  const [asked] = useState<FieldDefinition[]>(() =>
    editing && BUILT_IN_FORM_SERVICES.has(serviceCodeFor(editing.id)) ? builtInFields(editing.fieldsConfig) : [],
  );

  const [name, setName] = useState(registered?.Service_Name || editing?.title || '');
  const [code, setCode] = useState(editCode);
  const [codeEdited, setCodeEdited] = useState(false);
  const [cadence, setCadence] = useState<Cadence>(registered?.Cadence ?? (editing ? cadenceFor(editing.frequency) : 'DAILY'));
  const [description, setDescription] = useState(editing?.description ?? '');
  const [fields, setFields] = useState<FieldDefinition[]>(() => {
    const saved = editing?.fieldsConfig ?? [];
    const mine = editing && BUILT_IN_FORM_SERVICES.has(serviceCodeFor(editing.id)) ? extraFields(saved) : saved;
    return mine.map((f) => ({ ...f }));
  });
  const [open, setOpen] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tryValues, setTryValues] = useState<Record<string, unknown>>({});
  const [tryEvidence, setTryEvidence] = useState<Record<string, EvidenceValue | null>>({});
  const [columnText, setColumnText] = useState('');
  const [previewMode, setPreviewMode] = useState<'form' | 'sheet'>('form');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const labelInputs = useRef(new Map<number, HTMLInputElement>());
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    labelInputs.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const existingCodes = useMemo(
    () => [...serviceRegistryRows.map((r) => r.Service_Code), ...operationalSheets.map((s) => serviceCodeFor(s.id))],
    [serviceRegistryRows, operationalSheets],
  );
  const serviceCode = mode === 'edit' ? editCode : code.trim();
  const problems = useMemo(
    () => validateDraft({ name, code: serviceCode, fields }, existingCodes, mode, { asked, builtIn }),
    [name, serviceCode, fields, existingCodes, mode, asked, builtIn],
  );
  const shown = attempted ? problems : NO_PROBLEMS;
  const issues = problemCount(problems);

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const reach = sites.filter((s) => s.services === 'ALL' || (serviceCode !== '' && s.services.includes(serviceCode))).length;
  const copySources = operationalSheets.filter(
    (s) => s.id !== editing?.id && (s.fieldsConfig?.length ?? 0) > 0 && !BUILT_IN_FORM_SERVICES.has(serviceCodeFor(s.id)),
  );

  const taken = (list: FieldDefinition[], except?: number) => [...list.filter((_, j) => j !== except).map((f) => f.key), ...savedKeys];

  // ------------------------------------------------------------------ edits
  const onName = (value: string) => {
    setDirty(true);
    setName(value);
    if (mode === 'create' && !codeEdited) setCode(serviceCodeFrom(value));
  };

  const updateField = (i: number, patch: Partial<FieldDefinition>) => {
    setDirty(true);
    setFields((prev) => {
      const before = prev[i];
      let next = patch.type && patch.type !== before.type ? withType(before, patch.type) : { ...before, ...patch };
      // New questions take their saved name from the wording; saved ones keep theirs.
      if (patch.label !== undefined && !savedKeys.has(before.key)) next = { ...next, key: fieldKeyFrom(patch.label, taken(prev, i)) };
      let list = prev.map((f, j) => (j === i ? next : f));
      // A show-if pointing at this question keeps pointing at it.
      list = renameRefs(list, before.key, next.key);
      // Its answers changed (type or options): a show-if on it may no longer match anything.
      if (patch.type || patch.options) {
        const offered = answersOf(next);
        list = list.map((f) =>
          f.showIf?.field === next.key ? { ...f, showIf: { ...f.showIf, equals: f.showIf.equals.filter((e) => offered.includes(e)) } } : f,
        );
      }
      return list;
    });
  };

  const addField = (type: FieldType) => {
    setDirty(true);
    const index = fields.length;
    setFields((prev) => [...prev, blankField(type, taken(prev))]);
    setOpen(index);
    focusNext.current = index;
  };

  const move = (i: number, step: -1 | 1) => {
    const j = i + step;
    if (j < 0 || j >= fields.length) return;
    setDirty(true);
    setFields((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOpen((o) => (o === i ? j : o === j ? i : o));
  };

  const duplicate = (i: number) => {
    setDirty(true);
    setFields((prev) => {
      const source = prev[i];
      const label = source.label ? `${source.label} (copy)` : '';
      const copy = { ...copyField(source), label, key: fieldKeyFrom(label, taken(prev)) };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    setOpen(i + 1);
    focusNext.current = i + 1;
  };

  const remove = (i: number) => {
    setDirty(true);
    setFields((prev) => dropRefs(prev.filter((_, j) => j !== i), prev[i].key));
    setOpen(null);
  };

  /** Drag a question onto another's place. */
  const dropAt = (to: number) => {
    const from = dragFrom;
    setDragFrom(null);
    setDragOver(null);
    if (from === null || from === to) return;
    setDirty(true);
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setOpen(null);
  };

  const replaceQuestions = (list: FieldDefinition[]) => {
    if (fields.length && dirty && !window.confirm('Replace the questions you have now?')) return false;
    const keys: string[] = [...savedKeys];
    const renamed = new Map<string, string>();
    let next = list.map((f) => {
      // Reuse a saved name only when it is free; never collide with one.
      const key = savedKeys.has(f.key) || keys.includes(f.key) ? fieldKeyFrom(f.label, keys) : f.key;
      keys.push(key);
      if (key !== f.key) renamed.set(f.key, key);
      return { ...copyField(f), key };
    });
    for (const [from, to] of renamed) next = renameRefs(next, from, to);
    setFields(next);
    setOpen(null);
    setDirty(true);
    return true;
  };

  const applyTemplate = (id: string) => {
    const t = FORM_TEMPLATES.find((x) => x.id === id);
    if (!t || !replaceQuestions(t.fields)) return;
    if (!name.trim()) onName(t.name);
    setCadence(t.cadence);
  };

  const copyFrom = (sheetId: string) => {
    const source = operationalSheets.find((s) => s.id === sheetId);
    if (source?.fieldsConfig) replaceQuestions(source.fieldsConfig);
  };

  /** A header row copied out of a spreadsheet becomes the questions. */
  const addFromColumns = () => {
    const made = columnsToFields(columnText, taken(fields));
    if (!made.length) return;
    setDirty(true);
    setFields((prev) => [...prev, ...made]);
    setColumnText('');
    setOpen(null);
  };

  /** Questions read from pasted HTML or JSON: replace the form's, or go on the end. */
  const useImported = (result: ImportResult, how: 'replace' | 'append') => {
    if (!result.fields.length) return false;
    if (how === 'replace') {
      if (!replaceQuestions(result.fields)) return false;
    } else {
      const keys = taken(fields);
      const renamed = new Map<string, string>();
      let added = result.fields.map((f) => {
        const key = keys.includes(f.key) ? fieldKeyFrom(f.label, keys) : f.key;
        keys.push(key);
        if (key !== f.key) renamed.set(f.key, key);
        return { ...copyField(f), key };
      });
      for (const [from, to] of renamed) added = renameRefs(added, from, to);
      setDirty(true);
      setFields((prev) => [...prev, ...added]);
      setOpen(null);
    }
    if (!name.trim() && result.title && mode === 'create') onName(result.title.replace(/\s*[—–-]\s*daily check$/i, '').trim());
    return true;
  };

  /** The questions as JSON, to keep or to paste into another form. */
  const downloadJson = () => {
    const blob = new Blob([exportFormJson(name.trim() || 'Form', cleanForSave(fields))], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(serviceCode || 'form').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  const cancel = () => {
    if (dirty && !window.confirm('Leave without saving? Your changes will be lost.')) return;
    onClose();
  };

  const publish = async () => {
    setAttempted(true);
    if (issues > 0) {
      const firstBad = Object.keys(problems.fields).map(Number).sort((a, b) => a - b)[0];
      if (firstBad !== undefined && !problems.name && !problems.code) {
        setOpen(firstBad);
        focusNext.current = firstBad;
      }
      return;
    }
    // The built-in columns go back in front of the extras: they are what the
    // service's own screen asks for, and the records table and the sheet
    // export read them from this same array.
    const clean = [...asked, ...cleanForSave(fields, builtIn)];
    const title = name.trim();
    setSaving(true);
    const res =
      mode === 'edit' && editing
        ? await updateOperationalSheet(editing.id, { title, cadence, description: description.trim(), fields: clean })
        : await addOperationalSheet({
            id: sheetIdFor(serviceCode),
            code: serviceCode,
            title,
            category: 'Custom Forms',
            iconName: 'ClipboardList',
            frequency: cadence,
            description: description.trim() || `${title} records`,
            fieldsCount: clean.length,
            tableTarget: `service_submission:${serviceCode}`,
            defaultShift: 'MORNING',
            isCustom: true,
            fieldsConfig: clean,
          });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      // The tick answers the press. It stays long enough to be read, then
      // the screen moves on by itself.
      setSaved(true);
      window.setTimeout(() => onSaved(mode === 'edit' && editing ? editing.id : sheetIdFor(serviceCode)), 600);
    }
  };

  // ------------------------------------------------------------------ guards
  if (editSheetId && !editing) {
    return (
      <Notice title="This form could not be found" body="It may still be loading, or it was switched off in Master Data." onBack={onClose} />
    );
  }
  const previewFields = fields.map((f) => ({ ...f, label: f.label.trim() || (f.type === 'section' ? 'Untitled section' : 'Untitled question') }));
  const sheetColumns = previewFields.filter((f) => f.type !== 'section');
  const dateLabel = new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // ------------------------------------------------------------------ render
  return (
    <div className="max-w-7xl mx-auto pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={cancel}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" /> Operational Sheets
          </button>
          <h1 className="mt-1 text-xl font-bold text-slate-900 truncate">{mode === 'edit' ? `Edit ${editing?.title}` : 'New form'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancel}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={saving || saved}
            className="press inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving
              </>
            ) : saved ? (
              <>
                <Check className="w-4 h-4" /> {mode === 'edit' ? 'Saved' : 'Published'}
              </>
            ) : mode === 'edit' ? (
              'Save changes'
            ) : (
              'Publish form'
            )}
          </button>
        </div>
      </div>

      {attempted && issues > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-(--r-card) border border-(--color-missing) bg-(--color-missing-tint) px-4 py-3 text-sm text-(--color-ink)">
          <AlertCircle className="w-4 h-4 mt-0.5 text-(--color-missing) shrink-0" />
          <span>
            Fix {issues === 1 ? '1 thing' : `${issues} things`} before {mode === 'edit' ? 'saving' : 'publishing'}. Each one is marked below.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Basics */}
          <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900">About this form</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="fb-name" className={LABEL}>Form name</label>
                <input
                  id="fb-name"
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="e.g. UPS battery check"
                  className={`${INPUT} ${shown.name ? 'border-(--color-missing)' : ''}`}
                />
                {shown.name && <p className="mt-1 text-[11px] text-(--color-missing)">{shown.name}</p>}
              </div>

              <div>
                <label htmlFor="fb-code" className={LABEL}>Service code</label>
                <input
                  id="fb-code"
                  value={serviceCode}
                  readOnly={mode === 'edit'}
                  onChange={(e) => {
                    setDirty(true);
                    setCodeEdited(true);
                    setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'));
                  }}
                  placeholder="UPS_BATTERY_CHECK"
                  className={`${INPUT} font-mono ${mode === 'edit' ? 'bg-slate-50 text-slate-600' : ''} ${shown.code ? 'border-(--color-missing)' : ''}`}
                />
                <p className={`mt-1 text-[11px] ${shown.code ? 'text-(--color-missing)' : 'text-slate-500'}`}>
                  {shown.code ?? (mode === 'edit' ? 'Fixed once a form is published.' : 'Used in Master Data and exports. It cannot change later.')}
                </p>
              </div>

              <div>
                <label htmlFor="fb-desc" className={LABEL}>Short description (optional)</label>
                <input
                  id="fb-desc"
                  value={description}
                  onChange={(e) => {
                    setDirty(true);
                    setDescription(e.target.value);
                  }}
                  placeholder="What the POC checks"
                  className={INPUT}
                />
              </div>

              <div className="sm:col-span-2">
                <span className={LABEL} id="fb-cadence">How often is it filed?</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-labelledby="fb-cadence">
                  {CADENCE_OPTIONS.map((c) => {
                    const picked = cadence === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={picked}
                        onClick={() => {
                          setDirty(true);
                          setCadence(c.value);
                        }}
                        className={`text-left p-3 rounded-xl border transition active:scale-[0.99] cursor-pointer ${
                          picked ? 'border-(--color-ink) bg-slate-50 shadow-xs' : 'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-3.5 h-3.5 rounded-full border-4 shrink-0 ${
                              picked ? 'border-(--color-ink) bg-white' : 'border-slate-300 bg-white'
                            }`}
                          />
                          <span className="text-sm font-semibold text-slate-900">{c.label}</span>
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-600">{c.hint}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">{c.effect}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Saved in Master Data as this service's <code className="font-mono text-slate-700">Cadence</code>, so the Control Room, the POC
                  desk and the Admin Service Hub all judge it the same way.
                </p>
              </div>
            </div>

            <p className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
              Appears on the POC desk at <strong className="text-slate-900 font-mono">{reach}</strong> of{' '}
              <span className="font-mono">{sites.length}</span> sites: those whose Services Enabled is ALL
              {serviceCode ? ` or includes ${serviceCode}` : ''}. POCs also need this service in their access in POC Master.
            </p>
          </section>

          {/* Start from */}
          <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900">Start from</h2>
            <p className="mt-0.5 text-xs text-slate-500">Load a ready set of questions, then change anything.</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FORM_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t.id)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] transition cursor-pointer"
                >
                  <span className="block text-sm font-semibold text-slate-900">{t.name}</span>
                  <span className="block mt-0.5 text-[11px] text-slate-500">{t.hint}</span>
                </button>
              ))}
            </div>
            {copySources.length > 0 && (
              <div className="mt-3">
                <label htmlFor="fb-copy" className={LABEL}>Or copy the questions of an existing form</label>
                <select
                  id="fb-copy"
                  value=""
                  onChange={(e) => e.target.value && copyFrom(e.target.value)}
                  className={`${INPUT} sm:max-w-sm`}
                >
                  <option value="">Choose a form</option>
                  {copySources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.fieldsConfig?.length} questions)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* The form usually exists as a sheet already. Its header row is
                the question list, so paste it instead of retyping it. */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <label htmlFor="fb-columns" className={LABEL}>Or paste the column names from your sheet</label>
              <textarea
                id="fb-columns"
                rows={2}
                value={columnText}
                onChange={(e) => setColumnText(e.target.value)}
                placeholder="Paste a header row: Date, Chiller temp, Door seal, Remarks, Photo"
                className={`${INPUT} h-auto py-2`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={addFromColumns}
                  disabled={parseList(columnText).length === 0}
                  className="h-9 px-3 rounded-lg text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-40 disabled:cursor-default active:scale-[0.98] transition cursor-pointer"
                >
                  Add {parseList(columnText).length || ''} {parseList(columnText).length === 1 ? 'question' : 'questions'}
                </button>
                <span className="text-[11px] text-slate-500">
                  Copy the header row out of Excel or Google Sheets. Tabs, commas or one per line all work, and each answer type is
                  guessed from the wording.
                </span>
              </div>
            </div>

            <ImportPanel onUse={useImported} hasQuestions={fields.length > 0} />
          </section>

          {/* What the screen already asks — so nobody adds it twice. */}
          {builtIn && asked.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs">
              <h2 className="text-sm font-semibold text-slate-900">
                Already asked on this screen <span className="ml-1 font-mono text-xs text-slate-500">{asked.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {editing?.title} collects these itself. A POC should never be asked for one of them twice, so they cannot be added
                again below.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {asked.map((f) => (
                  <li
                    key={f.key}
                    className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600"
                  >
                    {f.label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Questions */}
          <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {builtIn ? 'Extra questions' : 'Questions'}{' '}
                <span className="ml-1 font-mono text-xs text-slate-500">{fields.filter((f) => f.type !== 'section').length}</span>
              </h2>
              {fields.length > 0 && (
                <button
                  type="button"
                  onClick={downloadJson}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  title="Download the questions as JSON, to keep or to paste into another form"
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
              )}
            </div>
            {builtIn && (
              <p className="mt-1 text-xs text-slate-500">
                Only what you add here is asked at the end of {editing?.title}, on top of what it already collects. It shows in
                Records and in exports, but is not copied into the Google Sheet, whose columns are fixed.
              </p>
            )}
            {shown.form && <p className="mt-1 text-xs text-(--color-missing)">{shown.form}</p>}

            {fields.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
                {builtIn
                  ? 'No extra questions yet. Pick an answer type below to add one.'
                  : 'No questions yet. Pick an answer type below, or start from a ready set above.'}
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {fields.map((f, i) => {
                  const Icon = TYPE_ICON[f.type] ?? Type;
                  const expanded = open === i;
                  const problem = shown.fields[i];
                  const isSaved = savedKeys.has(f.key);
                  return (
                    <li
                      key={`${f.key}-${i}`}
                      onDragOver={(e) => {
                        if (dragFrom === null) return;
                        e.preventDefault();
                        setDragOver(i);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropAt(i);
                      }}
                      className={`rounded-xl border transition ${
                        dragOver === i && dragFrom !== i ? 'border-teal-500 ring-2 ring-teal-100' : ''
                      } ${dragFrom === i ? 'opacity-50' : ''} ${
                        f.type === 'section' ? 'bg-slate-50' : ''
                      } ${
                        problem ? 'border-(--color-missing)' : expanded ? 'border-slate-400 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1 p-2">
                        <span
                          draggable
                          onDragStart={(e) => {
                            setDragFrom(i);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(i));
                          }}
                          onDragEnd={() => {
                            setDragFrom(null);
                            setDragOver(null);
                          }}
                          title="Drag to reorder"
                          className="hidden sm:flex w-5 h-8 items-center justify-center text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : i)}
                          aria-expanded={expanded}
                          className="flex-1 min-w-0 flex items-center gap-3 px-1 py-1 text-left cursor-pointer"
                        >
                          <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={`block text-sm truncate ${
                                f.type === 'section'
                                  ? 'font-bold uppercase tracking-wide text-[12px] text-teal-800'
                                  : f.label.trim()
                                    ? 'font-medium text-slate-900'
                                    : 'text-slate-500'
                              }`}
                            >
                              {f.type === 'section' ? f.label.trim() || 'Untitled section' : `${i + 1}. ${f.label.trim() || 'Untitled question'}`}
                            </span>
                            <span className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                              {fieldTypeLabel(f.type)}
                              {f.required ? ', required' : ''}
                              {f.showIf && (
                                <span className="px-1.5 py-px rounded bg-indigo-50 text-indigo-700 font-semibold">
                                  only if {fields.find((x) => x.key === f.showIf?.field)?.label || f.showIf.field} = {f.showIf.equals.join(' / ')}
                                </span>
                              )}
                              {f.followUp && (
                                <span className={`px-1.5 py-px rounded font-semibold ${f.followUp.issue ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {f.followUp.when.join(' / ')} → {[f.followUp.comment !== 'off' && 'comment', f.followUp.photo !== 'off' && 'photo', f.followUp.issue && 'issue']
                                    .filter(Boolean)
                                    .join(', ')}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                        <button type="button" className={ICON_BUTTON} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button type="button" className={ICON_BUTTON} onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button type="button" className={`${ICON_BUTTON} hidden sm:flex`} onClick={() => duplicate(i)} aria-label="Duplicate">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button type="button" className={`${ICON_BUTTON} hover:text-(--color-missing)`} onClick={() => remove(i)} aria-label="Delete question">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                      </div>
                      {problem && <p className="px-4 pb-2 -mt-1 text-[11px] text-(--color-missing)">{problem}</p>}

                      {expanded && (
                        <div className="animate-settle border-t border-slate-100 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label htmlFor={`fb-q-${i}`} className={LABEL}>{f.type === 'section' ? 'Section heading' : 'Question'}</label>
                            <input
                              id={`fb-q-${i}`}
                              ref={(el) => {
                                if (el) labelInputs.current.set(i, el);
                                else labelInputs.current.delete(i);
                              }}
                              value={f.label}
                              onChange={(e) => updateField(i, { label: e.target.value })}
                              placeholder={f.type === 'section' ? 'e.g. Pump room' : 'e.g. Battery voltage'}
                              className={INPUT}
                            />
                          </div>

                          <div>
                            <label htmlFor={`fb-t-${i}`} className={LABEL}>Answer type</label>
                            <select id={`fb-t-${i}`} value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })} className={INPUT}>
                              {FIELD_TYPES.map((t) => (
                                <option key={t.type} value={t.type}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {f.type !== 'section' && (
                            <div className="flex items-end gap-5 pb-1.5">
                              <Switch label="Required" checked={f.required} onChange={(v) => updateField(i, { required: v })} />
                              <Switch label="Critical" checked={f.isCritical === true} onChange={(v) => updateField(i, { isCritical: v || undefined })} />
                            </div>
                          )}

                          <div className="sm:col-span-2">
                            <label htmlFor={`fb-h-${i}`} className={LABEL}>Help text (optional)</label>
                            <input
                              id={`fb-h-${i}`}
                              value={f.helperText ?? ''}
                              onChange={(e) => updateField(i, { helperText: e.target.value })}
                              placeholder="Shown under the question, e.g. Read it from the main panel"
                              className={INPUT}
                            />
                          </div>

                          {f.type !== 'evidence' && f.type !== 'section' && (
                            <div className="sm:col-span-2">
                              <label htmlFor={`fb-d-${i}`} className={LABEL}>Starts with (optional)</label>
                              {f.type === 'select' ? (
                                <select
                                  id={`fb-d-${i}`}
                                  value={String(f.defaultValue ?? '')}
                                  onChange={(e) => updateField(i, { defaultValue: e.target.value || undefined })}
                                  className={INPUT}
                                >
                                  <option value="">Nothing chosen</option>
                                  {(f.options ?? []).filter(Boolean).map((o) => (
                                    <option key={o} value={o}>{o}</option>
                                  ))}
                                </select>
                              ) : f.type === 'boolean' ? (
                                <select
                                  id={`fb-d-${i}`}
                                  value={String(f.defaultValue ?? '')}
                                  onChange={(e) => updateField(i, { defaultValue: e.target.value || undefined })}
                                  className={INPUT}
                                >
                                  <option value="">Nothing chosen</option>
                                  <option value="Yes">Yes</option>
                                  <option value="No">No</option>
                                </select>
                              ) : (
                                <input
                                  id={`fb-d-${i}`}
                                  type={isNumericType(f.type) ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
                                  step="any"
                                  value={String(f.defaultValue ?? '')}
                                  onChange={(e) => updateField(i, { defaultValue: e.target.value === '' ? undefined : e.target.value })}
                                  placeholder={isNumericType(f.type) ? 'e.g. 100' : 'Left empty'}
                                  className={INPUT}
                                />
                              )}
                              <p className="mt-1 text-[11px] text-slate-500">
                                The answer the form opens with. Useful when it is nearly always the same, like 100%.
                              </p>
                            </div>
                          )}

                          {isNumericType(f.type) && (
                            <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                              <div>
                                <label htmlFor={`fb-u-${i}`} className={LABEL}>Unit</label>
                                <input id={`fb-u-${i}`} value={f.unit ?? ''} onChange={(e) => updateField(i, { unit: e.target.value })} placeholder="V, L, kWh" className={INPUT} />
                              </div>
                              {(['min', 'max'] as const).map((bound) => (
                                <div key={bound}>
                                  <label htmlFor={`fb-${bound}-${i}`} className={LABEL}>{bound === 'min' ? 'Lowest allowed' : 'Highest allowed'}</label>
                                  <input
                                    id={`fb-${bound}-${i}`}
                                    type="number"
                                    step="any"
                                    value={f[bound] ?? ''}
                                    onChange={(e) => updateField(i, { [bound]: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    placeholder={f.type === 'percentage' ? (bound === 'min' ? '0' : '100') : 'None'}
                                    className={INPUT}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {f.type === 'select' && (
                            <OptionsEditor index={i} options={f.options ?? []} onChange={(options) => updateField(i, { options })} />
                          )}

                          {canBranchOn(f) && (
                            <FollowUpEditor field={f} onChange={(followUp) => updateField(i, { followUp })} />
                          )}

                          <ShowIfEditor
                            field={f}
                            earlier={fields.slice(0, i).filter((x) => canBranchOn(x) && x.label.trim())}
                            onChange={(showIf) => updateField(i, { showIf })}
                          />

                          <p className="sm:col-span-2 text-[11px] text-slate-500">
                            Saved as <code className="font-mono text-slate-700">{f.key}</code>
                            {isSaved ? '. Kept as it is so past entries stay linked.' : '.'}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700">Add a question</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FIELD_TYPES.map((t) => {
                  const Icon = TYPE_ICON[t.type];
                  return (
                    <button
                      key={t.type}
                      type="button"
                      title={t.hint}
                      onClick={() => addField(t.type)}
                      className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Preview, either way round: the form a POC fills, or the sheet it becomes. */}
        <aside className="lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-600">Preview</span>
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg" role="group" aria-label="Preview as">
              {(
                [
                  ['form', 'Form', Smartphone],
                  ['sheet', 'Sheet', Table],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={previewMode === value}
                  onClick={() => setPreviewMode(value)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                    previewMode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-(--r-card) border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-base font-semibold text-slate-900 truncate">{name.trim() || 'Untitled form'}</p>
              <p className="text-xs text-slate-500">
                {previewMode === 'form' ? `Their site, ${dateLabel}` : `${sheetColumns.length + 3} columns in Records and in exports`}
              </p>
            </div>

            {previewMode === 'form' ? (
              <>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                  {previewFields.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500">Questions you add appear here.</p>
                  ) : (
                    <ServiceFieldList
                      fields={previewFields}
                      values={tryValues}
                      onValue={(k, v) => setTryValues((p) => ({ ...p, [k]: v }))}
                      evidence={tryEvidence}
                      onEvidence={(k, v) => setTryEvidence((p) => ({ ...p, [k]: v }))}
                      serviceCode={serviceCode || 'NEW'}
                      preview
                      idPrefix="preview"
                    />
                  )}
                </div>
                <div className="p-4 pt-0">
                  <button type="button" disabled className="w-full h-11 rounded-xl bg-(--color-ink) text-white text-sm font-semibold opacity-80">
                    File {name.trim() || 'form'}
                  </button>
                </div>
              </>
            ) : previewFields.length === 0 ? (
              <p className="p-4 py-8 text-center text-xs text-slate-500">Questions you add become columns here.</p>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      {['Date', 'Site', ...sheetColumns.map((f) => f.label), 'Filed by'].map((head, i) => (
                        <th
                          key={`${head}-${i}`}
                          className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-700">
                      <td className="px-3 py-2 whitespace-nowrap">{currentDate}</td>
                      <td className="px-3 py-2 whitespace-nowrap">Their site</td>
                      {sheetColumns.map((f) => (
                        <td key={f.key} className="px-3 py-2 whitespace-nowrap text-slate-500">
                          {sampleValue(f, currentDate)}
                        </td>
                      ))}
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">The POC</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {previewMode === 'form'
              ? 'Try the answers here. Nothing is saved from the preview.'
              : 'One row per filing. Date, Site and Filed by are added for you.'}
          </p>
        </aside>
      </div>
    </div>
  );
};

/** What one answer looks like in the sheet preview. */
function sampleValue(field: FieldDefinition, today: string): string {
  if (field.defaultValue !== undefined && field.defaultValue !== '') return String(field.defaultValue);
  switch (field.type) {
    case 'number':
      return field.unit ? `12 ${field.unit}` : '12';
    case 'percentage':
      return '100';
    case 'temperature':
      return '4';
    case 'boolean':
      return 'Yes';
    case 'select':
      return field.options?.find(Boolean) ?? 'One option';
    case 'date':
      return today;
    case 'time':
      return '09:30';
    case 'evidence':
      return 'Drive link';
    case 'section':
      return '';
    case 'textarea':
      return 'Any remarks';
    default:
      return 'Text';
  }
}

const Switch: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer"
  >
    <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-(--color-ink)' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </span>
    {label}
  </button>
);

const OptionsEditor: React.FC<{ index: number; options: string[]; onChange: (options: string[]) => void }> = ({ index, options, onChange }) => {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusLast = useRef(false);
  useEffect(() => {
    if (!focusLast.current) return;
    inputs.current[options.length - 1]?.focus();
    focusLast.current = false;
  });
  const add = () => {
    focusLast.current = true;
    onChange([...options, '']);
  };

  return (
    <div className="sm:col-span-2">
      <span className={LABEL}>Options</span>
      <ul className="space-y-2">
        {options.map((o, j) => (
          <li key={j} className="flex items-center gap-2">
            <span className="w-5 text-right text-[11px] font-mono text-slate-500">{j + 1}</span>
            <input
              ref={(el) => {
                inputs.current[j] = el;
              }}
              aria-label={`Option ${j + 1}`}
              value={o}
              onChange={(e) => onChange(options.map((x, k) => (k === j ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={`Option ${j + 1}`}
              className={INPUT}
            />
            <button
              type="button"
              className={ICON_BUTTON}
              onClick={() => onChange(options.filter((_, k) => k !== j))}
              disabled={options.length <= 1}
              aria-label={`Remove option ${j + 1}`}
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          id={`fb-add-option-${index}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add option
        </button>
        <button
          type="button"
          onClick={() => setPasting((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <Table className="w-3.5 h-3.5" /> Paste a list
        </button>
      </div>
      {pasting && (
        <div className="mt-2">
          <textarea
            rows={2}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Good, Needs repair, Not working"
            aria-label="Paste options"
            className={`${INPUT} h-auto py-2`}
          />
          <button
            type="button"
            onClick={() => {
              const list = parseList(pasted, 200);
              if (!list.length) return;
              onChange(list);
              setPasted('');
              setPasting(false);
            }}
            disabled={parseList(pasted, 200).length === 0}
            className="mt-2 h-8 px-3 rounded-lg text-xs font-semibold text-white bg-(--color-ink) disabled:opacity-40 disabled:cursor-default active:scale-[0.98] transition cursor-pointer"
          >
            Replace with these
          </button>
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">Press Enter to add the next option.</p>
    </div>
  );
};

/** Picks answers of a fixed-answer question, as toggle chips. */
const AnswerChips: React.FC<{ answers: string[]; picked: string[]; onChange: (picked: string[]) => void; tone?: 'rose' | 'indigo' }> = ({
  answers,
  picked,
  onChange,
  tone = 'indigo',
}) => (
  <div className="flex flex-wrap gap-1.5">
    {answers.map((a) => {
      const on = picked.includes(a);
      return (
        <button
          key={a}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? picked.filter((x) => x !== a) : [...picked, a])}
          className={`h-8 px-3 rounded-lg border text-xs font-semibold transition active:scale-[0.97] cursor-pointer ${
            on
              ? tone === 'rose'
                ? 'bg-rose-50 border-rose-400 text-rose-700'
                : 'bg-indigo-50 border-indigo-400 text-indigo-700'
              : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
          }`}
        >
          {a}
        </button>
      );
    })}
  </div>
);

const LEVEL_LABEL = { off: 'Off', optional: 'Optional', required: 'Required' } as const;

const Levels: React.FC<{ label: string; value: 'off' | 'optional' | 'required'; onChange: (v: 'off' | 'optional' | 'required') => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div>
    <span className={LABEL}>{label}</span>
    <div className="inline-flex p-0.5 bg-slate-100 rounded-lg" role="radiogroup" aria-label={label}>
      {(['off', 'optional', 'required'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-7 px-2.5 rounded-md text-xs font-semibold transition cursor-pointer ${
            value === v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {LEVEL_LABEL[v]}
        </button>
      ))}
    </div>
  </div>
);

/**
 * What an answer opens: e.g. "No" asks why, takes a photo, and is reported
 * as an issue. Only Yes/No and dropdown questions have fixed answers to hang
 * it on.
 */
const FollowUpEditor: React.FC<{ field: FieldDefinition; onChange: (fu: FieldDefinition['followUp']) => void }> = ({ field, onChange }) => {
  const fu = field.followUp;
  const answers = answersOf(field);
  const on = Boolean(fu);
  const set = (patch: Partial<NonNullable<FieldDefinition['followUp']>>) =>
    onChange({ when: [], comment: 'required', photo: 'optional', issue: true, ...fu, ...patch });

  return (
    <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Follow-up on an answer
        </span>
        <Switch
          label={on ? 'On' : 'Off'}
          checked={on}
          onChange={(v) =>
            onChange(
              v
                ? { when: field.type === 'boolean' ? ['No'] : answers.slice(-1), comment: 'required', photo: 'optional', issue: true }
                : undefined,
            )
          }
        />
      </div>
      {!on ? (
        <p className="text-[11px] text-slate-500">
          e.g. when the answer is <strong>No</strong>, ask why and for a photo, and report it as an issue.
        </p>
      ) : (
        <>
          <div>
            <span className={LABEL}>When the answer is</span>
            <AnswerChips answers={answers} picked={fu!.when} onChange={(when) => set({ when })} tone="rose" />
          </div>
          <div className="flex flex-wrap gap-4">
            <Levels label="Ask for a comment" value={fu!.comment} onChange={(comment) => set({ comment })} />
            <Levels label="Ask for a photo" value={fu!.photo} onChange={(photo) => set({ photo })} />
          </div>
          {fu!.comment !== 'off' && (
            <div>
              <label className={LABEL}>What the comment box asks (optional)</label>
              <input
                value={fu!.prompt ?? ''}
                onChange={(e) => set({ prompt: e.target.value || undefined })}
                placeholder="Why? Say what is wrong — which unit, where."
                className={INPUT}
              />
            </div>
          )}
          <Switch label="Report it as an issue (entry marked CRITICAL, admins alerted)" checked={fu!.issue} onChange={(issue) => set({ issue })} />
        </>
      )}
    </div>
  );
};

/** Ask this question only when an earlier Yes/No or dropdown answer matches. */
const ShowIfEditor: React.FC<{
  field: FieldDefinition;
  earlier: FieldDefinition[];
  onChange: (showIf: FieldDefinition['showIf']) => void;
}> = ({ field, earlier, onChange }) => {
  const cond = field.showIf;
  const parent = earlier.find((x) => x.key === cond?.field);
  if (earlier.length === 0 && !cond) return null;
  return (
    <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <GitBranch className="w-3.5 h-3.5 text-indigo-600" /> {field.type === 'section' ? 'Show this section' : 'Ask this question'}
      </span>
      <select
        value={cond?.field ?? ''}
        onChange={(e) => {
          const next = earlier.find((x) => x.key === e.target.value);
          onChange(next ? { field: next.key, equals: answersOf(next).slice(0, 1) } : undefined);
        }}
        className={INPUT}
        aria-label="Depends on"
      >
        <option value="">Always</option>
        {earlier.map((x) => (
          <option key={x.key} value={x.key}>
            Only when “{x.label}” is…
          </option>
        ))}
      </select>
      {cond && parent && (
        <AnswerChips answers={answersOf(parent)} picked={cond.equals} onChange={(equals) => onChange({ field: cond.field, equals })} />
      )}
      {cond && !parent && <p className="text-[11px] text-(--color-missing)">The question this depended on is gone or now comes later.</p>}
    </div>
  );
};

/**
 * Paste (or open) a form from elsewhere — an HTML page or JSON an AI
 * assistant wrote, an exported form — and see what it becomes before using it.
 */
const ImportPanel: React.FC<{ onUse: (result: ImportResult, how: 'replace' | 'append') => boolean; hasQuestions: boolean }> = ({
  onUse,
  hasQuestions,
}) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const read = (value: string) => {
    const parse = typeof DOMParser !== 'undefined' ? (html: string) => new DOMParser().parseFromString(html, 'text/html') : undefined;
    setResult(importForm(value, parse));
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    read(content);
  };
  const use = (how: 'replace' | 'append') => {
    if (result && onUse(result, how)) {
      setText('');
      setResult(null);
    }
  };

  const questions = result?.fields.filter((f) => f.type !== 'section') ?? [];
  const sections = result?.fields.filter((f) => f.type === 'section').length ?? 0;
  const followUps = questions.filter((f) => f.followUp).length;
  const branches = result?.fields.filter((f) => f.showIf).length ?? 0;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <label htmlFor="fb-import" className={`${LABEL} flex items-center gap-1.5`}>
        <FileCode2 className="w-3.5 h-3.5 text-slate-500" /> Or paste a form as HTML or JSON
      </label>
      <textarea
        id="fb-import"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        placeholder={'Paste the HTML page or JSON an AI assistant made for you, e.g.\n{ "title": "UPS check", "questions": [ { "label": "Any alarms?", "type": "yes/no" } ] }'}
        className={`${INPUT} h-auto py-2 font-mono text-[11px]`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => read(text)}
          disabled={!text.trim()}
          className="h-9 px-3 rounded-lg text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-40 disabled:cursor-default active:scale-[0.98] transition cursor-pointer"
        >
          Read the form
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" /> Open a file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".html,.htm,.json,.txt,text/html,application/json"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <span className="text-[11px] text-slate-500">Nothing in it is run — the questions are only read.</span>
      </div>

      {result && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          {questions.length === 0 ? (
            <p className="text-xs text-(--color-missing)">{result.notes[0] ?? 'No questions were found.'}</p>
          ) : (
            <>
              <p className="text-xs text-slate-800">
                Found <strong>{questions.length}</strong> {questions.length === 1 ? 'question' : 'questions'}
                {result.title ? <> in “{result.title}”</> : null}
                {sections ? <>, {sections} {sections === 1 ? 'section' : 'sections'}</> : null}
                {followUps ? <>, {followUps} with a follow-up</> : null}
                {branches ? <>, {branches} shown only after an answer</> : null}.
              </p>
              <ol className="max-h-40 overflow-y-auto text-[11px] text-slate-600 space-y-0.5">
                {result.fields.map((f, n) => (
                  <li key={`${f.key}-${n}`} className={f.type === 'section' ? 'pt-1 font-bold uppercase tracking-wide text-teal-800' : 'pl-2'}>
                    {f.type === 'section' ? f.label : `${f.label} — ${fieldTypeLabel(f.type)}${f.required ? ', required' : ''}`}
                  </li>
                ))}
              </ol>
              {result.notes.map((n) => (
                <p key={n} className="text-[11px] text-amber-700">{n}</p>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => use('replace')}
                  className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) active:scale-[0.98] transition cursor-pointer"
                >
                  {hasQuestions ? 'Replace my questions' : 'Use these questions'}
                </button>
                {hasQuestions && (
                  <button
                    type="button"
                    onClick={() => use('append')}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                  >
                    Add them to the end
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Notice: React.FC<{ title: string; body: string; onBack: () => void }> = ({ title, body, onBack }) => (
  <div className="max-w-md mx-auto mt-10 bg-white border border-slate-200 rounded-(--r-card) p-8 text-center">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <p className="mt-1 text-xs text-slate-500">{body}</p>
    <button
      type="button"
      onClick={onBack}
      className="mt-4 h-9 px-4 rounded-lg bg-(--color-ink) text-white text-xs font-semibold active:scale-[0.98] transition cursor-pointer"
    >
      Back to Operational Sheets
    </button>
  </div>
);
