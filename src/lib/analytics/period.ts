/**
 * The period and scope an analytics dashboard shows: segment (B2B / B2C),
 * a preset, a month or a custom From / To range, and chosen sites.
 *
 * Shared by the EB-DG, Daily Site Report and Fire Pump dashboards, so "30D"
 * means the same days everywhere. Presets end YESTERDAY except "Today":
 * today's entries are usually still being filed, and a half-filed day drags
 * every trend down. "Today" is there for the daily checks, where today's
 * state is the point.
 */

export type Segment = 'ALL' | 'B2B' | 'B2C';
export type Preset = 'today' | 'last7' | 'last30' | 'last90' | 'currentMonth' | 'prevMonth' | 'all' | 'custom';

export interface PeriodFilters {
  segment: Segment;
  preset: Preset;
  /** 'yyyy-MM': when set, wins over the preset. */
  month: string;
  /** 'yyyy-MM-dd': the custom range, used when preset is 'custom'. */
  from: string;
  to: string;
  /** Site codes; empty means every site. */
  sites: string[];
}

export const DEFAULT_PERIOD_FILTERS: PeriodFilters = { segment: 'ALL', preset: 'last30', month: '', from: '', to: '', sites: [] };

export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Days from `from` to `to`, both counted. */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** The days a filter covers. `from` is null for "all". */
export function rangeFor(
  filters: Pick<PeriodFilters, 'preset' | 'month'> & Partial<Pick<PeriodFilters, 'from' | 'to'>>,
  today: string,
): { from: string | null; to: string } {
  const yesterday = shiftDay(today, -1);
  if (filters.month) {
    const [y, m] = filters.month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: `${filters.month}-01`, to: last < yesterday ? last : yesterday };
  }
  switch (filters.preset) {
    case 'today':
      return { from: today, to: today };
    case 'custom': {
      const a = filters.from || filters.to || '';
      const b = filters.to || filters.from || '';
      if (!a) return { from: shiftDay(yesterday, -29), to: yesterday };
      let [from, to] = a <= b ? [a, b] : [b, a];
      if (to > today) to = today;
      if (from > to) from = to;
      return { from, to };
    }
    case 'last7':
      return { from: shiftDay(yesterday, -6), to: yesterday };
    case 'last30':
      return { from: shiftDay(yesterday, -29), to: yesterday };
    case 'last90':
      return { from: shiftDay(yesterday, -89), to: yesterday };
    case 'currentMonth':
      return { from: `${today.slice(0, 7)}-01`, to: yesterday < `${today.slice(0, 7)}-01` ? today : yesterday };
    case 'prevMonth': {
      const first = `${today.slice(0, 7)}-01`;
      const lastPrev = shiftDay(first, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    default:
      return { from: null, to: yesterday };
  }
}

/** The equal-length period just before a range; none for an open range. */
export function previousRange(range: { from: string | null; to: string }): { from: string; to: string } | null {
  if (!range.from) return null;
  const len = daysBetween(range.from, range.to);
  return { from: shiftDay(range.from, -len), to: shiftDay(range.from, -1) };
}

/** The months that have entries, newest first, for the month picker. */
export function monthsOf(dates: Iterable<string>, today: string): string[] {
  const set = new Set<string>();
  for (const raw of dates) {
    const d = String(raw ?? '').slice(0, 10);
    if (d && d <= today) set.add(d.slice(0, 7));
  }
  return [...set].sort().reverse();
}

/** Whether a day falls in a range. */
export const inRange = (day: string, range: { from: string | null; to: string }) => (!range.from || day >= range.from) && day <= range.to;

// Month names written out here, not taken from the browser's locale data,
// which says "Sept" in some browsers and "Sep" in others.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25 Sep 2026". */
export function formatDate(day: string): string {
  const [y, m, d] = String(day ?? '').slice(0, 10).split('-').map(Number);
  return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : '-';
}

/** "Sep 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : month;
}

/** "25 Sep". */
export function formatShortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}` : '-';
}

/** "12 Sep 2026 to 25 Sep 2026", one date for one day, "Up to ..." when open. */
export function formatRange(range: { from: string | null; to: string }): string {
  if (!range.from) return `Up to ${formatDate(range.to)}`;
  return range.from === range.to ? formatDate(range.to) : `${formatDate(range.from)} to ${formatDate(range.to)}`;
}

/** Change against the previous period, in %; null when there is nothing to compare. */
export function changePct(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/**
 * The periods Records offers. Unlike the dashboards, Records includes today:
 * it is where someone looks for the entry they just filed.
 */
export type RecordPeriod = 'ALL' | 'DAY' | 'THIS_MONTH' | 'PREV_MONTH' | 'CUSTOM';

/** The days a Records period covers; null means every day. */
export function recordPeriodRange(period: RecordPeriod, picks: { day: string; from: string; to: string }, today: string): { from: string; to: string } | null {
  switch (period) {
    case 'DAY':
      return picks.day ? { from: picks.day, to: picks.day } : null;
    case 'THIS_MONTH':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'PREV_MONTH': {
      const lastPrev = shiftDay(`${today.slice(0, 7)}-01`, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case 'CUSTOM': {
      const a = picks.from || picks.to;
      const b = picks.to || picks.from;
      if (!a) return null;
      const [from, to] = a <= b ? [a, b] : [b, a];
      return { from, to: to > today ? today : to };
    }
    default:
      return null;
  }
}
