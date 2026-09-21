/**
 * What every route module shares.
 *
 * The one rule: a handler touches the database only through run(), which
 * resolves the caller and opens a withActor transaction as them. There is
 * no other way in, so no endpoint can forget RLS.
 */

import type { Request } from 'express';
import type { Db, Queryable } from '../db';
import { HttpError } from '../http';
import type { IdentityResolver } from '../identity';
import type { FieldDefinition } from '../../src/types';
import { validateSubmissionData } from '../../src/lib/services/validateSubmission';

export interface RouteDeps {
  db: Pick<Db, 'withActor' | 'healthy'>;
  identity: IdentityResolver;
}

export type Run = <T>(req: Request, fn: (client: Queryable, email: string) => Promise<T>) => Promise<T>;

/** Runs `fn` as the caller, inside RLS, in one transaction. */
export function runAs(deps: RouteDeps): Run {
  return async (req, fn) => {
    const { email } = await deps.identity.resolve(req);
    return deps.db.withActor(email, (client) => fn(client, email));
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today in India — the day a POC means by "today", whatever the server's clock zone. */
export const todayInIndia = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A single query-string value, or null. `?site=a&site=b` arrives as an array and is refused. */
export function queryText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export const optionalText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export function requiredText(v: unknown, message: string): string {
  const s = optionalText(v);
  if (!s) throw new HttpError(400, message);
  return s;
}

export function optionalDate(v: unknown, name: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !ISO_DATE.test(v)) throw new HttpError(400, `${name} must be a date (YYYY-MM-DD).`);
  return v;
}

export function requiredDate(v: unknown, message: string): string {
  const d = optionalDate(v, 'date');
  if (!d) throw new HttpError(400, message);
  return d;
}

/** A whole-number id from the path. */
export function numericId(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^\d{1,18}$/.test(v)) throw new HttpError(400, `${what} id must be a number.`);
  return v;
}

export function limitFrom(v: unknown, fallback = 500, max = 5000): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

export async function requireSuperAdmin(c: Queryable): Promise<void> {
  const { rows } = await c.query('select is_super_admin() as ok');
  if (!rows[0]?.ok) throw new HttpError(403, 'Only a Super Admin can change master data.', 'FORBIDDEN');
}

/**
 * An attachment the caller can see, filed for this service at this site.
 *
 * Checked explicitly because foreign keys ignore RLS: without this, a
 * request could point at a photo from another site simply by knowing its
 * id, and the database would accept the reference.
 */
export async function requireAttachment(
  c: Queryable,
  id: unknown,
  serviceCode: string,
  siteCode: string,
  label: string,
): Promise<string | null> {
  if (id === undefined || id === null || id === '') return null;
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, `${label} is not a valid attachment.`);
  const { rows } = await c.query(
    'select 1 from attachment where attachment_id = $1 and service_code = $2 and site_code = $3',
    [id, serviceCode, siteCode],
  );
  if (rows.length === 0) throw new HttpError(400, `${label} was not found for this site. Upload it again.`);
  return id;
}

/**
 * Deliberately does nothing.
 *
 * Sheet copies are sent by the browser, not the server: Zomato's Google
 * Workspace only lets a Web App be shared "Anyone within Zomato", and this
 * server is not a Zomato Google user, so Google would refuse it. Queuing
 * rows here would only fill sheet_outbox with copies nothing can deliver.
 * The call sites stay, marking each write that has a sheet copy, in case a
 * server path becomes possible later (e.g. a Workspace-approved service
 * account).
 */
export async function queueSheetCopy(
  _c: Queryable,
  _serviceCode: string,
  _payload: { event: string; record: unknown },
): Promise<void> {
  /* sent from the browser — see AppContext reserveSheetWindow */
}

/**
 * The extra questions an admin added to a service that has its own screen,
 * ready to store as jsonb.
 *
 * Only the questions marked `isExtra` count. The rest of a form row describes
 * the columns that screen already collects — a diesel request's rate, entity
 * and timestamp — and they are neither asked of the POC nor expected here, so
 * validating against them would refuse every submission.
 *
 * Of those, only keys the form defines survive, the same way the Daily Site
 * Report keeps only the readings it knows: a client cannot widen its own row
 * by inventing keys. What is kept is checked against the field definitions,
 * so an answer the form would refuse cannot arrive by another route.
 */
export async function extrasFor(c: Queryable, serviceCode: string, raw: unknown): Promise<string> {
  if (raw === undefined || raw === null) return '{}';
  if (!isPlainObject(raw)) throw new HttpError(400, 'extras must be an object of field values.');

  const { rows } = await c.query('select fields from service_form where service_code = $1', [serviceCode]);
  const saved: FieldDefinition[] = rows[0]?.fields ?? [];
  const fields = saved.filter((f) => f.isExtra === true);
  if (fields.length === 0) return '{}';

  const kept: Record<string, unknown> = {};
  for (const f of fields) if (raw[f.key] !== undefined) kept[f.key] = raw[f.key];

  const errors = validateSubmissionData(fields, kept);
  if (errors.length) throw new HttpError(400, errors[0].message, 'VALIDATION', errors);
  return JSON.stringify(kept);
}

/** Dates and timestamps as the app expects them: ISO strings. */
export const iso = (v: unknown): string | undefined =>
  v instanceof Date ? v.toISOString() : v === null || v === undefined ? undefined : String(v);

export const num = (v: unknown): number | undefined =>
  v === null || v === undefined || v === '' ? undefined : Number(v);
