-- =====================================================================
-- WarehouseOS — EB-DG daily entries + per-site DG configuration.
--
-- Runs AFTER db/schema.sql (site_master must exist for the FK).
--
-- Column names are the 109 sheet headers, lower-cased. That mapping is
-- mechanical and reversible, so a column is still resolved BY NAME and
-- never by position (MASTERDATA.md I5). v_ebdg_header_map below is the
-- machine-readable statement of it — the API asserts against that view
-- at boot, so a drifted column fails loudly instead of writing a number
-- into the wrong field.
--
-- No formulas, no generated columns: calculate() in the app computes all
-- 69 derived values and writes literal numbers (I6). A blank stays NULL
-- rather than becoming 0 — 'the POC did not run this DG' and 'the DG ran
-- for zero hours' are different facts and must not collapse.
--
-- ⚠ Three headers collide with SQL keywords: date, timestamp, day. All
-- three are non-reserved in PostgreSQL and legal as column names, but
-- `timestamp` directly followed by a string literal parses as a typed
-- constant, so an unquoted reference can change meaning in a way that
-- does not error. The API therefore double-quotes EVERY identifier it
-- builds from v_ebdg_header_map rather than special-casing these three —
-- one rule that cannot be forgotten beats three exceptions that can.
-- =====================================================================

create table ebdg_daily (
  record_id                     text primary key,
  date                          date not null,
  timestamp                     timestamptz not null,
  day                           text,
  site_code                     text not null references site_master(site_code),
  wh_code                       text,
  zone                          text,
  dg1_hsd_opening               numeric,
  dg1_hsd_added                 numeric,
  dg1_hsd_closing               numeric,
  dg1_hsd_consumption           numeric,
  dg1_kwh_opening               numeric,
  dg1_kwh_closing               numeric,
  dg1_kwh_consumption           numeric,
  dg1_run_hrs                   numeric,
  dg1_unit_per_ltr              numeric not null default 0,
  dg1_ltr_per_hr                numeric not null default 0,
  dg1_hour_meter                numeric,
  dg1_b_check_done_today        text,
  dg1_b_check_last_hrs          numeric,
  dg1_b_check_last_date         date,
  dg1_b_check_due_hrs           numeric,
  dg1_b_check_remaining_hrs     numeric,
  dg1_b_check_due_date          date,
  dg1_b_check_remaining_days    numeric,
  dg1_b_check_status            text,
  dg2_hsd_opening               numeric,
  dg2_hsd_added                 numeric,
  dg2_hsd_closing               numeric,
  dg2_hsd_consumption           numeric,
  dg2_kwh_opening               numeric,
  dg2_kwh_closing               numeric,
  dg2_kwh_consumption           numeric,
  dg2_run_hrs                   numeric,
  dg2_unit_per_ltr              numeric not null default 0,
  dg2_ltr_per_hr                numeric not null default 0,
  dg2_hour_meter                numeric,
  dg2_b_check_done_today        text,
  dg2_b_check_last_hrs          numeric,
  dg2_b_check_last_date         date,
  dg2_b_check_due_hrs           numeric,
  dg2_b_check_remaining_hrs     numeric,
  dg2_b_check_due_date          date,
  dg2_b_check_remaining_days    numeric,
  dg2_b_check_status            text,
  dg3_hsd_opening               numeric,
  dg3_hsd_added                 numeric,
  dg3_hsd_closing               numeric,
  dg3_hsd_consumption           numeric,
  dg3_kwh_opening               numeric,
  dg3_kwh_closing               numeric,
  dg3_kwh_consumption           numeric,
  dg3_run_hrs                   numeric,
  dg3_unit_per_ltr              numeric not null default 0,
  dg3_ltr_per_hr                numeric not null default 0,
  dg3_hour_meter                numeric,
  dg3_b_check_done_today        text,
  dg3_b_check_last_hrs          numeric,
  dg3_b_check_last_date         date,
  dg3_b_check_due_hrs           numeric,
  dg3_b_check_remaining_hrs     numeric,
  dg3_b_check_due_date          date,
  dg3_b_check_remaining_days    numeric,
  dg3_b_check_status            text,
  def_opening                   numeric,
  def_added                     numeric,
  def_closing                   numeric,
  def_used                      numeric,
  total_hsd_consumption         numeric not null default 0,
  total_kwh_consumption         numeric not null default 0,
  total_run_hrs                 numeric not null default 0,
  total_unit_per_ltr            numeric not null default 0,
  total_ltr_per_hr              numeric not null default 0,
  hsd_tank_opening              numeric,
  hsd_received_ltr              numeric,
  hsd_rate                      numeric,
  hsd_amount                    numeric not null default 0,
  hsd_tank_closing              numeric,
  grid_mf                       numeric,
  grid_kwh_opening              numeric,
  grid_kwh_closing              numeric,
  grid_kwh_consumed             numeric,
  grid_kvah_opening             numeric,
  grid_kvah_closing             numeric,
  grid_kvah_consumed            numeric,
  grid_pf                       numeric not null default 0,
  grid_supply_hrs               numeric,
  grid_supply_pct               numeric not null default 0,
  dg_supply_pct                 numeric not null default 0,
  eb_power_cuts                 numeric,
  max_load_kw                   numeric,
  solar_opening                 numeric,
  solar_closing                 numeric,
  solar_generated               numeric,
  total_kwh_all_sources         numeric not null default 0,
  eb_rate_per_unit              numeric,
  eb_amount                     numeric not null default 0,
  dg_amount                     numeric not null default 0,
  dg_rate_per_unit              numeric not null default 0,
  solar_rate_per_unit           numeric,
  solar_amount                  numeric not null default 0,
  total_amount                  numeric not null default 0,
  blended_rate_per_unit         numeric not null default 0,
  water_opening                 numeric,
  water_closing                 numeric,
  water_consumed                numeric,
  raw_water_procured_kl         numeric,
  remark                        text,
  submitted_by                  text
);

-- The carry-forward lookup: 'this site's most recent row strictly before
-- this date'. Site first, then date descending — so the planner walks
-- straight to the previous row instead of scanning the site's history.
create unique index ebdg_daily_site_date_idx on ebdg_daily (site_code, date desc);
create index ebdg_daily_date_idx on ebdg_daily (date desc);

-- One row per site per day. The form offers an edit when this would trip,
-- rather than writing a second row for the same day (spec edge case 4).
alter table ebdg_daily add constraint ebdg_one_row_per_site_day unique (site_code, date);

-- ---------------------------------------------------------------------
-- Header map — the contract between the sheet and this table.
-- ---------------------------------------------------------------------
create or replace view v_ebdg_header_map (ordinal, header_name, column_name) as
select row_number() over () , h, c
from (values
  ('Record_ID', 'record_id'),
  ('Date', 'date'),
  ('Timestamp', 'timestamp'),
  ('Day', 'day'),
  ('Site_Code', 'site_code'),
  ('WH_Code', 'wh_code'),
  ('Zone', 'zone'),
  ('DG1_HSD_Opening', 'dg1_hsd_opening'),
  ('DG1_HSD_Added', 'dg1_hsd_added'),
  ('DG1_HSD_Closing', 'dg1_hsd_closing'),
  ('DG1_HSD_Consumption', 'dg1_hsd_consumption'),
  ('DG1_KWH_Opening', 'dg1_kwh_opening'),
  ('DG1_KWH_Closing', 'dg1_kwh_closing'),
  ('DG1_KWH_Consumption', 'dg1_kwh_consumption'),
  ('DG1_Run_Hrs', 'dg1_run_hrs'),
  ('DG1_Unit_Per_Ltr', 'dg1_unit_per_ltr'),
  ('DG1_Ltr_Per_Hr', 'dg1_ltr_per_hr'),
  ('DG1_Hour_Meter', 'dg1_hour_meter'),
  ('DG1_B_Check_Done_Today', 'dg1_b_check_done_today'),
  ('DG1_B_Check_Last_Hrs', 'dg1_b_check_last_hrs'),
  ('DG1_B_Check_Last_Date', 'dg1_b_check_last_date'),
  ('DG1_B_Check_Due_Hrs', 'dg1_b_check_due_hrs'),
  ('DG1_B_Check_Remaining_Hrs', 'dg1_b_check_remaining_hrs'),
  ('DG1_B_Check_Due_Date', 'dg1_b_check_due_date'),
  ('DG1_B_Check_Remaining_Days', 'dg1_b_check_remaining_days'),
  ('DG1_B_Check_Status', 'dg1_b_check_status'),
  ('DG2_HSD_Opening', 'dg2_hsd_opening'),
  ('DG2_HSD_Added', 'dg2_hsd_added'),
  ('DG2_HSD_Closing', 'dg2_hsd_closing'),
  ('DG2_HSD_Consumption', 'dg2_hsd_consumption'),
  ('DG2_KWH_Opening', 'dg2_kwh_opening'),
  ('DG2_KWH_Closing', 'dg2_kwh_closing'),
  ('DG2_KWH_Consumption', 'dg2_kwh_consumption'),
  ('DG2_Run_Hrs', 'dg2_run_hrs'),
  ('DG2_Unit_Per_Ltr', 'dg2_unit_per_ltr'),
  ('DG2_Ltr_Per_Hr', 'dg2_ltr_per_hr'),
  ('DG2_Hour_Meter', 'dg2_hour_meter'),
  ('DG2_B_Check_Done_Today', 'dg2_b_check_done_today'),
  ('DG2_B_Check_Last_Hrs', 'dg2_b_check_last_hrs'),
  ('DG2_B_Check_Last_Date', 'dg2_b_check_last_date'),
  ('DG2_B_Check_Due_Hrs', 'dg2_b_check_due_hrs'),
  ('DG2_B_Check_Remaining_Hrs', 'dg2_b_check_remaining_hrs'),
  ('DG2_B_Check_Due_Date', 'dg2_b_check_due_date'),
  ('DG2_B_Check_Remaining_Days', 'dg2_b_check_remaining_days'),
  ('DG2_B_Check_Status', 'dg2_b_check_status'),
  ('DG3_HSD_Opening', 'dg3_hsd_opening'),
  ('DG3_HSD_Added', 'dg3_hsd_added'),
  ('DG3_HSD_Closing', 'dg3_hsd_closing'),
  ('DG3_HSD_Consumption', 'dg3_hsd_consumption'),
  ('DG3_KWH_Opening', 'dg3_kwh_opening'),
  ('DG3_KWH_Closing', 'dg3_kwh_closing'),
  ('DG3_KWH_Consumption', 'dg3_kwh_consumption'),
  ('DG3_Run_Hrs', 'dg3_run_hrs'),
  ('DG3_Unit_Per_Ltr', 'dg3_unit_per_ltr'),
  ('DG3_Ltr_Per_Hr', 'dg3_ltr_per_hr'),
  ('DG3_Hour_Meter', 'dg3_hour_meter'),
  ('DG3_B_Check_Done_Today', 'dg3_b_check_done_today'),
  ('DG3_B_Check_Last_Hrs', 'dg3_b_check_last_hrs'),
  ('DG3_B_Check_Last_Date', 'dg3_b_check_last_date'),
  ('DG3_B_Check_Due_Hrs', 'dg3_b_check_due_hrs'),
  ('DG3_B_Check_Remaining_Hrs', 'dg3_b_check_remaining_hrs'),
  ('DG3_B_Check_Due_Date', 'dg3_b_check_due_date'),
  ('DG3_B_Check_Remaining_Days', 'dg3_b_check_remaining_days'),
  ('DG3_B_Check_Status', 'dg3_b_check_status'),
  ('DEF_Opening', 'def_opening'),
  ('DEF_Added', 'def_added'),
  ('DEF_Closing', 'def_closing'),
  ('DEF_Used', 'def_used'),
  ('Total_HSD_Consumption', 'total_hsd_consumption'),
  ('Total_KWH_Consumption', 'total_kwh_consumption'),
  ('Total_Run_Hrs', 'total_run_hrs'),
  ('Total_Unit_Per_Ltr', 'total_unit_per_ltr'),
  ('Total_Ltr_Per_Hr', 'total_ltr_per_hr'),
  ('HSD_Tank_Opening', 'hsd_tank_opening'),
  ('HSD_Received_Ltr', 'hsd_received_ltr'),
  ('HSD_Rate', 'hsd_rate'),
  ('HSD_Amount', 'hsd_amount'),
  ('HSD_Tank_Closing', 'hsd_tank_closing'),
  ('Grid_MF', 'grid_mf'),
  ('Grid_KWH_Opening', 'grid_kwh_opening'),
  ('Grid_KWH_Closing', 'grid_kwh_closing'),
  ('Grid_KWH_Consumed', 'grid_kwh_consumed'),
  ('Grid_KVAH_Opening', 'grid_kvah_opening'),
  ('Grid_KVAH_Closing', 'grid_kvah_closing'),
  ('Grid_KVAH_Consumed', 'grid_kvah_consumed'),
  ('Grid_PF', 'grid_pf'),
  ('Grid_Supply_Hrs', 'grid_supply_hrs'),
  ('Grid_Supply_Pct', 'grid_supply_pct'),
  ('DG_Supply_Pct', 'dg_supply_pct'),
  ('EB_Power_Cuts', 'eb_power_cuts'),
  ('Max_Load_KW', 'max_load_kw'),
  ('Solar_Opening', 'solar_opening'),
  ('Solar_Closing', 'solar_closing'),
  ('Solar_Generated', 'solar_generated'),
  ('Total_KWH_All_Sources', 'total_kwh_all_sources'),
  ('EB_Rate_Per_Unit', 'eb_rate_per_unit'),
  ('EB_Amount', 'eb_amount'),
  ('DG_Amount', 'dg_amount'),
  ('DG_Rate_Per_Unit', 'dg_rate_per_unit'),
  ('Solar_Rate_Per_Unit', 'solar_rate_per_unit'),
  ('Solar_Amount', 'solar_amount'),
  ('Total_Amount', 'total_amount'),
  ('Blended_Rate_Per_Unit', 'blended_rate_per_unit'),
  ('Water_Opening', 'water_opening'),
  ('Water_Closing', 'water_closing'),
  ('Water_Consumed', 'water_consumed'),
  ('Raw_Water_Procured_KL', 'raw_water_procured_kl'),
  ('Remark', 'remark'),
  ('Submitted_By', 'submitted_by')
) as t(h, c);

-- ---------------------------------------------------------------------
-- Per-site DG configuration — drives how many DG blocks the form shows.
-- Until now the app assumed 2 DGs everywhere because no source existed.
-- ---------------------------------------------------------------------
create table site_dg_config (
  site_code             text primary key references site_master(site_code),
  dg_count              smallint not null default 2 check (dg_count between 0 and 3),
  has_def               boolean  not null default true,
  has_solar             boolean  not null default false,
  b_check_interval_hrs  numeric  not null default 500,
  b_check_interval_days integer  not null default 365,
  last_updated_by       text,
  last_updated_at       timestamptz not null default now()
);

create trigger trg_touch_site_dg_config before insert or update on site_dg_config
  for each row execute function fn_touch_updated();
create trigger trg_audit_site_dg_config after insert or update on site_dg_config
  for each row execute function fn_audit_master('site_code');

-- Every active real site gets a default row, so the form always has config.
insert into site_dg_config (site_code)
select site_code from site_master where site_code <> 'ALL'
on conflict (site_code) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security for daily entries.
--
-- This is the rule the whole feature turns on: a POC sees their own
-- site's rows and nothing else. Before this existed the browser did the
-- filtering, which meant a POC opening "My Site Records" was served all
-- 120 sites and merely shown one. Here the other 119 never leave the
-- database.
-- ---------------------------------------------------------------------
alter table ebdg_daily     enable row level security;
alter table site_dg_config enable row level security;

-- Read: any site in your grant, provided you hold the EB_DG service.
create policy read_ebdg on ebdg_daily for select to wos_app
  using (fn_has_service('EB_DG') and site_code in (select fn_visible_sites()));

-- Write: same scope. `with check` is what stops a POC from filing a row
-- against somebody else's site by editing the payload — without it, the
-- using clause would let the insert through and only block reading it
-- back, which is a silent corruption rather than an error.
create policy write_ebdg on ebdg_daily for insert to wos_app
  with check (fn_has_service('EB_DG') and site_code in (select fn_visible_sites()));

-- Update exists for the duplicate-entry case: same day, same site, the
-- POC corrects a reading. Still their own site, still their own service.
create policy update_ebdg on ebdg_daily for update to wos_app
  using      (fn_has_service('EB_DG') and site_code in (select fn_visible_sites()))
  with check (fn_has_service('EB_DG') and site_code in (select fn_visible_sites()));

-- I1 again: a filed reading is history. Corrections are updates.
create trigger trg_nodelete_ebdg before delete on ebdg_daily
  for each row execute function fn_block_delete();

-- DG config is readable by anyone who can see the site (the form needs it
-- to know how many DG blocks to draw); only a Super Admin may change it.
create policy read_dg_config on site_dg_config for select to wos_app
  using (site_code in (select fn_visible_sites()));
create policy write_dg_config on site_dg_config for all to wos_app
  using (is_super_admin()) with check (is_super_admin());

grant select, insert, update on ebdg_daily     to wos_app;
grant select, insert, update on site_dg_config to wos_app;
grant select                 on v_ebdg_header_map to wos_app;
