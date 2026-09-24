-- ---------------------------------------------------------------------
-- Fire Pump Healthiness — one check per site per day.
--
-- It replaces the generic "Fire Safety" form, which never had questions:
-- the service keeps its code FIRE, so every existing grant, POC_Master row
-- and screen that knows FIRE carries on, and only the name changes.
--
-- Like the Daily Site Report it has its own table rather than a
-- service_submission row, because it has rules the generic forms cannot
-- express: a failed check needs a remark (a photo is optional), the sprinkler line is
-- asked only where a sprinkler system exists, and the overall status is
-- computed by the server (src/lib/firePump/checks.ts), never sent by the
-- browser.
-- ---------------------------------------------------------------------

-- Upserted, not only renamed: a Master Data import can have skipped FIRE or
-- left it inactive, and every screen lists services from this table, so a
-- missing or inactive row would hide the whole service.
insert into service_registry
  (service_code, service_name, cadence, needs_approval, needs_delivery_validation, requires_evidence)
values ('FIRE', 'Fire Pump Healthiness', 'DAILY', false, false, false)
on conflict (service_code) do update
  set service_name = excluded.service_name,
      is_active    = true;

create table fire_pump_log (
  log_id               bigint generated always as identity primary key,
  site_code            text not null references site_master (site_code),
  log_date             date not null,
  submitted_by         text not null default fn_actor_email(),
  submitted_by_name    text,
  submitted_at         timestamptz not null default now(),

  -- One answer per check, keyed as the form keys them (fire_alarm, mcp, …).
  answers              jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  -- For every failed check: what is wrong, and (optionally) a photo of it.
  remarks              jsonb not null default '{}'::jsonb check (jsonb_typeof(remarks) = 'object'),
  photos               jsonb not null default '{}'::jsonb check (jsonb_typeof(photos) = 'object'),

  hydrant_pressure_bar numeric check (hydrant_pressure_bar between 0 and 20),
  overall_status       text not null check (overall_status in ('OK', 'CRITICAL')),
  issues_count         integer not null default 0 check (issues_count >= 0),
  -- Questions an admin added to the service later.
  extras               jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object'),
  last_updated_by      text,
  last_updated_at      timestamptz not null default now(),

  -- Two POCs at one site cannot both file today; a correction is an update.
  unique (site_code, log_date)
);

create index fire_pump_log_date on fire_pump_log (log_date desc);

create trigger trg_touch_fire_pump_log before insert or update on fire_pump_log
  for each row execute function fn_touch_updated();
-- Nothing filed is ever deleted (I1).
create trigger trg_nodelete_fire_pump_log before delete on fire_pump_log
  for each row execute function fn_block_delete();
-- Every change is history (I3): an amended check keeps what it said before.
create trigger trg_audit_fire_pump_log after insert or update on fire_pump_log
  for each row execute function fn_audit_record('log_id');

alter table fire_pump_log enable row level security;

create policy read_fire_pump on fire_pump_log for select to wos_app
  using (fn_can_access('FIRE', site_code));
create policy write_fire_pump on fire_pump_log for insert to wos_app
  with check (fn_can_access('FIRE', site_code) and submitted_by = current_user_email());
create policy update_fire_pump on fire_pump_log for update to wos_app
  using      (fn_can_access('FIRE', site_code))
  with check (fn_can_access('FIRE', site_code));

grant select, insert, update on fire_pump_log to wos_app;
