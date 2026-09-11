# WarehouseOS on Postgres — migration runbook

Moves master data and EB-DG daily entries off Google Sheets onto Postgres, so
site and POC assignments are a real write to a real database instead of a
fire-and-forget POST followed by a manual re-paste.

Target is the platform-provisioned Postgres on **apps.blinkit.in**. Plain
PostgreSQL — no Supabase, no PostgREST.

## Why this is worth doing

Three things MASTERDATA.md asks for are impossible on the Sheets architecture
and become automatic here:

| MASTERDATA.md | On Sheets | On Postgres |
|---|---|---|
| §6 "Filter server-side. Client-side scope filtering is never the control." | Impossible — no server exists | Row Level Security, enforced in the DB |
| I1 "Never delete a row" | A convention people can break | `DELETE` raises an exception |
| I3 "Every master change writes an audit row" | App must remember to; a manual sheet edit never does | A trigger — nothing can bypass it |

Plus: reads stop being "best-effort" (no CORS wall, no hidden iframe, no
paste-the-page fallback), and writes come back on the next read.

## Files, in run order

| File | What it creates |
|---|---|
| [`schema.sql`](schema.sql) | Enums, `site_master`, `service_registry`, `poc_master`, `master_audit`, triggers, `v_effective_access`, the `wos_app` role and all master-data RLS |
| [`ebdg.sql`](ebdg.sql) | `ebdg_daily` (the 109 columns), `v_ebdg_header_map`, `site_dg_config`, EB-DG RLS |
| `seed.sql` | Generated from your sheet export — see step 3 |

## Steps

### 1. Provision the database
On apps.blinkit.in, ask the platform's Claude: *"deploy Postgres alongside my
app."* It provisions the database and injects the credentials as environment
variables. **Do not copy the connection string anywhere** — it is already
wired, and the API reads it from the environment.

### 2. Create the schema
Run `schema.sql`, then `ebdg.sql`. Order matters: `ebdg_daily.site_code` has a
foreign key to `site_master`, and `site_dg_config` seeds one row per site.

Then set a password for the `wos_app` role and give it to the API as an env
var. `schema.sql` deliberately creates that role **without** one — a password
committed to a repo is a password you cannot rotate.

### 3. Load your existing data

Export every tab from the master sheet: **File → Download → Web page (.html)**,
unzip, and drop the per-tab files into `data/sheets/`. Then:

```bash
node scripts/html-to-json.mjs data/sheets data/master-data.json
node scripts/validate-master-data.mjs data/master-data.json
node scripts/json-to-sql.mjs data/master-data.json db/seed.sql
```

Pass the output path as an argument — **do not use a `>` redirect.**
PowerShell encodes redirects as UTF-16 with a byte-order mark, which is not
something any JSON parser or `psql` will accept, and the resulting error
points at the file's contents rather than at its encoding.

Run the generated `seed.sql` after `ebdg.sql`.

`validate-master-data.mjs` checks the snapshot against everything the schema
enforces — enums, both primary keys, the `poc_master → site_master` foreign
key, and the `scope_matches_role` constraint — and exits non-zero if the seed
would abort. It also reports operational problems that are valid data but
still wrong: a site with no POC, a lone SUPER_ADMIN, an address outside the
sign-in domains.

Both scripts print warnings to stderr for things worth checking before you
commit to them — in particular **blank `Active` cells become `false`**, which
revokes that person's access. `AC-0078` in the current data is one of these.
Fix it in the sheet and re-export if that isn't what you want.

`html-to-json.mjs` also repairs the mojibake in the export (`â` for an em dash,
`Â°` for a degree sign) so descriptions and addresses land readable.

### 4. Make sure you can still get in

Before anyone else touches it, confirm **your own email holds a `SUPER_ADMIN`
row** in `poc_master`. RLS means only a SUPER_ADMIN can write master data, so
if nobody holds that role, you are locked out of your own admin UI with no way
back in through the app.

In the current export that is `AC-0262`, `sudhanshu.verma@grofers.com` — the
only one. Adding two more is cheap insurance against one person leaving.

### 5. Point the app at it
The API reads `DATABASE_URL` (injected by the platform) and
`SUPER_ADMIN_EMAILS`. Nothing secret goes in a `VITE_` variable — anything
prefixed `VITE_` is compiled into the browser bundle and readable by every
visitor.

### 6. Retire the old path
Once the data is verified in Postgres, delete: `MASTER_WAREHOUSES` in
`src/data/initialData.ts`, the paste-JSON importer, the Apps Script bridge in
`src/lib/masterDataSync.ts`, and `localStorage` as a data store.

## Notes

- **Identity is per-transaction.** The API runs
  `select set_config('app.actor_email', $1, true)` at the start of every
  request transaction. The `true` scopes it to that transaction, so a pooled
  connection handed to the next request cannot inherit the previous user's
  identity. Forget the call and the caller resolves to `app`, which matches no
  POC row — they see nothing rather than everything.
- **`site_code = 'ALL'`** is a real sentinel row in `site_master`, so the FK
  from `poc_master` holds for nationwide admins without special-casing.
- **The scope matrix is a CHECK constraint**, so a `SERVICE_ADMIN` scoped to a
  single site is rejected by the database, not just discouraged by the UI.
- **One person, several sites.** `poc_master` is keyed on `access_id`, not
  email — 262 rows cover ~200 people, several of whom are POC at two or three
  warehouses. `fn_visible_sites()` returns the union of their live grants.
- **The sandbox cannot reach internal systems.** apps.blinkit.in is isolated,
  so master data arrives as the export above, not as a live sync. Google
  Sheets stays reachable (it is public infrastructure), which is what keeps
  the sheet mirror working.

## Not yet verified

The SQL in this folder has **not been executed** — there is no Postgres or
Docker on the development machine. Column count, ordering against
`EBDG_COLUMN_ORDER`, duplicate names and paren balance were checked
statically. First run against a real database is what will confirm the rest.
