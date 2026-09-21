/**
 * Request plumbing shared by every route: async error capture, and one
 * place that turns a failure into a response the app can act on.
 *
 * Most rules live in Postgres (RLS, check constraints, triggers), so most
 * refusals arrive here as a database error. Mapping them by SQLSTATE and
 * constraint name is what turns "new row violates check constraint
 * no_self_approval" into "You cannot approve your own request."
 */

import type { NextFunction, Request, Response } from 'express';
import { NoIdentityError } from './identity';

/** Thrown by handlers for anything the caller got wrong. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'BAD_REQUEST',
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Express 4 does not catch a rejected promise; this routes it to the error handler. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Human messages for the constraints a person can actually trip. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  no_self_approval: 'You cannot approve or reject your own request.',
  no_self_review: 'You cannot review your own entry.',
  rejection_has_reason: 'Please enter a rejection reason.',
  validated_has_pod: 'Add the POD — a photo or a Google Drive link — before validating delivery.',
  delivery_needs_order_qty: 'Please enter the order quantity.',
  validation_only_for_delivery: 'Only Delivery Only requests are validated.',
  attachment_shape: 'A photo must be JPEG, PNG, WebP or PDF and at most 2 MB, or a Google Drive link.',
  daily_site_log_site_code_log_date_key: 'A report for this site and date has already been filed.',
  one_filing_per_period: 'This service has already been filed for this site and period.',
  ebdg_daily_site_code_date_key: 'An EB-DG entry for this site and date already exists.',
  vendor_name_key: 'A vendor with that name already exists.',
  scope_matches_role:
    'Scope does not match the role: Super Admin is ALL sites and services; Service Admin is ALL sites; Warehouse Admin and Site POC need a site.',
};

export interface ErrorResponse {
  status: number;
  body: { error: string; message: string; details?: unknown };
}

/**
 * The response for a known failure, or null for a bug.
 *
 * Messages raised by our own PL/pgSQL triggers are written for people and
 * are passed through. Messages Postgres generates itself name tables and
 * policies, so they are replaced.
 */
export function describeError(err: any): ErrorResponse | null {
  if (err instanceof NoIdentityError) {
    return { status: 401, body: { error: 'UNAUTHENTICATED', message: err.message } };
  }
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.code, message: err.message, details: err.details } };
  }
  // body-parser's own refusals.
  if (err?.type === 'entity.too.large') {
    return { status: 413, body: { error: 'TOO_LARGE', message: 'That is over the size limit. Photos can be at most 2 MB.' } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'The request body is not valid JSON.' } };
  }

  const fromOurTrigger = typeof err?.where === 'string' && err.where.includes('PL/pgSQL');
  const known = err?.constraint ? CONSTRAINT_MESSAGES[err.constraint] : undefined;

  switch (err?.code) {
    case '42501':
      return {
        status: 403,
        body: { error: 'FORBIDDEN', message: fromOurTrigger ? err.message : 'Your role does not permit that change.' },
      };
    case '23505':
      return { status: 409, body: { error: 'DUPLICATE', message: known ?? 'That record already exists.' } };
    case '23503':
      return { status: 400, body: { error: 'UNKNOWN_REFERENCE', message: 'That site, service or record does not exist.' } };
    case '23514':
      return { status: 400, body: { error: 'RULE_BROKEN', message: known ?? 'That change breaks a data rule.' } };
    case '23502':
      return { status: 400, body: { error: 'MISSING_VALUE', message: 'A required value is missing.' } };
    case '22023':
      return {
        status: 400,
        body: { error: 'BAD_REQUEST', message: fromOurTrigger ? err.message : 'A value is not allowed here.' },
      };
    case '22P02':
    case '22007':
    case '22008':
      return { status: 400, body: { error: 'BAD_REQUEST', message: 'A value has the wrong format.' } };
    case 'P0001':
      // A bare `raise exception` — ours, e.g. fn_block_delete.
      return { status: 409, body: { error: 'NOT_ALLOWED', message: err.message } };
    default:
      return null;
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const described = describeError(err);
  if (described) {
    return res.status(described.status).json(described.body);
  }
  // Ours. Log it in full, tell the caller nothing — internal messages name
  // tables and columns.
  console.error('[api]', err);
  res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong. It has been logged.' });
}
