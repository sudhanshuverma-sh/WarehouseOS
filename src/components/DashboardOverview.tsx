import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  FileText, 
  Fuel, 
  Users, 
  X, 
  ExternalLink, 
  Mail, 
  Share2, 
  Copy, 
  Check, 
  ArrowRight,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { DailySiteLog, SiteHealthStatus, Warehouse } from '../types';
import { PageHeader } from './common/PageHeader';
import { DayBar } from './DayBar';

interface DashboardOverviewProps {
  onNavigateTab: (tab: string) => void;
  onOpenChecklistForWarehouse: (warehouseId: string) => void;
  onBack?: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateTab, onOpenChecklistForWarehouse, onBack }) => {
  const {
    warehouses,
    siteMasterRows,
    currentUser,
    currentDate,
    dailySiteLogs,
    getComplianceMatrix,
    getBriefing,
    getSiteHistory,
    buildShareMailHtml
  } = useApp();

  const [activeAdminTab, setActiveAdminTab] = useState<'today' | 'compliance' | 'brief'>('today');
  const [selectedDrawerSite, setSelectedDrawerSite] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{ subject: string; html: string; plain: string; composeUrl: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Today's metrics
  const todaysLogs = dailySiteLogs.filter(l => l.date === currentDate);
  const filedSitesMap = new Map<string, DailySiteLog>();
  todaysLogs.forEach(l => filedSitesMap.set(l.site, l));

  // Site roster: prefer Site_Master (the real, master-data-sourced network)
  // once it's been imported; fall back to the legacy seed list otherwise.
  // NOTE: "filed today" (totalFiled, below) is still counted off dailySiteLogs,
  // which key by the old warehouse id/code, not Site_Code — there is no valid
  // join between the two yet (filing forms haven't been rewired to Site_Master).
  // So this only moves the roster/denominator over, not the filed/missing count.
  const activeSiteMasterRows = siteMasterRows.filter(s => s.Active === 'Yes');
  const usingMasterData = activeSiteMasterRows.length > 0;
  const totalExpected = usingMasterData ? activeSiteMasterRows.length : warehouses.length;
  const totalFiled = todaysLogs.length;
  const totalMissing = totalExpected - totalFiled;

  const criticalCount = todaysLogs.filter(l => l.worstStatus === 'critical').length;
  const partialCount = todaysLogs.filter(l => l.worstStatus === 'partial').length;
  const clearCount = todaysLogs.filter(l => l.worstStatus === 'clear').length;

  const allActivities = todaysLogs.flatMap(l => l.activities);
  const openActivities = allActivities.filter(a => a.status !== 'Completed');
  const overdueActivities = allActivities.filter(a => a.overdue);

  // Equipment deviations aggregation
  const equipFailMap: Record<string, number> = {};
  todaysLogs.forEach(l => {
    if (l.coldRoom < 100) equipFailMap['Cold Room'] = (equipFailMap['Cold Room'] || 0) + 1;
    if (l.freezersGgp < 100) equipFailMap['Freezers GGP'] = (equipFailMap['Freezers GGP'] || 0) + 1;
    if (l.rt < 100) equipFailMap['RT Reach Truck'] = (equipFailMap['RT Reach Truck'] || 0) + 1;
    if (l.bopt < 100) equipFailMap['BOPT Pallet Truck'] = (equipFailMap['BOPT Pallet Truck'] || 0) + 1;
    if (l.dg < 100) equipFailMap['DG Generator'] = (equipFailMap['DG Generator'] || 0) + 1;
    if (l.hvls < 100) equipFailMap['HVLS Big Fans'] = (equipFailMap['HVLS Big Fans'] || 0) + 1;
    if (l.lightsInspection !== 'Done') equipFailMap['Lights Inspection'] = (equipFailMap['Lights Inspection'] || 0) + 1;
    if (l.mtsInspection !== 'Done') equipFailMap['MTS Inspection'] = (equipFailMap['MTS Inspection'] || 0) + 1;
  });

  const equipFailList = Object.entries(equipFailMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // 14-day trend mockup data
  const trendDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(new Date(currentDate).getTime() - (13 - i) * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    const logs = dailySiteLogs.filter(l => l.date === dateStr);
    const deviations = logs.reduce((sum, l) => sum + l.deviationsCount, 0);
    return {
      date: dateStr,
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      filed: i === 13 ? totalFiled : Math.min(warehouses.length, 3 + (i % 2)),
      deviations: i === 13 ? equipFailList.reduce((sum, e) => sum + e.count, 0) : (i % 3),
      expected: warehouses.length
    };
  });

  const complianceData = getComplianceMatrix(currentDate, 21);
  const briefingData = getBriefing(currentDate);

  // Drawer site detail
  const drawerSiteLog = selectedDrawerSite ? dailySiteLogs.find(l => l.site === selectedDrawerSite && l.date === currentDate) : null;
  const drawerSiteHistory = selectedDrawerSite ? getSiteHistory(selectedDrawerSite, 35) : null;
  const drawerWarehouse = selectedDrawerSite ? warehouses.find(w => w.id === selectedDrawerSite) : null;

  const handleOpenShare = (logId: string) => {
    const share = buildShareMailHtml(logId);
    setShareData(share);
  };

  const handleCopyRichHtml = () => {
    if (!shareData) return;
    try {
      const blobHtml = new Blob([shareData.html], { type: 'text/html' });
      const blobText = new Blob([shareData.plain], { type: 'text/plain' });
      const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
      navigator.clipboard.write(data).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      });
    } catch {
      navigator.clipboard.writeText(shareData.plain);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Admin Controls & View Switcher */}
      {/* Kept deliberately quiet: the Day Bar below is the hero of this screen,
          and two competing headline blocks made neither one read. */}
      <PageHeader
        title="Control Room"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal' },
          { label: activeAdminTab === 'today' ? "Today's Pulse" : activeAdminTab === 'compliance' ? 'Compliance Matrix' : 'Director Briefing' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 bg-[var(--bg-subtle)] rounded-[var(--r-chip)]">
              {(['today', 'compliance', 'brief'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveAdminTab(tab)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeAdminTab === tab
                      ? 'bg-white text-[var(--color-ink)] elevate-1'
                      : 'text-[var(--text-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {tab === 'today' ? "Today's Pulse" : tab === 'compliance' ? 'Compliance' : 'Director Brief'}
                </button>
              ))}
            </div>

            <button
              onClick={() => onNavigateTab('adminDashboard')}
              className="px-3.5 py-1.5 bg-[var(--bg-subtle)] hover:bg-[var(--color-frost)] text-[var(--text-secondary)] font-semibold text-xs rounded-[var(--r-chip)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Service hub</span>
            </button>

            <button
              onClick={() => onNavigateTab('serviceAssignments')}
              className="px-3.5 py-1.5 bg-[var(--bg-subtle)] hover:bg-[var(--color-frost)] text-[var(--text-secondary)] font-semibold text-xs rounded-[var(--r-chip)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Assignments</span>
            </button>

            <button
              onClick={() => onNavigateTab('dailyForm')}
              className="px-3.5 py-1.5 bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-white font-semibold text-xs rounded-[var(--r-chip)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>File report</span>
            </button>
          </div>
        }
      />

      {/* TAB 1: TODAY'S REPORTING CONTROL ROOM */}
      {activeAdminTab === 'today' && (
        <div className="space-y-6">
          {/* The day, as a track: cutoffs notched, filings landing, now marked. */}
          <DayBar totalExpected={totalExpected} />

          {/* Zone board — the five zones in Site_Master, each carrying its own
              accent so the network reads as a map rather than a list. Colour
              here is categorical (which zone), never status. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {(['North', 'South', 'East', 'West', 'Central'] as const).map(zone => {
              const zoneSites = warehouses.filter(w => w.zone === zone);
              if (zoneSites.length === 0) return null;
              const zoneFiled = zoneSites.filter(w => filedSitesMap.has(w.id)).length;
              const allIn = zoneFiled === zoneSites.length;

              return (
                <div
                  key={zone}
                  className="soft-card p-4 lift-on-hover"
                  style={{ background: `var(--color-zone-${zone.toLowerCase()}-tint)` }}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold text-[var(--color-ink)]">{zone}</span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: `var(--color-zone-${zone.toLowerCase()})` }}
                    />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display font-bold text-2xl text-[var(--color-ink)] tabular">
                      {zoneFiled}
                    </span>
                    <span className="text-sm text-[var(--text-muted)] tabular">/ {zoneSites.length}</span>
                  </div>
                  <p className="text-[0.6875rem] text-[var(--text-secondary)] mt-0.5">
                    {allIn ? 'all in' : `${zoneSites.length - zoneFiled} outstanding`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Where the roster is coming from — worth stating plainly, because
              the count above means something different in each case. */}
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-2">
            <span className={`chip ${usingMasterData ? 'chip-filed' : 'chip-neutral'}`}>
              {usingMasterData ? `${totalExpected} active sites` : 'Legacy seed list'}
            </span>
            {usingMasterData
              ? 'Roster from Site_Master.'
              : 'Load master data to count against the real network.'}
            <span className="ml-auto">
              <strong className="text-[var(--color-ink)] tabular">{openActivities.length}</strong> open activities
              {overdueActivities.length > 0 && (
                <span className="text-[var(--color-missing)] font-semibold">
                  {' '}· {overdueActivities.length} past ETA
                </span>
              )}
            </span>
          </p>

          {/* Site Status Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                Site Status Overview (Click for Detail Drawer)
              </h3>
              <span className="text-xs text-slate-400">4 Active Hubs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {warehouses.map(wh => {
                const log = filedSitesMap.get(wh.id);
                const isFiled = !!log;
                const status: SiteHealthStatus = log ? log.worstStatus : 'missing';

                const borderStyles = {
                  clear: 'border-teal-500 bg-teal-50/20 hover:border-teal-600',
                  partial: 'border-amber-400 bg-amber-50/20 hover:border-amber-500',
                  critical: 'border-rose-500 bg-rose-50/30 hover:border-rose-600',
                  missing: 'border-slate-300 border-dashed bg-slate-50/50 hover:border-slate-400'
                };

                return (
                  <button
                    key={wh.id}
                    onClick={() => setSelectedDrawerSite(wh.id)}
                    className={`p-4 rounded-2xl border text-left transition shadow-sm hover:shadow-md relative overflow-hidden flex flex-col justify-between h-32 ${borderStyles[status]}`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-900">{wh.id}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                          status === 'clear' ? 'bg-teal-100 text-teal-800' :
                          status === 'partial' ? 'bg-amber-100 text-amber-800' :
                          status === 'critical' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <div className="font-bold text-slate-800 text-xs mt-1 truncate">{wh.name}</div>
                      <div className="text-[11px] text-slate-500">{wh.city}</div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px] text-slate-600">
                      <span>{isFiled ? `${log?.deviationsCount} deviations` : 'No report filed'}</span>
                      {log?.activities.length ? (
                        <span className="font-semibold text-indigo-700">{log.activities.length} tasks</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Two-Column Analytics: Equipment Deviations & 14-Day Trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Equipment Deviations Panel */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>Equipment Deviations</span>
                <span className="text-slate-400">{equipFailList.length} affected items</span>
              </h3>

              {equipFailList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-teal-500 mx-auto mb-2" />
                  No deviations logged today. All equipment at 100%.
                </div>
              ) : (
                <div className="space-y-3">
                  {equipFailList.map(item => {
                    const pct = Math.round((item.count / totalFiled) * 100);
                    const isCrit = item.label === 'Cold Room' || item.label === 'Freezers GGP';

                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-800">
                          <span>{item.label}</span>
                          <span>{item.count} sites ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCrit ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 14-Day Trend SVG */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>14-Day Filing & Deviations Trend</span>
                <span className="text-teal-600 font-mono">14 Days</span>
              </h3>

              <div className="h-44 flex items-end gap-1.5 pt-4">
                {trendDays.map((td, i) => {
                  const heightPct = Math.round((td.filed / td.expected) * 100);
                  const isToday = i === 13;

                  return (
                    <div key={td.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-10 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg transition whitespace-nowrap z-10">
                        {td.label}: {td.filed}/{td.expected} filed ({td.deviations} devs)
                      </div>

                      <div className="w-full h-28 bg-slate-50 rounded-t flex items-end justify-center">
                        <div
                          className={`w-full rounded-t transition-all duration-300 ${
                            isToday ? 'bg-teal-600' : 'bg-teal-400 hover:bg-teal-500'
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono rotate-45 origin-left mt-1 truncate">
                        {td.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Open Ongoing Activities Table */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Open Activities Across Facilities</span>
              <span className="text-slate-400">{allActivities.length} total logged</span>
            </h3>

            {allActivities.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No ongoing activities recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[11px]">
                      <th className="pb-2">Site</th>
                      <th className="pb-2">Work Description</th>
                      <th className="pb-2">Owner</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Closing ETA</th>
                      <th className="pb-2">Barrier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allActivities.map((act) => (
                      <tr key={act.rowId} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 font-bold font-mono text-slate-800">{act.logId.split('_')[2]}</td>
                        <td className="py-2.5 text-slate-900 font-medium">{act.work}</td>
                        <td className="py-2.5 text-slate-600">{act.owner}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            act.status === 'Completed' ? 'bg-teal-100 text-teal-800' :
                            act.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                            act.status === 'Blocked' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {act.overdue ? (
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {act.eta} (Late)
                            </span>
                          ) : (
                            act.eta || '—'
                          )}
                        </td>
                        <td className="py-2.5 text-slate-500">{act.barrier || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPLIANCE HEATMAP MATRIX (21 DAYS) */}
      {activeAdminTab === 'compliance' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-black font-mono text-teal-700">
                {complianceData.overall}<span className="text-2xl font-normal text-slate-400 font-sans">%</span>
              </span>
              <div className="text-xs uppercase font-bold tracking-widest text-slate-400">
                21-Day Network<br />Filing Rate
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Sorted worst-first by historical compliance rate
            </div>
          </div>

          {/* Compliance Matrix Rows */}
          <div className="space-y-3 overflow-x-auto">
            <div className="min-w-[640px] space-y-2">
              <div className="grid grid-cols-12 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                <span className="col-span-3">Facility</span>
                <span className="col-span-7 flex justify-between">
                  <span>{complianceData.dayLabels[0]}</span>
                  <span>{complianceData.dayLabels[complianceData.dayLabels.length - 1]}</span>
                </span>
                <span className="col-span-2 text-right">Filing Rate</span>
              </div>

              {complianceData.rows.map(row => (
                <div key={row.site} className="grid grid-cols-12 items-center gap-2 py-2 border-b border-slate-50 hover:bg-slate-50/50 rounded-lg px-1">
                  <div className="col-span-3">
                    <span className="font-bold text-xs text-slate-900">{row.site}</span>
                    <span className="text-[11px] text-slate-400 block">{row.streak} day streak</span>
                  </div>

                  <div className="col-span-7 flex gap-1">
                    {row.cells.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-6 rounded-md transition hover:scale-125 ${
                          cell === 'clear' ? 'bg-teal-500' :
                          cell === 'partial' ? 'bg-amber-400' :
                          cell === 'critical' ? 'bg-rose-500' :
                          'bg-slate-200'
                        }`}
                        title={`${complianceData.dayLabels[idx]}: ${cell}`}
                      />
                    ))}
                  </div>

                  <div className="col-span-2 text-right">
                    <span className={`text-sm font-black font-mono ${
                      row.rate >= 90 ? 'text-teal-700' : row.rate >= 70 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {row.rate}%
                    </span>
                    <span className="text-[10px] text-slate-400 block">{row.filed}/{complianceData.days} days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXECUTIVE DIRECTOR BRIEFING PROSE */}
      {activeAdminTab === 'brief' && (
        <div className="bg-[#FAF8F4] border border-[#E8E2D8] rounded-2xl p-8 space-y-6 shadow-sm animate-in fade-in duration-200 font-serif">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline flex-wrap gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight font-sans">
              The Daily Site Brief
            </h2>
            <span className="text-xs uppercase tracking-widest text-slate-500 font-sans">
              {briefingData.dateLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-4">
              <p className="text-xl leading-relaxed text-slate-900 italic font-medium">
                "{briefingData.lead}"
              </p>

              <div className="space-y-3 font-sans text-xs text-slate-700 leading-relaxed">
                {briefingData.paragraphs.map(p => (
                  <div key={p.site} className="p-3 bg-white/80 rounded-xl border border-[#E0D9CD]">
                    <strong className="text-slate-900 font-bold">{p.site}:</strong> {p.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/90 p-5 rounded-2xl border border-[#E0D9CD] font-sans space-y-3 text-xs">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 pb-2 border-b border-slate-200">
                At a Glance
              </h3>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span>Facilities Reported</span>
                <strong className="text-slate-900">{briefingData.totals.filed} / {briefingData.totals.expected}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                <span>Critical Risk</span>
                <strong>{briefingData.totals.critical}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-amber-700">
                <span>Partial Deviations</span>
                <strong>{briefingData.totals.partial}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-teal-700">
                <span>All Clear</span>
                <strong>{briefingData.totals.clear}</strong>
              </div>
              <div className="flex justify-between py-1 text-slate-500">
                <span>Awaiting Reports</span>
                <strong>{briefingData.totals.missing}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Detail Drawer */}
      {selectedDrawerSite && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{drawerWarehouse?.name || selectedDrawerSite}</h2>
                  <span className="font-mono text-xs font-bold text-teal-700">{selectedDrawerSite} • {drawerWarehouse?.city}</span>
                </div>
                <button
                  onClick={() => setSelectedDrawerSite(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {drawerSiteLog ? (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Filed by POC:</span>
                      <strong className="text-slate-800">{drawerSiteLog.pocName} ({drawerSiteLog.pocEmail})</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Maintenance:</span>
                      <strong className="text-slate-800">{drawerSiteLog.pmCompleted} of {drawerSiteLog.pmPlanned} completed</strong>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                      Equipment Status Details
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between p-2 rounded bg-slate-50">
                        <span>Cold Room:</span>
                        <strong className={drawerSiteLog.coldRoom < 100 ? 'text-rose-600 font-bold' : 'text-teal-700'}>{drawerSiteLog.coldRoom}%</strong>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-slate-50">
                        <span>Freezers GGP:</span>
                        <strong className={drawerSiteLog.freezersGgp < 100 ? 'text-rose-600 font-bold' : 'text-teal-700'}>{drawerSiteLog.freezersGgp}%</strong>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-slate-50">
                        <span>RT Reach Truck:</span>
                        <strong className={drawerSiteLog.rt < 100 ? 'text-amber-600 font-bold' : 'text-teal-700'}>{drawerSiteLog.rt}%</strong>
                      </div>
                      <div className="flex justify-between p-2 rounded bg-slate-50">
                        <span>DG Standby Power:</span>
                        <strong className={drawerSiteLog.dg < 100 ? 'text-amber-600 font-bold' : 'text-teal-700'}>{drawerSiteLog.dg}%</strong>
                      </div>
                    </div>
                  </div>

                  {drawerSiteLog.highlights && (
                    <div>
                      <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                        Highlights:
                      </h4>
                      <p className="text-slate-600 p-3 bg-slate-50 rounded-xl leading-relaxed">{drawerSiteLog.highlights}</p>
                    </div>
                  )}

                  <button
                    onClick={() => handleOpenShare(drawerSiteLog.logId)}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    Share Report via Email / Gmail
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="font-bold text-slate-700">No report filed for today.</p>
                  <p className="text-xs mt-1">Site POC has not yet submitted today's activity sheet.</p>
                </div>
              )}

              {/* 35-Day Filing Calendar & Filers Breakdown */}
              {drawerSiteHistory && (
                <div className="space-y-3 pt-3 border-t border-slate-200 text-xs">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    35-Day Filing Calendar ({drawerSiteHistory.rate}% Rate)
                  </h4>
                  <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px]">
                    {drawerSiteHistory.cells.map((c, i) => (
                      <div
                        key={i}
                        className={`p-1.5 rounded text-white font-bold ${
                          c.status === 'clear' ? 'bg-teal-600' :
                          c.status === 'partial' ? 'bg-amber-500' :
                          c.status === 'critical' ? 'bg-rose-600' :
                          'bg-slate-200 text-slate-500'
                        }`}
                        title={`${c.label}: ${c.status}`}
                      >
                        {c.day}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedDrawerSite(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Report Modal */}
      {shareData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-teal-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Share Report
              </h3>
              <button onClick={() => setShareData(null)} className="text-teal-200 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyRichHtml}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${
                    copySuccess ? 'bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copySuccess ? 'Copied Rich HTML ✓' : 'Copy Rich HTML'}
                </button>

                <a
                  href={shareData.composeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-slate-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Gmail
                </a>
              </div>

              <div 
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: shareData.html }}
              />
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShareData(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
