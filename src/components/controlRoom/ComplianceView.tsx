import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import { formatDate, formatShortDay } from '../../lib/analytics/period';
import { complianceReport, type ComplianceCell } from '../../lib/controlRoom/compliance';
import { inChannel, type ChannelTab, type ControlRoomRecords, type ControlRoomService, type ControlRoomSite } from '../../lib/controlRoom/siteServiceStatus';
import { PdfButton } from '../common/PdfButton';

/**
 * Control Room, Compliance: how reliably each site and each service files,
 * across every scheduled service and every Master Data site, over the last
 * 7, 14 or 30 closed days. Today sits beside the period as "in progress".
 */

const PERIODS = [7, 14, 30] as const;
const ROWS = 25;

const rateColor = (r: number | null) => (r === null ? 'text-slate-400' : r >= 95 ? 'text-(--color-filed)' : r >= 70 ? 'text-(--color-due)' : 'text-(--color-missing)');
const barColor = (r: number | null) => (r === null ? 'bg-slate-200' : r >= 95 ? 'bg-(--color-filed)' : r >= 70 ? 'bg-(--color-due)' : 'bg-(--color-missing)');
const cellColor = (c: ComplianceCell) =>
  c.due === 0 ? 'bg-slate-100' : c.done === c.due ? 'bg-(--color-filed)' : c.done === 0 ? 'bg-(--color-missing)' : 'bg-(--color-due)';
const pct = (r: number | null) => (r === null ? '-' : `${r % 1 ? r.toFixed(1) : r}%`);

const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) => (
  <div className="inline-flex p-1 bg-(--bg-subtle) rounded-(--r-chip)" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={String(o.value)}
        type="button"
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${o.value === value ? 'bg-white text-(--color-ink) elevate-1' : 'text-(--text-muted) hover:text-(--color-ink)'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const Tile: React.FC<{ label: string; value: string; sub: string; tone?: string; chip?: React.ReactNode }> = ({ label, value, sub, tone = 'text-slate-900', chip }) => (
  <div className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs min-w-0">
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {chip}
    </div>
    <div className={`mt-1.5 text-2xl font-bold font-mono tracking-tight ${tone}`}>{value}</div>
    <div className="mt-1 text-[11px] text-slate-500 truncate">{sub}</div>
  </div>
);

export const ComplianceView: React.FC<{
  sites: ControlRoomSite[];
  services: ControlRoomService[];
  records: ControlRoomRecords;
  today: string;
  onOpenSite: (siteId: string) => void;
}> = ({ sites, services, records, today, onOpenSite }) => {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(14);
  const [channel, setChannel] = useState<ChannelTab>('ALL');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const page = useRef<HTMLDivElement>(null);

  const inScope = useMemo(() => sites.filter((s) => inChannel(s, channel)), [sites, channel]);
  const r = useMemo(() => complianceReport(inScope, services, records, today, days), [inScope, services, records, today, days]);

  const needle = q.trim().toLowerCase();
  const rows = r.sites.filter((s) => s.due > 0 && (!needle || `${s.site.name} ${s.site.id} ${s.site.city}`.toLowerCase().includes(needle)));
  const shown = all ? rows : rows.slice(0, ROWS);
  const ranked = r.services.filter((s) => s.rate !== null);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  const change = r.overall !== null && r.prevOverall !== null ? Math.round((r.overall - r.prevOverall) * 10) / 10 : null;
  const cols = { gridTemplateColumns: `minmax(10rem,13rem) repeat(${r.days.length + 1}, minmax(10px, 1fr)) 7.5rem` };
  const range = `${formatDate(r.days[0])} to ${formatDate(r.days[r.days.length - 1])}`;

  return (
    <div ref={page} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Seg<(typeof PERIODS)[number]> label="Period" value={days} onChange={setDays} options={PERIODS.map((p) => ({ value: p, label: `${p}D` }))} />
          <Seg<ChannelTab>
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'B2B', label: 'B2B' },
              { value: 'B2C', label: 'B2C' },
            ]}
          />
          <span className="text-xs text-slate-500">{range}, today shown apart</span>
        </div>
        <PdfButton target={page} title="Control Room compliance" subtitle={`${range}, ${inScope.length} sites`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Network compliance"
          value={pct(r.overall)}
          tone={rateColor(r.overall)}
          sub="Scheduled filings made, every service"
          chip={
            change !== null && change !== 0 ? (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono ${change > 0 ? 'bg-(--color-filed-tint) text-(--color-filed)' : 'bg-(--color-missing-tint) text-(--color-missing)'}`} title="Against the period just before">
                {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(change)} pts
              </span>
            ) : null
          }
        />
        <Tile label="Sites fully compliant" value={`${r.perfect}`} tone="text-(--color-filed)" sub={`of ${rows.length} sites with daily services`} />
        <Tile label="Sites under 70%" value={`${r.under70}`} tone={r.under70 ? 'text-(--color-missing)' : 'text-slate-900'} sub="Need a call this week" />
        <Tile label="Weakest service" value={worst ? pct(worst.rate) : '-'} tone={rateColor(worst?.rate ?? null)} sub={worst ? `${worst.name}${best && best !== worst ? `; best is ${best.name} at ${pct(best.rate)}` : ''}` : 'No scheduled services'} />
      </div>

      <section className="bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Compliance by service</h3>
          <span className="text-[11px] text-slate-500">Weekly and monthly services count once their week or month is over</span>
        </div>
        {!r.services.length ? (
          <p className="py-6 text-center text-xs text-slate-500">No scheduled services in the Service Registry.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {r.services.map((s) => (
              <li key={s.code}>
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{s.cadence.toLowerCase()}</span>
                  <span className={`ml-auto font-mono font-bold ${rateColor(s.rate)}`}>{pct(s.rate)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <span className={`block h-full rounded-full ${barColor(s.rate)}`} style={{ width: `${s.rate ?? 0}%` }} />
                  </span>
                  <span className="w-20 text-right font-mono text-[10px] text-slate-400">
                    {s.done} / {s.due}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Daily services by site</h3>
            <p className="text-[11px] text-slate-500">Worst first. Each square is one day: its daily services filed out of due. Click a site for details.</p>
          </div>
          <label className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search sites</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sites"
              className="h-9 w-52 pl-8 pr-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-600"
            />
          </label>
        </div>

        <div className="overflow-x-auto" data-pdf-expand>
          <div className="min-w-[760px]">
            <div className="grid items-end gap-1 pb-2 border-b border-slate-100" style={cols}>
              <span className="text-[11px] font-semibold text-slate-500">Site</span>
              {[...r.dayRates, r.todayRate].map((d, i) => {
                const isToday = i === r.dayRates.length;
                return (
                  <span key={d.day} className="flex flex-col items-center gap-0.5" title={`${formatDate(d.day)}: ${pct(d.rate)} of daily filings${isToday ? ' so far' : ''}`}>
                    <span className={`w-full h-6 rounded-sm bg-slate-100 overflow-hidden flex items-end ${isToday ? 'ring-1 ring-slate-400' : ''}`}>
                      <span className={`w-full ${barColor(d.rate)}`} style={{ height: `${d.rate ?? 0}%`, opacity: isToday ? 0.55 : 1 }} />
                    </span>
                    <span className={`text-[9px] font-mono ${isToday ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{isToday ? 'Now' : Number(d.day.slice(8))}</span>
                  </span>
                );
              })}
              <span className="text-[11px] font-semibold text-slate-500 text-right">Rate, streak</span>
            </div>

            <div className="divide-y divide-slate-50">
              {shown.map((s) => (
                <button
                  key={s.site.id}
                  type="button"
                  onClick={() => onOpenSite(s.site.id)}
                  className="grid items-center gap-1 w-full py-1.5 text-left hover:bg-slate-50 rounded-md cursor-pointer"
                  style={cols}
                >
                  <span className="min-w-0 pr-2">
                    <span className="block truncate text-xs font-semibold text-slate-900">{s.site.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">
                      {s.missed ? `${s.missed} ${s.missed === 1 ? 'day' : 'days'} missed` : 'Nothing missed'}
                    </span>
                  </span>
                  {[...s.cells, s.today].map((c, i) => {
                    const isToday = i === s.cells.length;
                    return (
                      <span
                        key={c.day}
                        className={`h-5 rounded-sm ${cellColor(c)} ${isToday ? 'opacity-60 ring-1 ring-slate-400' : ''}`}
                        title={`${formatShortDay(c.day)}${isToday ? ' (today, in progress)' : ''}: ${c.done} of ${c.due} filed`}
                      />
                    );
                  })}
                  <span className="text-right">
                    <span className={`block text-sm font-bold font-mono ${rateColor(s.rate)}`}>{pct(s.rate)}</span>
                    <span className="block text-[10px] text-slate-400">{s.streak ? `${s.streak} day streak` : 'No streak'}</span>
                  </span>
                </button>
              ))}
              {!rows.length && <p className="py-8 text-center text-xs text-slate-500">{needle ? 'No site matches.' : 'No site has daily services to file.'}</p>}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            {[
              ['bg-(--color-filed)', 'All filed'],
              ['bg-(--color-due)', 'Some filed'],
              ['bg-(--color-missing)', 'None filed'],
              ['bg-slate-100', 'Nothing due'],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${c}`} /> {l}
              </span>
            ))}
          </div>
          {rows.length > ROWS && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
              {all ? `Show the worst ${ROWS}` : `Show all ${rows.length} sites`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
