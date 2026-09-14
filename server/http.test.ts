import { describe, expect, it } from 'vitest';
import { describeError, HttpError } from './http';
import { NoIdentityError } from './identity';

/** The shape node-postgres gives a database error. */
const pgError = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(String(extra.message ?? 'db said no')), { code, ...extra });

const TRIGGER = 'PL/pgSQL function fn_diesel_guard() line 12 at RAISE';

describe('describeError', () => {
  it('maps identity and handler errors', () => {
    expect(describeError(new NoIdentityError('no header'))).toMatchObject({ status: 401 });
    expect(describeError(new HttpError(404, 'Not found', 'NOT_FOUND'))).toEqual({
      status: 404,
      body: { error: 'NOT_FOUND', message: 'Not found', details: undefined },
    });
  });

  it('passes through our trigger messages but hides Postgres policy text', () => {
    expect(describeError(pgError('42501', { message: 'Only an admin may approve', where: TRIGGER }))?.body.message).toBe(
      'Only an admin may approve',
    );
    expect(
      describeError(pgError('42501', { message: 'new row violates row-level security policy for table "diesel_request"' }))
        ?.body.message,
    ).toBe('Your role does not permit that change.');
  });

  it('turns named constraints into sentences', () => {
    expect(describeError(pgError('23514', { constraint: 'no_self_approval' }))).toEqual({
      status: 400,
      body: { error: 'RULE_BROKEN', message: 'You cannot approve or reject your own request.' },
    });
    expect(describeError(pgError('23505', { constraint: 'daily_site_log_site_code_log_date_key' }))).toMatchObject({
      status: 409,
      body: { error: 'DUPLICATE', message: 'A report for this site and date has already been filed.' },
    });
  });

  it('falls back to generic text for constraints it does not know', () => {
    expect(describeError(pgError('23514', { constraint: 'some_other_check' }))?.body.message).toBe(
      'That change breaks a data rule.',
    );
  });

  it('reports oversized and malformed bodies', () => {
    expect(describeError({ type: 'entity.too.large' })?.status).toBe(413);
    expect(describeError({ type: 'entity.parse.failed' })?.status).toBe(400);
  });

  it('returns null for bugs, so they are logged and hidden', () => {
    expect(describeError(new TypeError('x is undefined'))).toBeNull();
    expect(describeError(pgError('42P01'))).toBeNull(); // undefined table
  });
});
