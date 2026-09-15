import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid, shiftMonth, type DayActivity } from '../../lib/controlRoom/siteServiceStatus';

/**
 * Month calendar of filing activity. Each day is shaded by how much of the
 * daily work was filed ("coverage"), or by how many entries came in for
 * services that are not daily ("entries"). Choosing a day drives the rest of
 * the screen. Arrow keys move between days; future days cannot be chosen.
 */

export type CalendarMode = 'coverage' | 'entries';

interface LogCalendarProps {
  month: string;
  onMonthChange: (month: string) => void;
  selected: string;
  onSelect: (day: string) => void;
  today: string;
  activity: Map<string, DayActivity>;
  mode: CalendarMode;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeDay(a: DayActivity | undefined, mode: CalendarMode): string {
  if (!a) return 'No activity';
  const entries = plural(a.entries, 'entry').replace('entrys', 'entries');
  return mode === 'coverage' && a.due > 0 ? `${a.done} of ${a.due} daily filings done, ${entries}` : entries;
}

function tone(a: DayActivity | undefined, mode: CalendarMode, isToday: boolean, busiest: number): string {
  const quiet = 'text-slate-600 hover:bg-slate-100';
  if (!a) return quiet;
  if (mode === 'coverage' && a.due > 0) {
    const ratio = a.done / a.due;
    if (ratio >= 1) return 'bg-(--color-filed) text-(--color-ink) hover:brightness-95';
    if (ratio >= 0.5) return 'bg-(--color-filed-tint) text-(--color-ink) hover:brightness-95';
    // The day is not over yet: unfinished today is "due", not "missing".
    if (ratio > 0 || isToday) return 'bg-(--color-due-tint) text-(--color-ink) hover:brightness-95';
    return 'bg-(--color-missing-tint) text-(--color-ink) hover:brightness-95';
  }
  if (a.entries === 0) return quiet;
  return a.entries >= Math.max(2, busiest * 0.6)
    ? 'bg-(--color-filed) text-(--color-ink) hover:brightness-95'
    : 'bg-(--color-filed-tint) text-(--color-ink) hover:brightness-95';
}

const LEGEND: Record<CalendarMode, { swatch: string; label: string }[]> = {
  coverage: [
    { swatch: 'bg-(--color-filed)', label: 'All done' },
    { swatch: 'bg-(--color-filed-tint)', label: 'Half or more' },
    { swatch: 'bg-(--color-due-tint)', label: 'Some' },
    { swatch: 'bg-(--color-missing-tint)', label: 'None' },
  ],
  entries: [
    { swatch: 'bg-(--color-filed)', label: 'Busy' },
    { swatch: 'bg-(--color-filed-tint)', label: 'Some entries' },
    { swatch: 'bg-slate-100', label: 'None' },
  ],
};

export const LogCalendar: React.FC<LogCalendarProps> = ({ month, onMonthChange, selected, onSelect, today, activity, mode }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (!focusNext.current) return;
    cells.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const weeks = monthGrid(month);
  const busiest = Math.max(0, ...[...activity.values()].map((a) => a.entries));
  const thisMonth = today.slice(0, 7);
  const tabStop = selected.slice(0, 7) === month ? selected : `${month}-01`;
  const shown = hovered ?? selected;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });

  const move = (e: React.KeyboardEvent, day: string) => {
    const step = KEY_STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(day, step);
    if (next > today) return;
    if (next.slice(0, 7) !== month) onMonthChange(next.slice(0, 7));
    focusNext.current = next;
    onSelect(next);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CalendarDays className="w-4 h-4 text-slate-500" /> {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          {selected !== today && (
            <button
              type="button"
              onClick={() => {
                onMonthChange(thisMonth);
                onSelect(today);
              }}
              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition cursor-pointer"
            >
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-[0.96] transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-[0.96] transition cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div key={month} className="mt-3 animate-settle" role="grid" aria-label={`Filing activity, ${monthLabel}`}>
        <div className="grid grid-cols-7 gap-1 mb-1" role="row">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="text-center text-[10px] font-semibold text-slate-400">
              {w.slice(0, 1)}
              <span className="sr-only">{w.slice(1)}</span>
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1" role="row">
            {week.map((day, di) => {
              if (!day) return <div key={di} role="gridcell" />;
              const future = day > today;
              const a = activity.get(day);
              const isToday = day === today;
              const isSelected = day === selected;
              return (
                <div key={day} role="gridcell">
                  <button
                    ref={(el) => {
                      if (el) cells.current.set(day, el);
                      else cells.current.delete(day);
                    }}
                    type="button"
                    disabled={future}
                    tabIndex={day === tabStop ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={`${longDay(day)}: ${future ? 'upcoming' : describeDay(a, mode)}`}
                    onClick={() => onSelect(day)}
                    onKeyDown={(e) => move(e, day)}
                    onMouseEnter={() => !future && setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(null)}
                    className={`w-full aspect-square rounded-lg text-xs font-mono transition duration-150 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-ink) ${
                      future ? 'text-slate-300 cursor-default' : `${tone(a, mode, isToday, busiest)} cursor-pointer`
                    } ${isSelected ? 'ring-2 ring-(--color-ink) ring-offset-1 font-bold' : ''} ${isToday ? 'font-bold underline decoration-2 underline-offset-2' : ''}`}
                  >
                    {Number(day.slice(8))}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-2 min-h-8 text-xs text-slate-600" aria-live="polite">
        <strong className="text-slate-900">{longDay(shown)}</strong>
        <span className="block text-slate-500">{describeDay(activity.get(shown), mode)}</span>
      </p>

      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1.5">
        {LEGEND[mode].map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className={`w-3 h-3 rounded ${l.swatch}`} /> {l.label}
          </span>
        ))}
      </div>
    </section>
  );
};
