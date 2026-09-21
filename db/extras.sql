-- =====================================================================
-- Extra questions on the services that have their own screen.
--
-- Every other service stores its answers in service_submission.data, a
-- jsonb object that already accepts whatever the form defines. The three
-- services with bespoke tables had nowhere to put a question added later,
-- so adding a column to the Daily Site Report, Diesel or EB-DG meant a
-- schema change every time. This is that place, once.
--
-- Deliberately separate from the report's own columns: daily_site_log
-- keeps `readings` for the checklist the health score is computed from,
-- and `extras` for everything an admin adds afterwards, so a new question
-- can never change what "critical" means.
--
-- A new file rather than an edit to services.sql: scripts/migrate.mjs
-- records applied files by name in schema_migrations, so an edit to a
-- file that has already run would never reach an existing database.
-- =====================================================================

alter table daily_site_log
  add column if not exists extras jsonb not null default '{}'::jsonb
  check (jsonb_typeof(extras) = 'object');

alter table diesel_request
  add column if not exists extras jsonb not null default '{}'::jsonb
  check (jsonb_typeof(extras) = 'object');

alter table ebdg_daily
  add column if not exists extras jsonb not null default '{}'::jsonb
  check (jsonb_typeof(extras) = 'object');
