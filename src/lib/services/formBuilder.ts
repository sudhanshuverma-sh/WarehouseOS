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

/** Services whose questions live in their own screens. The builder does not edit them. */
export const OWN_SCREEN_SERVICES: ReadonlySet<string> = new Set(['SITE_ACTIVITY', 'DIESEL', 'EB_DG', 'HOUSEKEEPING', 'WASHING', 'ADHOC']);

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

export const CADENCE_OPTIONS: readonly { value: Cadence; label: string; hint: string }[] = [
  { value: 'DAILY', label: 'Daily', hint: 'Filed every day. Shows as pending until it is.' },
  { value: 'WEEKLY', label: 'Weekly', hint: 'Filed once a week, Monday to Sunday.' },
  { value: 'MONTHLY', label: 'Monthly', hint: 'Filed once a month.' },
  { value: 'EVENT_DRIVEN', label: 'On request', hint: 'Filed when needed. Never shows as pending.' },
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

function fieldProblem(f: FieldDefinition, seen: Set<string>): string | undefined {
  if (!f.label.trim()) return 'Write the question.';
  if (!FIELD_KEY.test(f.key)) return 'This question has an invalid saved name.';
  if (seen.has(f.key)) return 'Two questions share the same saved name.';
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

/** Everything that would stop a draft being published. Codes are checked only when creating. */
export function validateDraft(draft: FormDraft, existingCodes: readonly string[], mode: 'create' | 'edit'): DraftProblems {
  const problems: DraftProblems = { fields: {} };
  if (!draft.name.trim()) problems.name = 'Give the form a name.';

  if (mode === 'create') {
    const code = draft.code.trim();
    if (!code) problems.code = 'Add a service code.';
    else if (!SERVICE_CODE.test(code)) problems.code = 'Use capital letters, digits and _, starting with a letter.';
    else if (existingCodes.some((c) => c.toUpperCase() === code)) problems.code = `${code} is already used by another service.`;
  }

  if (!draft.fields.length) problems.form = 'Add at least one question.';
  const seen = new Set<string>();
  draft.fields.forEach((f, i) => {
    const problem = fieldProblem(f, seen);
    seen.add(f.key);
    if (problem) problems.fields[i] = problem;
  });
  return problems;
}

/** A draft's questions as they are saved: trimmed, and only the settings that apply to each type. */
export function cleanForSave(fields: FieldDefinition[]): FieldDefinition[] {
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
    return out;
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
