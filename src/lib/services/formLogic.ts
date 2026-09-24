/**
 * What a built form does beyond one box per question: sections, questions
 * that show only after a certain answer, and answers that open a follow-up
 * (a comment, a photo) and count as an issue.
 *
 * One module for every place that reads a form — the POC's screen, the
 * builder's preview, the shared validator (so the browser and the API agree),
 * the API before it saves, and Records — so "is this question asked?" and
 * "does this answer need a comment?" have one answer everywhere.
 */

import type { FieldDefinition, FieldFollowUp } from '../../types';

/** Where a question's follow-up comment and photo are stored, beside its answer. */
export const commentKey = (key: string) => `${key}__comment`;
export const photoKey = (key: string) => `${key}__photo`;

/** Where the entry's issue status is stored, for forms with issue answers. */
export const STATUS_KEY = 'overall_status';
export const ISSUES_KEY = 'issues';

/** Question types an answer can be compared on: fixed answers only. */
export const canBranchOn = (f: FieldDefinition) => f.type === 'boolean' || f.type === 'select';

/** The fixed answers a Yes/No or dropdown question offers. */
export const answersOf = (f: FieldDefinition): string[] =>
  f.type === 'boolean' ? ['Yes', 'No'] : f.type === 'select' ? (f.options ?? []).filter(Boolean) : [];

/** An answer as text: a stored true / false reads as Yes / No. */
export function answerText(v: unknown): string {
  if (v === true || v === 'true') return 'Yes';
  if (v === false || v === 'false') return 'No';
  return v === undefined || v === null ? '' : String(v);
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Whether a question is asked, given the answers so far. A question hangs on
 * an earlier one, which must itself be asked — hiding a parent hides its
 * whole branch.
 */
export function isShown(
  field: FieldDefinition,
  data: Record<string, unknown>,
  byKey: Map<string, FieldDefinition>,
  depth = 0,
): boolean {
  const cond = field.showIf;
  if (!cond) return true;
  const parent = byKey.get(cond.field);
  if (!parent || depth > 20) return true; // a broken rule never hides a question
  if (!isShown(parent, data, byKey, depth + 1)) return false;
  return cond.equals.includes(answerText(data[cond.field]));
}

export const keyMap = (fields: readonly FieldDefinition[]) => new Map(fields.map((f) => [f.key, f]));

/** The questions actually asked for these answers, sections included. */
export function shownFields(fields: readonly FieldDefinition[], data: Record<string, unknown>): FieldDefinition[] {
  const byKey = keyMap(fields);
  return fields.filter((f) => isShown(f, data, byKey));
}

/** The follow-up this answer opens, if any. */
export function openFollowUp(field: FieldDefinition, value: unknown): FieldFollowUp | null {
  const fu = field.followUp;
  if (!fu || blank(value)) return null;
  return fu.when.includes(answerText(value)) ? fu : null;
}

/** Whether any answer of this form counts as an issue. */
export const hasIssueRules = (fields: readonly FieldDefinition[]) => fields.some((f) => f.followUp?.issue);

/** The asked questions whose answer is an issue, by label. */
export function issuesOf(fields: readonly FieldDefinition[], data: Record<string, unknown>): string[] {
  return shownFields(fields, data)
    .filter((f) => openFollowUp(f, data[f.key])?.issue)
    .map((f) => f.label);
}

/**
 * An entry as it is saved: no answer to a question that was not asked, no
 * follow-up the answer did not open, no value for a section — and, for a form
 * with issue answers, its status worked out from the answers (never taken
 * from the client). `status: false` leaves the status out, for the extra
 * questions of a screen that keeps its own status.
 */
export function pruneEntry(
  fields: readonly FieldDefinition[],
  data: Record<string, unknown>,
  { status = true }: { status?: boolean } = {},
): Record<string, unknown> {
  const byKey = keyMap(fields);
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) {
    const asked = f.type !== 'section' && isShown(f, data, byKey);
    const fu = asked ? openFollowUp(f, data[f.key]) : null;
    if (!asked) delete out[f.key];
    if (!fu || fu.comment === 'off') delete out[commentKey(f.key)];
    if (!fu || fu.photo === 'off') delete out[photoKey(f.key)];
  }
  delete out[STATUS_KEY];
  delete out[ISSUES_KEY];
  if (status && hasIssueRules(fields)) {
    const issues = issuesOf(fields, out);
    out[STATUS_KEY] = issues.length ? 'CRITICAL' : 'OK';
    out[ISSUES_KEY] = issues.join(', ');
  }
  return out;
}

export interface LogicError {
  field: string;
  message: string;
}

/** A comment or photo an opened follow-up requires and did not get. */
export function followUpErrors(fields: readonly FieldDefinition[], data: Record<string, unknown>): LogicError[] {
  const errors: LogicError[] = [];
  for (const f of shownFields(fields, data)) {
    const fu = openFollowUp(f, data[f.key]);
    if (!fu) continue;
    if (fu.comment === 'required' && blank(data[commentKey(f.key)])) {
      const ask = fu.prompt?.trim() || 'say why';
      errors.push({ field: commentKey(f.key), message: `${f.label}: ${ask}${/[.?!]$/.test(ask) ? '' : '.'}` });
    }
    if (fu.photo === 'required' && blank(data[photoKey(f.key)])) {
      errors.push({ field: photoKey(f.key), message: `${f.label}: attach a photo.` });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Sanitising what a form definition says (builder and API)
// ---------------------------------------------------------------------------

const LEVELS = ['required', 'optional', 'off'] as const;
const level = (v: unknown, fallback: FieldFollowUp['comment']): FieldFollowUp['comment'] =>
  (LEVELS as readonly string[]).includes(String(v)) ? (v as FieldFollowUp['comment']) : fallback;

const strings = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map((x) => answerText(x).trim()).filter(Boolean);

/**
 * A follow-up as it may be saved on this question, or undefined when it does
 * not apply: only fixed-answer questions have one, and only for answers the
 * question offers.
 */
export function cleanFollowUp(field: FieldDefinition, raw: unknown): FieldFollowUp | undefined {
  if (!raw || typeof raw !== 'object' || !canBranchOn(field)) return undefined;
  const r = raw as Record<string, unknown>;
  const offered = answersOf(field);
  const when = [...new Set(strings(r.when))].filter((w) => offered.includes(w));
  if (!when.length) return undefined;
  const out: FieldFollowUp = {
    when,
    comment: level(r.comment, 'required'),
    photo: level(r.photo, 'off'),
    issue: r.issue === true,
  };
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : '';
  if (prompt) out.prompt = prompt.slice(0, 200);
  if (out.comment === 'off' && out.photo === 'off' && !out.issue) return undefined;
  return out;
}

/**
 * A show-if rule as it may be saved, or undefined: it must hang on an EARLIER
 * Yes/No or dropdown question (so a form can never loop), and on answers that
 * question offers.
 */
export function cleanCondition(raw: unknown, earlier: readonly FieldDefinition[]) {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const parent = earlier.find((f) => f.key === String(r.field ?? ''));
  if (!parent || !canBranchOn(parent)) return undefined;
  const offered = answersOf(parent);
  const equals = [...new Set(strings(r.equals))].filter((e) => offered.includes(e));
  return equals.length ? { field: parent.key, equals } : undefined;
}

/** A question's show-if and follow-up, cleaned against the questions before it. */
export function cleanLogic(field: FieldDefinition, earlier: readonly FieldDefinition[]): Pick<FieldDefinition, 'showIf' | 'followUp'> {
  const out: Pick<FieldDefinition, 'showIf' | 'followUp'> = {};
  const showIf = cleanCondition(field.showIf, earlier);
  if (showIf) out.showIf = showIf;
  const followUp = cleanFollowUp(field, field.followUp);
  if (followUp) out.followUp = followUp;
  return out;
}
