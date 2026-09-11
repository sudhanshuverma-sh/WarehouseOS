/**
 * What actually reaches the sheet.
 *
 * The header emitted here must equal the header row of the real EB_DG_B2B /
 * EB_DG_B2C tabs byte for byte, and every value must land under the column
 * whose name it belongs to.
 */

import { describe, expect, it, vi } from 'vitest';
import { EBDG_HEADER_ROW, buildSheetPayload, rowToCsvLine, rowsToCsv, SheetSyncingEbDgRepository } from './sheetWriter';
import { calculate } from './calculate';
import { EbDgRow, resolveSiteDgConfig } from '../../types/ebdg';
import { createEmptyInput } from './input';
import type { EbDgRepository, SubmitResult } from './repository';

/** The header row of the destination tab, verbatim from EB_DG_B2B.csv. */
const SHEET_HEADER_FROM_CSV =
  'Record_ID,Date,Timestamp,Day,Site_Code,WH_Code,Zone,DG1_HSD_Opening,DG1_HSD_Added,DG1_HSD_Closing,DG1_HSD_Consumption,DG1_KWH_Opening,DG1_KWH_Closing,DG1_KWH_Consumption,DG1_Run_Hrs,DG1_Unit_Per_Ltr,DG1_Ltr_Per_Hr,DG1_Hour_Meter,DG1_B_Check_Done_Today,DG1_B_Check_Last_Hrs,DG1_B_Check_Last_Date,DG1_B_Check_Due_Hrs,DG1_B_Check_Remaining_Hrs,DG1_B_Check_Due_Date,DG1_B_Check_Remaining_Days,DG1_B_Check_Status,DG2_HSD_Opening,DG2_HSD_Added,DG2_HSD_Closing,DG2_HSD_Consumption,DG2_KWH_Opening,DG2_KWH_Closing,DG2_KWH_Consumption,DG2_Run_Hrs,DG2_Unit_Per_Ltr,DG2_Ltr_Per_Hr,DG2_Hour_Meter,DG2_B_Check_Done_Today,DG2_B_Check_Last_Hrs,DG2_B_Check_Last_Date,DG2_B_Check_Due_Hrs,DG2_B_Check_Remaining_Hrs,DG2_B_Check_Due_Date,DG2_B_Check_Remaining_Days,DG2_B_Check_Status,DG3_HSD_Opening,DG3_HSD_Added,DG3_HSD_Closing,DG3_HSD_Consumption,DG3_KWH_Opening,DG3_KWH_Closing,DG3_KWH_Consumption,DG3_Run_Hrs,DG3_Unit_Per_Ltr,DG3_Ltr_Per_Hr,DG3_Hour_Meter,DG3_B_Check_Done_Today,DG3_B_Check_Last_Hrs,DG3_B_Check_Last_Date,DG3_B_Check_Due_Hrs,DG3_B_Check_Remaining_Hrs,DG3_B_Check_Due_Date,DG3_B_Check_Remaining_Days,DG3_B_Check_Status,DEF_Opening,DEF_Added,DEF_Closing,DEF_Used,Total_HSD_Consumption,Total_KWH_Consumption,Total_Run_Hrs,Total_Unit_Per_Ltr,Total_Ltr_Per_Hr,HSD_Tank_Opening,HSD_Received_Ltr,HSD_Rate,HSD_Amount,HSD_Tank_Closing,Grid_MF,Grid_KWH_Opening,Grid_KWH_Closing,Grid_KWH_Consumed,Grid_KVAH_Opening,Grid_KVAH_Closing,Grid_KVAH_Consumed,Grid_PF,Grid_Supply_Hrs,Grid_Supply_Pct,DG_Supply_Pct,EB_Power_Cuts,Max_Load_KW,Solar_Opening,Solar_Closing,Solar_Generated,Total_KWH_All_Sources,EB_Rate_Per_Unit,EB_Amount,DG_Amount,DG_Rate_Per_Unit,Solar_Rate_Per_Unit,Solar_Amount,Total_Amount,Blended_Rate_Per_Unit,Water_Opening,Water_Closing,Water_Consumed,Raw_Water_Procured_KL,Remark,Submitted_By';

const config = resolveSiteDgConfig({ Site_Code: 'ZHPL-DL-01', DG_Count: 1, Has_DEF: 'No', Has_Solar: 'No' });
const meta = {
  siteCode: 'ZHPL-DL-01', whCode: 'Delhi DC', zone: 'North',
  date: '2026-09-03', timestamp: '2026-09-03T18:24:11+05:30', submittedBy: 'ramesh.k@zomato.com'
};

const sampleRow = (): EbDgRow =>
  calculate(
    { ...createEmptyInput(), DG1_HSD_Closing: 1162, DG1_KWH_Closing: 4479, DG1_Run_Hrs: 1.6, DG1_Hour_Meter: 456.6, Remark: 'DG ran during EB cut 14:10–15:45' },
    null, config, meta,
    { DG1_HSD_Opening: 1185, DG1_KWH_Opening: 4438 }
  );

describe('EBDG_HEADER_ROW', () => {
  it('is byte-for-byte the destination tab header', () => {
    expect(EBDG_HEADER_ROW).toBe(SHEET_HEADER_FROM_CSV);
  });
});

describe('CSV emission', () => {
  it('writes exactly 109 cells per row', () => {
    // Split on commas outside quotes — the Remark carries a comma-free em dash
    // but the helper must still hold at 109 for any row.
    const cells = rowToCsvLine(sampleRow()).match(/("([^"]|"")*"|[^,]*)(,|$)/g);
    expect(cells).toHaveLength(109 + 1); // trailing empty match from the regex
  });

  it('puts each value under its own header position', () => {
    const headers = SHEET_HEADER_FROM_CSV.split(',');
    const values = rowToCsvLine(sampleRow()).split(',');
    expect(values[headers.indexOf('Record_ID')]).toBe('EBDG-ZHPL-DL-01-20260903');
    expect(values[headers.indexOf('Day')]).toBe('Thu');
    expect(values[headers.indexOf('DG1_HSD_Consumption')]).toBe('23');
    expect(values[headers.indexOf('DG1_Unit_Per_Ltr')]).toBe('1.78');
    expect(values[headers.indexOf('Submitted_By')]).toBe('ramesh.k@zomato.com');
  });

  it('leaves an unfilled column empty rather than writing a 0 into the sheet', () => {
    const headers = SHEET_HEADER_FROM_CSV.split(',');
    const values = rowToCsvLine(sampleRow()).split(',');
    expect(values[headers.indexOf('DG2_HSD_Closing')]).toBe('');
    expect(values[headers.indexOf('DG3_B_Check_Status')]).toBe('');
  });

  it('quotes a Remark containing a comma so the row keeps its shape', () => {
    const row = { ...sampleRow(), Remark: 'DG ran 14:10, EB cut, restored 15:45' };
    const line = rowToCsvLine(row);
    expect(line).toContain('"DG ran 14:10, EB cut, restored 15:45"');
  });

  it('rowsToCsv leads with the header when asked, and omits it when appending', () => {
    expect(rowsToCsv([sampleRow()]).split('\r\n')[0]).toBe(SHEET_HEADER_FROM_CSV);
    expect(rowsToCsv([sampleRow()], false).split('\r\n')[0]).not.toBe(SHEET_HEADER_FROM_CSV);
  });
});

describe('Apps Script payload', () => {
  it('ships the header alongside the values so the script can map by name', () => {
    const payload = buildSheetPayload(sampleRow(), 'EB_DG_B2C');
    expect(payload.action).toBe('upsertEbDgRow');
    expect(payload.tab).toBe('EB_DG_B2C');
    expect(payload.header).toHaveLength(109);
    expect(payload.values).toHaveLength(109);
    expect(payload.header.join(',')).toBe(SHEET_HEADER_FROM_CSV);
    expect(payload.recordId).toBe('EBDG-ZHPL-DL-01-20260903');
  });
});

describe('SheetSyncingEbDgRepository', () => {
  const stubInner = (result: SubmitResult): EbDgRepository => ({
    getPreviousRow: async () => null,
    getRowByDate: async () => null,
    hasLaterRows: async () => false,
    listBySite: async () => [],
    submit: async () => result
  });

  it('reports the local save even with no sheet URL configured', async () => {
    const repo = new SheetSyncingEbDgRepository(
      stubInner({ success: true, mode: 'created', message: 'Saved X.' }),
      () => ''
    );
    const res = await repo.submit(sampleRow(), 'EB_DG_B2B');
    expect(res.success).toBe(true);
    expect(res.message).toContain('no sheet URL configured');
  });

  it('does not push when the local save failed', async () => {
    const push = vi.fn();
    const repo = new SheetSyncingEbDgRepository(
      stubInner({ success: false, message: 'disk full' }),
      () => { push(); return 'https://script.google.com/exec'; }
    );
    const res = await repo.submit(sampleRow(), 'EB_DG_B2B');
    expect(res.success).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
