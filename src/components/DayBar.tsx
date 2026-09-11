import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * THE DAY BAR — the dashboard's thesis.
 *
 * MASTERDATA.md §4 gives every service a `Submission_Window` and states the
 * rule plainly: "Filed after this = late, not missing." That distinction is
 * the real heartbeat of this product — a site that filed at 18:40 is a
 * different problem from one that never filed at all — and until now the UI
 * collapsed both into a single count of rows.
 *
 * So the day is drawn as a track: cutoffs notched onto it, filings landing
 * along it, and a live marker for now. The question it answers on sight is
 * "what's due next, and who still owes it?"
 */

/** The operational day. Filing starts before the first 11:00 cutoff and the
 *  last window (EB_DG) closes at 20:00, so 06:00–22:00 frames all of them
 *  with room to breathe at either end. */
const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 22 * 60;
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;

/** Fallback windows, used only until Service_Registry has been loaded — the
 *  values MASTERDATA.md §4 documents as current. */
const FALLBACK_WINDOWS: { code: string; label: string; window: string }[] = [
  { code: 'SITE_ACTIVITY', label: 'Site activity', window: '11:00' },
  { code: 'ATTENDANCE', label: 'Attendance', window: '11:00' },
  { code: 'DIESEL', label: 'Diesel', window: '18:00' },
  { code: 'COLD_ROOM', label: 'Cold room', window: '18:00' },
  { code: 'HOUSEKEEPING', label: 'Housekeeping', window: '18:00' },
  { code: 'EB_DG', label: 'EB & DG', window: '20:00' }
];

const toMinutes = (hhmm: string): number | null => {
  const m = hhmm?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const pct = (minutes: number) => ((minutes - DAY_START_MIN) / DAY_SPAN) * 100;

const fmtClock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

interface DayBarProps {
  totalExpected: number;
  onSelectMissing?: () => void;
}

export const DayBar: React.FC<DayBarProps> = ({ totalExpected, onSelectMissing }) => {
  const { dailySiteLogs, currentDate, serviceRegistryRows } = useApp();

  // Re-render each minute so the marker and the countdown stay honest without
  // burning a timer on every second.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = currentDate === new Date().toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  /** Cutoffs, grouped so services sharing a window (11:00 has two, 18:00 has
   *  three) render as one notch rather than stacking illegibly. */
  const cutoffs = useMemo(() => {
    const source = serviceRegistryRows.length
      ? serviceRegistryRows
          .filter(s => s.Active === 'Yes' && s.Submission_Window)
          .map(s => ({
            code: s.Service_Code,
            label: s.Service_Name || s.Service_Code,
            window: s.Submission_Window
          }))
      : FALLBACK_WINDOWS;

    const byWindow = new Map<number, string[]>();
    for (const s of source) {
      const mins = toMinutes(s.window);
      if (mins === null || mins < DAY_START_MIN || mins > DAY_END_MIN) continue;
      byWindow.set(mins, [...(byWindow.get(mins) ?? []), s.label]);
    }

    return Array.from(byWindow.entries())
      .map(([minutes, labels]) => ({ minutes, labels }))
      .sort((a, b) => a.minutes - b.minutes);
  }, [serviceRegistryRows]);

  const todaysLogs = useMemo(
    () => dailySiteLogs.filter(l => l.date === currentDate),
    [dailySiteLogs, currentDate]
  );

  /** A filing is late when it landed after the last cutoff it was due by. With
   *  no cutoffs loaded nothing can be judged late — better to show nothing
   *  than to invent a verdict. */
  const filings = useMemo(() => {
    const lastCutoff = cutoffs.length ? cutoffs[cutoffs.length - 1].minutes : null;

    return todaysLogs
      .map(log => {
        const t = new Date(log.timestamp);
        if (Number.isNaN(t.getTime())) return null;
        const mins = t.getHours() * 60 + t.getMinutes();
        return {
          id: log.logId,
          minutes: Math.min(Math.max(mins, DAY_START_MIN), DAY_END_MIN),
          late: lastCutoff !== null && mins > lastCutoff
        };
      })
      .filter((f): f is { id: string; minutes: number; late: boolean } => f !== null);
  }, [todaysLogs, cutoffs]);

  const lateCount = filings.filter(f => f.late).length;
  const filedCount = todaysLogs.length;
  const missingCount = Math.max(0, totalExpected - filedCount);

  const nextCutoff = isToday ? cutoffs.find(c => c.minutes > nowMin) : undefined;
  const minutesToNext = nextCutoff ? nextCutoff.minutes - nowMin : null;

  return (
    <section className="soft-panel p-5 sm:p-6" aria-label="Today's filing against submission windows">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display font-bold text-4xl sm:text-[2.75rem] leading-none text-[var(--color-ink)] tabular">
              {filedCount}
            </span>
            <span className="font-display text-lg text-[var(--text-muted)] leading-none tabular">
              / {totalExpected}
            </span>
            <span className="text-sm font-semibold text-[var(--text-secondary)] ml-1">sites filed</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">
            {new Date(currentDate).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
            {isToday && <span className="tabular"> · {fmtClock(nowMin)} IST</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lateCount > 0 && (
            <span className="chip chip-late">
              <span className="tabular font-bold">{lateCount}</span> filed late
            </span>
          )}
          {missingCount > 0 && (
            <button
              onClick={onSelectMissing}
              className="chip chip-missing cursor-pointer hover:brightness-97 transition"
            >
              <span className="tabular font-bold">{missingCount}</span> not filed
            </button>
          )}
          {missingCount === 0 && filedCount > 0 && (
            <span className="chip chip-filed">Every site is in</span>
          )}
        </div>
      </div>

      {/* The track */}
      <div className="daybar">
        {isToday && (
          <div
            className="daybar-elapsed"
            style={{ width: `${Math.min(100, Math.max(0, pct(nowMin)))}%` }}
          />
        )}

        {cutoffs.map(cut => (
          <div
            key={cut.minutes}
            className="daybar-cut"
            data-passed={isToday && nowMin > cut.minutes}
            style={{ left: `${pct(cut.minutes)}%` }}
          >
            {/* Time only. Service names would collide at 18:00, where three
                windows land together — they're named in the sentence below
                instead, where there's room to read them. */}
            <span className="daybar-cut-label">{fmtClock(cut.minutes)}</span>
          </div>
        ))}

        {filings.map(f => (
          <div
            key={f.id}
            className="daybar-tick"
            data-late={f.late}
            style={{ left: `${pct(f.minutes)}%` }}
            title={`Filed ${fmtClock(f.minutes)}${f.late ? ' — after cutoff' : ''}`}
          />
        ))}

        {isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN && (
          <div className="daybar-now" style={{ left: `${pct(nowMin)}%` }} aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-4 text-[0.6875rem] text-[var(--text-muted)]">
          <span className="tabular">{fmtClock(DAY_START_MIN)}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-[var(--color-filed)]" />
            on time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 rounded-full bg-[var(--color-late)]" />
            late
          </span>
          <span className="tabular ml-auto">{fmtClock(DAY_END_MIN)}</span>
        </div>

        {/* The one line an admin actually acts on. */}
        {nextCutoff && minutesToNext !== null && (
          <p className="text-xs text-[var(--text-secondary)]">
            Next cutoff{' '}
            <strong className="tabular text-[var(--color-ink)]">{fmtClock(nextCutoff.minutes)}</strong>{' '}
            for {nextCutoff.labels.join(', ')} —{' '}
            <strong className="text-[var(--color-ink)]">
              {Math.floor(minutesToNext / 60) > 0 && `${Math.floor(minutesToNext / 60)}h `}
              {minutesToNext % 60}m
            </strong>{' '}
            left
          </p>
        )}
        {isToday && !nextCutoff && cutoffs.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            All windows closed for today. Anything filed now counts as late.
          </p>
        )}
      </div>
    </section>
  );
};
