-- =====================================================================
-- WarehouseOS — every service other than EB-DG.
--
-- Runs AFTER db/schema.sql and db/ebdg.sql.
--
-- Until this file, a POC's Diesel request, Daily Site Report or
-- Housekeeping entry lived in their own browser's localStorage. Nobody
-- else could see it, and clearing the browser deleted it. Here each one
-- becomes a row that every authorised person sees, under the same rules
-- ebdg_daily already follows:
--
--   * RLS decides who sees and writes what — fn_can_access(service, site)
--   * a filed record is never deleted (I1) — fn_block_delete()
--   * every change is audited by trigger, never by app code (I3)
--   * approval is an admin act, and nobody approves their own request
--
-- Layout:
--   diesel_request (+ diesel_event)     approval + delivery workflow
--   daily_site_log (+ activity)         one report per site per day
--   service_submission + service_form   every other service, defined as data
--   attachment                          photos (stored here) or Drive links
--   vendor                              replaces the hard-coded vendor list
--   record_audit                        change history for all of the above
--   sheet_outbox                        optional copies to Google Sheets
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Service catalogue additions
-- ---------------------------------------------------------------------

-- Where a service's records are copied to, if anywhere. Replaces the
-- per-browser localStorage URL, which only ever worked for whoever set it.
alter table service_registry add column if not exists sheet_mirror_url text;

-- Every service the app files. `do nothing` keeps whatever the master
-- sheet import already set; these are only defaults for an empty database.
insert into service_registry
  (service_code, service_name, cadence, needs_approval, needs_delivery_validation, requires_evidence)
values
  ('SITE_ACTIVITY', 'Daily Site Activity Report', 'DAILY',        false, false, false),
  ('DIESEL',        'Diesel Procurement',         'EVENT_DRIVEN', true,  true,  true),
  ('EB_DG',         'EB-DG Daily Log',            'DAILY',        false, false, false),
  ('HOUSEKEEPING',  'Housekeeping Deployment',    'DAILY',        false, false, false),
  ('WASHING',       'Washing',                    'EVENT_DRIVEN', false, false, false),
  ('ADHOC',         'Adhoc Requests',             'EVENT_DRIVEN', false, false, false),
  ('COLD_ROOM',     'Cold Room',                  'DAILY',        false, false, false),
  ('RT',            'Reach Truck',                'DAILY',        false, false, false),
  ('BOPT',          'BOPT',                       'DAILY',        false, false, false),
  ('UPS',           'UPS',                        'DAILY',        false, false, false),
  ('LT_PANEL',      'LT Panel',                   'DAILY',        false, false, false),
  ('FIRE',          'Fire Safety',                'DAILY',        false, false, false),
  ('HVLS',          'HVLS Fans',                  'DAILY',        false, false, false),
  ('WATER',         'Water',                      'DAILY',        false, false, false),
  ('SECURITY',      'Security',                   'DAILY',        false, false, false),
  ('CHECKLIST',     'Task Checklists',            'DAILY',        false, false, false)
on conflict (service_code) do nothing;

-- A site added later (through the app, not the seed) must still get its
-- DG config row — ebdg.sql only backfilled the sites that existed then,
-- and without the row the EB-DG form has nothing to draw.
create or replace function fn_site_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.site_code <> 'ALL' then
    insert into site_dg_config (site_code) values (new.site_code)
    on conflict (site_code) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_site_defaults after insert on site_master
  for each row execute function fn_site_defaults();

-- ---------------------------------------------------------------------
-- 2. Generic change history for service records (I3)
--
-- master_audit is one row per field, shaped like the sheet's audit tab.
-- Service records change far more often, so one row per change holding
-- {field: [old, new]} keeps this table proportionate.
-- ---------------------------------------------------------------------
create table record_audit (
  audit_id    bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  actor_email text not null,
  table_name  text not null,
  record_key  text not null,
  action      text not null check (action in ('CREATE', 'UPDATE')),
  changed     jsonb not null
);

create index record_audit_target_idx on record_audit (table_name, record_key, ts desc);

-- security definer: wos_app has no insert on record_audit, so the trigger
-- writes as the owner. That is the point — the history is not something
-- the caller can write, skip or edit.
create or replace function fn_audit_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pk_col text  := tg_argv[0];
  -- Photo bytes are not history; the attachment id and size are.
  new_j  jsonb := to_jsonb(new) - 'bytes';
  old_j  jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'bytes' end;
  diff   jsonb := '{}'::jsonb;
  k      text;
begin
  if tg_op = 'INSERT' then
    insert into record_audit (actor_email, table_name, record_key, action, changed)
    values (fn_actor_email(), tg_table_name, new_j ->> pk_col, 'CREATE', new_j);
  else
    for k in select jsonb_object_keys(new_j) loop
      continue when k in ('last_updated_at', 'last_updated_by');
      if (new_j -> k) is distinct from (old_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      end if;
    end loop;
    if diff <> '{}'::jsonb then
      insert into record_audit (actor_email, table_name, record_key, action, changed)
      values (fn_actor_email(), tg_table_name, new_j ->> pk_col, 'UPDATE', diff);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Vendors — replaces VENDOR_EMAIL_MAP and the localStorage list
-- ---------------------------------------------------------------------
create table vendor (
  vendor_id       bigint generated always as identity primary key,
  name            text not null unique,
  vendor_type     text not null check (vendor_type in ('Payment', 'Delivery', 'Both')),
  email           text,
  is_active       boolean not null default true,
  last_updated_by text,
  last_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Attachments — a stored photo OR a Google Drive link, never both
--
-- One table for both so a record points at "its POD" without caring how
-- the POC supplied it. Photos are capped at 2 MB: the app compresses
-- before upload (a phone photo lands around 300 KB), and the cap is what
-- stops a raw 12 MB camera file from quietly growing the database.
-- ---------------------------------------------------------------------
create table attachment (
  attachment_id uuid primary key default gen_random_uuid(),
  service_code  text not null references service_registry (service_code),
  site_code     text not null references site_master (site_code),
  kind          text not null check (kind in ('upload', 'link')),
  mime          text,
  bytes         bytea,
  size_bytes    integer,
  sha256        text,
  link_url      text,
  file_name     text,
  uploaded_by   text not null default fn_actor_email(),
  uploaded_at   timestamptz not null default now(),

  constraint attachment_shape check (
    (kind = 'upload'
       and bytes is not null and link_url is null
       and size_bytes = octet_length(bytes)
       and size_bytes <= 2097152
       and mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
    or
    (kind = 'link'
       and bytes is null
       and link_url ~ '^https://(drive|docs)\.google\.com/')
  )
);

create index attachment_site_idx on attachment (site_code, service_code);

-- ---------------------------------------------------------------------
-- 5. Diesel procurement
-- ---------------------------------------------------------------------

-- Request IDs come from the database, one counter per type. The app used
-- to compute "highest ID in MY browser + 1", so two POCs filing on the
-- same morning both got PZHPL1001.
create sequence diesel_payment_seq  start with 1001;
create sequence diesel_delivery_seq start with 1001;

create table diesel_request (
  request_id                text primary key,   -- PZHPL1001 / DZHPL1001, assigned by trigger
  site_code                 text not null references site_master (site_code),
  requested_at              timestamptz not null default now(),
  requester_email           text not null default fn_actor_email(),
  requester_name            text,

  entity                    text,
  wh_name_b2b               text,
  wh_name_b2c               text,
  cost_center               text,
  zone                      text,

  fuel                      text not null default 'Diesel' check (fuel in ('Diesel', 'DEF')),
  procurement_type          text not null check (procurement_type in ('Delivery Only', 'Payment Only')),
  vendor_name               text not null,
  quantity                  numeric not null check (quantity > 0),
  order_quantity_litres     numeric check (order_quantity_litres > 0),
  delivered_quantity_litres numeric check (delivered_quantity_litres >= 0),
  rate_per_litre            numeric not null check (rate_per_litre > 0),
  final_amount              numeric not null check (final_amount >= 0),

  qr_attachment_id          uuid references attachment (attachment_id),
  pod_attachment_id         uuid references attachment (attachment_id),

  status text not null default 'Pending Admin Approval' check (status in (
    'Pending Admin Approval', 'Approved', 'Rejected', 'Payment Processing', 'Completed',
    'Ready for Delivery', 'Pending Validation', 'Delivery Completed', 'Partial Delivery', 'Not Delivered'
  )),
  validation text check (validation in ('Pending Validation', 'Delivered', 'Partial Delivered', 'Not Delivered')),

  notes                     text,
  rejection_reason          text,
  approval_notes            text,
  approved_by               text,
  approved_at               timestamptz,
  validated_by              text,
  validated_at              timestamptz,
  last_updated_by           text,
  last_updated_at           timestamptz not null default now(),

  constraint delivery_needs_order_qty check (
    procurement_type <> 'Delivery Only' or order_quantity_litres is not null
  ),
  constraint validation_only_for_delivery check (
    procurement_type = 'Delivery Only' or validation is null
  ),
  constraint rejection_has_reason check (
    status <> 'Rejected' or nullif(trim(rejection_reason), '') is not null
  ),
  constraint validated_has_pod check (
    validation is null or validation = 'Pending Validation' or pod_attachment_id is not null
  ),
  constraint no_self_approval check (
    approved_by is null or approved_by <> requester_email
  )
);

create index diesel_request_site_idx on diesel_request (site_code, requested_at desc);
create index diesel_request_status_idx on diesel_request (status);

create or replace function fn_diesel_assign_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Always overwritten: the caller does not get to pick an ID.
  new.request_id := case new.procurement_type
    when 'Payment Only'  then 'PZHPL' || nextval('diesel_payment_seq')
    when 'Delivery Only' then 'DZHPL' || nextval('diesel_delivery_seq')
  end;
  if new.request_id is null then
    raise exception 'Unknown procurement type: %', new.procurement_type using errcode = '22023';
  end if;
  return new;
end;
$$;

-- The workflow rules that must hold no matter which endpoint (or future
-- endpoint) makes the change.
create or replace function fn_diesel_guard() returns trigger
language plpgsql as $$
declare
  actor text := fn_actor_email();
begin
  if new.request_id      <> old.request_id
  or new.site_code       <> old.site_code
  or new.requester_email <> old.requester_email
  or new.procurement_type <> old.procurement_type then
    raise exception 'ID, site, requester and type are fixed once a request is filed'
      using errcode = '42501';
  end if;

  -- Deciding a pending request is an admin act. The app never writes
  -- 'Approved': approving routes the request straight onto its type's
  -- track — 'Payment Processing' or 'Ready for Delivery' — so the check is
  -- "any move OUT of pending", not "a move to Approved". Guarding only the
  -- word 'Approved' would let a POC approve themselves by writing
  -- 'Payment Processing' directly.
  if old.status = 'Pending Admin Approval' and new.status <> old.status then
    if new.status not in ('Rejected', 'Approved', 'Payment Processing', 'Ready for Delivery') then
      raise exception 'A pending request can only be approved or rejected, not moved to %', new.status
        using errcode = '22023';
    end if;
    if (new.procurement_type = 'Payment Only'  and new.status = 'Ready for Delivery')
    or (new.procurement_type = 'Delivery Only' and new.status = 'Payment Processing') then
      raise exception '% requests do not use the % track', new.procurement_type, new.status
        using errcode = '22023';
    end if;
    if not fn_is_admin() then
      raise exception 'Only an admin may approve or reject a diesel request' using errcode = '42501';
    end if;
    -- Stamped here, not taken from the payload, so it cannot be spoofed.
    new.approved_by := actor;
    new.approved_at := now();
  elsif new.status is distinct from old.status
        and new.status in ('Rejected', 'Approved', 'Payment Processing', 'Ready for Delivery') then
    raise exception 'Only a pending request can be approved or rejected — this one is %', old.status
      using errcode = '22023';
  end if;

  if new.validation is distinct from old.validation
     and new.validation in ('Delivered', 'Partial Delivered', 'Not Delivered') then
    new.validated_by := actor;
    new.validated_at := now();
  end if;

  return new;
end;
$$;

-- What happened to a request, in order — the timeline the app shows.
create table diesel_event (
  event_id    bigint generated always as identity primary key,
  request_id  text not null references diesel_request (request_id),
  action      text not null check (action in ('CREATED', 'APPROVED', 'REJECTED', 'VALIDATED', 'POD_UPLOADED')),
  actor_email text not null default fn_actor_email(),
  at          timestamptz not null default now(),
  details     text
);

create index diesel_event_request_idx on diesel_event (request_id, at);

create or replace function fn_diesel_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into diesel_event (request_id, action, details)
    values (new.request_id, 'CREATED',
            concat_ws(' · ', new.procurement_type, new.vendor_name, new.quantity || ' L'));
    return new;
  end if;

  if old.status = 'Pending Admin Approval' and new.status <> old.status then
    insert into diesel_event (request_id, action, details)
    values (new.request_id,
            case when new.status = 'Rejected' then 'REJECTED' else 'APPROVED' end,
            coalesce(new.rejection_reason, new.approval_notes));
  end if;
  if new.pod_attachment_id is distinct from old.pod_attachment_id and new.pod_attachment_id is not null then
    insert into diesel_event (request_id, action) values (new.request_id, 'POD_UPLOADED');
  end if;
  if new.validation is distinct from old.validation and new.validation <> 'Pending Validation' then
    insert into diesel_event (request_id, action, details)
    values (new.request_id, 'VALIDATED',
            concat_ws(' · ', new.validation, new.delivered_quantity_litres || ' L delivered'));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Daily Site Activity Report — one per site per day
-- ---------------------------------------------------------------------
create table daily_site_log (
  log_id            bigint generated always as identity primary key,
  site_code         text not null references site_master (site_code),
  log_date          date not null,
  submitted_by      text not null default fn_actor_email(),
  submitted_by_name text,
  submitted_at      timestamptz not null default now(),

  -- Utility / MHE availability (%) and routine checks, keyed as the form
  -- keys them (ups, dg, ltPanel, …). jsonb because the checklist grows.
  readings          jsonb not null default '{}'::jsonb check (jsonb_typeof(readings) = 'object'),
  remarks           jsonb not null default '{}'::jsonb check (jsonb_typeof(remarks) = 'object'),

  pm_planned        integer not null default 0 check (pm_planned >= 0),
  pm_completed      integer not null default 0 check (pm_completed >= 0),
  pm_remark         text,
  highlights        text,
  worst_status      text not null check (worst_status in ('clear', 'partial', 'critical', 'missing')),
  deviations_count  integer not null default 0 check (deviations_count >= 0),
  last_updated_by   text,
  last_updated_at   timestamptz not null default now(),

  -- The duplicate check the app did in the browser, now one the database
  -- cannot be talked out of: two POCs at one site cannot both file today.
  unique (site_code, log_date)
);

create table daily_site_activity (
  activity_id bigint generated always as identity primary key,
  log_id      bigint not null references daily_site_log (log_id),
  sr_no       integer not null check (sr_no > 0),
  work        text not null,
  owner       text,
  status      text not null default 'Open' check (status in ('Open', 'In Progress', 'Completed', 'Blocked')),
  eta         date,
  barrier     text,
  cost        numeric check (cost >= 0),
  manhours    numeric check (manhours >= 0),
  unique (log_id, sr_no)
);

-- ---------------------------------------------------------------------
-- 7. Every other service — defined as data, not as tables
--
-- Housekeeping, Washing, Cold Room, RT, BOPT … and whatever service #20
-- turns out to be. Its columns are a row in service_form; its entries are
-- rows in service_submission. Adding a service or a column is an admin
-- action in the app, not a migration.
-- ---------------------------------------------------------------------
create table service_form (
  service_code    text primary key references service_registry (service_code),
  fields          jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  last_updated_by text,
  last_updated_at timestamptz not null default now()
);

create table service_submission (
  submission_id     bigint generated always as identity primary key,
  service_code      text not null references service_registry (service_code),
  site_code         text not null references site_master (site_code),
  entry_date        date not null,
  shift             text check (shift in ('MORNING', 'EVENING', 'NIGHT')),
  status            text not null default 'Submitted'
                    check (status in ('Submitted', 'Pending', 'Verified', 'Flagged', 'Approved', 'Rejected')),
  data              jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  remarks           text,
  submitted_by      text not null default fn_actor_email(),
  submitted_by_name text,
  submitted_at      timestamptz not null default now(),
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_notes      text,
  last_updated_by   text,
  last_updated_at   timestamptz not null default now(),

  constraint no_self_review check (reviewed_by is null or reviewed_by <> submitted_by)
);

create index service_submission_lookup_idx
  on service_submission (service_code, site_code, entry_date desc);

create or replace function fn_submission_guard() returns trigger
language plpgsql as $$
begin
  if new.service_code <> old.service_code
  or new.site_code    <> old.site_code
  or new.submitted_by <> old.submitted_by then
    raise exception 'Service, site and submitter are fixed once an entry is filed'
      using errcode = '42501';
  end if;

  -- Verifying, flagging, approving and rejecting are review acts.
  if new.status is distinct from old.status
     and new.status in ('Verified', 'Flagged', 'Approved', 'Rejected') then
    if not fn_is_admin() then
      raise exception 'Only an admin may review an entry' using errcode = '42501';
    end if;
    new.reviewed_by := fn_actor_email();
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Optional copies to Google Sheets
--
-- A filed record is queued here in the same transaction that saves it, so
-- a copy is never promised for a record that did not commit. The API's
-- worker delivers and retries; Google being down delays the copy and
-- never the POC.
-- ---------------------------------------------------------------------
create table sheet_outbox (
  outbox_id       bigint generated always as identity primary key,
  service_code    text not null references service_registry (service_code),
  target_url      text not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now(),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  done_at         timestamptz
);

create index sheet_outbox_due_idx on sheet_outbox (next_attempt_at) where done_at is null;

-- Queues a copy if, and only if, the service has a sheet linked. Callable
-- by wos_app, which cannot touch sheet_outbox directly — and only for a
-- service the caller holds, so a POC cannot fill someone else's sheet.
create or replace function fn_enqueue_sheet_copy(code text, payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  url text;
begin
  if not fn_has_service(code) then
    raise exception 'No access to service %', code using errcode = '42501';
  end if;
  select nullif(trim(sheet_mirror_url), '') into url
    from service_registry where service_code = code and is_active;
  if url is null then
    return false;
  end if;
  insert into sheet_outbox (service_code, target_url, payload)
  values (code, url, payload || jsonb_build_object('actorEmail', fn_actor_email()));
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Triggers
-- ---------------------------------------------------------------------
create trigger trg_diesel_assign_id before insert on diesel_request
  for each row execute function fn_diesel_assign_id();
create trigger trg_diesel_guard before update on diesel_request
  for each row execute function fn_diesel_guard();
create trigger trg_diesel_event after insert or update on diesel_request
  for each row execute function fn_diesel_event();
create trigger trg_submission_guard before update on service_submission
  for each row execute function fn_submission_guard();

do $$
declare
  t   text;
  pk  text;
begin
  -- Tables with last_updated_* get them stamped on every write.
  foreach t in array array['vendor', 'diesel_request', 'daily_site_log', 'service_form', 'service_submission'] loop
    execute format('create trigger trg_touch_%1$s before insert or update on %1$s
                    for each row execute function fn_touch_updated()', t);
  end loop;

  -- Nothing filed is ever deleted (I1).
  foreach t in array array['vendor', 'attachment', 'diesel_request', 'diesel_event', 'daily_site_log',
                           'daily_site_activity', 'service_form', 'service_submission',
                           'record_audit'] loop
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s
                    for each row execute function fn_block_delete()', t);
  end loop;

  -- Every change is history (I3). diesel_event and record_audit are
  -- history themselves; sheet_outbox is delivery bookkeeping.
  for t, pk in
    select * from (values
      ('vendor', 'vendor_id'), ('attachment', 'attachment_id'), ('diesel_request', 'request_id'),
      ('daily_site_log', 'log_id'), ('daily_site_activity', 'activity_id'),
      ('service_form', 'service_code'), ('service_submission', 'submission_id')
    ) as v (tbl, pk_col)
  loop
    execute format('create trigger trg_audit_%1$s after insert or update on %1$s
                    for each row execute function fn_audit_record(%2$L)', t, pk);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Row Level Security
--
-- The rule everywhere: you see and file records for a (service, site)
-- pair you hold a live grant for. fn_can_access checks both against the
-- SAME grant, so holding DIESEL at one site and EB_DG at another does not
-- let you file diesel at the second.
-- ---------------------------------------------------------------------
alter table record_audit        enable row level security;
alter table vendor              enable row level security;
alter table attachment          enable row level security;
alter table diesel_request      enable row level security;
alter table diesel_event        enable row level security;
alter table daily_site_log      enable row level security;
alter table daily_site_activity enable row level security;
alter table service_form        enable row level security;
alter table service_submission  enable row level security;
alter table sheet_outbox        enable row level security;   -- no policy: wos_app sees none of it

create policy read_record_audit on record_audit for select to wos_app using (is_super_admin());

create policy read_vendor  on vendor for select to wos_app using (true);
create policy write_vendor on vendor for all to wos_app
  using      (is_super_admin() or (fn_is_admin() and fn_has_service('DIESEL')))
  with check (is_super_admin() or (fn_is_admin() and fn_has_service('DIESEL')));

create policy read_attachment on attachment for select to wos_app
  using (fn_can_access(service_code, site_code));
create policy write_attachment on attachment for insert to wos_app
  with check (fn_can_access(service_code, site_code) and uploaded_by = current_user_email());

create policy read_diesel on diesel_request for select to wos_app
  using (fn_can_access('DIESEL', site_code));
-- A new request is always pending and always the caller's own.
create policy write_diesel on diesel_request for insert to wos_app
  with check (fn_can_access('DIESEL', site_code)
              and requester_email = current_user_email()
              and status = 'Pending Admin Approval'
              and approved_by is null
              and validated_by is null);
create policy update_diesel on diesel_request for update to wos_app
  using      (fn_can_access('DIESEL', site_code))
  with check (fn_can_access('DIESEL', site_code));

-- Events inherit the request's visibility.
create policy read_diesel_event on diesel_event for select to wos_app
  using (exists (select 1 from diesel_request r where r.request_id = diesel_event.request_id));

create policy read_daily_site on daily_site_log for select to wos_app
  using (fn_can_access('SITE_ACTIVITY', site_code));
create policy write_daily_site on daily_site_log for insert to wos_app
  with check (fn_can_access('SITE_ACTIVITY', site_code) and submitted_by = current_user_email());
create policy update_daily_site on daily_site_log for update to wos_app
  using      (fn_can_access('SITE_ACTIVITY', site_code))
  with check (fn_can_access('SITE_ACTIVITY', site_code));

-- Activities inherit their report's visibility; the subquery runs under
-- the caller's own RLS, so an unseen report has no reachable activities.
create policy read_activity on daily_site_activity for select to wos_app
  using (exists (select 1 from daily_site_log l where l.log_id = daily_site_activity.log_id));
create policy write_activity on daily_site_activity for insert to wos_app
  with check (exists (select 1 from daily_site_log l where l.log_id = daily_site_activity.log_id));
create policy update_activity on daily_site_activity for update to wos_app
  using      (exists (select 1 from daily_site_log l where l.log_id = daily_site_activity.log_id))
  with check (exists (select 1 from daily_site_log l where l.log_id = daily_site_activity.log_id));

-- Every signed-in user needs a form's columns to draw it; only a Super
-- Admin changes them.
create policy read_service_form  on service_form for select to wos_app using (true);
create policy write_service_form on service_form for all to wos_app
  using (is_super_admin()) with check (is_super_admin());

create policy read_submission on service_submission for select to wos_app
  using (fn_can_access(service_code, site_code));
create policy write_submission on service_submission for insert to wos_app
  with check (fn_can_access(service_code, site_code)
              and submitted_by = current_user_email()
              and status in ('Submitted', 'Pending')
              and reviewed_by is null);
create policy update_submission on service_submission for update to wos_app
  using      (fn_can_access(service_code, site_code))
  with check (fn_can_access(service_code, site_code));

grant select on record_audit, vendor, attachment, diesel_request, diesel_event,
                daily_site_log, daily_site_activity, service_form, service_submission to wos_app;
grant insert, update on vendor, diesel_request, daily_site_log, daily_site_activity,
                        service_form, service_submission to wos_app;
grant insert on attachment to wos_app;
grant execute on function fn_enqueue_sheet_copy(text, jsonb) to wos_app;
