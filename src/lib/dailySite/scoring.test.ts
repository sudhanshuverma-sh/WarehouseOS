import { describe, expect, it } from 'vitest';
import { dailySiteValueErrors, scoreDailySite } from './scoring';

describe('scoreDailySite', () => {
  it('is clear when everything is available and done', () => {
    expect(scoreDailySite({})).toEqual({ worstStatus: 'clear', deviationsCount: 0 });
    expect(scoreDailySite({ ups: 100, rt: '100', gemba: 'Done' })).toEqual({ worstStatus: 'clear', deviationsCount: 0 });
  });

  it('is partial for an ordinary utility or MHE shortfall', () => {
    expect(scoreDailySite({ ups: 90 })).toEqual({ worstStatus: 'partial', deviationsCount: 1 });
    expect(scoreDailySite({ bopt: '50', hvls: 0 })).toEqual({ worstStatus: 'partial', deviationsCount: 2 });
  });

  it('is critical when stock is at risk', () => {
    expect(scoreDailySite({ coldRoom: 99 }).worstStatus).toBe('critical');
    expect(scoreDailySite({ freezersGgp: 0, ups: 50 })).toEqual({ worstStatus: 'critical', deviationsCount: 2 });
  });

  it('is critical when a routine check was not done', () => {
    expect(scoreDailySite({ mtsInspection: 'Not Done' }).worstStatus).toBe('critical');
    expect(scoreDailySite({ gemba: 'NA' }).worstStatus).toBe('critical');
  });

  it('does not let a later partial downgrade an earlier critical', () => {
    expect(scoreDailySite({ coldRoom: 10, rt: 10 }).worstStatus).toBe('critical');
  });
});

describe('dailySiteValueErrors', () => {
  it('accepts blanks and valid readings', () => {
    expect(dailySiteValueErrors({ ups: '', dg: 75, gemba: 'NA' })).toEqual([]);
  });

  it('refuses percentages outside 0-100 and non-numbers', () => {
    expect(dailySiteValueErrors({ ups: 120 })).toEqual(['UPS must be a percentage from 0 to 100.']);
    expect(dailySiteValueErrors({ rt: -1, dg: 'lots' })).toHaveLength(2);
  });

  it('refuses a routine value that is not Done / Not Done / NA', () => {
    expect(dailySiteValueErrors({ gemba: 'Yes' })).toEqual(['Gemba must be Done, Not Done or NA.']);
  });
});
