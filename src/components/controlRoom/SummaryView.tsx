import React, { useMemo, useRef, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, CheckCircle2, Copy, Fuel, Mail, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { DailySiteLog } from '../../types';
import type { DieselWaiting } from '../../lib/alerts/pendingWork';
import { formatDate, formatShortDay } from '../../lib/analytics/period';
import { controlRoomSummary, summaryText, type SummaryIssue } from '../../lib/controlRoom/summary';
import type { ControlRoomRecords, ControlRoomService, ControlRoomSite } from '../../lib/controlRoom/siteServiceStatus';
import { PdfButton } from '../common/PdfButton';

/**
 * Control Room, Summary: the whole operation today on one page. A written
 * headline, the key numbers against yesterday, a 7-day filing trend, each
 * service's progress, every open issue and the sites not started. Copy it as
 * text, email it, or download it as a PDF.
 */

const KIND: Record<SummaryIssue['kind'], { label: string; icon: React.ElementType }> = {
  critical: { label: 'Critical check', icon: AlertTriangle },
  daily: { label: 'Daily report', icon: AlertTriangle },
  maintenance: { label: 'DG maintenance', icon: Wrench },
  diesel: { label: 'Diesel', icon: Fuel },
};
const ISSUES_SHOWN = 12;

const rateTone = (r: number | null) => (r === null ? 'text-slate-400' : r >= 95 ? 'text-(--color-filed)' : r >= 70 ? 'text-(--color-due)' : 'text-(--color-missing)');
const barFill = (r: number | null) => (r === null ? '#e2e8f0' : r >= 95 ? 'var(--color-filed)' : r >= 70 ? 'var(--color-due)' : 'var(--color-missing)');

const Delta: React.FC<{ now: number | null; before: number | null; unit?: string }> = ({ now, before, unit = '' }) => {
  if (now === null || before === null) return <span className="text-[11px] text-slate-400">No figure for yesterday</span>;
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return <span className="text-[11px] text-slate-500">Same as yesterday</span>;
  const up = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-(--color-filed)' : 'text-(--color-missing)'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(d)}
      {unit} {up ? 'up' : 'down'} on yesterday
    </span>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; tone?: string; foot: React.ReactNode }> = ({ label, value, tone = 'text-slate-900', foot }) => (
  <div className="bg-white border border-slate-200 rounded-(--r-card) p-4 shadow-xs min-w-0">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <div className={`mt-1.5 text-2xl font-bold font-mono tracking-tight ${tone}`}>{value}</div>
    <div className="mt-1 truncate">{foot}</div>
  </div>
);

const Card: React.FC<{ title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, aside, className = '', children }) => (
  <section className={`bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs min-w-0 ${className}`}>
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

export const SummaryView: React.FC<{
  sites: ControlRoomSite[];
  services: ControlRoomService[];
  records: ControlRoomRecords;
  dieselLogs: DieselWaiting[];
  dailySiteLogs: Pick<DailySiteLog, 'site' | 'date' | 'worstStatus' | 'deviationsCount'>[];
  today: string;
  dateLabel: string;
  onOpenSite: (siteId: string) => void;
  onOpenServiceHub: () => void;
}> = ({ sites, services, records, dieselLogs, dailySiteLogs, today, dateLabel, onOpenSite, onOpenServiceHub }) => {
  const { notify } = useApp();
  const page = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [allIssues, setAllIssues] = useState(false);

  const s = useMemo(
    () => controlRoomSummary({ sites, services, records, dieselLogs, dailySiteLogs, today }),
    [sites, services, records, dieselLogs, dailySiteLogs, today],
  );
  const text = useMemo(() => summaryText(s, formatDate(today)), [s, today]);
  const subject = `Control Room summary, ${formatDate(today)}`;
  const mailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      notify('error', 'Could not copy', 'Your browser blocked the clipboard. Try Email instead.');
    }
  };

  const critical = s.counts.critical + s.counts.dailyCritical;
  const trend = s.trend.map((d) => ({ ...d, label: d.day === today ? 'Today' : formatShortDay(d.day) }));
  const scheduled = s.services.filter((x) => x.scheduled);
  const onRequest = s.services.filter((x) => !x.scheduled);
  const issues = allIssues ? s.issues : s.issues.slice(0, ISSUES_SHOWN);

  return (
    <div ref={page} className="space-y-4">
      {/* The headline: what a manager needs to know, in sentences. */}
      <section className="bg-white border border-slate-200 rounded-(--r-card) p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dateLabel}</span>
            <h2 className="mt-1 text-lg font-bold text-slate-900 tracking-tight">Where the operation stands today</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-pdf-ignore>
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-(--color-filed)" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy summary'}
            </button>
            <a
              href={mailUrl}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
            <PdfButton target={page} title="Control Room summary" subtitle={dateLabel} />
          </div>
        </div>
        <ul className="mt-4 space-y-1.5">
          {s.headline.map((line, i) => (
            <li key={i} className={`text-sm leading-relaxed ${i === 0 ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile
          label="Sites complete"
          value={
            <>
              {s.sites.complete}
              <span className="text-base font-medium text-slate-400"> / {s.sites.total}</span>
            </>
          }
          tone="text-slate-900"
          foot={<Delta now={s.sites.complete} before={s.sites.completeYesterday} />}
        />
        <Tile
          label="Filings in"
          value={s.filings.rate === null ? '-' : `${s.filings.rate}%`}
          tone={rateTone(s.filings.rate)}
          foot={<Delta now={s.filings.rate} before={s.filings.rateYesterday} unit=" pts" />}
        />
        <Tile
          label="Critical issues"
          value={critical}
          tone={critical ? 'text-(--color-missing)' : 'text-slate-900'}
          foot={<span className="text-[11px] text-slate-500">{s.counts.critical} checks, {s.counts.dailyCritical} daily reports</span>}
        />
        <Tile
          label="DG alerts"
          value={s.counts.maintenance}
          tone={s.counts.maintenance ? 'text-(--color-due)' : 'text-slate-900'}
          foot={<span className="text-[11px] text-slate-500">B-check, PF or service due</span>}
        />
        <Tile
          label="Diesel waiting"
          value={s.counts.diesel}
          tone={s.counts.diesel ? 'text-(--color-due)' : 'text-slate-900'}
          foot={<span className="text-[11px] text-slate-500">Approval or POD pending</span>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card title="Filings, last 7 days" aside={<span className="text-[11px] text-slate-500">Today is still in progress</span>} className="lg:col-span-2">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(_v, _n, item) => {
                    const d = item.payload as (typeof trend)[number];
                    return [`${d.rate ?? 0}% (${d.done} of ${d.due})`, d.day === today ? 'So far' : 'Filed'];
                  }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {trend.map((d) => (
                    <Cell key={d.day} fill={barFill(d.rate)} fillOpacity={d.day === today ? 0.45 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Services today"
          className="lg:col-span-3"
          aside={
            <button type="button" onClick={onOpenServiceHub} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer" data-pdf-ignore>
              Service hub <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          {!s.services.length ? (
            <p className="py-6 text-center text-xs text-slate-500">No services in the Service Registry.</p>
          ) : (
            <ul className="space-y-2.5">
              {scheduled.map((x) => {
                const rate = x.total ? Math.round((x.done / x.total) * 100) : null;
                return (
                  <li key={x.code}>
                    <button type="button" onClick={onOpenServiceHub} className="w-full text-left group cursor-pointer">
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate group-hover:underline">{x.name}</span>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">{x.cadence.toLowerCase()}</span>
                        <span className="ml-auto font-mono text-slate-600">
                          {x.done} / {x.total}
                        </span>
                        <span className={`w-20 text-right text-[11px] ${x.pending ? 'text-(--color-due)' : 'text-(--color-filed)'}`}>
                          {x.pending ? `${x.pending} pending` : 'All in'}
                        </span>
                      </div>
                      <span className="mt-1 block h-2 rounded-full bg-slate-100 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${rate ?? 0}%`, background: barFill(rate) }} />
                      </span>
                    </button>
                  </li>
                );
              })}
              {onRequest.length > 0 && (
                <li className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                  On request today: {onRequest.map((x) => `${x.name} ${x.done}`).join(', ')}
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card title="Needs attention" aside={<span className="text-[11px] text-slate-500">{s.issues.length} open, worst first</span>} className="lg:col-span-3">
          {!s.issues.length ? (
            <p className="py-6 flex items-center justify-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-(--color-filed)" /> Nothing needs attention right now.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100" data-pdf-expand>
                {issues.map((i, n) => {
                  const k = KIND[i.kind];
                  const Icon = k.icon;
                  return (
                    <li key={`${i.siteCode}-${i.kind}-${n}`}>
                      <button type="button" onClick={() => onOpenSite(i.siteCode)} className="w-full flex items-start gap-3 py-2 text-left hover:bg-slate-50 rounded-md cursor-pointer">
                        <span
                          className={`mt-0.5 w-6 h-6 shrink-0 grid place-items-center rounded-md ${
                            i.tone === 'bad' ? 'bg-(--color-missing-tint) text-(--color-missing)' : 'bg-(--color-due-tint) text-(--color-due)'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-900 truncate">{i.site}</span>
                          <span className="block text-[11px] text-slate-600">{i.title}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">{k.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {s.issues.length > ISSUES_SHOWN && (
                <button type="button" onClick={() => setAllIssues((v) => !v)} className="mt-2 text-xs font-semibold text-slate-700 underline underline-offset-2 cursor-pointer" data-pdf-ignore>
                  {allIssues ? 'Show fewer' : `Show all ${s.issues.length}`}
                </button>
              )}
            </>
          )}
        </Card>

        <Card title="Not started today" aside={<span className="text-[11px] text-slate-500">{s.notStarted.length} of {s.sites.total} sites</span>} className="lg:col-span-2">
          {!s.notStarted.length ? (
            <p className="py-6 flex items-center justify-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-(--color-filed)" /> Every site has filed something today.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto" data-pdf-expand>
              {s.notStarted.map((n) => (
                <button
                  key={n.code}
                  type="button"
                  onClick={() => onOpenSite(n.code)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-(--color-missing) bg-(--color-missing-tint) rounded-md hover:brightness-95 cursor-pointer"
                >
                  {n.name}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
