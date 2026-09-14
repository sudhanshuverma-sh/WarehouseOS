/**
 * EB-DG daily entry — the pure calculation engine.
 *
 * calculate() takes what the POC typed, the site's previous row (carry-
 * forward source), and the site's DG config, and returns the full 109-
 * column row as LITERAL VALUES — never a spreadsheet formula
 * (MASTERDATA.md I6). Money is rounded to 2dp, litres to 1dp, hours to 1dp.
 *
 * BLANK IS NOT ZERO. Every formula in the spec reads `=IF(X_Closing="","",…)`,
 * so a reading the POC did not fill produces an empty cell, not a 0. A
 * standby DG left alone must not book its whole tank as consumed. Blank
 * counts as 0 only inside the N()-wrapped aggregates — that is what nz() is
 * for, and it is used nowhere else.
 *
 * Every division is guarded — see safeDiv() — so a fresh site with no
 * consumption yet renders 0, never NaN or Infinity.
 *
 * This file has NO dependency on Google Sheets, the database, or React. It is
 * intentionally pure so calculate.test.ts can exercise it without any I/O,
 * and so a future Firestore-backed repository (MASTERDATA.md I8) reuses it
 * unchanged.
 */

import {
  EbDgInput,
  EbDgRow,
  EbDgSeedOpenings,
  EbDgSingle,
  Num,
  SiteDgConfig,
  YesNoBlank
} from '../../types/ebdg';

// ---------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------

/** Divides a/b, returning `fallback` (default 0) instead of NaN/Infinity. */
export function safeDiv(a: number, b: number, fallback = 0): number {
  if (!b) return fallback;
  const r = a / b;
  return Number.isFinite(r) ? r : fallback;
}

export function round(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

const roundMoney = (n: number) => round(n, 2);
const roundLitres = (n: number) => round(n, 1);
const roundHours = (n: number) => round(n, 1);
/**
 * Ratios and percentages carry 2dp, matching the live sheet's own figures in
 * the Column_Guide (Unit_Per_Ltr 1.78, Grid_PF 0.97, Grid_Supply_Pct 93.33,
 * DG_Supply_Pct 6.67). The prompt's "litres to 1, hours to 1" rule covers
 * quantities; it says nothing about ratios, and rounding 41/23 to 1.8 would
 * not reproduce the sheet.
 */
const roundRatio = (n: number) => round(n, 2);

/** The spec's N(): a blank counts as 0. Use ONLY where a formula wraps N(). */
export const nz = (v: Num | undefined | null): number =>
  v === '' || v === undefined || v === null || !Number.isFinite(Number(v)) ? 0 : Number(v);

/** True when a cell is genuinely unfilled — the `X=""` test in the formulas. */
export const isBlank = (v: unknown): boolean =>
  v === '' || v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v));

/** Normalises a raw form/sheet value into Num, preserving blank. */
export const toNum = (v: unknown): Num => {
  if (isBlank(v)) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

/** Rounds only when there is a value — a blank stays blank. */
const roundNum = (v: Num, decimals: number): Num => (v === '' ? '' : round(v, decimals));

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------

/** Parses 'YYYY-MM-DD' as a UTC midnight Date, so weekday/day-math is TZ-independent. */
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** =TEXT(Date,"ddd") — three-letter weekday. */
export function dayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  return WEEKDAY_ABBR[parseDate(dateStr).getUTCDay()];
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days between two dates: later - earlier. */
export function diffDays(laterDateStr: string, earlierDateStr: string): number {
  const ms = parseDate(laterDateStr).getTime() - parseDate(earlierDateStr).getTime();
  return Math.round(ms / 86400000);
}

export function formatRecordId(siteCode: string, dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `EBDG-${siteCode}-${y}${m}${d}`;
}

export function nowIstIso(): string {
  // The runtime's own clock, formatted with the +05:30 offset the spec asks
  // for — independent of the server/browser's local timezone setting.
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}` +
    `T${pad(ist.getHours())}:${pad(ist.getMinutes())}:${pad(ist.getSeconds())}+05:30`
  );
}

// ---------------------------------------------------------------------
// calculate()
// ---------------------------------------------------------------------

export interface CalculateMeta {
  siteCode: string;
  whCode: string;
  zone: string;
  date: string;          // YYYY-MM-DD — the day the reading is for
  timestamp?: string;    // ISO 8601 +05:30; defaults to now
  submittedBy: string;   // POC email/name
}

type DgNumber = 1 | 2 | 3;

/** Every column of a DG this site does not have stays blank — not 0. */
const BLANK_DG: EbDgSingle = {
  HSD_Opening: '', HSD_Added: '', HSD_Closing: '', HSD_Consumption: '',
  KWH_Opening: '', KWH_Closing: '', KWH_Consumption: '',
  Run_Hrs: '', Unit_Per_Ltr: 0, Ltr_Per_Hr: 0, Hour_Meter: '',
  B_Check_Done_Today: '', B_Check_Last_Hrs: '', B_Check_Last_Date: '',
  B_Check_Due_Hrs: '', B_Check_Remaining_Hrs: '', B_Check_Due_Date: '',
  B_Check_Remaining_Days: '', B_Check_Status: ''
};

function calcDgBlock(
  n: DgNumber,
  active: boolean,
  input: EbDgInput,
  prev: EbDgRow | null,
  seed: EbDgSeedOpenings | undefined,
  config: SiteDgConfig,
  date: string
): EbDgSingle {
  if (!active) return { ...BLANK_DG };

  const prevVal = (suffix: string): Num =>
    prev ? toNum(prev[`DG${n}_${suffix}` as keyof EbDgRow]) : '';
  const inputVal = (suffix: string): Num => toNum(input[`DG${n}_${suffix}` as keyof EbDgInput]);
  const seedVal = (key: string): Num => toNum(seed?.[key as keyof EbDgSeedOpenings]);

  // Carry-forward: today's opening is this site's own previous-day closing.
  // With no previous row, the one-time seed stands in (edge case 1).
  const HSD_Opening = prev ? prevVal('HSD_Closing') : seedVal(`DG${n}_HSD_Opening`);
  const KWH_Opening = prev ? prevVal('KWH_Closing') : seedVal(`DG${n}_KWH_Opening`);

  const HSD_Added = inputVal('HSD_Added');
  const HSD_Closing = inputVal('HSD_Closing');
  // =IF(HSD_Closing="","", HSD_Opening + N(HSD_Added) - HSD_Closing)
  const HSD_Consumption: Num = isBlank(HSD_Closing)
    ? ''
    : roundLitres(nz(HSD_Opening) + nz(HSD_Added) - nz(HSD_Closing));

  const KWH_Closing = inputVal('KWH_Closing');
  // =IF(KWH_Closing="","", KWH_Closing - KWH_Opening)
  const KWH_Consumption: Num = isBlank(KWH_Closing) ? '' : round(nz(KWH_Closing) - nz(KWH_Opening), 1);

  const Run_Hrs = roundNum(inputVal('Run_Hrs'), 1);
  // Both are IFERROR(...,0) — always a number, 0 when the divisor is blank/zero.
  const Unit_Per_Ltr = roundRatio(safeDiv(nz(KWH_Consumption), nz(HSD_Consumption), 0));
  const Ltr_Per_Hr = roundLitres(safeDiv(nz(HSD_Consumption), nz(Run_Hrs), 0));
  const Hour_Meter = roundNum(inputVal('Hour_Meter'), 1);

  const doneToday = (input[`DG${n}_B_Check_Done_Today` as keyof EbDgInput] as YesNoBlank) || 'No';

  // Reset on the day it's done; otherwise carry yesterday's value untouched.
  // On a first-ever entry there is nothing to carry, so the seed starts the chain.
  const carriedLastHrs: Num = prev ? prevVal('B_Check_Last_Hrs') : seedVal(`DG${n}_B_Check_Last_Hrs`);
  const carriedLastDate: string = prev
    ? String(prev[`DG${n}_B_Check_Last_Date` as keyof EbDgRow] ?? '')
    : String(seed?.[`DG${n}_B_Check_Last_Date` as keyof EbDgSeedOpenings] ?? '');

  const B_Check_Last_Hrs: Num = doneToday === 'Yes' ? nz(Hour_Meter) : carriedLastHrs;
  const B_Check_Last_Date: string = doneToday === 'Yes' ? date : carriedLastDate;

  const intervalHrs = config.B_Check_Interval_Hrs || 500;
  const intervalDays = config.B_Check_Interval_Days || 365;

  // =IF(Last_Hrs="","", Last_Hrs + INTERVAL)
  const B_Check_Due_Hrs: Num = isBlank(B_Check_Last_Hrs) ? '' : nz(B_Check_Last_Hrs) + intervalHrs;
  // =IF(Hour_Meter="","", Due_Hrs - Hour_Meter) — keyed on the meter, per spec.
  const B_Check_Remaining_Hrs: Num =
    isBlank(Hour_Meter) || isBlank(B_Check_Due_Hrs) ? '' : round(nz(B_Check_Due_Hrs) - nz(Hour_Meter), 1);

  // =IF(Last_Date="","", Last_Date + DAYS)
  const B_Check_Due_Date: string = B_Check_Last_Date === '' ? '' : addDays(B_Check_Last_Date, intervalDays);
  // =IF(Due_Date="","", Due_Date - Date)
  const B_Check_Remaining_Days: Num = B_Check_Due_Date === '' ? '' : diffDays(B_Check_Due_Date, date);

  // Status needs a meter reading AND a chain to measure against. With no
  // B-check history at all the badge stays blank rather than crying DUE NOW
  // on a number it does not have — the seed above is how that history starts.
  const hasHistory = !isBlank(B_Check_Remaining_Hrs) || !isBlank(B_Check_Remaining_Days);
  const B_Check_Status: EbDgSingle['B_Check_Status'] = (() => {
    if (isBlank(Hour_Meter) || !hasHistory) return '';
    const remHrs = nz(B_Check_Remaining_Hrs);
    const remDays = nz(B_Check_Remaining_Days);
    // Only the limits that actually exist get to trigger the alarm.
    const hrsDue = !isBlank(B_Check_Remaining_Hrs) && remHrs <= 0;
    const daysDue = !isBlank(B_Check_Remaining_Days) && remDays <= 0;
    if (hrsDue || daysDue) return 'DUE NOW';
    const hrsSoon = !isBlank(B_Check_Remaining_Hrs) && remHrs <= 50;
    const daysSoon = !isBlank(B_Check_Remaining_Days) && remDays <= 30;
    if (hrsSoon || daysSoon) return 'DUE SOON';
    return 'OK';
  })();

  return {
    HSD_Opening, HSD_Added, HSD_Closing, HSD_Consumption,
    KWH_Opening, KWH_Closing, KWH_Consumption,
    Run_Hrs, Unit_Per_Ltr, Ltr_Per_Hr, Hour_Meter,
    B_Check_Done_Today: doneToday, B_Check_Last_Hrs, B_Check_Last_Date,
    B_Check_Due_Hrs, B_Check_Remaining_Hrs, B_Check_Due_Date,
    B_Check_Remaining_Days, B_Check_Status
  };
}

function flattenDg(n: DgNumber, block: EbDgSingle): Partial<EbDgRow> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block)) {
    out[`DG${n}_${key}`] = value;
  }
  return out as Partial<EbDgRow>;
}

export function calculate(
  input: EbDgInput,
  prev: EbDgRow | null,
  config: SiteDgConfig,
  meta: CalculateMeta,
  seed?: EbDgSeedOpenings
): EbDgRow {
  const date = meta.date;

  const dg1 = calcDgBlock(1, config.DG_Count >= 1, input, prev, seed, config, date);
  const dg2 = calcDgBlock(2, config.DG_Count >= 2, input, prev, seed, config, date);
  const dg3 = calcDgBlock(3, config.DG_Count >= 3, input, prev, seed, config, date);

  // Totals wrap every term in N(): a blank contributes 0 and the total is
  // always a real number.
  const Total_HSD_Consumption = roundLitres(nz(dg1.HSD_Consumption) + nz(dg2.HSD_Consumption) + nz(dg3.HSD_Consumption));
  const Total_KWH_Consumption = round(nz(dg1.KWH_Consumption) + nz(dg2.KWH_Consumption) + nz(dg3.KWH_Consumption), 1);
  const Total_Run_Hrs = roundHours(nz(dg1.Run_Hrs) + nz(dg2.Run_Hrs) + nz(dg3.Run_Hrs));
  const Total_Unit_Per_Ltr = roundRatio(safeDiv(Total_KWH_Consumption, Total_HSD_Consumption, 0));
  const Total_Ltr_Per_Hr = roundLitres(safeDiv(Total_HSD_Consumption, Total_Run_Hrs, 0));

  const hasDef = config.Has_DEF === 'Yes';
  const DEF_Opening: Num = !hasDef ? '' : prev ? toNum(prev.DEF_Closing) : toNum(seed?.DEF_Opening);
  const DEF_Added: Num = hasDef ? toNum(input.DEF_Added) : '';
  const DEF_Closing: Num = hasDef ? toNum(input.DEF_Closing) : '';
  const DEF_Used: Num = !hasDef || isBlank(DEF_Closing)
    ? ''
    : roundLitres(nz(DEF_Opening) + nz(DEF_Added) - nz(DEF_Closing));

  const HSD_Tank_Opening: Num = prev ? toNum(prev.HSD_Tank_Closing) : toNum(seed?.HSD_Tank_Opening);
  const HSD_Received_Ltr = toNum(input.HSD_Received_Ltr);
  const HSD_Rate = toNum(input.HSD_Rate);
  const HSD_Amount = roundMoney(nz(HSD_Received_Ltr) * nz(HSD_Rate));
  const HSD_Tank_Closing = toNum(input.HSD_Tank_Closing);

  const Grid_MF = toNum(input.Grid_MF);
  const mfEffective = nz(Grid_MF) === 0 ? 1 : nz(Grid_MF);
  const Grid_KWH_Opening: Num = prev ? toNum(prev.Grid_KWH_Closing) : toNum(seed?.Grid_KWH_Opening);
  const Grid_KWH_Closing = toNum(input.Grid_KWH_Closing);
  const Grid_KWH_Consumed: Num = isBlank(Grid_KWH_Closing)
    ? ''
    : round((nz(Grid_KWH_Closing) - nz(Grid_KWH_Opening)) * mfEffective, 1);

  const Grid_KVAH_Opening: Num = prev ? toNum(prev.Grid_KVAH_Closing) : toNum(seed?.Grid_KVAH_Opening);
  const Grid_KVAH_Closing = toNum(input.Grid_KVAH_Closing);
  // KVAH deliberately does NOT take the multiplying factor — confirmed against source data.
  const Grid_KVAH_Consumed: Num = isBlank(Grid_KVAH_Closing)
    ? ''
    : round(nz(Grid_KVAH_Closing) - nz(Grid_KVAH_Opening), 1);

  const Grid_PF = round(safeDiv(nz(Grid_KWH_Consumed), nz(Grid_KVAH_Consumed), 0), 2);
  const Grid_Supply_Hrs = roundNum(toNum(input.Grid_Supply_Hrs), 1);
  const Grid_Supply_Pct = roundRatio(safeDiv(nz(Grid_Supply_Hrs), 24, 0) * 100);
  const DG_Supply_Pct = roundRatio(safeDiv(Total_Run_Hrs, 24, 0) * 100);
  const EB_Power_Cuts = toNum(input.EB_Power_Cuts);
  const Max_Load_KW = roundNum(toNum(input.Max_Load_KW), 1);

  const hasSolar = config.Has_Solar === 'Yes';
  const Solar_Opening: Num = !hasSolar ? '' : prev ? toNum(prev.Solar_Closing) : toNum(seed?.Solar_Opening);
  const Solar_Closing: Num = hasSolar ? toNum(input.Solar_Closing) : '';
  const Solar_Generated: Num = !hasSolar || isBlank(Solar_Closing)
    ? ''
    : round(nz(Solar_Closing) - nz(Solar_Opening), 1);

  const Total_KWH_All_Sources = round(nz(Grid_KWH_Consumed) + Total_KWH_Consumption + nz(Solar_Generated), 1);

  const EB_Rate_Per_Unit = toNum(input.EB_Rate_Per_Unit);
  const EB_Amount = roundMoney(nz(Grid_KWH_Consumed) * nz(EB_Rate_Per_Unit));
  const DG_Amount = roundMoney(Total_HSD_Consumption * nz(HSD_Rate));
  const DG_Rate_Per_Unit = round(safeDiv(DG_Amount, Total_KWH_Consumption, 0), 2);
  const Solar_Rate_Per_Unit: Num = hasSolar ? toNum(input.Solar_Rate_Per_Unit) : '';
  const Solar_Amount = roundMoney(nz(Solar_Generated) * nz(Solar_Rate_Per_Unit));
  const Total_Amount = roundMoney(EB_Amount + DG_Amount + Solar_Amount);
  const Blended_Rate_Per_Unit = round(safeDiv(Total_Amount, Total_KWH_All_Sources, 0), 2);

  const Water_Opening: Num = prev ? toNum(prev.Water_Closing) : toNum(seed?.Water_Opening);
  const Water_Closing = toNum(input.Water_Closing);
  const Water_Consumed: Num = isBlank(Water_Closing)
    ? ''
    : round(nz(Water_Closing) - nz(Water_Opening), 1);
  const Raw_Water_Procured_KL = roundNum(toNum(input.Raw_Water_Procured_KL), 1);

  const row: EbDgRow = {
    Record_ID: formatRecordId(meta.siteCode, date),
    Date: date,
    Timestamp: meta.timestamp || nowIstIso(),
    Day: dayOfWeek(date),
    Site_Code: meta.siteCode,
    WH_Code: meta.whCode,
    Zone: meta.zone,

    ...flattenDg(1, dg1),
    ...flattenDg(2, dg2),
    ...flattenDg(3, dg3),

    DEF_Opening, DEF_Added, DEF_Closing, DEF_Used,

    Total_HSD_Consumption, Total_KWH_Consumption, Total_Run_Hrs, Total_Unit_Per_Ltr, Total_Ltr_Per_Hr,

    HSD_Tank_Opening, HSD_Received_Ltr, HSD_Rate, HSD_Amount, HSD_Tank_Closing,

    Grid_MF, Grid_KWH_Opening, Grid_KWH_Closing, Grid_KWH_Consumed,
    Grid_KVAH_Opening, Grid_KVAH_Closing, Grid_KVAH_Consumed, Grid_PF,
    Grid_Supply_Hrs, Grid_Supply_Pct, DG_Supply_Pct, EB_Power_Cuts, Max_Load_KW,

    Solar_Opening, Solar_Closing, Solar_Generated, Total_KWH_All_Sources,

    EB_Rate_Per_Unit, EB_Amount, DG_Amount, DG_Rate_Per_Unit,
    Solar_Rate_Per_Unit, Solar_Amount, Total_Amount, Blended_Rate_Per_Unit,

    Water_Opening, Water_Closing, Water_Consumed, Raw_Water_Procured_KL,

    Remark: input.Remark || '',
    Submitted_By: meta.submittedBy
  } as EbDgRow;

  return row;
}

// ---------------------------------------------------------------------
// Validation — see the spec's "Validation — reject on submit" table.
// Pure: takes the same inputs as calculate(), so it can run before/without
// persistence. Hard errors block submission; warnings can be overridden by
// the POC (the form requires a Remark before allowing override).
//
// Every rule below is skipped when the reading it judges is blank — an
// unfilled meter is not a backwards meter.
// ---------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateDg(
  n: DgNumber,
  active: boolean,
  input: EbDgInput,
  prev: EbDgRow | null,
  seed: EbDgSeedOpenings | undefined,
  issues: ValidationIssue[]
) {
  if (!active) return;

  const inputVal = (suffix: string): Num => toNum(input[`DG${n}_${suffix}` as keyof EbDgInput]);
  const prevVal = (suffix: string): Num => (prev ? toNum(prev[`DG${n}_${suffix}` as keyof EbDgRow]) : '');

  const HSD_Opening = prev ? prevVal('HSD_Closing') : toNum(seed?.[`DG${n}_HSD_Opening` as keyof EbDgSeedOpenings]);
  const HSD_Added = inputVal('HSD_Added');
  const HSD_Closing = inputVal('HSD_Closing');
  if (!isBlank(HSD_Closing) && nz(HSD_Closing) > nz(HSD_Opening) + nz(HSD_Added)) {
    issues.push({ field: `DG${n}_HSD_Closing`, severity: 'error', message: 'Closing stock is higher than what was available. Check the dip reading.' });
  }

  const KWH_Opening = prev ? prevVal('KWH_Closing') : toNum(seed?.[`DG${n}_KWH_Opening` as keyof EbDgSeedOpenings]);
  const KWH_Closing = inputVal('KWH_Closing');
  if (!isBlank(KWH_Closing) && !isBlank(KWH_Opening) && nz(KWH_Closing) < nz(KWH_Opening)) {
    issues.push({ field: `DG${n}_KWH_Closing`, severity: 'error', message: 'Energy meter cannot go backwards.' });
  }

  const Hour_Meter = inputVal('Hour_Meter');
  const prevHourMeter = prevVal('Hour_Meter');
  if (!isBlank(Hour_Meter) && !isBlank(prevHourMeter) && nz(Hour_Meter) < nz(prevHourMeter)) {
    issues.push({ field: `DG${n}_Hour_Meter`, severity: 'error', message: 'Hour meter cannot go backwards.' });
  }

  const Run_Hrs = inputVal('Run_Hrs');
  if (!isBlank(Run_Hrs) && (nz(Run_Hrs) < 0 || nz(Run_Hrs) > 24)) {
    issues.push({ field: `DG${n}_Run_Hrs`, severity: 'error', message: 'Run hours must be between 0 and 24.' });
  }

  // Only meaningful once both readings exist: a blank closing means "no dip
  // taken", not "no diesel used".
  if (!isBlank(Run_Hrs) && nz(Run_Hrs) > 0 && !isBlank(HSD_Closing)) {
    const consumption = nz(HSD_Opening) + nz(HSD_Added) - nz(HSD_Closing);
    if (consumption === 0) {
      issues.push({ field: `DG${n}_Run_Hrs`, severity: 'warning', message: 'DG ran but used no diesel. Confirm the readings.' });
    }
  }
}

export function validate(
  input: EbDgInput,
  prev: EbDgRow | null,
  config: SiteDgConfig,
  date: string,
  seed: EbDgSeedOpenings | undefined,
  today: string = new Date().toISOString().slice(0, 10)
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  validateDg(1, config.DG_Count >= 1, input, prev, seed, issues);
  validateDg(2, config.DG_Count >= 2, input, prev, seed, issues);
  validateDg(3, config.DG_Count >= 3, input, prev, seed, issues);

  const Grid_KWH_Opening = prev ? toNum(prev.Grid_KWH_Closing) : toNum(seed?.Grid_KWH_Opening);
  const Grid_KWH_Closing = toNum(input.Grid_KWH_Closing);
  if (!isBlank(Grid_KWH_Closing) && !isBlank(Grid_KWH_Opening) && nz(Grid_KWH_Closing) < nz(Grid_KWH_Opening)) {
    issues.push({ field: 'Grid_KWH_Closing', severity: 'error', message: 'Grid meter cannot go backwards.' });
  }

  const totalRunHrs =
    (config.DG_Count >= 1 ? nz(toNum(input.DG1_Run_Hrs)) : 0) +
    (config.DG_Count >= 2 ? nz(toNum(input.DG2_Run_Hrs)) : 0) +
    (config.DG_Count >= 3 ? nz(toNum(input.DG3_Run_Hrs)) : 0);
  if (totalRunHrs > 24) {
    issues.push({ field: 'Total_Run_Hrs', severity: 'error', message: 'Total DG hours cannot exceed 24 in a day.' });
  }

  const gridSupplyHrs = nz(toNum(input.Grid_Supply_Hrs));
  // "far above 24" — DG and grid can overlap (a DG can run as backup during a
  // brief EB dip), so this only warns once the combined figure is
  // implausible rather than merely over 24.
  if (gridSupplyHrs + totalRunHrs > 30) {
    issues.push({
      field: 'Grid_Supply_Hrs',
      severity: 'warning',
      message: 'Grid supply hours plus DG run hours is far above 24 — please confirm (DG and grid can overlap, so this is a warning, not a hard error).'
    });
  }

  if (date > today) {
    issues.push({ field: 'Date', severity: 'error', message: 'Cannot file for a future date.' });
  }

  return issues;
}

export const hasBlockingErrors = (issues: ValidationIssue[]): boolean => issues.some(i => i.severity === 'error');
