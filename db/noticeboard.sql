-- ---------------------------------------------------------------------
-- Noticeboard: messages, SOPs and documents a Super Admin posts, and who
-- has read them.
--
-- A new file rather than an edit to services.sql: migrations are recorded
-- by filename and applied once, so a change to an applied file never
-- reaches a database that already has it.
--
-- Documents are Google Drive links, never uploads. The attachment table
-- caps uploads at 2 MiB and allows JPEG, PNG, WebP and PDF only, and a real
-- deck is 5 to 30 MB; a Drive link has no size, and Slides, Docs, Sheets and
-- PDFs in Drive all pass the same link check the attachment table uses.
-- ---------------------------------------------------------------------

create table notice (
  notice_id       bigint generated always as identity primary key,
  title           text not null check (length(trim(title)) > 0),
  body            text,
  link_url        text,
  audience        text not null check (audience in ('ALL', 'SITE', 'PERSON')),
  site_code       text references site_master (site_code),
  person_email    text,
  posted_by       text not null default fn_actor_email(),
  posted_by_name  text,
  posted_at       timestamptz not null default now(),
  last_updated_by text,
  last_updated_at timestamptz not null default now(),

  -- Who it is for decides which column is filled, and only that one. A
  -- SITE notice with no site would reach nobody; a PERSON notice with a
  -- site as well would be ambiguous about which rule let a reader see it.
  constraint notice_audience check (
    (audience = 'ALL'    and site_code is null     and person_email is null) or
    (audience = 'SITE'   and site_code is not null and person_email is null) or
    (audience = 'PERSON' and site_code is null     and person_email is not null)
  ),

  -- The same rule the attachment table enforces for its links.
  constraint notice_link_is_drive check (
    link_url is null or link_url ~ '^https://(drive|docs)\.google\.com/'
  )
);

create index notice_posted_idx on notice (posted_at desc);

/**
 * Who has opened which notice.
 *
 * The first per-person "seen" state in this app: until now every count was
 * derived and identical for everyone in the same scope. It is what lets the
 * Noticeboard tab keep asking for attention until THIS person has looked,
 * without anyone else's reading switching it off.
 */
create table notice_read (
  notice_id    bigint not null references notice (notice_id),
  reader_email text   not null default fn_actor_email(),
  read_at      timestamptz not null default now(),
  primary key (notice_id, reader_email)
);

-- ---------------------------------------------------------------------
-- Triggers, through the same functions every other record here uses.
-- ---------------------------------------------------------------------

create trigger trg_touch_notice before insert or update on notice
  for each row execute function fn_touch_updated();

-- A posted notice is a record like any other: it is never deleted, so a
-- POC can always be shown what they were told and when.
create trigger trg_nodelete_notice before delete on notice
  for each row execute function fn_block_delete();

create trigger trg_audit_notice after insert or update on notice
  for each row execute function fn_audit_record('notice_id');

-- ---------------------------------------------------------------------
-- Who may see what, enforced here and not only in the UI.
-- ---------------------------------------------------------------------

alter table notice enable row level security;
alter table notice_read enable row level security;

-- A notice addressed to one person is invisible to everyone else at the
-- database, not merely hidden by the screen. A Super Admin sees them all,
-- since they posted them.
create policy read_notice on notice for select to wos_app
  using (
    is_super_admin()
    or audience = 'ALL'
    or (audience = 'SITE' and site_code in (select fn_visible_sites()))
    or (audience = 'PERSON' and lower(person_email) = lower(current_user_email()))
  );

create policy write_notice on notice for all to wos_app
  using (is_super_admin())
  with check (is_super_admin() and posted_by = current_user_email());

-- Reading is personal: a person records and sees only their own reads.
create policy read_own_reads on notice_read for select to wos_app
  using (reader_email = current_user_email());

-- And only for a notice they can actually see. Foreign keys ignore RLS, so
-- without the exists() a POC could record reading someone else's private
-- notice, and worse, use the answer as an oracle: a missing id fails the
-- foreign key while an existing private one succeeds, so they could probe
-- which private notices exist. The subquery runs under notice's own RLS,
-- so an invisible notice and a missing one look the same: no row.
create policy write_own_reads on notice_read for insert to wos_app
  with check (
    reader_email = current_user_email()
    and exists (select 1 from notice n where n.notice_id = notice_read.notice_id)
  );

grant select, insert, update on notice to wos_app;
grant select, insert on notice_read to wos_app;
