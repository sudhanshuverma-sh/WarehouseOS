/**
 * The sheet contract, pinned.
 *
 * SPEC_HEADER below is the header row of EB_DG_B2B.csv / EB_DG_B2C.csv,
 * pasted verbatim. OWNERSHIP is the Column_Guide's "Who fills it" column,
 * transcribed row for row. Together they are the authority on:
 *
 *   - what order the 109 columns go in
 *   - which 35 the POC types (and therefore which the form makes editable)
 *   - which 5 the app stamps
 *   - which 69 the app calculates (and must never render as an input box)
 *
 * The legacy DG/EB/Water form had HSD_Closing and HSD_Consumption the wrong
 * way round — asking the POC to type the derived figure and showing the dip
 * reading as a computed tile. These tests exist so that inversion, in either
 * direction, fails the build instead of reaching a site POC.
 */

import { describe, expect, it } from 'vitest';
import { EBDG_COLUMN_ORDER } from '../../types/ebdg';
import { EBDG_APP_WRITTEN_FIELDS, EBDG_INPUT_FIELDS, createEmptyInput } from './input';

/** Header row of the destination tabs, verbatim. */
const SPEC_HEADER =
  'Record_ID,Date,Timestamp,Day,Site_Code,WH_Code,Zone,DG1_HSD_Opening,DG1_HSD_Added,DG1_HSD_Closing,DG1_HSD_Consumption,DG1_KWH_Opening,DG1_KWH_Closing,DG1_KWH_Consumption,DG1_Run_Hrs,DG1_Unit_Per_Ltr,DG1_Ltr_Per_Hr,DG1_Hour_Meter,DG1_B_Check_Done_Today,DG1_B_Check_Last_Hrs,DG1_B_Check_Last_Date,DG1_B_Check_Due_Hrs,DG1_B_Check_Remaining_Hrs,DG1_B_Check_Due_Date,DG1_B_Check_Remaining_Days,DG1_B_Check_Status,DG2_HSD_Opening,DG2_HSD_Added,DG2_HSD_Closing,DG2_HSD_Consumption,DG2_KWH_Opening,DG2_KWH_Closing,DG2_KWH_Consumption,DG2_Run_Hrs,DG2_Unit_Per_Ltr,DG2_Ltr_Per_Hr,DG2_Hour_Meter,DG2_B_Check_Done_Today,DG2_B_Check_Last_Hrs,DG2_B_Check_Last_Date,DG2_B_Check_Due_Hrs,DG2_B_Check_Remaining_Hrs,DG2_B_Check_Due_Date,DG2_B_Check_Remaining_Days,DG2_B_Check_Status,DG3_HSD_Opening,DG3_HSD_Added,DG3_HSD_Closing,DG3_HSD_Consumption,DG3_KWH_Opening,DG3_KWH_Closing,DG3_KWH_Consumption,DG3_Run_Hrs,DG3_Unit_Per_Ltr,DG3_Ltr_Per_Hr,DG3_Hour_Meter,DG3_B_Check_Done_Today,DG3_B_Check_Last_Hrs,DG3_B_Check_Last_Date,DG3_B_Check_Due_Hrs,DG3_B_Check_Remaining_Hrs,DG3_B_Check_Due_Date,DG3_B_Check_Remaining_Days,DG3_B_Check_Status,DEF_Opening,DEF_Added,DEF_Closing,DEF_Used,Total_HSD_Consumption,Total_KWH_Consumption,Total_Run_Hrs,Total_Unit_Per_Ltr,Total_Ltr_Per_Hr,HSD_Tank_Opening,HSD_Received_Ltr,HSD_Rate,HSD_Amount,HSD_Tank_Closing,Grid_MF,Grid_KWH_Opening,Grid_KWH_Closing,Grid_KWH_Consumed,Grid_KVAH_Opening,Grid_KVAH_Closing,Grid_KVAH_Consumed,Grid_PF,Grid_Supply_Hrs,Grid_Supply_Pct,DG_Supply_Pct,EB_Power_Cuts,Max_Load_KW,Solar_Opening,Solar_Closing,Solar_Generated,Total_KWH_All_Sources,EB_Rate_Per_Unit,EB_Amount,DG_Amount,DG_Rate_Per_Unit,Solar_Rate_Per_Unit,Solar_Amount,Total_Amount,Blended_Rate_Per_Unit,Water_Opening,Water_Closing,Water_Consumed,Raw_Water_Procured_KL,Remark,Submitted_By';

/** Column_Guide "Who fills it", transcribed. POC = 🟡 types it, APP = 🟩 app writes, CALC = ⬛ calculated. */
const OWNERSHIP: Record<string, 'POC' | 'APP' | 'CALC'> = {
  Record_ID: 'APP', Date: 'APP', Timestamp: 'APP', Day: 'CALC', Site_Code: 'APP', WH_Code: 'CALC', Zone: 'CALC',
  ...dgOwnership(1), ...dgOwnership(2), ...dgOwnership(3),
  DEF_Opening: 'CALC', DEF_Added: 'POC', DEF_Closing: 'POC', DEF_Used: 'CALC',
  Total_HSD_Consumption: 'CALC', Total_KWH_Consumption: 'CALC', Total_Run_Hrs: 'CALC',
  Total_Unit_Per_Ltr: 'CALC', Total_Ltr_Per_Hr: 'CALC',
  HSD_Tank_Opening: 'CALC', HSD_Received_Ltr: 'POC', HSD_Rate: 'POC', HSD_Amount: 'CALC', HSD_Tank_Closing: 'POC',
  Grid_MF: 'POC', Grid_KWH_Opening: 'CALC', Grid_KWH_Closing: 'POC', Grid_KWH_Consumed: 'CALC',
  Grid_KVAH_Opening: 'CALC', Grid_KVAH_Closing: 'POC', Grid_KVAH_Consumed: 'CALC', Grid_PF: 'CALC',
  Grid_Supply_Hrs: 'POC', Grid_Supply_Pct: 'CALC', DG_Supply_Pct: 'CALC', EB_Power_Cuts: 'POC', Max_Load_KW: 'POC',
  Solar_Opening: 'CALC', Solar_Closing: 'POC', Solar_Generated: 'CALC', Total_KWH_All_Sources: 'CALC',
  EB_Rate_Per_Unit: 'POC', EB_Amount: 'CALC', DG_Amount: 'CALC', DG_Rate_Per_Unit: 'CALC',
  Solar_Rate_Per_Unit: 'POC', Solar_Amount: 'CALC', Total_Amount: 'CALC', Blended_Rate_Per_Unit: 'CALC',
  Water_Opening: 'CALC', Water_Closing: 'POC', Water_Consumed: 'CALC', Raw_Water_Procured_KL: 'POC',
  Remark: 'POC', Submitted_By: 'APP'
};

function dgOwnership(n: 1 | 2 | 3): Record<string, 'POC' | 'CALC'> {
  return {
    [`DG${n}_HSD_Opening`]: 'CALC',
    [`DG${n}_HSD_Added`]: 'POC',
    [`DG${n}_HSD_Closing`]: 'POC',        // the dip reading — typed, NOT derived
    [`DG${n}_HSD_Consumption`]: 'CALC',   // derived from it — never typed
    [`DG${n}_KWH_Opening`]: 'CALC',
    [`DG${n}_KWH_Closing`]: 'POC',
    [`DG${n}_KWH_Consumption`]: 'CALC',
    [`DG${n}_Run_Hrs`]: 'POC',
    [`DG${n}_Unit_Per_Ltr`]: 'CALC',
    [`DG${n}_Ltr_Per_Hr`]: 'CALC',
    [`DG${n}_Hour_Meter`]: 'POC',
    [`DG${n}_B_Check_Done_Today`]: 'POC',
    [`DG${n}_B_Check_Last_Hrs`]: 'CALC',
    [`DG${n}_B_Check_Last_Date`]: 'CALC',
    [`DG${n}_B_Check_Due_Hrs`]: 'CALC',
    [`DG${n}_B_Check_Remaining_Hrs`]: 'CALC',
    [`DG${n}_B_Check_Due_Date`]: 'CALC',
    [`DG${n}_B_Check_Remaining_Days`]: 'CALC',
    [`DG${n}_B_Check_Status`]: 'CALC'
  };
}

const specColumns = SPEC_HEADER.split(',');
const ownedBy = (kind: 'POC' | 'APP' | 'CALC') => specColumns.filter(c => OWNERSHIP[c] === kind);

describe('EB-DG sheet contract — column order', () => {
  it('matches the destination tab header exactly, in order', () => {
    expect([...EBDG_COLUMN_ORDER]).toEqual(specColumns);
  });

  it('is 109 columns', () => {
    expect(EBDG_COLUMN_ORDER).toHaveLength(109);
    expect(specColumns).toHaveLength(109);
  });

  it('has an ownership entry for every column, and no strays', () => {
    expect(Object.keys(OWNERSHIP).sort()).toEqual([...specColumns].sort());
  });
});

describe('EB-DG sheet contract — who fills what', () => {
  it('splits 35 POC / 5 app-written / 69 calculated, as the guide states', () => {
    expect(ownedBy('POC')).toHaveLength(35);
    expect(ownedBy('APP')).toHaveLength(5);
    expect(ownedBy('CALC')).toHaveLength(69);
  });

  it('the form\'s editable fields are exactly the guide\'s POC-typed columns', () => {
    expect([...EBDG_INPUT_FIELDS].sort()).toEqual(ownedBy('POC').sort());
  });

  it('the empty form has one box per POC column and not one more', () => {
    expect(Object.keys(createEmptyInput()).sort()).toEqual(ownedBy('POC').sort());
  });

  it('app-written columns match the guide', () => {
    expect([...EBDG_APP_WRITTEN_FIELDS].sort()).toEqual(ownedBy('APP').sort());
  });

  it('never offers a calculated column as an editable input', () => {
    const leaked = ownedBy('CALC').filter(c => (EBDG_INPUT_FIELDS as readonly string[]).includes(c));
    expect(leaked).toEqual([]);
  });

  /** The specific inversion the legacy form shipped with. */
  it('has HSD Closing typed by the POC and HSD Consumption derived — not the reverse', () => {
    for (const n of [1, 2, 3]) {
      expect(EBDG_INPUT_FIELDS).toContain(`DG${n}_HSD_Closing`);
      expect(EBDG_INPUT_FIELDS).not.toContain(`DG${n}_HSD_Consumption`);
    }
  });

  /** Same shape of trap: every "Opening" is carried forward, never typed. */
  it('never asks the POC to type an opening balance', () => {
    const openings = specColumns.filter(c => c.endsWith('_Opening'));
    expect(openings.length).toBeGreaterThan(0);
    for (const col of openings) {
      expect(EBDG_INPUT_FIELDS).not.toContain(col);
    }
  });
});
