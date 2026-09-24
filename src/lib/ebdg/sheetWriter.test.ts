/**
 * What actually reaches the sheet.
 *
 * The header emitted here must equal the header row of the real EB_DG_B2B /
 * EB_DG_B2C tabs byte for byte, and every value must land under the column
 * whose name it belongs to.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EBDG_HEADER_ROW, EBDG_SHEET_HEADER, buildSheetPayload, buildEbDgSheetBatch, rowToCsvLine, rowsToCsv, submittedAtOf } from './sheetWriter';
import { EBDG_COLUMN_ORDER } from './columns';
import { calculate } from './calculate';
import { EbDgRow, resolveSiteDgConfig } from '../../types/ebdg';
import { createEmptyInput } from './input';

/** The header row of the live EB_DG_B2B tab, verbatim from its CSV export: no Timestamp, Submitted_At and Status last. */
const SHEET_HEADER_FROM_CSV =
  'Record_ID,Date,Day,Site_Code,WH_Code,Zone,DG1_HSD_Opening,DG1_HSD_Added,DG1_HSD_Closing,DG1_HSD_Consumption,DG1_KWH_Opening,DG1_KWH_Closing,DG1_KWH_Consumption,DG1_Run_Hrs,DG1_Unit_Per_Ltr,DG1_Ltr_Per_Hr,DG1_Hour_Meter,DG1_B_Check_Done_Today,DG1_B_Check_Last_Hrs,DG1_B_Check_Last_Date,DG1_B_Check_Due_Hrs,DG1_B_Check_Remaining_Hrs,DG1_B_Check_Due_Date,DG1_B_Check_Remaining_Days,DG1_B_Check_Status,DG2_HSD_Opening,DG2_HSD_Added,DG2_HSD_Closing,DG2_HSD_Consumption,DG2_KWH_Opening,DG2_KWH_Closing,DG2_KWH_Consumption,DG2_Run_Hrs,DG2_Unit_Per_Ltr,DG2_Ltr_Per_Hr,DG2_Hour_Meter,DG2_B_Check_Done_Today,DG2_B_Check_Last_Hrs,DG2_B_Check_Last_Date,DG2_B_Check_Due_Hrs,DG2_B_Check_Remaining_Hrs,DG2_B_Check_Due_Date,DG2_B_Check_Remaining_Days,DG2_B_Check_Status,DG3_HSD_Opening,DG3_HSD_Added,DG3_HSD_Closing,DG3_HSD_Consumption,DG3_KWH_Opening,DG3_KWH_Closing,DG3_KWH_Consumption,DG3_Run_Hrs,DG3_Unit_Per_Ltr,DG3_Ltr_Per_Hr,DG3_Hour_Meter,DG3_B_Check_Done_Today,DG3_B_Check_Last_Hrs,DG3_B_Check_Last_Date,DG3_B_Check_Due_Hrs,DG3_B_Check_Remaining_Hrs,DG3_B_Check_Due_Date,DG3_B_Check_Remaining_Days,DG3_B_Check_Status,DEF_Opening,DEF_Added,DEF_Closing,DEF_Used,Total_HSD_Consumption,Total_KWH_Consumption,Total_Run_Hrs,Total_Unit_Per_Ltr,Total_Ltr_Per_Hr,HSD_Tank_Opening,HSD_Received_Ltr,HSD_Rate,HSD_Amount,HSD_Tank_Closing,Grid_MF,Grid_KWH_Opening,Grid_KWH_Closing,Grid_KWH_Consumed,Grid_KVAH_Opening,Grid_KVAH_Closing,Grid_KVAH_Consumed,Grid_PF,Grid_Supply_Hrs,Grid_Supply_Pct,DG_Supply_Pct,EB_Power_Cuts,Max_Load_KW,Solar_Opening,Solar_Closing,Solar_Generated,Total_KWH_All_Sources,EB_Rate_Per_Unit,EB_Amount,DG_Amount,DG_Rate_Per_Unit,Solar_Rate_Per_Unit,Solar_Amount,Total_Amount,Blended_Rate_Per_Unit,Water_Opening,Water_Closing,Water_Consumed,Raw_Water_Procured_KL,Remark,Submitted_By,Submitted_At,Status';

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
  it('writes exactly 110 cells per row', () => {
    // Split on commas outside quotes — the Remark carries a comma-free em dash
    // but the helper must still hold at 110 for any row.
    const cells = rowToCsvLine(sampleRow()).match(/("([^"]|"")*"|[^,]*)(,|$)/g);
    expect(cells).toHaveLength(110 + 1); // trailing empty match from the regex
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
    expect(payload.header).toHaveLength(110);
    expect(payload.values).toHaveLength(110);
    expect(payload.header.join(',')).toBe(SHEET_HEADER_FROM_CSV);
    expect(payload.recordId).toBe('EBDG-ZHPL-DL-01-20260903');
  });
});

describe('Rows read back from the database', () => {
  it('leave the answers to added questions out of the sheet copy', () => {
    const withExtras = { ...sampleRow(), extras: { generator_room_clean: 'Yes' }, generator_room_clean: 'Yes' } as unknown as EbDgRow;
    const payload = buildSheetPayload(withExtras, 'EB_DG_B2B');
    expect(payload.values).toHaveLength(110);
    expect(payload.header).not.toContain('generator_room_clean');
  });
});

describe('"Send all to sheet" batch', () => {
  it('carries each row with its own tab, keyed on Record_ID', () => {
    const b2b = sampleRow();
    const b2c = { ...sampleRow(), Record_ID: 'EBDG-ZHPL-MH-02-20260903', Site_Code: 'ZHPL-MH-02' };
    const batch = buildEbDgSheetBatch([
      { row: b2b, channel: 'EB_DG_B2B' },
      { row: b2c, channel: 'EB_DG_B2C' },
    ]);
    expect(batch.action).toBe('upsertEbDgRows');
    expect(batch.header.join(',')).toBe(SHEET_HEADER_FROM_CSV);
    expect(batch.rows.map((r) => [r.tab, r.key])).toEqual([
      ['EB_DG_B2B', 'EBDG-ZHPL-DL-01-20260903'],
      ['EB_DG_B2C', 'EBDG-ZHPL-MH-02-20260903'],
    ]);
    expect(batch.rows.every((r) => r.values.length === 110)).toBe(true);
  });

  it('skips a row with no Record_ID rather than appending an unmatchable line', () => {
    const batch = buildEbDgSheetBatch([{ row: { ...sampleRow(), Record_ID: '' }, channel: 'EB_DG_B2B' }]);
    expect(batch.rows).toHaveLength(0);
  });
});

describe('app and Apps Script agree', () => {
  const gs = readFileSync(new URL('../../../scripts/EbDg_Code.gs', import.meta.url), 'utf8');

  const scriptHeader = (() => {
    const block = gs.match(/var EBDG_HEADER = \[([\s\S]*?)\];/);
    if (!block) throw new Error('EBDG_HEADER not found in scripts/EbDg_Code.gs');
    return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  })();

  it('on the header, column for column — DG 1, DG 2 and DG 3 included', () => {
    expect(scriptHeader.join(',')).toBe(SHEET_HEADER_FROM_CSV);
    expect(scriptHeader.filter((h) => h.startsWith('DG3_'))).toHaveLength(19);
  });

  it('on the actions the app posts', () => {
    expect(gs).toContain("payload.action === 'upsertEbDgRow'");
    expect(gs).toContain("payload.action === 'upsertEbDgRows'");
    expect(gs).toContain("var KEY_COLUMN = 'Record_ID'");
  });

  it('fills the pre-formatted rows with a blank Record_ID, never appending below them', () => {
    // The live tab carries ~2000 formula rows; appendRow would land after all of them.
    expect(gs).not.toContain('appendRow');
    expect(gs).toContain('slots.emptyRows');
  });
});

describe('Columns the tab has and the app contract does not', () => {
  const cell = (values: Array<string | number>, header: string) => values[EBDG_SHEET_HEADER.indexOf(header)];

  it('drops Timestamp and adds Submitted_At and Status, leaving the 109-column contract alone', () => {
    expect(EBDG_SHEET_HEADER).not.toContain('Timestamp');
    expect(EBDG_SHEET_HEADER.slice(-2)).toEqual(['Submitted_At', 'Status']);
    expect(EBDG_COLUMN_ORDER).toHaveLength(109);
    expect(buildSheetPayload(sampleRow(), 'EB_DG_B2B').header).not.toContain('Timestamp');
  });

  it('writes Submitted_At in Indian time, whether the row says +05:30 or UTC', () => {
    expect(cell(buildSheetPayload(sampleRow(), 'EB_DG_B2B').values, 'Submitted_At')).toBe('2026-09-03 18:24:11');
    // How a row read back from the database carries the same moment.
    expect(submittedAtOf('2026-09-03T12:54:11.000Z')).toBe('2026-09-03 18:24:11');
    expect(submittedAtOf('')).toBe('');
  });

  it('marks a first filing Submitted and a correction Amended', () => {
    expect(cell(buildSheetPayload(sampleRow(), 'EB_DG_B2B').values, 'Status')).toBe('Submitted');
    expect(cell(buildSheetPayload(sampleRow(), 'EB_DG_B2B', 'Amended').values, 'Status')).toBe('Amended');
    const remembered = { ...sampleRow(), Status: 'Amended' as const };
    expect(buildEbDgSheetBatch([{ row: remembered, channel: 'EB_DG_B2B' }]).rows[0].values.at(-1)).toBe('Amended');
  });
});
