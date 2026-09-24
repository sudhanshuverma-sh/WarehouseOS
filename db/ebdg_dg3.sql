-- ---------------------------------------------------------------------
-- EB-DG: every site is shown DG 1, DG 2 and DG 3.
--
-- The DG3_* columns have been in ebdg_daily since ebdg.sql; only the
-- per-site count kept the third block hidden. A site without a third DG
-- leaves it blank, and blank readings book no diesel, units or hours
-- (see calcDgBlock in src/lib/ebdg/calculate.ts).
--
-- A new file rather than an edit to ebdg.sql: migrations are recorded by
-- filename and applied once, so a change to an applied file never reaches
-- a database that already has it.
-- ---------------------------------------------------------------------

alter table site_dg_config alter column dg_count set default 3;

update site_dg_config set dg_count = 3 where dg_count < 3;
