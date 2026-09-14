/**
 * The first Super Admin.
 *
 * On a fresh database poc_master is empty, so nobody is a Super Admin —
 * and only a Super Admin may import master data or add people. Without
 * this the app would be locked on day one with no way in through it.
 *
 * At boot, if (and only if) no live SUPER_ADMIN exists, each address in
 * SUPER_ADMIN_EMAILS gets one. Once master data is imported the real
 * access rows take over and this never fires again, so the env variable
 * cannot be used later to grant access quietly.
 */

import type { Queryable } from './db';
import { normaliseEmail } from './identity';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma- or whitespace-separated list; invalid entries are dropped and reported. */
export function parseEmailList(raw: string | undefined): { emails: string[]; invalid: string[] } {
  const parts = (raw ?? '').split(/[\s,;]+/).map(normaliseEmail).filter(Boolean);
  const emails = [...new Set(parts.filter((p) => EMAIL_SHAPE.test(p)))];
  return { emails, invalid: parts.filter((p) => !EMAIL_SHAPE.test(p)) };
}

/**
 * Runs as the table owner (outside RLS) inside one transaction.
 * Returns the addresses it granted; empty when a Super Admin already exists.
 */
export async function ensureSuperAdmins(client: Queryable, emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];

  await client.query('begin');
  try {
    // Attributes the audit rows to the bootstrap, not to a person.
    await client.query("select set_config('app.actor_email', 'bootstrap', true)");

    const { rows } = await client.query(
      `select 1 from v_effective_access where role = 'SUPER_ADMIN' limit 1`,
    );
    if (rows.length > 0) {
      await client.query('rollback');
      return [];
    }

    // AC-BOOT-n rather than next_access_id(): the sheet import brings its
    // own AC-0001…AC-0262, and a bootstrap row holding AC-0001 would sit on
    // a real person's key and block their row from importing.
    // The conflict branch revives a deactivated bootstrap row — reachable
    // only here, i.e. only while no live Super Admin exists at all.
    for (const [i, email] of emails.entries()) {
      await client.query(
        `insert into poc_master (access_id, poc_email, poc_name, role, site_code, service_codes, description)
         values ($1, $2, $3, 'SUPER_ADMIN', 'ALL', 'ALL', 'Created at first boot from SUPER_ADMIN_EMAILS')
         on conflict (access_id) do update
            set poc_email = excluded.poc_email, poc_name = excluded.poc_name,
                is_active = true, access_end_date = null`,
        [`AC-BOOT-${i + 1}`, email, email.split('@')[0]],
      );
    }

    await client.query('commit');
    return emails;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }
}
