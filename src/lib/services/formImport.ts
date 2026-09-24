/**
 * A form pasted in — JSON, an HTML form, or an AI-made HTML page whose
 * questions live in a <script> — turned into builder questions.
 *
 * Nothing pasted is ever run. JSON is parsed; an HTML page's script is only
 * READ: the list of questions it builds from (an array of objects with a
 * label) is pulled out by a small literal reader that understands strings,
 * numbers, arrays and objects and keeps anything else (an arrow function, an
 * expression) as text. The show-if rules those functions express in the
 * usual shapes (`state.x?.value === 'Yes'`) are recognised from that text.
 *
 * The result is a starting point: every question lands in the builder, where
 * it can be checked and changed before anything is published.
 */

import type { FieldDefinition, FieldFollowUp, FieldType } from '../../types';
import { answerText, cleanLogic } from './formLogic';
import { FIELD_KEY, fieldKeyFrom, guessFieldType, parseList, withType } from './formBuilder';

export interface ImportResult {
  title?: string;
  fields: FieldDefinition[];
  source: 'json' | 'script' | 'html' | 'list';
  /** Things the import could not carry over, in words. */
  notes: string[];
}

type Loose = Record<string, unknown>;

// ---------------------------------------------------------------------------
// A tolerant reader for JS / JSON literals
// ---------------------------------------------------------------------------

/** Marks a value kept as source text (a function, an expression). */
interface Raw {
  __raw: string;
}
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && '__raw' in v;

function readLiteral(src: string): unknown {
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i)) {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (src.startsWith('/*', i)) {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
      } else return;
    }
  };
  const str = (): string => {
    const q = src[i++];
    let out = '';
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        const n = src[i + 1];
        out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        i += 2;
      } else out += src[i++];
    }
    i++;
    return out;
  };
  /** Source text up to the next top-level , ] or } — for values we do not read. */
  const rawUntilBoundary = (): Raw => {
    const start = i;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        str();
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
      i++;
    }
    return { __raw: src.slice(start, i).trim() };
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      const s = str();
      ws();
      // 'a' + b, `…${x}` and friends are expressions, not plain strings.
      if (src[i] && !/[,\]}]/.test(src[i])) {
        i = start;
        return rawUntilBoundary();
      }
      return s;
    }
    const m = /^(-?\d+(\.\d+)?|true|false|null)(?=\s*[,\]}])/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return m[1] === 'true' ? true : m[1] === 'false' ? false : m[1] === 'null' ? null : Number(m[1]);
    }
    return rawUntilBoundary();
  };
  const arr = (): unknown[] => {
    i++;
    const out: unknown[] = [];
    for (;;) {
      ws();
      if (src[i] === ']' || i >= src.length) {
        i++;
        return out;
      }
      out.push(value());
      ws();
      if (src[i] === ',') i++;
    }
  };
  const obj = (): Loose => {
    i++;
    const out: Loose = {};
    for (;;) {
      ws();
      if (src[i] === '}' || i >= src.length) {
        i++;
        return out;
      }
      if (src.startsWith('...', i)) {
        rawUntilBoundary();
      } else {
        let key: string;
        if (src[i] === '"' || src[i] === "'") key = str();
        else {
          const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
          if (!m) {
            rawUntilBoundary();
            if (src[i] === ',') i++;
            continue;
          }
          key = m[0];
          i += key.length;
        }
        ws();
        if (src[i] === ':') {
          i++;
          out[key] = value();
        } else if (src[i] === '(') {
          // A method: showIf() { … }
          out[key] = rawUntilBoundary();
        } else {
          out[key] = { __raw: key }; // shorthand property
        }
      }
      ws();
      if (src[i] === ',') i++;
    }
  };
  return value();
}

/** Every top-level `[ … ]` in a script, read as a literal. */
function arraysIn(script: string): unknown[][] {
  const found: unknown[][] = [];
  const re = /[=(:]\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) {
    const start = m.index + m[0].length - 1;
    try {
      const v = readLiteral(script.slice(start));
      if (Array.isArray(v) && v.length) found.push(v);
    } catch {
      /* not a literal we can read */
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// From loosely described questions to FieldDefinitions
// ---------------------------------------------------------------------------

const pick = (o: Loose, names: string[]): unknown => {
  for (const n of names) if (o[n] !== undefined && !isRaw(o[n])) return o[n];
  return undefined;
};
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

const LABEL_NAMES = ['label', 'question', 'title', 'text', 'prompt', 'name', 'q'];
const ID_NAMES = ['key', 'id', 'name', 'field', 'code'];
const GROUP_NAMES = ['section', 'group', 'g', 'category', 'heading', 'page'];
const OPTION_NAMES = ['options', 'opts', 'choices', 'values', 'answers', 'items'];

function optionsOf(o: Loose): string[] {
  const raw = pick(o, OPTION_NAMES);
  if (!Array.isArray(raw)) return typeof raw === 'string' ? parseList(raw, 200) : [];
  return raw
    .map((x) => (x && typeof x === 'object' ? text((x as Loose).label ?? (x as Loose).value ?? (x as Loose).text) : answerText(x)))
    .filter(Boolean);
}

const isYesNo = (opts: string[]) => opts.length === 2 && opts.every((x) => /^(yes|no)$/i.test(x));

function typeOf(o: Loose, label: string, opts: string[]): FieldType {
  const t = text(pick(o, ['type', 'inputType', 'fieldType', 'kind', 'answerType'])).toLowerCase().replace(/[\s/-]/g, '_');
  if (/^(section|heading|header|title|group|divider)$/.test(t)) return 'section';
  if (/^(boolean|bool|yes_?no|y_?n|toggle|switch|checkbox)$/.test(t)) return 'boolean';
  if (isYesNo(opts)) return 'boolean';
  if (/^(select|dropdown|radio|choice|single_?select|multiple_?choice|options|enum)$/.test(t) || opts.length) return 'select';
  if (/^(number|integer|int|float|decimal|numeric|range|counter)$/.test(t)) return 'number';
  if (/^(percent|percentage)$/.test(t)) return 'percentage';
  if (/^(temperature|temp)$/.test(t)) return 'temperature';
  if (/^(textarea|long_?text|paragraph|multiline|comment|remarks?)$/.test(t)) return 'textarea';
  if (/^(date|datetime|datetime_local)$/.test(t)) return 'date';
  if (t === 'time') return 'time';
  if (/^(photo|image|file|upload|evidence|attachment|camera|signature)$/.test(t)) return 'evidence';
  if (/^(text|string|short_?text|email|tel|phone|url)$/.test(t)) return 'text';
  return guessFieldType(label);
}

/** `state.sprinkler_available?.value === 'Yes'` and the like, from a function's text. */
function conditionFromCode(code: string): { field: string; equals: string[] } | undefined {
  const m =
    /(?:state|answers|values|form|data)\s*(?:\??\.)\s*([A-Za-z_$][\w$]*)(?:\s*\??\.\s*value)?\s*={2,3}\s*['"`]([^'"`]+)['"`]/.exec(code) ??
    /\[\s*['"]([\w$]+)['"]\s*\](?:\s*\??\.\s*value)?\s*={2,3}\s*['"`]([^'"`]+)['"`]/.exec(code);
  return m ? { field: m[1], equals: [m[2]] } : undefined;
}

function conditionOf(o: Loose): { field: string; equals: string[] } | undefined {
  const raw = o.showIf ?? o.show_if ?? o.dependsOn ?? o.depends_on ?? o.visibleIf ?? o.condition ?? o.when;
  if (!raw) return undefined;
  if (isRaw(raw)) return conditionFromCode(raw.__raw);
  if (typeof raw === 'string') return conditionFromCode(raw);
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Loose;
    const field = text(r.field ?? r.question ?? r.key ?? r.id);
    const eq = r.equals ?? r.value ?? r.is ?? r.in ?? r.answer;
    const equals = (Array.isArray(eq) ? eq : [eq]).map(answerText).filter(Boolean);
    return field && equals.length ? { field, equals } : undefined;
  }
  return undefined;
}

function followUpOf(o: Loose, type: FieldType, opts: string[]): FieldFollowUp | undefined {
  const offered = type === 'boolean' ? ['Yes', 'No'] : opts;
  const explicit = o.followUp ?? o.follow_up ?? o.followup;
  if (explicit && typeof explicit === 'object' && !isRaw(explicit)) return explicit as FieldFollowUp;
  if (o.neutral === true) return undefined;
  const good = pick(o, ['good', 'ok', 'expected', 'pass', 'healthy', 'correct']);
  const bad = pick(o, ['bad', 'fail', 'failAnswers', 'badAnswers', 'issueWhen']);
  let when: string[] = [];
  if (bad !== undefined) when = (Array.isArray(bad) ? bad : [bad]).map(answerText);
  else if (good !== undefined) {
    const g = answerText(good);
    when = offered.filter((x) => x !== g);
  }
  when = when.filter((w) => offered.includes(w));
  if (!when.length) return undefined;
  // A "wrong" answer on a checklist: say what is wrong, a photo if possible, and flag it.
  return { when, comment: 'required', photo: 'optional', issue: true };
}

interface Draft {
  id: string;
  field: FieldDefinition;
  rawShowIf?: { field: string; equals: string[] };
}

/** A list of loosely described questions — from JSON or a script — as FieldDefinitions. */
function fromItems(items: unknown[], { defaultRequired }: { defaultRequired: boolean }): { fields: FieldDefinition[]; notes: string[] } {
  const notes: string[] = [];
  const drafts: Draft[] = [];
  const keys: string[] = [];
  const add = (id: string, field: FieldDefinition, rawShowIf?: Draft['rawShowIf']) => {
    keys.push(field.key);
    drafts.push({ id, field, rawShowIf });
  };
  let group = '';

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Loose;
    const label = text(pick(o, LABEL_NAMES));
    const g = text(pick(o, GROUP_NAMES));
    if (g && g !== group) {
      group = g;
      add(`__section_${drafts.length}`, { key: fieldKeyFrom(g, keys), label: g, type: 'section', required: false });
    }
    if (!label) continue;

    const opts = optionsOf(o);
    const type = typeOf(o, label, opts);
    const id = text(pick(o, ID_NAMES)) || label;
    const key = FIELD_KEY.test(id) && !keys.includes(id) ? id : fieldKeyFrom(label, keys);

    let field = withType({ key, label, type: 'text', required: false }, type);
    if (type === 'select') field.options = opts.length ? opts : ['Option 1', 'Option 2'];
    if (type !== 'section') {
      const req = o.required ?? o.mandatory ?? o.isRequired;
      field.required = req === undefined ? defaultRequired : req === true || req === 'true' || req === 'yes';
    }
    const help = text(pick(o, ['helperText', 'help', 'hint', 'description', 'placeholder', 'ph']));
    if (help && type !== 'section') field.helperText = help;
    const unit = text(pick(o, ['unit', 'units', 'suffix']));
    if (unit && (type === 'number' || type === 'percentage' || type === 'temperature')) field.unit = unit;
    for (const bound of ['min', 'max'] as const) {
      const b = o[bound];
      if (typeof b === 'number' && field.type !== 'section') field[bound] = b;
    }
    const fu = followUpOf(o, type, field.options ?? []);
    if (fu) field.followUp = fu;
    field = { ...field };
    add(id, field, conditionOf(o));

    // `extra: { label: 'Pressure reading (bar)' }` — a reading asked beside the answer.
    const extra = o.extra ?? o.reading ?? o.measurement;
    if (extra && typeof extra === 'object' && !isRaw(extra)) {
      const ex = extra as Loose;
      const exLabel = text(ex.label ?? ex.question);
      if (exLabel) {
        const exType = typeOf(ex, exLabel, []);
        const exField = withType({ key: fieldKeyFrom(exLabel, keys), label: exLabel, type: 'text', required: false }, exType === 'text' ? 'number' : exType);
        const unit = /\(([^)]+)\)\s*$/.exec(exLabel)?.[1];
        if (unit && (exField.type === 'number')) exField.unit = unit;
        const exHelp = text(ex.ph ?? ex.placeholder ?? ex.hint);
        if (exHelp) exField.helperText = exHelp;
        add(`${id}__extra`, exField);
      }
    }
  }

  // Show-if rules name questions by the pasted id; point them at our keys.
  const keyOf = new Map(drafts.map((d) => [d.id, d.field.key]));
  for (const d of drafts) {
    if (!d.rawShowIf) continue;
    const ref = d.rawShowIf.field;
    const target = keyOf.get(ref) ?? drafts.find((x) => x.field.key === ref || x.field.label === ref)?.field.key;
    if (target) d.field.showIf = { field: target, equals: d.rawShowIf.equals };
    else notes.push(`"${d.field.label}" depended on "${d.rawShowIf.field}", which is not in the form; it is always asked.`);
  }

  // Keep only rules the builder can honour: show-if on an EARLIER fixed-answer question.
  const fields = drafts.map((d) => d.field);
  fields.forEach((f, i) => {
    const had = Boolean(f.showIf);
    const { showIf, followUp } = cleanLogic(f, fields.slice(0, i));
    if (showIf) f.showIf = showIf;
    else delete f.showIf;
    if (followUp) f.followUp = followUp;
    else delete f.followUp;
    if (had && !showIf) notes.push(`"${f.label}": its show-if rule could not be kept, so it is always asked.`);
  });
  return { fields, notes };
}

/** The first array of question-like objects in a JSON document. */
function questionsInJson(doc: unknown): { items: unknown[]; title?: string } | undefined {
  if (Array.isArray(doc)) return { items: doc };
  if (!doc || typeof doc !== 'object') return undefined;
  const o = doc as Loose;
  const title = text(o.title ?? o.name ?? o.formName ?? o.form_name) || undefined;
  for (const k of ['fields', 'questions', 'items', 'checks', 'elements', 'controls', 'schema']) {
    if (Array.isArray(o[k])) return { items: o[k] as unknown[], title };
  }
  // Grouped: { sections: [{ title, questions: [...] }] }
  const sections = o.sections ?? o.pages ?? o.groups;
  if (Array.isArray(sections)) {
    const items: unknown[] = [];
    for (const s of sections) {
      if (!s || typeof s !== 'object') continue;
      const so = s as Loose;
      const heading = text(so.title ?? so.name ?? so.heading ?? so.label);
      const qs = so.fields ?? so.questions ?? so.items ?? so.checks;
      if (!Array.isArray(qs)) continue;
      for (const q of qs) items.push(q && typeof q === 'object' && heading ? { section: heading, ...(q as Loose) } : q);
    }
    return { items, title };
  }
  return undefined;
}

const labelLike = (v: unknown) =>
  !!v && typeof v === 'object' && !Array.isArray(v) && LABEL_NAMES.some((n) => typeof (v as Loose)[n] === 'string');

// ---------------------------------------------------------------------------
// HTML forms (browser only: needs a DOM parser)
// ---------------------------------------------------------------------------

function fromDocument(doc: Document): { fields: FieldDefinition[]; notes: string[] } {
  const items: Loose[] = [];
  const doneRadios = new Set<string>();
  let section = '';
  const labelFor = (el: Element): string => {
    const id = el.getAttribute('id');
    const byFor = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
    const wrap = el.closest('label')?.textContent;
    return (
      byFor?.trim() ||
      el.getAttribute('aria-label')?.trim() ||
      (wrap && wrap.replace((el as HTMLInputElement).value ?? '', '').trim()) ||
      el.getAttribute('placeholder')?.trim() ||
      el.getAttribute('name')?.replace(/[_-]+/g, ' ').trim() ||
      ''
    );
  };
  const nodes = doc.querySelectorAll('h2, h3, h4, legend, input, select, textarea');
  nodes.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (['h2', 'h3', 'h4', 'legend'].includes(tag)) {
      section = el.textContent?.trim() ?? '';
      return;
    }
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'input' && ['hidden', 'submit', 'button', 'reset', 'image', 'search'].includes(type)) return;
    const required = el.hasAttribute('required');
    if (tag === 'input' && type === 'radio') {
      const name = el.getAttribute('name') ?? '';
      if (!name || doneRadios.has(name)) return;
      doneRadios.add(name);
      const group = [...doc.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)];
      const options = group.map((r) => labelFor(r) || r.getAttribute('value') || '').filter(Boolean);
      const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
      items.push({ section, id: name, label: legend || name.replace(/[_-]+/g, ' '), options, required });
      return;
    }
    const label = labelFor(el);
    if (!label) return;
    if (tag === 'select') {
      const options = [...el.querySelectorAll('option')].filter((o) => o.getAttribute('value') !== '').map((o) => o.textContent?.trim() ?? '');
      items.push({ section, id: el.getAttribute('name') ?? label, label, type: 'select', options, required });
    } else if (tag === 'textarea') {
      items.push({ section, id: el.getAttribute('name') ?? label, label, type: 'textarea', required });
    } else {
      const map: Record<string, string> = { checkbox: 'boolean', file: 'evidence', number: 'number', range: 'number', date: 'date', 'datetime-local': 'date', time: 'time' };
      items.push({
        section,
        id: el.getAttribute('name') ?? label,
        label,
        type: map[type] ?? 'text',
        min: el.hasAttribute('min') ? Number(el.getAttribute('min')) : undefined,
        max: el.hasAttribute('max') ? Number(el.getAttribute('max')) : undefined,
        required,
      });
    }
  });
  return fromItems(items, { defaultRequired: false });
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

/**
 * Whatever was pasted, as questions. `parseHtml` is the browser's DOMParser;
 * without it (in tests, on the server) only JSON and script-built pages are read.
 */
export function importForm(input: string, parseHtml?: (html: string) => Document): ImportResult {
  const text = input.trim();
  if (!text) return { fields: [], source: 'list', notes: ['Paste the HTML or JSON of a form first.'] };

  if (/^[[{]/.test(text)) {
    let doc: unknown;
    let strict = true;
    try {
      doc = JSON.parse(text);
    } catch {
      strict = false;
      try {
        doc = readLiteral(text); // JSON with comments, single quotes or trailing commas
      } catch {
        doc = undefined;
      }
    }
    const found = questionsInJson(doc);
    if (!found || !found.items.length) {
      const note = strict ? 'No list of questions was found in that JSON.' : 'That JSON could not be read. Check it is complete.';
      return { fields: [], source: 'json', notes: [note] };
    }
    const { fields, notes } = fromItems(found.items, { defaultRequired: false });
    return { title: found.title, fields, source: 'json', notes };
  }

  if (/<[a-z!]/i.test(text)) {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() || /<h1[^>]*>([^<]*)<\/h1>/i.exec(text)?.[1]?.trim() || undefined;

    // An AI-made page usually draws its questions from a list in a script.
    const scripts = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const lists = scripts.flatMap(arraysIn).filter((a) => a.filter(labelLike).length >= 2);
    if (lists.length) {
      const best = lists.sort((a, b) => b.filter(labelLike).length - a.filter(labelLike).length)[0];
      const { fields, notes } = fromItems(best, { defaultRequired: true });
      return { title, fields, source: 'script', notes };
    }

    if (parseHtml) {
      const { fields, notes } = fromDocument(parseHtml(text));
      if (fields.length) return { title, fields, source: 'html', notes };
    }
    return { title, fields: [], source: 'html', notes: ['No questions were found in that HTML.'] };
  }

  // Anything else: a list of question names, one per line or comma.
  const keys: string[] = [];
  const fields = parseList(text).map((label) => {
    const key = fieldKeyFrom(label, keys);
    keys.push(key);
    return withType({ key, label, type: 'text', required: false }, guessFieldType(label));
  });
  return { fields, source: 'list', notes: [] };
}

/** The questions as JSON someone can paste into another form, or keep. */
export function exportFormJson(title: string, fields: readonly FieldDefinition[]): string {
  return JSON.stringify({ title, fields }, null, 2);
}
