import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Filing } from '../../lib/controlRoom/siteServiceStatus';

/**
 * "Someone has already filed this."
 *
 * One wording wherever it is said, because it used to be said three ways
 * and stayed silent on four services. It names the person and the time so
 * the next POC can go and ask, rather than guess or file a second one.
 */

/** "09:14" when the filing recorded a time, else the day it covers. */
export function filedAtLabel(filing: Filing): string {
  const stamp = new Date(filing.at);
  if (filing.at.length > 10 && !Number.isNaN(stamp.getTime())) {
    return stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return filing.day;
}

/** "Filed 09:14 by Ramesh Kumar", or just the time when nobody was recorded. */
export function filedByLine(filing: Filing): string {
  const when = filedAtLabel(filing);
  return filing.by ? `Filed ${when} by ${filing.by}` : `Filed ${when}`;
}

export const AlreadyFiled: React.FC<{
  filing: Filing;
  /** What an amendment does here, in the caller's own words. */
  amendNote?: string;
  onOpen?: () => void;
  onAmend?: () => void;
  className?: string;
}> = ({ filing, amendNote, onOpen, onAmend, className = '' }) => (
  <div
    className={`rounded-(--r-card) border border-(--color-filed) bg-(--color-filed-tint) px-4 py-3 ${className}`}
    role="status"
  >
    <div className="flex items-start gap-2.5">
      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-(--color-filed)" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{filedByLine(filing)}</p>
        <p className="mt-0.5 text-xs text-slate-600">
          {amendNote ?? 'Filing again would replace what they entered. An amendment is recorded against your name.'}
        </p>

        {(onOpen || onAmend) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-(--color-ink) hover:bg-(--color-ink-soft) active:scale-[0.98] transition cursor-pointer"
              >
                Open it
              </button>
            )}
            {onAmend && (
              <button
                type="button"
                onClick={onAmend}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
              >
                Amend it
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
