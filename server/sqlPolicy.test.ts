/**
 * Static checks on db/*.sql and the one line of server code RLS depends on.
 *
 * There is no Postgres on the development machine, so these cannot prove
 * the SQL runs. What they can do is make the most dangerous mistakes —
 * a table nobody remembered to protect, RLS silently bypassed — fail the
 * test run instead of reaching production looking fine.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// migrate.mjs's run order, read from the script so the two cannot drift.
const FILES = [...read('scripts/migrate.mjs').match(/const FILES = \[([^\]]+)\]/)![1].matchAll(/'([^']+)'/g)].map(
  (m) => m[1],
);

/** Strips `--` comments so prose mentioning a table does not count. */
const sql = (file: string) => read(`db/${file}`).replace(/--.*$/gm, '');
const all = FILES.map(sql).join('\n');

const tables = [...all.matchAll(/create table (\w+)/g)].map((m) => m[1]);

// Tables that deliberately carry no policy: nothing but the owner reads them.
const OWNER_ONLY = new Set(['sheet_outbox']);

describe('db/*.sql', () => {
  it('runs the service tables after the tables they reference', () => {
    expect(FILES).toEqual(['schema.sql', 'ebdg.sql', 'services.sql']);
  });

  it('finds the tables it is checking', () => {
    expect(tables).toEqual(
      expect.arrayContaining(['poc_master', 'ebdg_daily', 'diesel_request', 'service_submission', 'attachment']),
    );
  });

  it.each(tables)('%s has row level security enabled', (table) => {
    expect(all).toMatch(new RegExp(`alter table ${table}\\s+enable row level security`));
  });

  it.each(tables.filter((t) => !OWNER_ONLY.has(t)))('%s has at least one policy for wos_app', (table) => {
    expect(all).toMatch(new RegExp(`create policy \\w+\\s+on ${table}\\s[\\s\\S]*?to wos_app`));
  });

  it('never grants to Supabase roles that do not exist in plain Postgres', () => {
    expect(all).not.toMatch(/\bto (authenticated|anon)\b/);
  });

  it('creates wos_app idempotently and without a login', () => {
    expect(all).not.toMatch(/create role wos_app login/);
    expect(all).toMatch(/if not exists \(select 1 from pg_roles where rolname = 'wos_app'\)/);
  });

  it('pins search_path on every security definer function it adds', () => {
    const definers = [...sql('services.sql').matchAll(/create or replace function (\w+)[^$]*?security definer([^$]*)\$\$/g)];
    expect(definers.length).toBeGreaterThan(0);
    for (const [, name, rest] of definers) {
      expect(rest, name).toMatch(/set search_path = public/);
    }
  });

  it('defines fn_can_access before any policy uses it', () => {
    expect(all.indexOf('function fn_can_access')).toBeGreaterThan(-1);
    expect(all.indexOf('function fn_can_access')).toBeLessThan(all.indexOf("fn_can_access('"));
  });

  it('blocks deletes on every filed service record', () => {
    for (const t of ['diesel_request', 'daily_site_log', 'service_submission', 'attachment']) {
      expect(sql('services.sql')).toContain(`'${t}'`);
    }
    expect(sql('services.sql')).toMatch(/trg_nodelete_%1\$s before delete/);
  });
});

describe('server/db.ts', () => {
  it('drops to wos_app inside every request transaction', () => {
    // The owner of the tables bypasses RLS. Remove this and every POC sees
    // every site, while every other test still passes.
    const src = read('server/db.ts');
    const withActor = src.slice(src.indexOf('async withActor'), src.indexOf('async unscoped'));
    expect(withActor).toMatch(/set local role \$\{APP_ROLE\}/);
    expect(withActor.indexOf("'begin'")).toBeLessThan(withActor.indexOf('set local role'));
    expect(src).toMatch(/APP_ROLE = 'wos_app'/);
  });
});
