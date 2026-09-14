-- =====================================================================
-- WarehouseOS — PostgreSQL schema for master data
--
-- A 1:1 translation of MASTERDATA.md (the contract) into Postgres, with
-- the invariants that document only *asks* for now actually ENFORCED by
-- the database:
--
--   I1  "Never delete a row"        -> DELETE raises an exception
--   I3  "Every change writes audit" -> trigger, not app code
--   I5  "Look up by header name"    -> real columns, not positions
--   §6  "Filter server-side"        -> v_effective_access + RLS
--
-- Targets plain PostgreSQL — the platform-provisioned database on
-- apps.blinkit.in. There is no auth.jwt() and no PostgREST here: the API
-- tier authenticates the caller and states their identity per transaction
-- (see §8). Run in order:
--
--   1. db/schema.sql   this file — master data
--   2. db/ebdg.sql     EB-DG daily entries + per-site DG config
--   3. db/seed.sql     generated from your sheet export (scripts/)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums — these mirror the Dropdowns tab (MASTERDATA.md §5)
-- ---------------------------------------------------------------------
create type role_t          as enum ('SITE_POC','WAREHOUSE_ADMIN','SERVICE_ADMIN','SUPER_ADMIN');
create type zone_t          as enum ('North','South','East','West','Central');
create type channel_t       as enum ('B2B','B2C','BOTH');
create type business_type_t as enum ('WHS','Grozo','HP','SS B2B');
create type cadence_t       as enum ('DAILY','WEEKLY','MONTHLY','EVENT_DRIVEN');

-- Yes/No columns become real booleans here. The app's adapter layer maps
-- them back to 'Yes'/'No' if anything still needs the sheet shape — that
-- adapter boundary is exactly what MASTERDATA.md I8 asked for.

-- ---------------------------------------------------------------------
-- 2. Site_Master — one row per warehouse (MASTERDATA.md §3)
-- ---------------------------------------------------------------------
create table site_master (
  site_code        text primary key,          -- ZHPL-{STATE}-{NN}. Immutable (I2).
  wh_code          text not null,
  facility_name    text not null,
  sap_code         text,
  cost_center      text,                      -- always equals sap_code
  zone             zone_t not null,
  state            text not null,
  city             text,
  address          text,
  pincode          text,                      -- text: leading zeros matter
  channel          channel_t not null,
  entity           text not null,
  business_type    business_type_t not null,
  gstin            text,
  lat_long         text,                      -- inconsistent formats; parse defensively
  map_link         text,
  services_enabled text not null default 'ALL',  -- 'ALL' or comma-separated codes
  go_live_date     date,
  closure_date     date,
  is_active        boolean not null default true,
  last_updated_by  text,
  last_updated_at  timestamptz not null default now()
);

-- The literal 'ALL' is a valid Site_Code scope (MASTERDATA.md §0.2), so a
-- plain FK from poc_master would reject every nationwide admin row. This
-- sentinel row lets the FK exist without special-casing it everywhere.
insert into site_master (site_code, wh_code, facility_name, zone, state, channel, entity, business_type)
values ('ALL', 'ALL', 'Nationwide (all sites)', 'North', 'N/A', 'BOTH', 'Zomato Hyperpure Private Limited', 'WHS');

-- ---------------------------------------------------------------------
-- 3. Service_Registry — config per service (MASTERDATA.md §4)
-- Adding service #7 is a row here, not a code change.
-- ---------------------------------------------------------------------
create table service_registry (
  service_code              text primary key,   -- immutable (I2)
  service_name              text not null,
  needs_approval            boolean not null default false,
  needs_delivery_validation boolean not null default false,
  requires_evidence         boolean not null default false,
  cadence                   cadence_t not null,
  submission_window         time,               -- after this = late, not missing
  sla_hours                 integer,            -- only meaningful when needs_approval
  appscript_url             text,               -- renamed from Spreadsheet_ID
  records_tab               text default 'Records',
  audit_tab                 text default 'Audit',
  is_active                 boolean not null default true,
  last_updated_by           text,
  last_updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. POC_Master — who can log in and what they see (MASTERDATA.md §2)
-- access_id is the PK, NOT poc_email: one person may hold several rows.
-- ---------------------------------------------------------------------
create table poc_master (
  access_id               text primary key,     -- AC-0001. Immutable.
  poc_email               text not null,        -- NOT unique, deliberately
  poc_name                text not null,
  wh_code                 text,                 -- display only — never join on this
  role                    role_t not null,
  site_code               text not null references site_master(site_code),
  service_codes           text not null default 'ALL',
  contact_number          text,                 -- text: '+91' and leading zeros
  is_primary              boolean not null default true,
  is_active               boolean not null default true,
  access_start_date       date,
  access_end_date         date,                 -- null = open-ended
  description             text,
  reporting_manager_email text,
  last_updated_by         text,
  last_updated_at         timestamptz not null default now(),

  -- MASTERDATA.md §6 scope matrix, enforced instead of documented:
  constraint scope_matches_role check (
    case role
      when 'SUPER_ADMIN'   then site_code = 'ALL' and service_codes = 'ALL'
      when 'SERVICE_ADMIN' then site_code = 'ALL' and service_codes <> 'ALL'
      when 'WAREHOUSE_ADMIN' then site_code <> 'ALL' and service_codes = 'ALL'
      when 'SITE_POC'      then site_code <> 'ALL'
    end
  )
);

create index poc_master_email_idx on poc_master (lower(poc_email));
create index poc_master_site_idx  on poc_master (site_code);

-- ---------------------------------------------------------------------
-- 5. Master_Audit — written by triggers below, never by hand (I3)
-- ---------------------------------------------------------------------
create table master_audit (
  audit_id      bigserial primary key,
  ts            timestamptz not null default now(),
  actor_email   text not null,
  action        text not null,   -- CREATE | UPDATE | DEACTIVATE | REACTIVATE
  target_tab    text not null,
  target_key    text not null,
  field_changed text,
  old_value     text,
  new_value     text,
  source        text not null default 'APP',
  notes         text
);

create index master_audit_target_idx on master_audit (target_tab, target_key, ts desc);

-- ---------------------------------------------------------------------
-- 6. Triggers
--
-- The actor is read from a per-connection setting the API sets before
-- each write:   select set_config('app.actor_email', $1, true);
-- ---------------------------------------------------------------------

-- Who is making this change? The API states it at the start of every
-- request transaction (server/db.ts withActor):
--     select set_config('app.actor_email', $1, true);
-- There is exactly one source of identity, on purpose: a second path (such
-- as trusting a JWT claim) is a second thing to keep in step with RLS.
-- Falls back to 'app' rather than failing, which matches no POC row — so a
-- missing identity sees nothing, never everything.
create or replace function fn_actor_email() returns text
language sql stable as $$
  select lower(coalesce(nullif(current_setting('app.actor_email', true), ''), 'app'))
$$;

-- Stamp last_updated_* on every write, so it can't be forgotten.
create or replace function fn_touch_updated() returns trigger
language plpgsql as $$
begin
  new.last_updated_at := now();
  new.last_updated_by := fn_actor_email();
  return new;
end;
$$;

-- One audit row per changed field (I3). Generic across all three tables —
-- the PK column name comes in as a trigger argument.
-- security definer: the caller (wos_app) has no insert on master_audit —
-- deliberately — so the trigger writes as the owner.
create or replace function fn_audit_master() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor  text  := fn_actor_email();
  pk_col text  := tg_argv[0];
  old_j  jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_j  jsonb := to_jsonb(new);
  pk_val text  := coalesce(new_j ->> pk_col, old_j ->> pk_col);
  k      text;
begin
  if tg_op = 'INSERT' then
    insert into master_audit (actor_email, action, target_tab, target_key, field_changed, old_value, new_value)
    values (actor, 'CREATE', tg_table_name, pk_val, '*', null, new_j::text);

  elsif tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k in ('last_updated_at', 'last_updated_by') then
        continue;
      end if;
      if (new_j -> k) is distinct from (old_j -> k) then
        insert into master_audit (actor_email, action, target_tab, target_key, field_changed, old_value, new_value)
        values (
          actor,
          case
            when k = 'is_active' and (new_j ->> k)::boolean then 'REACTIVATE'
            when k = 'is_active' then 'DEACTIVATE'
            else 'UPDATE'
          end,
          tg_table_name, pk_val, k, old_j ->> k, new_j ->> k
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

-- I1: never delete a master row. Deactivate instead.
create or replace function fn_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'Master rows are never deleted (MASTERDATA.md I1) — set is_active = false instead. Table: %', tg_table_name;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['poc_master', 'site_master', 'service_registry'] loop
    execute format('create trigger trg_touch_%1$s before insert or update on %1$s
                    for each row execute function fn_touch_updated()', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s
                    for each row execute function fn_block_delete()', t);
  end loop;
end $$;

create trigger trg_audit_poc     after insert or update on poc_master
  for each row execute function fn_audit_master('access_id');
create trigger trg_audit_site    after insert or update on site_master
  for each row execute function fn_audit_master('site_code');
create trigger trg_audit_service after insert or update on service_registry
  for each row execute function fn_audit_master('service_code');

-- ---------------------------------------------------------------------
-- 6b. Access_ID allocation.
--
-- Computed here rather than in the client so two admins creating a POC at
-- the same moment can't both decide they're AC-0263. The advisory lock is
-- held to the end of the transaction, so the winner commits first and the
-- loser recomputes.
-- ---------------------------------------------------------------------
create or replace function next_access_id() returns text
language plpgsql security definer as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('poc_master.access_id'));
  select coalesce(max((substring(access_id from 'AC-([0-9]+)'))::int), 0) + 1
    into n
    from poc_master
   where access_id ~ '^AC-[0-9]+$';
  return 'AC-' || lpad(n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Effective access — MASTERDATA.md §6, as one view.
-- This replaces computeEffectiveAccess() in src/lib/masterDataSync.ts:
-- the cascade (deactivating a site revokes its POCs) is the last join
-- condition, so it can never be forgotten by a caller.
-- ---------------------------------------------------------------------
create or replace view v_effective_access as
select
  p.access_id,
  lower(p.poc_email) as poc_email,
  p.poc_name,
  p.role,
  p.site_code,
  p.service_codes,
  p.contact_number
from poc_master p
join site_master s on s.site_code = p.site_code
where p.is_active
  and (p.access_start_date is null or p.access_start_date <= current_date)
  and (p.access_end_date   is null or p.access_end_date   >= current_date)
  and (p.site_code = 'ALL' or s.is_active);

-- ---------------------------------------------------------------------
-- 8. Row Level Security — plain PostgreSQL.
--
-- There is no auth.jwt() here. The API opens a pooled connection as the
-- role `wos_app` and, at the START of every request transaction, states
-- who the caller is:
--
--     begin;
--     select set_config('app.actor_email', $1, true);   -- true = tx-scoped
--     ...queries...
--     commit;
--
-- `true` matters: the setting dies with the transaction, so a pooled
-- connection handed to the next request cannot inherit the last user's
-- identity. Forget it and current_user_email() returns 'app', which
-- matches no POC row — the request sees nothing rather than everything.
-- Failing closed is the point.
--
-- These policies are the real boundary. src/lib/permissions.ts computes
-- the same rules in the browser so the UI can hide what it should, but
-- that copy is a convenience: it runs on the user's machine and is not
-- trusted. This block is what actually holds.
-- ---------------------------------------------------------------------

-- wos_app is never logged in as, so it has no password. The API connects
-- as the migrating user and runs `set local role wos_app` at the start of
-- every request transaction (server/db.ts). That user owns the tables, and
-- Postgres exempts owners from RLS — the role switch is what makes every
-- policy below actually apply.
--
-- `if not exists` because roles are cluster-wide: a second database on the
-- same server, or a re-run, must not fail here.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'wos_app') then
    create role wos_app nologin;
  end if;
  execute format('grant wos_app to %I', current_user);
end $$;

create or replace function current_user_email() returns text
language sql stable as $$ select fn_actor_email() $$;

create or replace function is_super_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from v_effective_access
    where poc_email = current_user_email() and role = 'SUPER_ADMIN'
  )
$$;

-- The set of site codes this caller may see. 'ALL' in their access row
-- widens it to every site; otherwise it is exactly the sites they hold a
-- live grant for. A person with several AC- rows gets the union, which is
-- how backup POCs covering two warehouses already work in the sheet.
create or replace function fn_visible_sites() returns setof text
language sql stable security definer as $$
  select s.site_code
    from site_master s
   where exists (
     select 1 from v_effective_access a
      where a.poc_email = current_user_email()
        and (a.site_code = 'ALL' or a.site_code = s.site_code)
   )
$$;

-- Does this caller hold the given service? 'ALL' covers everything.
create or replace function fn_has_service(code text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from v_effective_access a
     where a.poc_email = current_user_email()
       and (a.service_codes = 'ALL'
            or code = any (string_to_array(replace(a.service_codes, ' ', ''), ',')))
  )
$$;

-- May this caller work with this service AT this site? Both conditions on
-- the SAME grant. fn_has_service() and fn_visible_sites() checked apart
-- would let a person holding DIESEL at site A and EB_DG at site B file
-- diesel at B. Every service-record policy uses this instead.
create or replace function fn_can_access(code text, site text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from v_effective_access a
     where a.poc_email = current_user_email()
       and (a.site_code = 'ALL' or a.site_code = site)
       and (a.service_codes = 'ALL'
            or code = any (string_to_array(replace(a.service_codes, ' ', ''), ',')))
  )
$$;

-- Any admin flavour — the roles that may approve and review. Which
-- records they may touch is still decided by fn_can_access.
create or replace function fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from v_effective_access
     where poc_email = current_user_email()
       and role in ('SUPER_ADMIN', 'SERVICE_ADMIN', 'WAREHOUSE_ADMIN')
  )
$$;

alter table poc_master       enable row level security;
alter table site_master      enable row level security;
alter table service_registry enable row level security;
alter table master_audit     enable row level security;

-- Site and service catalogues are readable by anyone signed in: a POC's
-- form needs its own site's name and the service list to render at all.
create policy read_site    on site_master      for select to wos_app using (true);
create policy read_service on service_registry for select to wos_app using (true);

-- Who-can-see-what is not public. A POC reads only their own grants;
-- a Super Admin reads everyone's.
create policy read_poc on poc_master for select to wos_app
  using (is_super_admin() or lower(poc_email) = current_user_email());

create policy read_audit on master_audit for select to wos_app using (is_super_admin());

create policy write_poc     on poc_master       for all to wos_app
  using (is_super_admin()) with check (is_super_admin());
create policy write_site    on site_master      for all to wos_app
  using (is_super_admin()) with check (is_super_admin());
create policy write_service on service_registry for all to wos_app
  using (is_super_admin()) with check (is_super_admin());

grant select                         on site_master, service_registry, master_audit to wos_app;
grant select, insert, update         on poc_master, site_master, service_registry   to wos_app;
grant select                         on v_effective_access                          to wos_app;
grant execute on function next_access_id(), fn_visible_sites(), fn_has_service(text),
                          fn_can_access(text, text), fn_is_admin(),
                          is_super_admin(), current_user_email()                    to wos_app;

-- Audit rows are written by triggers only — nobody edits them by hand.
revoke insert, update, delete on master_audit from wos_app;
