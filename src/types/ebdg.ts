/**
 * EB-DG (Electricity Board / Diesel Generator) daily entry — types.
 *
 * Mirrors the two destination Google Sheets tabs column-for-column:
 *   EB_DG_B2B (68 sites) and EB_DG_B2C (52 sites) — identical structure,
 * routed by the site's Channel (Site_Master.Channel, see MASTERDATA.md §3).
 *
 * EBDG_COLUMN_ORDER below is the SOURCE OF TRUTH for the sheet's column
 * order. Never write to the sheet positionally — always resolve by header
 * name (see ../lib/ebdg/columns.ts), so an inserted column fails loudly
 * instead of writing diesel litres into a date field (MASTERDATA.md I5).
 */

export type YesNo = 'Yes' | 'No';
export type YesNoBlank = 'Yes' | 'No' | '';
export type EbDgChannel = 'EB_DG_B2B' | 'EB_DG_B2C';
export type BCheckStatus = 'OK' | 'DUE SOON' | 'DUE NOW' | '';

/**
 * A numeric cell that may be BLANK — and blank is not zero.
 *
 * Every formula in the spec is written `=IF(X_Closing="","",…)`: an unfilled
 * reading produces an empty cell, not a 0. That distinction is load-bearing.
 * A standby DG the POC correctly leaves alone must not book its whole tank as
 * consumed, and a meter nobody could read must not read as "the meter says 0".
 *
 * Blank counts as 0 ONLY inside the aggregates the spec wraps in N()
 * (Total_HSD_Consumption and friends) — see nz() in ../lib/ebdg/calculate.ts.
 */
export type Num = number | '';

/** The exact 109-column order of both destination tabs. Do not reorder. */
export const EBDG_COLUMN_ORDER = [
  'Record_ID', 'Date', 'Timestamp', 'Day', 'Site_Code', 'WH_Code', 'Zone',
  'DG1_HSD_Opening', 'DG1_HSD_Added', 'DG1_HSD_Closing', 'DG1_HSD_Consumption',
  'DG1_KWH_Opening', 'DG1_KWH_Closing', 'DG1_KWH_Consumption', 'DG1_Run_Hrs',
  'DG1_Unit_Per_Ltr', 'DG1_Ltr_Per_Hr', 'DG1_Hour_Meter',
  'DG1_B_Check_Done_Today', 'DG1_B_Check_Last_Hrs', 'DG1_B_Check_Last_Date',
  'DG1_B_Check_Due_Hrs', 'DG1_B_Check_Remaining_Hrs', 'DG1_B_Check_Due_Date',
  'DG1_B_Check_Remaining_Days', 'DG1_B_Check_Status',
  'DG2_HSD_Opening', 'DG2_HSD_Added', 'DG2_HSD_Closing', 'DG2_HSD_Consumption',
  'DG2_KWH_Opening', 'DG2_KWH_Closing', 'DG2_KWH_Consumption', 'DG2_Run_Hrs',
  'DG2_Unit_Per_Ltr', 'DG2_Ltr_Per_Hr', 'DG2_Hour_Meter',
  'DG2_B_Check_Done_Today', 'DG2_B_Check_Last_Hrs', 'DG2_B_Check_Last_Date',
  'DG2_B_Check_Due_Hrs', 'DG2_B_Check_Remaining_Hrs', 'DG2_B_Check_Due_Date',
  'DG2_B_Check_Remaining_Days', 'DG2_B_Check_Status',
  'DG3_HSD_Opening', 'DG3_HSD_Added', 'DG3_HSD_Closing', 'DG3_HSD_Consumption',
  'DG3_KWH_Opening', 'DG3_KWH_Closing', 'DG3_KWH_Consumption', 'DG3_Run_Hrs',
  'DG3_Unit_Per_Ltr', 'DG3_Ltr_Per_Hr', 'DG3_Hour_Meter',
  'DG3_B_Check_Done_Today', 'DG3_B_Check_Last_Hrs', 'DG3_B_Check_Last_Date',
  'DG3_B_Check_Due_Hrs', 'DG3_B_Check_Remaining_Hrs', 'DG3_B_Check_Due_Date',
  'DG3_B_Check_Remaining_Days', 'DG3_B_Check_Status',
  'DEF_Opening', 'DEF_Added', 'DEF_Closing', 'DEF_Used',
  'Total_HSD_Consumption', 'Total_KWH_Consumption', 'Total_Run_Hrs',
  'Total_Unit_Per_Ltr', 'Total_Ltr_Per_Hr',
  'HSD_Tank_Opening', 'HSD_Received_Ltr', 'HSD_Rate', 'HSD_Amount', 'HSD_Tank_Closing',
  'Grid_MF', 'Grid_KWH_Opening', 'Grid_KWH_Closing', 'Grid_KWH_Consumed',
  'Grid_KVAH_Opening', 'Grid_KVAH_Closing', 'Grid_KVAH_Consumed', 'Grid_PF',
  'Grid_Supply_Hrs', 'Grid_Supply_Pct', 'DG_Supply_Pct', 'EB_Power_Cuts', 'Max_Load_KW',
  'Solar_Opening', 'Solar_Closing', 'Solar_Generated', 'Total_KWH_All_Sources',
  'EB_Rate_Per_Unit', 'EB_Amount', 'DG_Amount', 'DG_Rate_Per_Unit',
  'Solar_Rate_Per_Unit', 'Solar_Amount', 'Total_Amount', 'Blended_Rate_Per_Unit',
  'Water_Opening', 'Water_Closing', 'Water_Consumed', 'Raw_Water_Procured_KL',
  'Remark', 'Submitted_By'
] as const;

export type EbDgColumn = typeof EBDG_COLUMN_ORDER[number];

if (EBDG_COLUMN_ORDER.length !== 109) {
  // Fails loudly at import time rather than silently writing a malformed row.
  throw new Error(`EBDG_COLUMN_ORDER must have exactly 109 columns, has ${EBDG_COLUMN_ORDER.length}.`);
}

/** Per-DG calculated + input block shape, parameterised by DG number (1|2|3) via key prefix. */
export interface EbDgSingle {
  HSD_Opening: Num;
  HSD_Added: Num;
  HSD_Closing: Num;
  HSD_Consumption: Num;
  KWH_Opening: Num;
  KWH_Closing: Num;
  KWH_Consumption: Num;
  Run_Hrs: Num;
  /** IFERROR(...,0) in the spec — always a number, 0 when undefined. */
  Unit_Per_Ltr: number;
  Ltr_Per_Hr: number;
  Hour_Meter: Num;
  B_Check_Done_Today: YesNoBlank;
  B_Check_Last_Hrs: Num;
  B_Check_Last_Date: string | '';
  B_Check_Due_Hrs: Num;
  B_Check_Remaining_Hrs: Num;
  B_Check_Due_Date: string | '';
  B_Check_Remaining_Days: Num;
  B_Check_Status: BCheckStatus;
}

/** The full 109-column row, exactly as written to EB_DG_B2B / EB_DG_B2C. */
export interface EbDgRow {
  Record_ID: string;
  Date: string;          // YYYY-MM-DD — the day the reading is for
  Timestamp: string;      // ISO 8601 with +05:30 offset — moment of submission
  Day: string;            // three-letter weekday, derived from Date
  Site_Code: string;
  WH_Code: string;
  Zone: string;

  DG1_HSD_Opening: Num; DG1_HSD_Added: Num; DG1_HSD_Closing: Num; DG1_HSD_Consumption: Num;
  DG1_KWH_Opening: Num; DG1_KWH_Closing: Num; DG1_KWH_Consumption: Num;
  DG1_Run_Hrs: Num; DG1_Unit_Per_Ltr: number; DG1_Ltr_Per_Hr: number; DG1_Hour_Meter: Num;
  DG1_B_Check_Done_Today: YesNoBlank; DG1_B_Check_Last_Hrs: Num; DG1_B_Check_Last_Date: string | '';
  DG1_B_Check_Due_Hrs: Num; DG1_B_Check_Remaining_Hrs: Num;
  DG1_B_Check_Due_Date: string | ''; DG1_B_Check_Remaining_Days: Num; DG1_B_Check_Status: BCheckStatus;

  DG2_HSD_Opening: Num; DG2_HSD_Added: Num; DG2_HSD_Closing: Num; DG2_HSD_Consumption: Num;
  DG2_KWH_Opening: Num; DG2_KWH_Closing: Num; DG2_KWH_Consumption: Num;
  DG2_Run_Hrs: Num; DG2_Unit_Per_Ltr: number; DG2_Ltr_Per_Hr: number; DG2_Hour_Meter: Num;
  DG2_B_Check_Done_Today: YesNoBlank; DG2_B_Check_Last_Hrs: Num; DG2_B_Check_Last_Date: string | '';
  DG2_B_Check_Due_Hrs: Num; DG2_B_Check_Remaining_Hrs: Num;
  DG2_B_Check_Due_Date: string | ''; DG2_B_Check_Remaining_Days: Num; DG2_B_Check_Status: BCheckStatus;

  DG3_HSD_Opening: Num; DG3_HSD_Added: Num; DG3_HSD_Closing: Num; DG3_HSD_Consumption: Num;
  DG3_KWH_Opening: Num; DG3_KWH_Closing: Num; DG3_KWH_Consumption: Num;
  DG3_Run_Hrs: Num; DG3_Unit_Per_Ltr: number; DG3_Ltr_Per_Hr: number; DG3_Hour_Meter: Num;
  DG3_B_Check_Done_Today: YesNoBlank; DG3_B_Check_Last_Hrs: Num; DG3_B_Check_Last_Date: string | '';
  DG3_B_Check_Due_Hrs: Num; DG3_B_Check_Remaining_Hrs: Num;
  DG3_B_Check_Due_Date: string | ''; DG3_B_Check_Remaining_Days: Num; DG3_B_Check_Status: BCheckStatus;

  DEF_Opening: Num; DEF_Added: Num; DEF_Closing: Num; DEF_Used: Num;

  // Totals wrap every term in N(), so a blank term counts as 0 and the total
  // is always a real number — that is what the spec's formulas do.
  Total_HSD_Consumption: number; Total_KWH_Consumption: number; Total_Run_Hrs: number;
  Total_Unit_Per_Ltr: number; Total_Ltr_Per_Hr: number;

  HSD_Tank_Opening: Num; HSD_Received_Ltr: Num; HSD_Rate: Num; HSD_Amount: number; HSD_Tank_Closing: Num;

  Grid_MF: Num; Grid_KWH_Opening: Num; Grid_KWH_Closing: Num; Grid_KWH_Consumed: Num;
  Grid_KVAH_Opening: Num; Grid_KVAH_Closing: Num; Grid_KVAH_Consumed: Num; Grid_PF: number;
  Grid_Supply_Hrs: Num; Grid_Supply_Pct: number; DG_Supply_Pct: number; EB_Power_Cuts: Num; Max_Load_KW: Num;

  Solar_Opening: Num; Solar_Closing: Num; Solar_Generated: Num; Total_KWH_All_Sources: number;

  EB_Rate_Per_Unit: Num; EB_Amount: number; DG_Amount: number; DG_Rate_Per_Unit: number;
  Solar_Rate_Per_Unit: Num; Solar_Amount: number; Total_Amount: number; Blended_Rate_Per_Unit: number;

  Water_Opening: Num; Water_Closing: Num; Water_Consumed: Num; Raw_Water_Procured_KL: Num;

  Remark: string;
  Submitted_By: string;
}

/**
 * The 35 fields the POC actually types. Everything else in EbDgRow is
 * either app-written (Record_ID, Date, Timestamp, Site_Code, Submitted_By)
 * or calculated by calculate() (../lib/ebdg/calculate.ts).
 */
export interface EbDgInput {
  DG1_HSD_Added: Num; DG1_HSD_Closing: Num; DG1_KWH_Closing: Num;
  DG1_Run_Hrs: Num; DG1_Hour_Meter: Num; DG1_B_Check_Done_Today: YesNoBlank;

  DG2_HSD_Added: Num; DG2_HSD_Closing: Num; DG2_KWH_Closing: Num;
  DG2_Run_Hrs: Num; DG2_Hour_Meter: Num; DG2_B_Check_Done_Today: YesNoBlank;

  DG3_HSD_Added: Num; DG3_HSD_Closing: Num; DG3_KWH_Closing: Num;
  DG3_Run_Hrs: Num; DG3_Hour_Meter: Num; DG3_B_Check_Done_Today: YesNoBlank;

  DEF_Added: Num; DEF_Closing: Num;

  HSD_Received_Ltr: Num; HSD_Rate: Num; HSD_Tank_Closing: Num;

  Grid_MF: Num; Grid_KWH_Closing: Num; Grid_KVAH_Closing: Num;
  Grid_Supply_Hrs: Num; EB_Power_Cuts: Num; Max_Load_KW: Num;

  Solar_Closing: Num;

  EB_Rate_Per_Unit: Num; Solar_Rate_Per_Unit: Num;

  Water_Closing: Num; Raw_Water_Procured_KL: Num;

  Remark: string;
}

/**
 * First-ever entry for a site has no previous row to carry openings from
 * (edge case 1 in the spec). Those openings become editable, one time —
 * this is how the form supplies them to calculate().
 *
 * B_Check_Last_Hrs / B_Check_Last_Date are seeded here for the same reason
 * the openings are: they are carry-forward chains too, and a chain with no
 * start never produces a meaningful due date. Without a seed, a site whose
 * DGs were last serviced last March would read DUE NOW from day one and stay
 * there until someone happened to file a B-check — the badge would carry no
 * information. Seeding lets the POC enter the real last-service reading once.
 */
export interface EbDgSeedOpenings {
  DG1_HSD_Opening?: number; DG1_KWH_Opening?: number;
  DG2_HSD_Opening?: number; DG2_KWH_Opening?: number;
  DG3_HSD_Opening?: number; DG3_KWH_Opening?: number;
  DEF_Opening?: number;
  HSD_Tank_Opening?: number;
  Grid_KWH_Opening?: number; Grid_KVAH_Opening?: number;
  Solar_Opening?: number;
  Water_Opening?: number;

  /** Hour-meter reading at the DG's last B-check, and the date it was done. */
  DG1_B_Check_Last_Hrs?: number; DG1_B_Check_Last_Date?: string;
  DG2_B_Check_Last_Hrs?: number; DG2_B_Check_Last_Date?: string;
  DG3_B_Check_Last_Hrs?: number; DG3_B_Check_Last_Date?: string;
}

/** Per-site DG configuration — Site_DG_Config tab (MASTERDATA.md-style master). */
export interface SiteDgConfig {
  Site_Code: string;
  DG_Count: 0 | 1 | 2 | 3;
  Has_DEF: YesNo;
  Has_Solar: YesNo;
  /** B-check interval in run hours. Default 500 if blank. */
  B_Check_Interval_Hrs?: number;
  /** B-check interval in calendar days. Default 365 if blank. */
  B_Check_Interval_Days?: number;
}

export const DEFAULT_B_CHECK_INTERVAL_HRS = 500;
export const DEFAULT_B_CHECK_INTERVAL_DAYS = 365;

export function resolveSiteDgConfig(partial: Partial<SiteDgConfig> & { Site_Code: string }): SiteDgConfig {
  return {
    Site_Code: partial.Site_Code,
    DG_Count: (partial.DG_Count ?? 2) as 0 | 1 | 2 | 3,
    Has_DEF: partial.Has_DEF ?? 'Yes',
    Has_Solar: partial.Has_Solar ?? 'No',
    B_Check_Interval_Hrs: partial.B_Check_Interval_Hrs || DEFAULT_B_CHECK_INTERVAL_HRS,
    B_Check_Interval_Days: partial.B_Check_Interval_Days || DEFAULT_B_CHECK_INTERVAL_DAYS
  };
}
