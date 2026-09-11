/**
 * The 35 fields the POC actually types — the single source of truth for what
 * the form renders as editable.
 *
 * This list is the code-side mirror of the Column_Guide's "🟡 POC types it"
 * rows. Everything NOT in this list is either app-written (5) or calculated
 * by calculate.ts (69), and must never appear as an editable box.
 *
 * Getting this backwards is not a cosmetic bug: the legacy DG/EB/Water form
 * asked the POC to type HSD *Consumption* and displayed HSD *Closing* as a
 * derived tile. That inverts the chain — Closing is the dip reading the POC
 * physically takes, and it is what becomes tomorrow's opening. columnContract
 * .test.ts pins this list against the guide so the inversion cannot return.
 */

import { EbDgInput, EbDgRow, Num } from '../../types/ebdg';
import { isBlank, toNum } from './calculate';

export const EBDG_INPUT_FIELDS = [
  'DG1_HSD_Added', 'DG1_HSD_Closing', 'DG1_KWH_Closing', 'DG1_Run_Hrs', 'DG1_Hour_Meter', 'DG1_B_Check_Done_Today',
  'DG2_HSD_Added', 'DG2_HSD_Closing', 'DG2_KWH_Closing', 'DG2_Run_Hrs', 'DG2_Hour_Meter', 'DG2_B_Check_Done_Today',
  'DG3_HSD_Added', 'DG3_HSD_Closing', 'DG3_KWH_Closing', 'DG3_Run_Hrs', 'DG3_Hour_Meter', 'DG3_B_Check_Done_Today',
  'DEF_Added', 'DEF_Closing',
  'HSD_Received_Ltr', 'HSD_Rate', 'HSD_Tank_Closing',
  'Grid_MF', 'Grid_KWH_Closing', 'Grid_KVAH_Closing', 'Grid_Supply_Hrs', 'EB_Power_Cuts', 'Max_Load_KW',
  'Solar_Closing',
  'EB_Rate_Per_Unit', 'Solar_Rate_Per_Unit',
  'Water_Closing', 'Raw_Water_Procured_KL',
  'Remark'
] as const;

/** The 5 columns the app stamps itself. */
export const EBDG_APP_WRITTEN_FIELDS = ['Record_ID', 'Date', 'Timestamp', 'Site_Code', 'Submitted_By'] as const;

/** The Yes/No inputs — everything else in EBDG_INPUT_FIELDS is numeric except Remark. */
export const EBDG_YESNO_FIELDS = ['DG1_B_Check_Done_Today', 'DG2_B_Check_Done_Today', 'DG3_B_Check_Done_Today'] as const;

/**
 * Every reading starts BLANK, not 0. A pre-filled 0 is indistinguishable from
 * a real meter reading of zero, so a POC who skips a standby DG would
 * otherwise silently book its whole tank as consumed.
 */
export function createEmptyInput(): EbDgInput {
  const out: Record<string, unknown> = {};
  for (const field of EBDG_INPUT_FIELDS) {
    out[field] = (EBDG_YESNO_FIELDS as readonly string[]).includes(field) ? 'No' : '';
  }
  out.Remark = '';
  return out as unknown as EbDgInput;
}

/**
 * Reopens an existing row for edit. Every EbDgInput key also exists verbatim
 * on EbDgRow (it is what was typed), so the typed values come straight back
 * out by name — never by position.
 */
export function rowToInput(row: EbDgRow): EbDgInput {
  const out = createEmptyInput() as unknown as Record<string, unknown>;
  for (const field of EBDG_INPUT_FIELDS) {
    const value = (row as unknown as Record<string, unknown>)[field];
    if (value === undefined) continue;
    out[field] = (EBDG_YESNO_FIELDS as readonly string[]).includes(field) || field === 'Remark'
      ? value
      : toNum(value);
  }
  return out as unknown as EbDgInput;
}

/**
 * The meter factor and the three tariffs are site constants, not daily
 * readings — they change rarely, and re-typing them every evening is how a
 * blank rate (and a silently zeroed EB_Amount) happens. Carried from the
 * previous row as an editable prefill; the POC overrides when a tariff moves.
 */
export const CARRIED_CONSTANTS = ['Grid_MF', 'HSD_Rate', 'EB_Rate_Per_Unit', 'Solar_Rate_Per_Unit'] as const;

export function prefillConstants(base: EbDgInput, prev: EbDgRow | null): EbDgInput {
  if (!prev) return base;
  const next = { ...base } as Record<string, unknown>;
  for (const key of CARRIED_CONSTANTS) {
    if (isBlank(next[key])) next[key] = toNum(prev[key]) as Num;
  }
  return next as unknown as EbDgInput;
}
