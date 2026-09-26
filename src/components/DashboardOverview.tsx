import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Calendar, FileText, X, ExternalLink, Mail, Copy, Check, ShieldCheck } from 'lucide-react';
import { PageHeader } from './common/PageHeader';
import { SiteServiceBoard } from './controlRoom/SiteServiceBoard';
import { ComplianceView } from './controlRoom/ComplianceView';
import { SummaryView } from './controlRoom/SummaryView';
import { computeSiteStatuses, controlRoomServices, controlRoomSites, siteMatches, sitePocs } from '../lib/controlRoom/siteServiceStatus';

/** One labelled fact in the drawer. A blank says where it would come from. */
const Detail: React.FC<{ label: string; value?: string; mono?: boolean }> = ({ label, value, mono }) => {
  const shown = String(value ?? '').trim();
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <span className="shrink-0 text-[11px] font-semibold text-slate-500">{label}</span>
      <span className={`text-right ${mono ? 'font-mono' : ''} ${shown ? 'text-slate-800' : 'text-slate-400'}`}>
        {shown || 'Not in Master Data'}
      </span>
    </div>
  );
};

/** What each tab is for, in one line under the tabs. */
const TAB_HELP = {
  today: 'Every site and every service, done or pending right now.',
  compliance: 'How reliably each site and service files over time, across every scheduled service.',
  brief: 'The whole operation today on one page: numbers against yesterday, issues and sites not started.'
} as const;

interface DashboardOverviewProps {
  onNavigateTab: (tab: string) => void;
  onOpenChecklistForWarehouse: (warehouseId: string) => void;
  onBack?: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateTab, onOpenChecklistForWarehouse, onBack }) => {
  const {
    warehouses,
    siteMasterRows,
    pocMasterRows,
    currentUser,
    currentDate,
    dailySiteLogs,
    getSiteHistory,
    buildShareMailHtml,
    serviceRegistryRows,
    operationalSheets,
    dieselLogs,
    ebdgRows,
    submissions,
    sheetRecords
  } = useApp();

  // The board: every active Site_Master site × every active Service_Registry
  // service, judged by each service's cadence. A site or service added in
  // Master Data appears here with no code change.
  const controlSites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const controlServices = useMemo(
    () => controlRoomServices(serviceRegistryRows, operationalSheets),
    [serviceRegistryRows, operationalSheets]
  );
  const controlRecords = useMemo(
    () => ({ dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords }),
    [dailySiteLogs, dieselLogs, ebdgRows, submissions, sheetRecords]
  );
  const siteStatuses = useMemo(
    () => computeSiteStatuses(controlSites, controlServices, controlRecords, currentDate),
    [controlSites, controlServices, controlRecords, currentDate]
  );
  const dateLabel = new Date(`${currentDate}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const [activeAdminTab, setActiveAdminTab] = useState<'today' | 'compliance' | 'brief'>('today');
  const [selectedDrawerSite, setSelectedDrawerSite] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{ subject: string; html: string; plain: string; composeUrl: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Esc closes the drawer, the same as clicking away from it.
  useEffect(() => {
    if (!selectedDrawerSite) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedDrawerSite(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDrawerSite]);

  // Whether the board is counting the real network or the app's warehouse list.
  const usingMasterData = siteMasterRows.some(s => s.Active === 'Yes');


  // Drawer site detail. Records and warehouses are matched by every name the
  // site goes by: the board's ids are Site_Codes, while logs and warehouses
  // still carry app ids like WH_AP_VIZAG_B2C, so exact equality found nothing.
  const drawerStatus = selectedDrawerSite ? siteStatuses.find(s => s.site.id === selectedDrawerSite) : null;
  const matchesDrawer = (id: string | undefined) =>
    drawerStatus ? siteMatches(drawerStatus.site, id) : id === selectedDrawerSite;
  const drawerWarehouse = selectedDrawerSite ? warehouses.find(w => matchesDrawer(w.id)) : null;
  const drawerSiteLog = selectedDrawerSite
    ? dailySiteLogs.find(l => matchesDrawer(l.site) && l.date === currentDate)
    : null;
  const drawerSiteHistory = selectedDrawerSite ? getSiteHistory(drawerWarehouse?.id ?? selectedDrawerSite, 35) : null;
  const drawerSite = selectedDrawerSite ? siteMasterRows.find(s => s.Site_Code === selectedDrawerSite) : null;
  const drawerPocs = drawerStatus ? sitePocs(drawerStatus.site, pocMasterRows) : [];
  const drawerAddress = [drawerSite?.Address, drawerSite?.City, drawerSite?.State, drawerSite?.Pincode]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .join(', ');

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
      {/* Kept deliberately quiet: the site board below is the point of this screen. */}
      <PageHeader
        title="Control Room"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal' },
          { label: activeAdminTab === 'today' ? 'Today' : activeAdminTab === 'compliance' ? 'Compliance' : 'Summary' }
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
                  {tab === 'today' ? 'Today' : tab === 'compliance' ? 'Compliance' : 'Summary'}
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
              onClick={() => onNavigateTab('dailyForm')}
              className="px-3.5 py-1.5 bg-[var(--color-ink)] hover:bg-[var(--color-ink-soft)] text-white font-semibold text-xs rounded-[var(--r-chip)] transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>File report</span>
            </button>
          </div>
        }
      />

      <p className="-mt-3 text-xs text-[var(--text-muted)]">{TAB_HELP[activeAdminTab]}</p>

      {/* TAB 1: TODAY, every Master Data site, every registry service, done or not */}
      {activeAdminTab === 'today' && (
        <SiteServiceBoard
          statuses={siteStatuses}
          services={controlServices}
          dateLabel={dateLabel}
          usingMasterData={usingMasterData}
          onOpenSite={setSelectedDrawerSite}
        />
      )}

      {/* TAB 2: COMPLIANCE, every scheduled service and site over 7, 14 or 30 days */}
      {activeAdminTab === 'compliance' && (
        <ComplianceView
          sites={controlSites}
          services={controlServices}
          records={controlRecords}
          today={currentDate}
          onOpenSite={setSelectedDrawerSite}
        />
      )}

      {/* TAB 3: SUMMARY, the whole operation today, against yesterday */}
      {activeAdminTab === 'brief' && (
        <SummaryView
          sites={controlSites}
          services={controlServices}
          records={controlRecords}
          dieselLogs={dieselLogs}
          dailySiteLogs={dailySiteLogs}
          today={currentDate}
          dateLabel={dateLabel}
          onOpenSite={setSelectedDrawerSite}
          onOpenServiceHub={() => onNavigateTab('adminDashboard')}
        />
      )}

      {/* Site Detail Drawer */}
      {selectedDrawerSite && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-150"
          onMouseDown={() => setSelectedDrawerSite(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${drawerStatus?.site.name ?? selectedDrawerSite}, site details`}
        >
          {/* Mousedown, not click: text selected inside and released outside
              should not count as clicking away. */}
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-6 flex flex-col justify-between"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">{drawerStatus?.site.name || drawerWarehouse?.name || selectedDrawerSite}</h2>
                  <p className="font-mono text-xs text-slate-500 truncate">
                    {[selectedDrawerSite, drawerSite?.WH_Code, drawerStatus?.site.channel, drawerStatus?.site.zone]
                      .map(v => String(v ?? '').trim())
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDrawerSite(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Who to call, and where the place is */}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                <div className="p-3">
                  <p className="text-[11px] font-semibold text-slate-500">Site POC{drawerPocs.length === 1 ? '' : 's'}</p>
                  {drawerPocs.length === 0 ? (
                    <p className="mt-1 text-slate-400">Nobody is listed for this site in POC Master.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                      {drawerPocs.map(p => (
                        <li key={p.Access_ID} className="flex items-center justify-between gap-3">
                          <span className="truncate text-slate-800">{p.POC_Name}</span>
                          {String(p.Contact_Number ?? '').trim() ? (
                            <a
                              href={`tel:${String(p.Contact_Number).replace(/\s+/g, '')}`}
                              className="shrink-0 font-mono text-slate-700 hover:text-slate-900 underline underline-offset-2"
                            >
                              {p.Contact_Number}
                            </a>
                          ) : (
                            <span className="shrink-0 text-slate-400">No number</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Detail label="SAP code" value={drawerSite?.SAP_Code} mono />
                <Detail label="GSTIN" value={drawerSite?.GSTIN} mono />
                <Detail label="Address" value={drawerAddress} />
              </div>

              {drawerStatus && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {drawerStatus.services.map(s => (
                    <li key={s.code} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 text-xs">
                      <span className="truncate text-slate-700">{s.name}</span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold ${
                          s.state === 'done' ? 'text-(--color-filed)' : s.state === 'pending' ? 'text-(--color-due)' : 'text-slate-500'
                        }`}
                      >
                        {s.state === 'done' ? 'Done' : s.state === 'pending' ? 'Pending' : s.count ? `${s.count} today` : 'None today'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

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
