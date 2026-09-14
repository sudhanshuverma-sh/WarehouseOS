import { describe, expect, it } from 'vitest';
import type { Queryable } from './db';
import { ensureSuperAdmins, parseEmailList } from './bootstrap';

/** Records statements; `superAdminExists` decides the lookup's answer. */
function fakeClient(superAdminExists: boolean) {
  const statements: { text: string; values?: unknown[] }[] = [];
  const client: Queryable = {
    query: (async (text: string, values?: unknown[]) => {
      statements.push({ text, values });
      if (text.includes('from v_effective_access')) return { rows: superAdminExists ? [{}] : [] };
      return { rows: [] };
    }) as unknown as Queryable['query'],
  };
  return { client, statements };
}

describe('parseEmailList', () => {
  it('splits, lower-cases, de-duplicates and reports junk', () => {
    expect(parseEmailList(' A@Zomato.com, b@zomato.com;a@zomato.com  nope ')).toEqual({
      emails: ['a@zomato.com', 'b@zomato.com'],
      invalid: ['nope'],
    });
    expect(parseEmailList(undefined)).toEqual({ emails: [], invalid: [] });
  });
});

describe('ensureSuperAdmins', () => {
  it('grants each address when no Super Admin exists', async () => {
    const { client, statements } = fakeClient(false);
    await expect(ensureSuperAdmins(client, ['a@zomato.com', 'b@zomato.com'])).resolves.toEqual(['a@zomato.com', 'b@zomato.com']);
    const inserts = statements.filter((s) => s.text.includes('insert into poc_master'));
    // AC-BOOT-n, so it can never occupy a key the sheet import brings.
    expect(inserts.map((s) => s.values)).toEqual([
      ['AC-BOOT-1', 'a@zomato.com', 'a'],
      ['AC-BOOT-2', 'b@zomato.com', 'b'],
    ]);
    expect(statements.at(-1)?.text).toBe('commit');
  });

  it('does nothing once a Super Admin exists, so the variable cannot grant access later', async () => {
    const { client, statements } = fakeClient(true);
    await expect(ensureSuperAdmins(client, ['late@zomato.com'])).resolves.toEqual([]);
    expect(statements.some((s) => s.text.includes('insert'))).toBe(false);
    expect(statements.at(-1)?.text).toBe('rollback');
  });

  it('does not open a transaction for an empty list', async () => {
    const { client, statements } = fakeClient(false);
    await expect(ensureSuperAdmins(client, [])).resolves.toEqual([]);
    expect(statements).toHaveLength(0);
  });
});
