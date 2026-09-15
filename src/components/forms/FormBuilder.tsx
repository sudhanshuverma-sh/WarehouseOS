import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  Clock,
  Copy,
  Hash,
  Link2,
  List,
  Percent,
  Plus,
  Smartphone,
  Thermometer,
  Trash2,
  Type,
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
  OWN_SCREEN_SERVICES,
  blankField,
  cleanForSave,
  fieldKeyFrom,
  fieldTypeLabel,
  isNumericType,
  problemCount,
  serviceCodeFrom,
  validateDraft,
  withType,
  type DraftProblems,
} from '../../lib/services/formBuilder';
import type { EvidenceValue } from '../common/EvidenceInput';
import { ServiceFieldList } from './ServiceFieldList';

/**
 * Form builder: create a new operational form POCs fill, or change the
 * questions of an existing one.
 *
 * Left, the form: name, how often it is filed, and its questions. Right, a
 * live preview rendered by the same component the POC desk uses. Publishing
 * creates the Service_Registry row and its questions (service_form); editing
 * keeps each saved question's internal name, so past entries stay linked.
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

  const [name, setName] = useState(registered?.Service_Name || editing?.title || '');
  const [code, setCode] = useState(editCode);
  const [codeEdited, setCodeEdited] = useState(false);
  const [cadence, setCadence] = useState<Cadence>(registered?.Cadence ?? (editing ? cadenceFor(editing.frequency) : 'DAILY'));
  const [description, setDescription] = useState(editing?.description ?? '');
  const [fields, setFields] = useState<FieldDefinition[]>(() => (editing?.fieldsConfig ?? []).map((f) => ({ ...f })));
  const [open, setOpen] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tryValues, setTryValues] = useState<Record<string, unknown>>({});
  const [tryEvidence, setTryEvidence] = useState<Record<string, EvidenceValue | null>>({});

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
    () => validateDraft({ name, code: serviceCode, fields }, existingCodes, mode),
    [name, serviceCode, fields, existingCodes, mode],
  );
  const shown = attempted ? problems : NO_PROBLEMS;
  const issues = problemCount(problems);

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const reach = sites.filter((s) => s.services === 'ALL' || (serviceCode !== '' && s.services.includes(serviceCode))).length;
  const copySources = operationalSheets.filter(
    (s) => s.id !== editing?.id && (s.fieldsConfig?.length ?? 0) > 0 && !OWN_SCREEN_SERVICES.has(serviceCodeFor(s.id)),
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
    setFields((prev) =>
      prev.map((f, j) => {
        if (j !== i) return f;
        let next = patch.type && patch.type !== f.type ? withType(f, patch.type) : { ...f, ...patch };
        // New questions take their saved name from the wording; saved ones keep theirs.
        if (patch.label !== undefined && !savedKeys.has(f.key)) next = { ...next, key: fieldKeyFrom(patch.label, taken(prev, i)) };
        return next;
      }),
    );
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
      const copy = { ...source, label, key: fieldKeyFrom(label, taken(prev)), options: source.options && [...source.options] };
      if (!copy.options) delete copy.options;
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    setOpen(i + 1);
    focusNext.current = i + 1;
  };

  const remove = (i: number) => {
    setDirty(true);
    setFields((prev) => prev.filter((_, j) => j !== i));
    setOpen(null);
  };

  const replaceQuestions = (list: FieldDefinition[]) => {
    if (fields.length && dirty && !window.confirm('Replace the questions you have now?')) return false;
    const keys: string[] = [...savedKeys];
    const next = list.map((f) => {
      // Reuse a saved name only when it is free; never collide with one.
      const key = savedKeys.has(f.key) || keys.includes(f.key) ? fieldKeyFrom(f.label, keys) : f.key;
      keys.push(key);
      return { ...f, key, options: f.options && [...f.options] };
    });
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
    const clean = cleanForSave(fields);
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
      onSaved(mode === 'edit' && editing ? editing.id : sheetIdFor(serviceCode));
    }
  };

  // ------------------------------------------------------------------ guards
  if (editSheetId && !editing) {
    return (
      <Notice title="This form could not be found" body="It may still be loading, or it was switched off in Master Data." onBack={onClose} />
    );
  }
  if (editing && OWN_SCREEN_SERVICES.has(editCode)) {
    return (
      <Notice
        title={`${editing.title} has its own screen`}
        body="Its questions are built into that screen, so they are not edited here."
        onBack={onClose}
      />
    );
  }

  const previewFields = fields.map((f) => ({ ...f, label: f.label.trim() || 'Untitled question' }));
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
            disabled={saving}
            className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) disabled:opacity-60 active:scale-[0.98] transition cursor-pointer whitespace-nowrap"
          >
            {saving ? 'Saving' : mode === 'edit' ? 'Save changes' : 'Publish form'}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl" role="radiogroup" aria-labelledby="fb-cadence">
                  {CADENCE_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={cadence === c.value}
                      onClick={() => {
                        setDirty(true);
                        setCadence(c.value);
                      }}
                      className={`h-9 rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                        cadence === c.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{CADENCE_OPTIONS.find((c) => c.value === cadence)?.hint}</p>
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
          </section>

          {/* Questions */}
          <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900">
              Questions <span className="ml-1 font-mono text-xs text-slate-500">{fields.length}</span>
            </h2>
            {shown.form && <p className="mt-1 text-xs text-(--color-missing)">{shown.form}</p>}

            {fields.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
                No questions yet. Pick an answer type below, or start from a ready set above.
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
                      className={`rounded-xl border transition ${
                        problem ? 'border-(--color-missing)' : expanded ? 'border-slate-400 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1 p-2">
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
                            <span className={`block text-sm truncate ${f.label.trim() ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                              {i + 1}. {f.label.trim() || 'Untitled question'}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              {fieldTypeLabel(f.type)}
                              {f.required ? ', required' : ''}
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
                            <label htmlFor={`fb-q-${i}`} className={LABEL}>Question</label>
                            <input
                              id={`fb-q-${i}`}
                              ref={(el) => {
                                if (el) labelInputs.current.set(i, el);
                                else labelInputs.current.delete(i);
                              }}
                              value={f.label}
                              onChange={(e) => updateField(i, { label: e.target.value })}
                              placeholder="e.g. Battery voltage"
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

                          <div className="flex items-end gap-5 pb-1.5">
                            <Switch label="Required" checked={f.required} onChange={(v) => updateField(i, { required: v })} />
                            <Switch label="Critical" checked={f.isCritical === true} onChange={(v) => updateField(i, { isCritical: v || undefined })} />
                          </div>

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

        {/* Preview */}
        <aside className="lg:sticky lg:top-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-600">
            <Smartphone className="w-4 h-4" /> What the POC sees
          </div>
          <div className="rounded-(--r-card) border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <p className="text-base font-semibold text-slate-900 truncate">{name.trim() || 'Untitled form'}</p>
              <p className="text-xs text-slate-500">Their site, {dateLabel}</p>
            </div>
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
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Try the answers here. Nothing is saved from the preview.</p>
        </aside>
      </div>
    </div>
  );
};

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
      <button
        type="button"
        onClick={add}
        id={`fb-add-option-${index}`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add option
      </button>
      <p className="mt-1 text-[11px] text-slate-500">Press Enter to add the next option.</p>
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
