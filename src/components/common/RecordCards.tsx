import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * A table's rows, as cards, for phones.
 *
 * The diesel ledger is 21 columns and the records explorer is wider still.
 * On a 390px screen that was a bare `overflow-auto` with no frozen column:
 * about eight screen-widths of sideways scrolling with nothing to tell you
 * which row you were on, and on the diesel screen the toolbar holding
 * "Columns" and "Full screen" was clipped off the right edge, so the two
 * controls that could have rescued it were unreachable.
 *
 * Both screens already had a detail view for a single record. This makes
 * that the way in on a phone: three or four fields that identify the
 * record, and a tap opens the full thing. The table stays for `md:` up,
 * where a wide table is the right tool.
 */

export interface RecordCardsProps<T> {
  rows: T[];
  /** What names this record: an id, a site, a date. */
  title: (row: T) => React.ReactNode;
  /** One quieter line underneath. */
  subtitle?: (row: T) => React.ReactNode;
  /** Two or three pairs. More than that is a table, not a card. */
  fields: (row: T) => { label: string; value: React.ReactNode }[];
  /** A status chip, shown against the title. */
  badge?: (row: T) => React.ReactNode;
  onOpen: (row: T) => void;
  rowKey: (row: T, index: number) => string;
  /** Shown in place of the list when there is nothing. */
  empty?: React.ReactNode;
}

export function RecordCards<T>({
  rows,
  title,
  subtitle,
  fields,
  badge,
  onOpen,
  rowKey,
  empty,
}: RecordCardsProps<T>) {
  if (rows.length === 0) {
    return <div className="p-6 text-center text-xs text-slate-500">{empty ?? 'Nothing to show.'}</div>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row, i) => {
        const pairs = fields(row).slice(0, 3);
        return (
          <li key={rowKey(row, i)}>
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="w-full text-left p-4 flex items-start gap-3 active:bg-slate-50 transition cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-900 truncate">{title(row)}</span>
                  {badge?.(row)}
                </span>

                {subtitle && <span className="block mt-0.5 text-xs text-slate-500 truncate">{subtitle(row)}</span>}

                {pairs.length > 0 && (
                  <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                    {pairs.map(pair => (
                      <div key={pair.label} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400">{pair.label}</dt>
                        <dd className="text-xs font-medium text-slate-800 font-mono tabular-nums truncate">{pair.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </span>

              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
