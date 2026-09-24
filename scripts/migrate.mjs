/**
 * Applies the SQL files in db/ to whatever DATABASE_URL points at.
 *
 *   node scripts/migrate.mjs          schema + ebdg
 *   node scripts/migrate.mjs --seed   ...and db/seed.sql, if present
 *
 * Records what it has run in schema_migrations, so running it twice is
 * safe and a deploy can call it unconditionally. Without that the second
 * deploy would fail on `create type ... already exists` and look like a
 * broken release rather than a no-op.
 *
 * Each file runs inside one transaction: a file that fails halfway leaves
 * nothing behind, rather than half a schema you then have to unpick by
 * hand to work out how far it got.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const FILES = ['schema.sql', 'ebdg.sql', 'services.sql', 'extras.sql', 'filings.sql', 'noticeboard.sql', 'noticeboard_posters.sql', 'ebdg_dg3.sql', 'fire_pump.sql'];
if (process.argv.includes('--seed')) FILES.push('seed.sql');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL.');
  console.error('Local example:');
  console.error('  postgres://postgres:YOURPASSWORD@localhost:5432/warehouseos');
  process.exit(1);
}

// Managed Postgres generally requires TLS; a local install generally has
// none. Decide from the host rather than making the caller remember.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal || process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

const dbDir = join(process.cwd(), 'db');

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect: ${err.message}`);
  if (isLocal) {
    console.error('Is PostgreSQL running, and does the database exist?');
    console.error('  createdb -U postgres warehouseos');
  }
  process.exit(1);
}

await client.query(`
  create table if not exists schema_migrations (
    filename   text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows: done } = await client.query('select filename from schema_migrations');
const applied = new Set(done.map((r) => r.filename));

let ran = 0;

for (const file of FILES) {
  const path = join(dbDir, file);

  if (!existsSync(path)) {
    // seed.sql is gitignored — it holds real names and phone numbers — so
    // on a fresh clone it legitimately is not there yet.
    console.log(`- ${file}: not found, skipping${file === 'seed.sql' ? ' (run npm run db:import first)' : ''}`);
    continue;
  }

  if (applied.has(file)) {
    console.log(`- ${file}: already applied`);
    continue;
  }

  process.stdout.write(`- ${file}: running... `);
  try {
    await client.query('begin');
    await client.query(readFileSync(path, 'utf8'));
    await client.query('insert into schema_migrations (filename) values ($1)', [file]);
    await client.query('commit');
    console.log('ok');
    ran++;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.log('FAILED');
    console.error(`\n  ${err.message}`);
    // Postgres reports the byte offset of a syntax error; turning it into
    // a line number is the difference between a useful message and a
    // treasure hunt through 400 lines of SQL.
    if (err.position) {
      const upto = readFileSync(path, 'utf8').slice(0, Number(err.position));
      console.error(`  at line ${upto.split('\n').length} of db/${file}`);
    }
    if (err.detail) console.error(`  detail: ${err.detail}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(ran > 0 ? `\nDone — ${ran} file(s) applied.` : '\nNothing to do; the database is up to date.');
