/**
 * The form builder's rules, kept apart from the screen.
 *
 * A new operational form is a Service_Registry row plus a list of questions
 * (service_form.fields). These helpers name questions, check a draft before
 * it is published, and tidy it for saving. The checks mirror what the API's
 * cleanFormFields refuses, so a draft that passes here is not bounced by the
 * server for a reason the builder could have shown next to the question.
 */

import type { FieldDefinition, FieldType } from '../../types';
import type { Cadence } from '../../types/masterData';

export const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SERVICE_CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Services that come with a screen of their own.
 *
 * The builder still edits these: what it edits is the EXTRA questions. The
 * built-in ones are part of that screen (the 43 point checklist, the diesel
 * request, the EB-DG meters) and are not the builder's to rewrite, but a
 * question added later is stored beside them and shown at the end of the
 * form, so every service can gain a column.
 */
export const BUILT_IN_FORM_SERVICES: ReadonlySet<string> = new Set(['SITE_ACTIVITY', 'DIESEL', 'EB_DG', 'HOUSEKEEPING', 'WASHING', 'ADHOC', 'FIRE']);

/**
 * The two halves of one of those services' `fieldsConfig`.
 *
 * A built-in column is a description of what that screen already asks — the
 * diesel request's rate and quantity, the report's 43 points. Asking a POC
 * for one of those again is the bug this split exists to prevent, so only
 * `extraFields` is ever rendered as a question at the end of a screen.
 */
export const extraFields = (fields: readonly FieldDefinition[] = []): FieldDefinition[] => fields.filter((f) => f.isExtra === true);

export const builtInFields = (fields: readonly FieldDefinition[] = []): FieldDefinition[] => fields.filter((f) => f.isExtra !== true);

export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  hint: string;
}

export const FIELD_TYPES: readonly FieldTypeInfo[] = [
  { type: 'text', label: 'Short answer', hint: 'A name, ID or a few words' },
  { type: 'textarea', label: 'Long answer', hint: 'Remarks and observations' },
  { type: 'number', label: 'Number', hint: 'Readings, counts, litres' },
  { type: 'percentage', label: 'Percentage', hint: 'A value from 0 to 100' },
  { type: 'temperature', label: 'Temperature', hint: 'Degrees Celsius' },
  { type: 'boolean', label: 'Yes / No', hint: 'Two buttons' },
  { type: 'select', label: 'Dropdown', hint: 'Pick one of your options' },
  { type: 'date', label: 'Date', hint: 'A calendar date' },
  { type: 'time', label: 'Time', hint: '24-hour time' },
  { type: 'evidence', label: 'Attach link', hint: 'A Google Drive link to a photo or file' },
];

export const fieldTypeLabel = (type: FieldType) => FIELD_TYPES.find((t) => t.type === type)?.label ?? type;

export const isNumericType = (type: FieldType) => type === 'number' || type === 'percentage' || type === 'temperature';

export interface CadenceOption {
  value: Cadence;
  label: string;
  /** What it means for the person filing it. */
  hint: string;
  /** What it means on the Control Room and the POC desk. */
  effect: string;
}

export const CADENCE_OPTIONS: readonly CadenceOption[] = [
  {
    value: 'DAILY',
    label: 'Every day',
    hint: 'A reading or check that happens daily, like a meter or a temperature.',
    effect: 'Shows as pending at every site until it is filed that day.',
  },
  {
    value: 'WEEKLY',
    label: 'Every week',
    hint: 'Filed once between Monday and Sunday, like a safety walk.',
    effect: 'Shows as pending until someone files it that week.',
  },
  {
    value: 'MONTHLY',
    label: 'Every month',
    hint: 'Filed once in the calendar month, like a service visit.',
    effect: 'Shows as pending until someone files it that month.',
  },
  {
    value: 'EVENT_DRIVEN',
    label: 'When needed',
    hint: 'No fixed day. It is filled in when the event happens, like a breakdown, a delivery or an ad-hoc job.',
    effect: 'Never shows as pending. The screens count how many were filed instead.',
  },
];

export const cadenceLabel = (cadence: Cadence) => CADENCE_OPTIONS.find((c) => c.value === cadence)?.label ?? cadence;

const isFiniteNumber = (v: unknown) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/** 'Chiller Temp (°C)' → 'chillerTempC', made unique against `taken`. */
export function fieldKeyFrom(label: string, taken: Iterable<string>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  if (!/^[A-Za-z]/.test(base)) base = `field${base}`;
  base = base.slice(0, 56);
  const used = new Set(taken);
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}${n}`;
  return key;
}

/** 'Cold Room / Chiller log' → 'COLD_ROOM_CHILLER_LOG'. */
export function serviceCodeFrom(name: string): string {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!code) return '';
  return /^[A-Z]/.test(code) ? code : `S_${code}`;
}

/** A question switched to another answer type, keeping what still applies. */
export function withType(field: FieldDefinition, type: FieldType): FieldDefinition {
  const next: FieldDefinition = { ...field, type };
  if (type === 'select') {
    if (!next.options?.length) next.options = ['Option 1', 'Option 2'];
  } else {
    delete next.options;
  }
  if (!isNumericType(type)) {
    delete next.unit;
    delete next.min;
    delete next.max;
  }
  if (type === 'percentage' && !next.unit) next.unit = '%';
  if (type === 'temperature' && !next.unit) next.unit = '°C';
  if (type !== field.type) delete next.defaultValue;
  return next;
}

export const blankField = (type: FieldType, taken: Iterable<string>): FieldDefinition =>
  withType({ key: fieldKeyFrom('', taken), label: '', type: 'text', required: false }, type);

export interface FormDraft {
  name: string;
  code: string;
  fields: FieldDefinition[];
}

export interface DraftProblems {
  name?: string;
  code?: string;
  form?: string;
  /** Question index → what is wrong with it. */
  fields: Record<number, string>;
}

export const problemCount = (p: DraftProblems) =>
  [p.name, p.code, p.form].filter(Boolean).length + Object.keys(p.fields).length;

function fieldProblem(f: FieldDefinition, seen: Set<string>, asked: Map<string, string>): string | undefined {
  if (!f.label.trim()) return 'Write the question.';
  if (!FIELD_KEY.test(f.key)) return 'This question has an invalid saved name.';
  if (seen.has(f.key)) return 'Two questions share the same saved name.';
  const already = asked.get(f.key.toLowerCase()) ?? asked.get(f.label.trim().toLowerCase());
  if (already) return `This screen already asks for “${already}”. Nobody should have to fill it twice.`;
  if (f.type === 'select') {
    const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (!options.length) return 'Add at least one option.';
    if (new Set(options).size !== options.length) return 'Each option must be different.';
  }
  if (isNumericType(f.type) && isFiniteNumber(f.min) && isFiniteNumber(f.max) && Number(f.min) > Number(f.max)) {
    return 'The minimum is larger than the maximum.';
  }
  return undefined;
}

/** What the service being edited already is, which changes what a draft needs. */
export interface DraftContext {
  /** The columns the service's own screen already puts on the page. */
  asked?: readonly FieldDefinition[];
  /**
   * The service has a screen of its own. It may carry no extra questions at
   * all: its screen is already a form, so "add at least one question" would
   * mean the name, the cadence and the description could never be changed.
   */
  builtIn?: boolean;
}

/**
 * Everything that would stop a draft being published. Codes are checked only
 * when creating; a question may not repeat one the service's own screen asks.
 */
export function validateDraft(
  draft: FormDraft,
  existingCodes: readonly string[],
  mode: 'create' | 'edit',
  { asked = [], builtIn = false }: DraftContext = {},
): DraftProblems {
  const problems: DraftProblems = { fields: {} };
  if (!draft.name.trim()) problems.name = 'Give the form a name.';

  if (mode === 'create') {
    const code = draft.code.trim();
    if (!code) problems.code = 'Add a service code.';
    else if (!SERVICE_CODE.test(code)) problems.code = 'Use capital letters, digits and _, starting with a letter.';
    else if (existingCodes.some((c) => c.toUpperCase() === code)) problems.code = `${code} is already used by another service.`;
  }

  if (!draft.fields.length && !builtIn) problems.form = 'Add at least one question.';
  const alreadyAsked = new Map<string, string>();
  for (const f of asked) {
    alreadyAsked.set(f.key.toLowerCase(), f.label);
    alreadyAsked.set(f.label.trim().toLowerCase(), f.label);
  }
  const seen = new Set<string>();
  draft.fields.forEach((f, i) => {
    const problem = fieldProblem(f, seen, alreadyAsked);
    seen.add(f.key);
    if (problem) problems.fields[i] = problem;
  });
  return problems;
}

/**
 * A draft's questions as they are saved: trimmed, and only the settings that
 * apply to each type. `markExtra` stamps them as added-in-the-builder, which
 * is what a service with its own screen asks at the end of that screen.
 */
export function cleanForSave(fields: FieldDefinition[], markExtra = false): FieldDefinition[] {
  return fields.map((f) => {
    const out: FieldDefinition = { key: f.key, label: f.label.trim(), type: f.type, required: f.required === true };
    const help = f.helperText?.trim();
    if (help) out.helperText = help;
    if (isNumericType(f.type)) {
      const unit = f.unit?.trim();
      if (unit) out.unit = unit;
      if (isFiniteNumber(f.min)) out.min = Number(f.min);
      if (isFiniteNumber(f.max)) out.max = Number(f.max);
    }
    if (f.type === 'select') out.options = [...new Set((f.options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (f.defaultValue !== undefined && f.defaultValue !== '' && f.type !== 'evidence') out.defaultValue = f.defaultValue;
    if (f.isCritical) out.isCritical = true;
    if (markExtra || f.isExtra) out.isExtra = true;
    return out;
  });
}

// ---------------------------------------------------------------------------
// Building a form from a spreadsheet header
//
// Most of these forms already exist as a sheet with a header row. Retyping
// forty column names as questions is the slowest part of the job, so a
// pasted header row becomes the questions, with each answer type guessed
// from the wording. A guess that is wrong is one dropdown away from right.
// ---------------------------------------------------------------------------

/** Ordered: the first pattern that matches a column name wins. */
const TYPE_HINTS: readonly [RegExp, FieldType][] = [
  [/photo|image|proof|\bpod\b|attach|invoice|receipt|\blink\b|\burl\b|document/i, 'evidence'],
  [/remark|comment|note|observation|description|reason|issue|action taken/i, 'textarea'],
  [/%|percent|availability|uptime/i, 'percentage'],
  [/temperature|\btemp\b|celsius|°c/i, 'temperature'],
  [/^(is|are|was|has|have|any)\b|\bdone\b|\bok\b|yes\s*\/\s*no|\by\/n\b|working|available\?/i, 'boolean'],
  [/\bdate\b|dated|\bday\b/i, 'date'],
  [/\btime\b|\bclock\b|\bhh:mm\b/i, 'time'],
  [
    /quantity|\bqty\b|count|number of|no\.? of|litre|liter|\bltr\b|\bl\)|kwh|\bkw\b|reading|meter|level|pressure|voltage|\bvolt|\bamp|hours|\bhrs\b|\bkg\b|\bkm\b|amount|rate|score/i,
    'number',
  ],
];

/** The answer type a column name suggests. Falls back to a short answer. */
export function guessFieldType(label: string): FieldType {
  for (const [pattern, type] of TYPE_HINTS) if (pattern.test(label)) return type;
  return 'text';
}

/** Splits a pasted header row, list or column of text into clean names. */
export function parseList(text: string, limit = 100): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n\r\t,;|]+/)) {
    const value = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (!value) continue;
    const fingerprint = value.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

/** A pasted header row as ready-made questions. */
export function columnsToFields(text: string, taken: Iterable<string> = []): FieldDefinition[] {
  const keys = [...taken];
  return parseList(text).map((label) => {
    const key = fieldKeyFrom(label, keys);
    keys.push(key);
    return withType({ key, label, type: 'text', required: false }, guessFieldType(label));
  });
}

export interface FormTemplate {
  id: string;
  name: string;
  hint: string;
  cadence: Cadence;
  fields: FieldDefinition[];
}

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    id: 'equipment',
    name: 'Equipment check',
    hint: 'Working or not, reading, condition, photo',
    cadence: 'DAILY',
    fields: [
      { key: 'working', label: 'Is the equipment working?', type: 'boolean', required: true },
      { key: 'reading', label: 'Meter reading', type: 'number', required: false },
      { key: 'condition', label: 'Condition', type: 'select', required: true, options: ['Good', 'Needs repair', 'Not working'] },
      { key: 'photo', label: 'Photo', type: 'evidence', required: false },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: false },
    ],
  },
  {
    id: 'temperature',
    name: 'Temperature log',
    hint: 'Chiller and freezer readings, door seal',
    cadence: 'DAILY',
    fields: [
      { key: 'chillerTemp', label: 'Chiller temperature', type: 'temperature', unit: '°C', required: true, min: -5, max: 15, isCritical: true },
      { key: 'freezerTemp', label: 'Freezer temperature', type: 'temperature', unit: '°C', required: true, min: -30, max: 0, isCritical: true },
      { key: 'doorSeal', label: 'Door seal', type: 'select', required: true, options: ['Good', 'Damaged', 'Ice build-up'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: false },
    ],
  },
  {
    id: 'safety',
    name: 'Safety walk',
    hint: 'Exits, extinguishers, first aid, issues',
    cadence: 'WEEKLY',
    fields: [
      { key: 'exitsClear', label: 'Are all emergency exits clear?', type: 'boolean', required: true, isCritical: true },
      { key: 'extinguishersOk', label: 'Fire extinguishers in place and in date?', type: 'boolean', required: true },
      { key: 'firstAidStocked', label: 'First aid box stocked?', type: 'boolean', required: true },
      { key: 'issues', label: 'Issues found', type: 'textarea', required: false },
      { key: 'photo', label: 'Photo of any issue', type: 'evidence', required: false },
    ],
  },
];
