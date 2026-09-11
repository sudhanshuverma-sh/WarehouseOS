# The API service

One Node service serving both the built React app and `/api`, with Postgres
beside it. That is the shape apps.blinkit.in supports, and it means no CORS
config, no cross-domain cookies, and one place where identity is resolved.

```
browser ── SSO ──▶ this service ──▶ Postgres (RLS decides what comes back)
```

## Files

| File | Role |
|---|---|
| `index.ts` | Boot, config, static serving, graceful shutdown |
| `db.ts` | Pool and `withActor()` — the only way to query |
| `identity.ts` | Who is calling: header / JWT / dev, behind one interface |
| `ebdgColumns.ts` | Header↔column mapping, quoted SQL, boot-time drift check |
| `routes.ts` | The endpoints |

## The two rules

**1. Every query goes through `withActor()`.** It opens a transaction and
declares the caller before anything else:

```sql
select set_config('app.actor_email', $1, true);
```

The `true` is transaction-scoped. Without it the value stays on the pooled
connection and the *next* request — a different person — inherits the previous
user's identity and sees their sites. There is deliberately no exported
`query()` that would let a caller skip this.

If the setting is ever missing, `fn_actor_email()` returns `app`, which matches
no `poc_master` row, so RLS returns nothing. It fails closed.

**2. Handlers do not filter by site.** RLS does. A filter written here is one
someone can forget to add to the next endpoint; a policy applies to every query
against the table whether the author thought about it or not. Asking for a site
you cannot see returns an empty list, because for you those rows do not exist.

## Endpoints

| | |
|---|---|
| `GET /api/health` | No auth — the platform probes before any user exists |
| `GET /api/me` | Every live grant, plus the union of sites and services |
| `GET /api/sites` `/services` `/my-sites` | Master data |
| `GET /api/ebdg/config/:siteCode` | DG count, DEF, solar — drives the form |
| `GET /api/ebdg/previous?site=&date=` | **Carry-forward.** Most recent row strictly before that date |
| `GET /api/ebdg/row?site=&date=` | Today's row, for the duplicate-entry case |
| `GET /api/ebdg/rows` | Table view, filtered and paged |
| `POST /api/ebdg/submit` | Upsert on `Record_ID` |
| `GET /api/ebdg/compliance?date=` | **Who has not filed today** |

## Running it

```bash
npm run api:dev     # tsx watch, against a local Postgres
npm run api         # bundle with esbuild, then run
```

`npm run dev` still serves the front-end on :3000 on its own.

## Boot-time schema check

The service asserts `v_ebdg_header_map` against `EBDG_COLUMN_ORDER` and
**refuses to start** if they disagree. Drift — a renamed column, one inserted
in the middle — would otherwise land numbers in the wrong fields, which reads
as a calculation bug and is very slow to trace back to a schema change.

## Not yet verified

The tests cover identity resolution and SQL construction — 40 of them, no
database required. **Nothing has run against a real Postgres**: there is none
on the development machine. What is unproven is every query's SQL, the RLS
policies, and the boot assertion against a live view.

The first `npm run api` against the platform's database is what confirms those.
Expect to fix things there; the parts that were testable are tested, and the
parts that were not are marked here rather than assumed.
