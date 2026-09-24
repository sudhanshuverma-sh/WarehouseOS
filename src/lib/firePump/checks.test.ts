import { describe, expect, it } from 'vitest';
import { FIRE_PUMP_CHECKS, firePumpErrors, NOT_APPLICABLE, scoreFirePump, visibleChecks, type FirePumpAnswers } from './checks';
import { FIRE_PUMP_RECORD_FIELDS, firePumpRecord } from './records';

/**
 * The daily fire pump check: what counts as a fault, and what a fault must
 * carry before it can be filed. The form and the API both use these rules.
 */

const allGood = (): FirePumpAnswers => ({
  fire_alarm: 'Yes',
  mcp: 'Yes',
  pump_room: 'Operational',
  hydrant_pressure: 'Yes',
  hydrant_line: 'Yes',
  hydrant_boxes: 'Yes',
  hose_reel: 'Yes',
  sprinkler_available: 'Yes',
  sprinkler_charged: 'Yes',
});

const entry = (answers: FirePumpAnswers, over: Partial<Parameters<typeof firePumpErrors>[0]> = {}) => ({
  answers,
  remarks: {},
  photos: {},
  ...over,
});

describe('the checks', () => {
  it('are the nine from the reference form, in its order', () => {
    expect(FIRE_PUMP_CHECKS.map((c) => c.key)).toEqual([
      'fire_alarm', 'mcp', 'pump_room', 'hydrant_pressure', 'hydrant_line',
      'hydrant_boxes', 'hose_reel', 'sprinkler_available', 'sprinkler_charged',
    ]);
  });

  it('ask about the sprinkler line only where there is a sprinkler system', () => {
    expect(visibleChecks({ sprinkler_available: 'Yes' }).map((c) => c.key)).toContain('sprinkler_charged');
    expect(visibleChecks({ sprinkler_available: 'No' }).map((c) => c.key)).not.toContain('sprinkler_charged');
  });
});

describe('scoreFirePump', () => {
  it('is OK when every check is healthy', () => {
    expect(scoreFirePump(allGood())).toEqual({ overall: 'OK', issues: [] });
  });

  it('is CRITICAL on any failed check, naming each one', () => {
    expect(scoreFirePump({ ...allGood(), hydrant_boxes: 'No', hose_reel: 'No' })).toEqual({
      overall: 'CRITICAL',
      issues: ['hydrant_boxes', 'hose_reel'],
    });
  });

  it('counts a non-operational pump room as a fault', () => {
    expect(scoreFirePump({ ...allGood(), pump_room: 'Non operational' }).overall).toBe('CRITICAL');
  });

  it('does not count "no sprinkler system" as a fault', () => {
    const { sprinkler_charged: _, ...rest } = allGood();
    expect(scoreFirePump({ ...rest, sprinkler_available: 'No' })).toEqual({ overall: 'OK', issues: [] });
  });
});

describe('firePumpErrors', () => {
  it('accepts a complete, healthy check', () => {
    expect(firePumpErrors(entry(allGood(), { pressure: '7.0' }))).toEqual([]);
  });

  it('wants every visible check answered', () => {
    const { mcp: _, ...rest } = allGood();
    expect(firePumpErrors(entry(rest))).toEqual(['Answer "Are all MCPs (manual call points) OK?"']);
  });

  it('refuses a failed check without a real remark, and takes it without a photo', () => {
    const answers = { ...allGood(), hydrant_boxes: 'No' };
    expect(firePumpErrors(entry(answers))).toEqual(['"Hydrant boxes OK": say what is wrong — which unit, where.']);
    expect(firePumpErrors(entry(answers, { remarks: { hydrant_boxes: 'Box near Gate 2, glass broken' } }))).toEqual([]);
    expect(firePumpErrors(entry(answers, { remarks: { hydrant_boxes: 'broken' }, photos: { hydrant_boxes: 'p1' } }))).toEqual([
      '"Hydrant boxes OK": say what is wrong — which unit, where.',
    ]);
    expect(
      firePumpErrors(entry(answers, { remarks: { hydrant_boxes: 'Box near Gate 2, glass broken' }, photos: { hydrant_boxes: 'p1' } })),
    ).toEqual([]);
  });

  it('does not ask for the sprinkler line where there is no sprinkler system, and refuses an answer to it', () => {
    const { sprinkler_charged: _, ...rest } = allGood();
    expect(firePumpErrors(entry({ ...rest, sprinkler_available: 'No' }))).toEqual([]);
    expect(firePumpErrors(entry({ ...rest, sprinkler_available: 'No', sprinkler_charged: 'No' }))).toEqual([
      '"Is the sprinkler line charged?" does not apply here.',
    ]);
  });

  it('refuses an answer the check does not offer, and a pressure out of range', () => {
    expect(firePumpErrors(entry({ ...allGood(), mcp: 'Maybe' }))[0]).toBe('"Are all MCPs (manual call points) OK?" must be Yes or No.');
    expect(firePumpErrors(entry(allGood(), { pressure: 45 }))).toEqual(['Pressure reading must be between 0 and 20 bar.']);
  });
});

describe('Records rows', () => {
  it('have one column per check, then its remark and photo, and say Not applicable for an unasked check', () => {
    const { sprinkler_charged: _, ...rest } = allGood();
    const row = firePumpRecord(
      {
        id: '7',
        siteCode: 'ZHPL-DL-01',
        date: '2026-09-24',
        submittedByName: 'Ramesh K',
        answers: { ...rest, sprinkler_available: 'No', hydrant_boxes: 'No' },
        remarks: { hydrant_boxes: 'Box near Gate 2, glass broken' },
        photos: { hydrant_boxes: '0b3c9f3e-1d5e-4a9b-9c55-2c7d7a7e8f10' },
        hydrantPressureBar: 7,
        overallStatus: 'CRITICAL',
        issuesCount: 1,
      },
      'https://wos.example',
    );
    expect(row).toMatchObject({
      warehouseId: 'ZHPL-DL-01',
      date: '2026-09-24',
      status: 'CRITICAL',
      hydrant_boxes: 'No',
      hydrant_boxes_remark: 'Box near Gate 2, glass broken',
      hydrant_boxes_photo: 'https://wos.example/api/attachments/0b3c9f3e-1d5e-4a9b-9c55-2c7d7a7e8f10',
      sprinkler_charged: NOT_APPLICABLE,
      hydrant_pressure_bar: 7,
      issues: 'Hydrant boxes OK',
    });
    // Every column Records lists is a key the row carries.
    for (const f of FIRE_PUMP_RECORD_FIELDS) expect(Object.keys(row)).toContain(f.key);
  });
});
