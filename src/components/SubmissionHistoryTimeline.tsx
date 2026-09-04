import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  History, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  Calendar, 
  User as UserIcon, 
  Building2, 
  FileText,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';
import { TaskSubmission, DailySiteLog } from '../types';

interface SubmissionHistoryTimelineProps {
  templateId?: string;
  sheetId?: string;
  warehouseId?: string;
  title?: string;
  limit?: number;
  onSelectSubmission?: (submission: any) => void;
}

export const SubmissionHistoryTimeline: React.FC<SubmissionHistoryTimelineProps> = ({
  templateId,
  sheetId,
  warehouseId,
  title = 'Recent Submission History (Last 5 Entries)',
  limit = 5,
  onSelectSubmission
}) => {
  const { 
    submissions, 
    dailySiteLogs, 
    dieselLogs, 
    sheetRecords, 
    currentUser, 
    warehouses,
    setNotification 
  } = useApp();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Collect history items based on templateId, sheetId, or warehouseId
  const historyItems = React.useMemo(() => {
    let items: Array<{
      id: string;
      date: string;
      shift?: string;
      warehouseId?: string;
      warehouseName?: string;
      submittedByName: string;
      timestamp?: string;
      status?: string;
      worstStatus?: string;
      score?: number;
      compliancePct?: number;
      summary: string;
      payload: Record<string, any>;
      type: 'template' | 'daily_site' | 'diesel' | 'sheet_record';
    }> = [];

    const effectiveWhId = (currentUser.role === 'SITE_POC' && currentUser.warehouseId) 
      ? currentUser.warehouseId 
      : (warehouseId && warehouseId !== 'ALL' ? warehouseId : undefined);

    // 1. Template submissions
    if (templateId) {
      const filtered = submissions.filter(s => {
        if (s.templateId !== templateId) return false;
        if (effectiveWhId && s.warehouseId !== effectiveWhId) return false;
        return true;
      });

      filtered.forEach(s => {
        const wh = warehouses.find(w => w.id === s.warehouseId);
        const submissionDate = s.submissionDate || (s as any).date || '';
        const score = (s as any).score ?? 100;
        items.push({
          id: s.id || `SUB_${s.templateId}_${s.warehouseId}_${submissionDate}_${s.shift}`,
          date: submissionDate,
          shift: s.shift,
          warehouseId: s.warehouseId,
          warehouseName: wh ? wh.name : s.warehouseId,
          submittedByName: s.submittedByName,
          timestamp: s.submittedAt,
          status: s.status,
          score,
          summary: `${s.shift} Shift • Score: ${score}% • ${Object.keys(s.dataPayload || {}).length} fields recorded`,
          payload: s.dataPayload || {},
          type: 'template'
        });
      });
    }

    // 2. Daily Site Activity
    if (sheetId === 'SHEET_DAILY_SITE' || (!templateId && !sheetId)) {
      const filtered = dailySiteLogs.filter(d => {
        if (effectiveWhId) {
          const wh = warehouses.find(w => w.id === effectiveWhId);
          if (wh && d.site !== wh.name && d.site !== effectiveWhId) return false;
        }
        return true;
      });

      filtered.forEach(d => {
        const logId = d.logId || (d as any).id || `DAILY_${d.site}_${d.date}`;
        items.push({
          id: logId,
          date: d.date,
          shift: 'ALL DAY',
          warehouseName: d.site,
          submittedByName: d.pocName,
          timestamp: d.timestamp,
          status: (d as any).overallStatus || d.worstStatus,
          worstStatus: d.worstStatus,
          compliancePct: (d as any).compliancePct || 100,
          summary: `Status: ${d.worstStatus} • PM: ${d.pmCompleted}/${d.pmPlanned} • ${d.activities?.length || 0} ongoing activities`,
          payload: {
            values: (d as any).values || {},
            remarks: (d as any).remarks || '',
            highlights: d.highlights,
            activities: d.activities
          },
          type: 'daily_site'
        });
      });
    }

    // 3. Diesel
    if (sheetId === 'SHEET_DIESEL') {
      const filtered = dieselLogs.filter(d => {
        if (effectiveWhId && d.warehouseId !== effectiveWhId) return false;
        return true;
      });

      filtered.forEach(d => {
        const wh = warehouses.find(w => w.id === d.warehouseId);
        items.push({
          id: d.id || `DSL_${d.warehouseId}_${d.timestamp}`,
          date: d.timestamp.split('T')[0],
          warehouseId: d.warehouseId,
          warehouseName: wh ? wh.name : d.warehouseId,
          submittedByName: d.submittedByName,
          timestamp: d.timestamp,
          status: d.validation,
          summary: `${d.type} • ${d.deliveredQuantityLitres}L @ ₹${d.ratePerLitre} • ${d.validation}`,
          payload: d as any,
          type: 'diesel'
        });
      });
    }

    // 4. Other Operational Sheets
    if (sheetId && sheetId !== 'SHEET_DAILY_SITE' && sheetId !== 'SHEET_DIESEL') {
      const records = sheetRecords[sheetId] || [];
      const filtered = records.filter(r => {
        if (effectiveWhId && r.warehouseId && r.warehouseId !== effectiveWhId) return false;
        return true;
      });

      filtered.forEach((r, rIdx) => {
        const wh = warehouses.find(w => w.id === r.warehouseId);
        items.push({
          id: r.id || `REC_${sheetId}_${r.warehouseId || 'WH'}_${r.date || 'D'}_${rIdx}`,
          date: r.date || '2026-08-19',
          shift: r.shift || 'MORNING',
          warehouseId: r.warehouseId,
          warehouseName: wh ? wh.name : r.warehouseId || 'Site Hub',
          submittedByName: r.submittedByName || 'Site POC',
          timestamp: r.submittedAt || r.date,
          status: r.status || 'Verified',
          summary: `${r.shift || 'General Shift'} Entry • Status: ${r.status || 'Verified'}`,
          payload: r,
          type: 'sheet_record'
        });
      });
    }

    // Sort descending by date/timestamp
    items.sort((a, b) => {
      const tA = new Date(a.timestamp || a.date).getTime();
      const tB = new Date(b.timestamp || b.date).getTime();
      return tB - tA;
    });

    return items.slice(0, limit);
  }, [templateId, sheetId, warehouseId, submissions, dailySiteLogs, dieselLogs, sheetRecords, currentUser, warehouses, limit]);

  const handleCopyPayload = (item: any) => {
    const text = JSON.stringify(item.payload, null, 2);
    navigator.clipboard?.writeText(text);
    setCopiedId(item.id);
    setNotification({
      type: 'info',
      message: `Copied submission payload for ${item.date} to clipboard!`
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (item: any) => {
    const statusText = item.worstStatus || item.status || 'COMPLETED';
    const isRed = statusText.toUpperCase() === 'RED' || statusText.toUpperCase() === 'DISCREPANCY' || statusText.toUpperCase() === 'CRITICAL';
    const isAmber = statusText.toUpperCase() === 'AMBER' || statusText.toUpperCase() === 'FLAGGED' || statusText.toUpperCase() === 'WARNING';

    if (isRed) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3 h-3" />
          {statusText}
        </span>
      );
    }
    if (isAmber) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          {statusText}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        {statusText}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="submission-history-timeline">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
            <p className="text-xs text-slate-500">
              Showing past records filed for this operational workflow
            </p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
          {historyItems.length} Past {historyItems.length === 1 ? 'Entry' : 'Entries'}
        </span>
      </div>

      {/* Timeline List */}
      {historyItems.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">No prior submissions found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Once you submit your first report for this template or sheet, your previous entries will appear here in chronological order.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {historyItems.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const uniqueKey = `${item.type}_${item.id}_${item.date}_${item.shift || ''}_${idx}`;
            return (
              <div key={uniqueKey} className="transition-colors hover:bg-slate-50/60">
                <div 
                  className="px-5 py-3.5 flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Step indicator */}
                    <div className="mt-0.5 flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 
                          ? 'bg-emerald-600 text-white ring-4 ring-emerald-50' 
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {idx + 1}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {item.date}
                        </span>
                        {item.shift && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {item.shift}
                          </span>
                        )}
                        {getStatusBadge(item)}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {item.warehouseName || item.warehouseId}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          {item.submittedByName}
                        </span>
                        {item.compliancePct !== undefined && (
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <span>•</span>
                            <span>{item.compliancePct}% Compliance</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 mt-1 font-mono">
                        {item.summary}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPayload(item);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
                      title="Copy Entry JSON"
                    >
                      {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 text-xs">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Submission Entry Snapshot ({item.id})
                      </span>
                      {onSelectSubmission && (
                        <button
                          type="button"
                          onClick={() => onSelectSubmission(item)}
                          className="px-2.5 py-1 rounded bg-white border border-slate-200 text-emerald-700 font-medium hover:bg-emerald-50 transition-colors flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Load into View
                        </button>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto max-h-56 font-mono text-[11px] text-slate-800 leading-relaxed">
                      <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
