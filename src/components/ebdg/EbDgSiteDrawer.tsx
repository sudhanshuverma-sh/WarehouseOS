import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { MapPin, X, Zap } from 'lucide-react';
import { formatDate, formatNum, maintenanceOf, type DgUnit, type SiteDay, type SitePower } from '../../lib/ebdg/dashboard';
import type { EbDgRecord } from '../../lib/ebdg/sheetWriter';
import { NEU, NeuChip } from '../analytics/NeuKit';
import { SiteDailyChart } from './EbDgCharts';
import { coverTone, DG_COLOR, stateTone } from './EbDgPanels';
import { EbDgEntriesTable } from './EbDgEntriesTable';

/**
 * One site, opened from anywhere on the dashboard: its figures, each of its
 * DGs, and every day it filed with every column of the record. The same
 * neumorphic surface as the dashboard. Esc or a click outside closes it.
 */
export const EbDgSiteDrawer: React.FC<{ site: SitePower; units: DgUnit[]; days: SiteDay[]; entries: EbDgRecord[]; onClose: () => void }> = ({
  site,
  units,
  days,
  entries,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const m = maintenanceOf(site);
  const coverColor = site.cover === null ? NEU.ink : { ok: NEU.good, soon: '#8A5A0B', bad: NEU.bad }[coverTone(site.cover).tone];
  const stat = (label: string, value: string, color: string = NEU.ink) => (
    <div className="neu-inset flex flex-col gap-1 px-4 py-3.5 rounded-2xl min-w-0">
      <span className="text-xs truncate" style={{ color: NEU.muted }}>
        {label}
      </span>
      <span className="text-lg font-semibold truncate" style={{ color }}>
        {value}
      </span>
    </div>
  );
  const TH = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em] whitespace-nowrap';
  const TD = 'px-3 py-2 whitespace-nowrap text-sm';

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${site.site}, site power`}>
      <motion.div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="neu-root absolute right-0 top-0 bottom-0 w-full max-w-3xl shadow-2xl flex flex-col"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <header className="flex items-center justify-between gap-3 px-5 sm:px-7 py-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="neu-raised w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ background: NEU.accent }}>
              <Zap className="w-5 h-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h2 className="m-0 text-xl font-semibold truncate" style={{ color: NEU.ink }}>
                {site.site}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] truncate" style={{ color: NEU.muted }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {[site.city, site.code, site.segment].filter(Boolean).join(', ')}, {site.days} days filed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="neu-press neu-raised w-11 h-11 rounded-2xl border-0 flex items-center justify-center shrink-0 cursor-pointer"
            style={{ color: NEU.ink }}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto neu-scroll px-5 sm:px-7 pb-7 flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stat('Diesel used', `${formatNum(site.hsd)} L`, NEU.accentInk)}
            {stat('DG hours', `${site.dgHrs} h`)}
            {stat('EB units', `${formatNum(site.grid)} kWh`)}
            {stat(site.cover === null ? 'Diesel on site' : `On site, ${site.cover} days`, `${formatNum(site.stock)} L`, coverColor)}
          </div>

          <section className="neu-card p-5 sm:p-6">
            <h3 className="m-0 mb-2 text-base font-semibold" style={{ color: NEU.ink }}>
              Diesel and EB per day
            </h3>
            <SiteDailyChart days={days} />
          </section>

          <section className="neu-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="m-0 text-base font-semibold" style={{ color: NEU.ink }}>
                Its DGs
              </h3>
              <NeuChip tone={stateTone(m.state)}>B-check {m.state === 'NO DATA' ? 'not read' : `${m.state}, next in ${m.nextDue}`}</NeuChip>
            </div>
            {!units.length ? (
              <p className="py-6 text-center text-sm" style={{ color: NEU.muted }}>
                No DG readings at this site in the period.
              </p>
            ) : (
              <div className="neu-inset rounded-2xl overflow-x-auto neu-scroll">
                <table className="w-full">
                  <thead>
                    <tr style={{ color: NEU.muted }}>
                      {['DG', 'Hours', 'Share', 'Diesel L', 'L per hr', 'kWh per L', 'Day tank', 'B-check left', 'Due'].map((h) => (
                        <th key={h} className={TH}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ color: NEU.ink }}>
                    {units.map((u) => (
                      <tr key={u.n} className="neu-row border-t" style={{ borderColor: NEU.rule }}>
                        <td className="px-3 py-2">
                          <span className="inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold text-white" style={{ background: DG_COLOR[u.n] }}>
                            DG {u.n}
                          </span>
                        </td>
                        <td className={TD}>{u.hrs}</td>
                        <td className={TD}>{u.share}%</td>
                        <td className={TD}>{formatNum(u.hsd)}</td>
                        <td className={TD}>{u.ltrHr ?? '-'}</td>
                        <td className={TD}>{u.kwhPerL ?? '-'}</td>
                        <td className={TD}>{u.dayTank === null ? '-' : `${formatNum(u.dayTank)} L`}</td>
                        <td className="px-3 py-2">
                          <NeuChip tone={stateTone(u.state)}>
                            {u.bcheck
                              ? [u.bcheck.remHrs !== null ? `${u.bcheck.remHrs} h` : '', u.bcheck.remDays !== null ? `${u.bcheck.remDays} d` : ''].filter(Boolean).join(', ')
                              : 'Not read'}
                          </NeuChip>
                        </td>
                        <td className={TD}>{u.bcheck?.due ? formatDate(String(u.bcheck.due).slice(0, 10)) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="neu-card p-5 sm:p-6">
            <EbDgEntriesTable bare neu rows={entries} title={`Every entry (${entries.length})`} layoutKey="ebdg-dashboard:site-entries" fileName={`eb-dg-${site.code}-entries.csv`} />
          </section>
        </div>
      </motion.aside>
    </div>,
    document.body,
  );
};
