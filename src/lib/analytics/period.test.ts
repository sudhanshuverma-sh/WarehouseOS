import { describe, expect, it } from 'vitest';
import { formatDate, formatRange, recordPeriodRange } from './period';

const TODAY = '2026-09-26';
const none = { day: '', from: '', to: '' };

describe('the periods Records offers', () => {
  it('covers this month up to today, and all of last month', () => {
    expect(recordPeriodRange('THIS_MONTH', none, TODAY)).toEqual({ from: '2026-09-01', to: TODAY });
    expect(recordPeriodRange('PREV_MONTH', none, TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(recordPeriodRange('PREV_MONTH', none, '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('takes a custom range in either order, one end alone, and never past today', () => {
    expect(recordPeriodRange('CUSTOM', { day: '', from: '2026-09-14', to: '2026-09-10' }, TODAY)).toEqual({ from: '2026-09-10', to: '2026-09-14' });
    expect(recordPeriodRange('CUSTOM', { day: '', from: '2026-09-12', to: '' }, TODAY)).toEqual({ from: '2026-09-12', to: '2026-09-12' });
    expect(recordPeriodRange('CUSTOM', { day: '', from: '2026-09-20', to: '2026-12-01' }, TODAY)).toEqual({ from: '2026-09-20', to: TODAY });
    expect(recordPeriodRange('CUSTOM', none, TODAY)).toBeNull();
  });

  it('keeps one day and all time as they were', () => {
    expect(recordPeriodRange('DAY', { ...none, day: '2026-09-02' }, TODAY)).toEqual({ from: '2026-09-02', to: '2026-09-02' });
    expect(recordPeriodRange('ALL', none, TODAY)).toBeNull();
  });
});

describe('dates in words', () => {
  it('reads the same in every browser', () => {
    expect(formatDate('2026-09-05')).toBe('05 Sep 2026');
    expect(formatRange({ from: '2026-09-01', to: '2026-09-26' })).toBe('01 Sep 2026 to 26 Sep 2026');
    expect(formatRange({ from: TODAY, to: TODAY })).toBe('26 Sep 2026');
  });
});
