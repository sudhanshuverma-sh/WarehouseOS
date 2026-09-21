/**
 * Extra questions on the services that have a screen of their own.
 *
 * Their answers go into one `extras` jsonb column (db/extras.sql), checked
 * against the same field definitions the generic services use — so a question
 * added in the builder behaves the same wherever it was added.
 */

import { describe, expect, it } from 'vitest';
import type { Queryable } from './db';
import { extrasFor } from './routes/common';
import { HttpError } from './http';

const withFields = (fields: unknown[]): Queryable =>
  ({ query: async () => ({ rows: [{ fields }], rowCount: 1 }) }) as unknown as Queryable;

const askFor = (over: Record<string, unknown> = {}) => ({
  key: 'lockoutTagNo',
  label: 'Lockout tag number',
  type: 'text',
  required: true,
  ...over,
});

describe('extrasFor()', () => {
  it('keeps an answer to a question the service actually asks', async () => {
    const json = await extrasFor(withFields([askFor()]), 'DIESEL', { lockoutTagNo: 'LT-88' });
    expect(JSON.parse(json)).toEqual({ lockoutTagNo: 'LT-88' });
  });

  it('drops a key no question asks for, rather than storing it', async () => {
    // The body is not the schema: only what the form defines is kept, the
    // same rule the daily report's readings follow.
    const json = await extrasFor(withFields([askFor()]), 'DIESEL', { lockoutTagNo: 'LT-88', injected: 'x' });
    expect(JSON.parse(json)).toEqual({ lockoutTagNo: 'LT-88' });
  });

  it('refuses a missing required answer', async () => {
    await expect(extrasFor(withFields([askFor()]), 'DIESEL', {})).rejects.toBeInstanceOf(HttpError);
  });

  it('refuses a number outside the range the question sets', async () => {
    const fields = [askFor({ key: 'ppm', type: 'number', required: true, min: 100, max: 300 })];
    await expect(extrasFor(withFields(fields), 'WASHING', { ppm: 999 })).rejects.toThrow(/ppm|300/i);
  });

  it('stores nothing when the service has no extra questions', async () => {
    expect(await extrasFor(withFields([]), 'SITE_ACTIVITY', { anything: 1 })).toBe('{}');
  });

  it('stores nothing when the client sends no extras at all', async () => {
    expect(await extrasFor(withFields([askFor()]), 'SITE_ACTIVITY', undefined)).toBe('{}');
  });

  it('refuses extras that are not an object', async () => {
    await expect(extrasFor(withFields([askFor()]), 'DIESEL', 'LT-88')).rejects.toBeInstanceOf(HttpError);
  });
});
