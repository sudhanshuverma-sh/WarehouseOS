-- ---------------------------------------------------------------------
-- One filing per site per period, and a history for the one table that
-- overwrites.
--
-- A warehouse has three or four POCs. Before this file, what the second
-- one got depended on which service they opened:
--
--   daily_site_log      unique (site_code, log_date), second write refused
--   service_submission  no rule at all, second write is a second row
--   ebdg_daily          upsert on record_id, second write overwrites the
--                       first, and no audit trigger, so it is simply gone
--
-- A new file rather than an edit to services.sql: migrations are recorded
-- by filename and applied once, so a change to an applied file never
-- reaches a database that already has it.
-- ---------------------------------------------------------------------

-- The period a filing belongs to, matching periodFor() in
-- src/lib/controlRoom/siteServiceStatus.ts so the board and the database
-- agree on what "already filed" means. Weeks are ISO, Monday first.
create or replace function fn_filing_period(cadence text, on_day date)
returns daterange
language sql immutable as $$
  select case upper(coalesce(cadence, 'DAILY'))
    when 'WEEKLY' then
      daterange(
        (on_day - ((extract(isodow from on_day)::int - 1)))::date,
        (on_day - ((extract(isodow from on_day)::int - 1)) + 7)::date,
        '[)')
    when 'MONTHLY' then
      daterange(date_trunc('month', on_day)::date, (date_trunc('month', on_day) + interval '1 month')::date, '[)')
    else daterange(on_day, on_day + 1, '[)')
  end;
$$;

comment on function fn_filing_period(text, date) is
  'The [from, to) days one filing covers, for the service cadence given.';

/**
 * Refuses a second filing for the same service, site and period.
 *
 * The rule cannot be a unique constraint: whether a repeat is legal
 * depends on the service's Cadence, which a Super Admin can change in
 * Master Data. EVENT_DRIVEN services (Diesel, Crate Washing, Ad-hoc) are
 * meant to be filed several times a day and are left alone.
 *
 * Raised as 23505 with a constraint name so it travels the path that
 * already exists: describeError() in server/http.ts turns 23505 into a
 * 409 DUPLICATE, worded from CONSTRAINT_MESSAGES.
 */
create or replace function fn_one_filing_per_period() returns trigger
language plpgsql as $$
declare
  cadence text;
  period  daterange;
  prior   record;
begin
  select s.cadence into cadence from service_registry s where s.service_code = new.service_code;

  -- An unregistered service, or one filed on request, may repeat.
  if cadence is null or upper(cadence) = 'EVENT_DRIVEN' then
    return new;
  end if;

  period := fn_filing_period(cadence, new.entry_date);

  select submission_id, submitted_by_name, submitted_by, submitted_at
    into prior
    from service_submission
   where service_code = new.service_code
     and site_code    = new.site_code
     and entry_date <@ period
     and (tg_op = 'INSERT' or submission_id <> new.submission_id)
   order by submitted_at
   limit 1;

  if found then
    raise exception
      'ALREADY FILED: % for % in this period, by % at %',
      new.service_code, new.site_code, coalesce(prior.submitted_by_name, prior.submitted_by), prior.submitted_at
      using errcode = '23505', constraint = 'one_filing_per_period';
  end if;

  return new;
end $$;

drop trigger if exists trg_one_filing_per_period on service_submission;
create trigger trg_one_filing_per_period
  before insert on service_submission
  for each row execute function fn_one_filing_per_period();

-- The only table that replaces a row in place was the only one with no
-- history. An amended meter reading now keeps the reading it replaced.
drop trigger if exists trg_audit_ebdg_daily on ebdg_daily;
create trigger trg_audit_ebdg_daily
  after insert or update on ebdg_daily
  for each row execute function fn_audit_record('record_id');
