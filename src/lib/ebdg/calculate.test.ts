import { describe, expect, it } from 'vitest';
import { calculate, validate, dayOfWeek, safeDiv, formatRecordId, nz } from './calculate';
import { EbDgInput, EbDgRow, SiteDgConfig, resolveSiteDgConfig } from '../../types/ebdg';
import { pickPreviousRow, anyLaterRows } from './repository';
import { rowToOrderedValues } from './columns';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const CONFIG_2DG: SiteDgConfig = resolveSiteDgConfig({
  Site_Code: 'ZHPL-DEL-01',
  DG_Count: 2,
  Has_DEF: 'Yes',
  Has_Solar: 'No'
});

const baseInput = (overrides: Partial<EbDgInput> = {}): EbDgInput => ({
  DG1_HSD_Added: 0, DG1_HSD_Closing: 100, DG1_KWH_Closing: 1000, DG1_Run_Hrs: 5, DG1_Hour_Meter: 500, DG1_B_Check_Done_Today: 'No',
  DG2_HSD_Added: 0, DG2_HSD_Closing: 50, DG2_KWH_Closing: 500, DG2_Run_Hrs: 0, DG2_Hour_Meter: 200, DG2_B_Check_Done_Today: 'No',
  DG3_HSD_Added: 0, DG3_HSD_Closing: 0, DG3_KWH_Closing: 0, DG3_Run_Hrs: 0, DG3_Hour_Meter: 0, DG3_B_Check_Done_Today: 'No',
  DEF_Added: 0, DEF_Closing: 90,
  HSD_Received_Ltr: 0, HSD_Rate: 90, HSD_Tank_Closing: 900,
  Grid_MF: 20, Grid_KWH_Closing: 1200, Grid_KVAH_Closing: 1250,
  Grid_Supply_Hrs: 20, EB_Power_Cuts: 0, Max_Load_KW: 80,
  Solar_Closing: 0,
  EB_Rate_Per_Unit: 8, Solar_Rate_Per_Unit: 0,
  Water_Closing: 150, Raw_Water_Procured_KL: 0,
  Remark: '',
  ...overrides
});

const meta = { siteCode: 'ZHPL-DEL-01', whCode: 'WH-DEL-01', zone: 'North', date: '2026-09-04', timestamp: '2026-09-04T20:00:00+05:30', submittedBy: 'poc@grofers.com' };

function makePrevRow(overrides: Partial<EbDgRow> = {}): EbDgRow {
  const row = calculate(
    baseInput({ DG1_HSD_Closing: 150, DG1_KWH_Closing: 900, DG2_HSD_Closing: 80, DG2_KWH_Closing: 400, DEF_Closing: 100, HSD_Tank_Closing: 1000, Grid_KWH_Closing: 1100, Grid_KVAH_Closing: 1150, Water_Closing: 140 }),
    null,
    CONFIG_2DG,
    { ...meta, date: '2026-09-03', timestamp: '2026-09-03T20:00:00+05:30' },
    { DG1_HSD_Opening: 200, DG1_KWH_Opening: 850, DG2_HSD_Opening: 90, DG2_KWH_Opening: 380, DEF_Opening: 110, HSD_Tank_Opening: 1050, Grid_KWH_Opening: 1050, Grid_KVAH_Opening: 1100, Water_Opening: 130 }
  );
  return { ...row, ...overrides };
}

// ---------------------------------------------------------------------
// 1. Normal day — carry-forward from a real previous row
// ---------------------------------------------------------------------

describe('calculate() — normal day', () => {
  const prev = makePrevRow();
  const row = calculate(baseInput(), prev, CONFIG_2DG, meta);

  it('opens today from yesterday\'s closing, per DG', () => {
    expect(row.DG1_HSD_Opening).toBe(prev.DG1_HSD_Closing);
    expect(row.DG1_KWH_Opening).toBe(prev.DG1_KWH_Closing);
    expect(row.DG2_HSD_Opening).toBe(prev.DG2_HSD_Closing);
    expect(row.DEF_Opening).toBe(prev.DEF_Closing);
    expect(row.HSD_Tank_Opening).toBe(prev.HSD_Tank_Closing);
    expect(row.Grid_KWH_Opening).toBe(prev.Grid_KWH_Closing);
    expect(row.Water_Opening).toBe(prev.Water_Closing);
  });

  it('computes DG1 consumption and efficiency correctly', () => {
    // Opening 150 + Added 0 - Closing 100 = 50 L consumed
    expect(row.DG1_HSD_Consumption).toBe(50);
    // KWH: 1000 - 900 = 100
    expect(row.DG1_KWH_Consumption).toBe(100);
    expect(row.DG1_Unit_Per_Ltr).toBeCloseTo(100 / 50, 5);
    expect(row.DG1_Ltr_Per_Hr).toBeCloseTo(50 / 5, 5);
  });

  it('sums totals across active DGs only, and leaves an absent DG blank (not 0)', () => {
    expect(row.Total_HSD_Consumption).toBe(nz(row.DG1_HSD_Consumption) + nz(row.DG2_HSD_Consumption));
    expect(row.Total_Run_Hrs).toBe(nz(row.DG1_Run_Hrs) + nz(row.DG2_Run_Hrs));
    // A 2-DG site has no DG3 at all — its columns are empty, not zeroed.
    expect(row.DG3_HSD_Consumption).toBe('');
    expect(row.DG3_Run_Hrs).toBe('');
    expect(row.DG3_B_Check_Status).toBe('');
  });

  it('applies the grid multiplying factor to KWH but not KVAH', () => {
    // (1200 - 1100) * MF 20 = 2000
    expect(row.Grid_KWH_Consumed).toBe(2000);
    // (1250 - 1150), no MF = 100
    expect(row.Grid_KVAH_Consumed).toBe(100);
  });

  it('stamps app-written fields', () => {
    expect(row.Record_ID).toBe('EBDG-ZHPL-DEL-01-20260904');
    expect(row.Site_Code).toBe('ZHPL-DEL-01');
    expect(row.Day).toBe(dayOfWeek('2026-09-04'));
    expect(row.Submitted_By).toBe('poc@grofers.com');
  });

  it('round-trips through the exact 109-column order without throwing', () => {
    expect(() => rowToOrderedValues(row)).not.toThrow();
    expect(rowToOrderedValues(row)).toHaveLength(109);
  });
});

// ---------------------------------------------------------------------
// 2. First-ever entry — no previous row, seed openings used one time
// ---------------------------------------------------------------------

describe('calculate() — first-ever entry (no previous row)', () => {
  it('uses the seed openings when prev is null', () => {
    const row = calculate(
      baseInput(),
      null,
      CONFIG_2DG,
      meta,
      { DG1_HSD_Opening: 300, DG1_KWH_Opening: 5000, HSD_Tank_Opening: 2000, Water_Opening: 100 }
    );
    expect(row.DG1_HSD_Opening).toBe(300);
    expect(row.DG1_KWH_Opening).toBe(5000);
    expect(row.HSD_Tank_Opening).toBe(2000);
    expect(row.Water_Opening).toBe(100);
    // Consumption still derives correctly off the seed opening.
    expect(row.DG1_HSD_Consumption).toBe(300 + 0 - 100);
  });

  it('leaves openings blank when no seed is supplied either — blank, not a fabricated 0', () => {
    const row = calculate(baseInput({ DG1_HSD_Closing: 0 }), null, CONFIG_2DG, meta);
    expect(row.DG1_HSD_Opening).toBe('');
    expect(row.Grid_KWH_Opening).toBe('');
    expect(row.Water_Opening).toBe('');
  });

  it('still computes downstream arithmetic off a blank opening without crashing', () => {
    // Blank counts as 0 inside the arithmetic (the spec's N()), so a filled
    // closing of 40 against an unknown opening reads as -40 rather than NaN.
    const row = calculate(baseInput({ DG1_HSD_Closing: 40, DG1_HSD_Added: 0 }), null, CONFIG_2DG, meta);
    expect(row.DG1_HSD_Consumption).toBe(-40);
    expect(Number.isNaN(row.DG1_Unit_Per_Ltr)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 3. Date gap — the carry-forward source is "most recent earlier row",
//    never strictly date - 1.
// ---------------------------------------------------------------------

describe('pickPreviousRow() — date gap handling', () => {
  const siteA = makePrevRow({ Site_Code: 'SITE-A', Date: '2026-09-01' });
  const siteAOther = makePrevRow({ Site_Code: 'SITE-A', Date: '2026-08-28' });
  const siteB = makePrevRow({ Site_Code: 'SITE-B', Date: '2026-09-03' }); // different site, interleaved in the same tab

  it('finds the most recent earlier row for the SAME site, skipping a gap (missed 2 and 3 Sep)', () => {
    const rows = [siteA, siteAOther, siteB];
    const found = pickPreviousRow(rows, 'SITE-A', '2026-09-04');
    expect(found?.Date).toBe('2026-09-01'); // not '2026-09-03', which belongs to SITE-B
  });

  it('never matches across sites even when another site filed more recently', () => {
    const rows = [siteB];
    const found = pickPreviousRow(rows, 'SITE-A', '2026-09-04');
    expect(found).toBeNull();
  });

  it('flags a back-dated entry: rows exist after the date being filed', () => {
    const rows = [siteA];
    expect(anyLaterRows(rows, 'SITE-A', '2026-08-31')).toBe(true);
    expect(anyLaterRows(rows, 'SITE-A', '2026-09-02')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 4. B-check reset vs. carry-forward
// ---------------------------------------------------------------------

describe('calculate() — B-check logic', () => {
  it('resets Last_Hrs/Last_Date to today when Done_Today = Yes', () => {
    const prev = makePrevRow({ DG1_B_Check_Last_Hrs: 100, DG1_B_Check_Last_Date: '2026-01-01' });
    const row = calculate(
      baseInput({ DG1_B_Check_Done_Today: 'Yes', DG1_Hour_Meter: 777 }),
      prev,
      CONFIG_2DG,
      meta
    );
    expect(row.DG1_B_Check_Last_Hrs).toBe(777);
    expect(row.DG1_B_Check_Last_Date).toBe('2026-09-04');
    expect(row.DG1_B_Check_Due_Hrs).toBe(777 + 500);
    expect(row.DG1_B_Check_Due_Date).toBe('2027-09-04');
  });

  it('carries Last_Hrs/Last_Date forward untouched when Done_Today = No', () => {
    const prev = makePrevRow({ DG1_B_Check_Last_Hrs: 100, DG1_B_Check_Last_Date: '2026-01-01' });
    const row = calculate(
      baseInput({ DG1_B_Check_Done_Today: 'No', DG1_Hour_Meter: 777 }),
      prev,
      CONFIG_2DG,
      meta
    );
    expect(row.DG1_B_Check_Last_Hrs).toBe(100);
    expect(row.DG1_B_Check_Last_Date).toBe('2026-01-01');
  });

  it('flags DUE NOW once remaining hours or days drop to zero or below', () => {
    const prev = makePrevRow({ DG1_B_Check_Last_Hrs: 100, DG1_B_Check_Last_Date: '2026-09-01' });
    // Due_Hrs = 100 + 500 = 600; Hour_Meter way past it.
    const row = calculate(baseInput({ DG1_Hour_Meter: 650, DG1_HSD_Closing: 90 }), prev, CONFIG_2DG, meta);
    expect(row.DG1_B_Check_Remaining_Hrs).toBeLessThanOrEqual(0);
    expect(row.DG1_B_Check_Status).toBe('DUE NOW');
  });

  it('flags DUE SOON within the 50-hour / 30-day warning window, OK outside it', () => {
    const prev = makePrevRow({ DG1_B_Check_Last_Hrs: 100, DG1_B_Check_Last_Date: '2026-08-01' });
    // Due_Hrs = 600; meter at 560 -> 40 hrs remaining -> DUE SOON.
    const soon = calculate(baseInput({ DG1_Hour_Meter: 560, DG1_HSD_Closing: 90 }), prev, CONFIG_2DG, meta);
    expect(soon.DG1_B_Check_Status).toBe('DUE SOON');

    // Meter at 200 -> 400 hrs remaining, date well within a year -> OK.
    const ok = calculate(baseInput({ DG1_Hour_Meter: 200, DG1_HSD_Closing: 90 }), prev, CONFIG_2DG, meta);
    expect(ok.DG1_B_Check_Status).toBe('OK');
  });
});

// ---------------------------------------------------------------------
// 5. Division-by-zero guards
// ---------------------------------------------------------------------

describe('calculate() — division by zero never produces NaN/Infinity', () => {
  it('safeDiv() returns the fallback instead of NaN/Infinity', () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(0, 0)).toBe(0);
    expect(safeDiv(10, 0, -1)).toBe(-1);
    expect(safeDiv(10, 5)).toBe(2);
  });

  it('Unit_Per_Ltr is 0, not NaN, when no diesel was consumed', () => {
    const prev = makePrevRow();
    // Opening 150, Added 0, Closing 150 -> 0 consumption, but KWH still moved.
    const row = calculate(baseInput({ DG1_HSD_Closing: 150, DG1_KWH_Closing: 950 }), prev, CONFIG_2DG, meta);
    expect(row.DG1_HSD_Consumption).toBe(0);
    expect(row.DG1_Unit_Per_Ltr).toBe(0);
    expect(Number.isNaN(row.DG1_Unit_Per_Ltr)).toBe(false);
  });

  it('Ltr_Per_Hr is 0, not Infinity, when Run_Hrs is 0', () => {
    const prev = makePrevRow();
    const row = calculate(baseInput({ DG1_Run_Hrs: 0, DG1_HSD_Closing: 100 }), prev, CONFIG_2DG, meta);
    expect(row.DG1_Ltr_Per_Hr).toBe(0);
    expect(Number.isFinite(row.DG1_Ltr_Per_Hr)).toBe(true);
  });

  it('Total_Unit_Per_Ltr and Blended_Rate_Per_Unit are 0 on a totally quiet day (no DG, no grid, no solar)', () => {
    const quietConfig = resolveSiteDgConfig({ Site_Code: 'ZHPL-DEL-02', DG_Count: 0, Has_DEF: 'No', Has_Solar: 'No' });
    const row = calculate(
      baseInput({
        DG1_HSD_Closing: 0, DG1_KWH_Closing: 0, DG1_Run_Hrs: 0,
        DG2_HSD_Closing: 0, DG2_KWH_Closing: 0, DG2_Run_Hrs: 0,
        Grid_KWH_Closing: 0, Grid_KVAH_Closing: 0, Grid_MF: 0
      }),
      null,
      quietConfig,
      meta
    );
    expect(row.Total_Unit_Per_Ltr).toBe(0);
    expect(row.Grid_PF).toBe(0);
    expect(row.Blended_Rate_Per_Unit).toBe(0);
    expect(row.DG_Rate_Per_Unit).toBe(0);
  });

  it('a Grid_MF of 0 is treated as 1, per spec, rather than zeroing consumption', () => {
    const row = calculate(baseInput({ Grid_MF: 0, Grid_KWH_Closing: 1150 }), null, CONFIG_2DG, meta, { Grid_KWH_Opening: 1100 });
    expect(row.Grid_KWH_Consumed).toBe(50); // (1150-1100) * 1, not * 0
  });
});

// ---------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------

describe('validate()', () => {
  const prev = makePrevRow();

  it('errors when closing stock exceeds what was available', () => {
    const issues = validate(baseInput({ DG1_HSD_Closing: 999 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'DG1_HSD_Closing' && i.severity === 'error')).toBe(true);
  });

  it('errors when the energy meter goes backwards', () => {
    const issues = validate(baseInput({ DG1_KWH_Closing: 1 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'DG1_KWH_Closing' && i.severity === 'error')).toBe(true);
  });

  it('errors when the hour meter goes backwards vs. yesterday', () => {
    const issues = validate(baseInput({ DG1_Hour_Meter: 1 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'DG1_Hour_Meter' && i.severity === 'error')).toBe(true);
  });

  it('errors when a single DG run exceeds 24 hours', () => {
    const issues = validate(baseInput({ DG1_Run_Hrs: 25 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'DG1_Run_Hrs' && i.severity === 'error')).toBe(true);
  });

  it('errors when total DG hours across all DGs exceed 24', () => {
    const issues = validate(baseInput({ DG1_Run_Hrs: 15, DG2_Run_Hrs: 12 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'Total_Run_Hrs' && i.severity === 'error')).toBe(true);
  });

  it('warns (does not error) when a DG ran but used no diesel', () => {
    const issues = validate(baseInput({ DG1_Run_Hrs: 3, DG1_HSD_Closing: 150 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    const found = issues.find(i => i.field === 'DG1_Run_Hrs' && i.message.includes('used no diesel'));
    expect(found?.severity).toBe('warning');
  });

  it('errors on a future date', () => {
    const issues = validate(baseInput(), prev, CONFIG_2DG, '2026-09-10', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'Date' && i.severity === 'error')).toBe(true);
  });

  it('passes clean on a well-formed normal day', () => {
    const issues = validate(baseInput(), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 6. Blank is not zero — the IF(X="","",…) semantics of every spec formula
// ---------------------------------------------------------------------

describe('calculate() — an unfilled reading stays blank, it is never read as 0', () => {
  const prev = makePrevRow();

  /** DG2 is a standby that did not run; the POC correctly leaves it alone. */
  const standbyInput = baseInput({
    DG2_HSD_Added: '', DG2_HSD_Closing: '', DG2_KWH_Closing: '', DG2_Run_Hrs: '', DG2_Hour_Meter: ''
  });

  it('does NOT book an untouched DG\'s whole tank as consumed', () => {
    const row = calculate(standbyInput, prev, CONFIG_2DG, meta);
    expect(row.DG2_HSD_Closing).toBe('');
    expect(row.DG2_HSD_Consumption).toBe('');   // not 80 L
    expect(row.DG2_KWH_Consumption).toBe('');   // not -400
  });

  it('keeps the untouched DG out of the totals and the money', () => {
    const row = calculate(standbyInput, prev, CONFIG_2DG, meta);
    // Only DG1's 50 L counts — blank contributes 0 through N(), nothing more.
    expect(row.Total_HSD_Consumption).toBe(50);
    expect(row.DG_Amount).toBe(50 * 90);
  });

  it('leaves DEF and the bulk tank blank rather than reading them as empty vessels', () => {
    const row = calculate(baseInput({ DEF_Closing: '', HSD_Tank_Closing: '' }), prev, CONFIG_2DG, meta);
    expect(row.DEF_Closing).toBe('');
    expect(row.DEF_Used).toBe('');       // not 100 L "used"
    expect(row.HSD_Tank_Closing).toBe(''); // not a tank reading 0
  });

  it('leaves grid/water consumption blank when the meter was not read', () => {
    const row = calculate(baseInput({ Grid_KWH_Closing: '', Grid_KVAH_Closing: '', Water_Closing: '' }), prev, CONFIG_2DG, meta);
    expect(row.Grid_KWH_Consumed).toBe('');
    expect(row.Grid_KVAH_Consumed).toBe('');
    expect(row.Water_Consumed).toBe('');
    expect(row.Grid_PF).toBe(0); // IFERROR field — a number, per spec
  });

  it('does not raise a "meter went backwards" error against a blank reading', () => {
    const issues = validate(standbyInput, prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('still catches a real backwards meter when the reading IS filled', () => {
    const issues = validate(baseInput({ DG2_KWH_Closing: 1 }), prev, CONFIG_2DG, '2026-09-04', undefined, '2026-09-04');
    expect(issues.some(i => i.field === 'DG2_KWH_Closing' && i.severity === 'error')).toBe(true);
  });

  it('a filled 0 is still a real reading and is treated as one', () => {
    // Explicit 0 closing against a 150 L opening = the tank was drained.
    const row = calculate(baseInput({ DG1_HSD_Closing: 0 }), prev, CONFIG_2DG, meta);
    expect(row.DG1_HSD_Consumption).toBe(150);
  });
});

// ---------------------------------------------------------------------
// 7. B-check chain start on a first-ever entry
// ---------------------------------------------------------------------

describe('calculate() — B-check on a site with no history', () => {
  it('starts the chain from the seeded last-service reading', () => {
    const row = calculate(
      baseInput({ DG1_Hour_Meter: 400 }),
      null,
      CONFIG_2DG,
      meta,
      { DG1_B_Check_Last_Hrs: 320, DG1_B_Check_Last_Date: '2026-03-15' }
    );
    expect(row.DG1_B_Check_Last_Hrs).toBe(320);
    expect(row.DG1_B_Check_Last_Date).toBe('2026-03-15');
    expect(row.DG1_B_Check_Due_Hrs).toBe(820);        // 320 + 500
    expect(row.DG1_B_Check_Remaining_Hrs).toBe(420);  // 820 - 400
    expect(row.DG1_B_Check_Due_Date).toBe('2027-03-15');
    expect(row.DG1_B_Check_Status).toBe('OK');
  });

  it('reports DUE NOW when the seeded history says the DG is genuinely overdue', () => {
    const row = calculate(
      baseInput({ DG1_Hour_Meter: 900 }),
      null,
      CONFIG_2DG,
      meta,
      { DG1_B_Check_Last_Hrs: 320, DG1_B_Check_Last_Date: '2026-03-15' }
    );
    expect(row.DG1_B_Check_Status).toBe('DUE NOW'); // 900 is past the 820 due mark
  });

  it('leaves the badge blank — not DUE NOW — when there is no history to judge against', () => {
    const row = calculate(baseInput({ DG1_Hour_Meter: 500 }), null, CONFIG_2DG, meta);
    expect(row.DG1_B_Check_Last_Hrs).toBe('');
    expect(row.DG1_B_Check_Remaining_Hrs).toBe('');
    expect(row.DG1_B_Check_Status).toBe('');
  });

  it('a B-check filed on day one seeds the chain by itself', () => {
    const row = calculate(
      baseInput({ DG1_Hour_Meter: 500, DG1_B_Check_Done_Today: 'Yes' }),
      null, CONFIG_2DG, meta
    );
    expect(row.DG1_B_Check_Last_Hrs).toBe(500);
    expect(row.DG1_B_Check_Last_Date).toBe('2026-09-04');
    expect(row.DG1_B_Check_Status).toBe('OK');
  });
});

// ---------------------------------------------------------------------
// 8. The Column_Guide's worked example, reproduced end to end.
//    Every number below is copied from the guide's "Example" column, so this
//    pins the engine against the live sheet's own arithmetic and rounding.
// ---------------------------------------------------------------------

describe('calculate() — reproduces the Column_Guide worked example', () => {
  const guideConfig = resolveSiteDgConfig({ Site_Code: 'ZHPL-DL-01', DG_Count: 1, Has_DEF: 'No', Has_Solar: 'No' });
  const guideMeta = {
    siteCode: 'ZHPL-DL-01', whCode: 'Delhi DC', zone: 'North',
    date: '2026-09-03', timestamp: '2026-09-03T18:24:11+05:30', submittedBy: 'ramesh.k@zomato.com'
  };

  // Yesterday's row supplies the openings the guide shows (1185 L / 4438 kWh),
  // plus the B-check chain (last done at 0 hrs on 2026-03-14).
  const yesterday = {
    ...makePrevRow(),
    Site_Code: 'ZHPL-DL-01', Date: '2026-09-02',
    DG1_HSD_Closing: 1185, DG1_KWH_Closing: 4438, DG1_Hour_Meter: 455,
    DG1_B_Check_Last_Hrs: 0, DG1_B_Check_Last_Date: '2026-03-14',
    Grid_KWH_Closing: 88515, Grid_KVAH_Closing: 0
  } as EbDgRow;

  const row = calculate(
    baseInput({
      DG1_HSD_Added: 0, DG1_HSD_Closing: 1162, DG1_KWH_Closing: 4479,
      DG1_Run_Hrs: 1.6, DG1_Hour_Meter: 456.6, DG1_B_Check_Done_Today: 'No',
      HSD_Rate: 94.50,
      Grid_MF: 20, Grid_KWH_Closing: 88604, Grid_KVAH_Closing: '',
      Grid_Supply_Hrs: 22.4, EB_Rate_Per_Unit: 8.20,
      Remark: 'DG ran during EB cut 14:10–15:45'
    }),
    yesterday, guideConfig, guideMeta
  );

  it('identity columns', () => {
    expect(row.Record_ID).toBe('EBDG-ZHPL-DL-01-20260903');
    expect(row.Day).toBe('Thu');                       // guide: Thu
    expect(row.Timestamp).toBe('2026-09-03T18:24:11+05:30');
    expect(row.Submitted_By).toBe('ramesh.k@zomato.com');
  });

  it('DG1 fuel and power — guide values 1185 / 1162 / 23 and 4438 / 4479 / 41', () => {
    expect(row.DG1_HSD_Opening).toBe(1185);
    expect(row.DG1_HSD_Closing).toBe(1162);
    expect(row.DG1_HSD_Consumption).toBe(23);
    expect(row.DG1_KWH_Opening).toBe(4438);
    expect(row.DG1_KWH_Consumption).toBe(41);
  });

  it('DG1 efficiency — 1.78 units/L and 14.4 L/hr, at the sheet\'s own precision', () => {
    expect(row.DG1_Unit_Per_Ltr).toBe(1.78);   // 41/23 = 1.7826 -> 2dp, not 1.8
    expect(row.DG1_Ltr_Per_Hr).toBe(14.4);     // 23/1.6 = 14.375 -> 1dp
  });

  it('DG1 B-check — due at 500 hrs, 43.4 remaining, DUE SOON', () => {
    expect(row.DG1_B_Check_Last_Hrs).toBe(0);
    expect(row.DG1_B_Check_Last_Date).toBe('2026-03-14');
    expect(row.DG1_B_Check_Due_Hrs).toBe(500);
    expect(row.DG1_B_Check_Remaining_Hrs).toBe(43.4);
    expect(row.DG1_B_Check_Due_Date).toBe('2027-03-14');
    expect(row.DG1_B_Check_Remaining_Days).toBe(192);
    expect(row.DG1_B_Check_Status).toBe('DUE SOON');
  });

  it('grid — 1780 units consumed after the ×20 meter factor', () => {
    expect(row.Grid_KWH_Consumed).toBe(1780);  // (88604 - 88515) * 20
  });

  it('supply split — 93.33% grid / 6.67% DG, at 2dp like the sheet', () => {
    expect(row.Grid_Supply_Pct).toBe(93.33);   // 22.4/24*100
    expect(row.DG_Supply_Pct).toBe(6.67);      // 1.6/24*100
  });

  it('a site with one DG leaves DG2 and DG3 columns empty', () => {
    expect(row.DG2_HSD_Opening).toBe('');
    expect(row.DG3_B_Check_Status).toBe('');
  });
});

describe('formatRecordId()', () => {
  it('formats EBDG-{Site_Code}-{YYYYMMDD}', () => {
    expect(formatRecordId('ZHPL-DEL-01', '2026-09-04')).toBe('EBDG-ZHPL-DEL-01-20260904');
  });
});
