import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Minus, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Copy, 
  Mail, 
  ExternalLink, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { SubmissionHistoryTimeline } from './SubmissionHistoryTimeline';
import { useExtraQuestions } from './forms/ExtraQuestions';
import { AlreadyFiled } from './common/AlreadyFiled';

interface ActivityItem {
  work: string;
  owner: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Blocked';
  eta: string;
  barrier?: string;
  cost?: number;
  manhours?: number;
}

const UTILITY = [
  { label: 'UPS', key: 'ups' },
  { label: 'DG', key: 'dg' },
  { label: 'LT Panel', key: 'ltPanel' },
  { label: 'Cold Room', key: 'coldRoom', isCrit: true },
  { label: 'HVLS', key: 'hvls' },
  { label: 'Water Coolers', key: 'waterCoolers' },
  { label: 'Freezers GGP', key: 'freezersGgp', isCrit: true },
  { label: 'Door Buzzer', key: 'doorBuzzer' }
];

const MHE = [
  { label: 'RT (Reach Truck)', key: 'rt' },
  { label: 'BOPT', key: 'bopt' },
  { label: 'Stackers', key: 'stackers' },
  { label: 'VRC', key: 'vrc' }
];

const ROUTINE = [
  { label: 'MTS Inspection', key: 'mtsInspection' },
  { label: 'Lights Inspection', key: 'lightsInspection' },
  { label: 'Air Circulation', key: 'airCirculation' },
  { label: 'Gemba', key: 'gemba' }
];

import { PageHeader } from './common/PageHeader';

export const DailySiteActivityForm: React.FC<{ 
  onNavigateToDashboard?: () => void;
  onBack?: () => void;
}> = ({ onNavigateToDashboard, onBack }) => {
  const { 
    warehouses, 
    currentUser, 
    currentDate, 
    submitDailySiteLog, 
    getExistingDailyReport,
    buildShareMailHtml 
  } = useApp();

  // Site selection
  const userSites = currentUser.role === 'SUPER_ADMIN' 
    ? warehouses.map(w => w.id) 
    : [currentUser.warehouseId || warehouses[0].id];

  const [selectedSite, setSelectedSite] = useState<string>(userSites[0] || '');
  const [selectedDate, setSelectedDate] = useState<string>(currentDate);

  // Questions an admin added to this service after the screen was built.
  const extras = useExtraQuestions('SITE_ACTIVITY', selectedSite);

  // Form State
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    UTILITY.concat(MHE).forEach(p => { init[p.key] = 100; });
    ROUTINE.forEach(r => { init[r.key] = 'Done'; });
    return init;
  });

  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [pmPlanned, setPmPlanned] = useState<number>(4);
  const [pmCompleted, setPmCompleted] = useState<number>(4);
  const [pmRemark, setPmRemark] = useState<string>('');
  const [highlights, setHighlights] = useState<string>('All equipment operational. Zero cold chain breaches recorded on shift.');
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      work: 'Chiller Evaporator Fan #2 check',
      owner: currentUser.fullName,
      status: 'Completed',
      eta: currentDate,
      barrier: '',
      cost: 0,
      manhours: 1
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [shareData, setShareData] = useState<{ subject: string; html: string; plain: string; composeUrl: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Check duplicate report
  const existingReport = selectedSite && selectedDate ? getExistingDailyReport(selectedSite, selectedDate) : undefined;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const handlePctChange = (key: string, val: number) => {
    const clampedVal = clamp(val);
    setValues(prev => ({ ...prev, [key]: clampedVal }));
    if (clampedVal >= 100) {
      setRemarks(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleRoutineChange = (key: string, val: 'Done' | 'Not Done' | 'NA') => {
    setValues(prev => ({ ...prev, [key]: val }));
    if (val === 'Done') {
      setRemarks(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Add / Remove Ongoing Activities
  const handleAddActivity = () => {
    setActivities(prev => [
      ...prev,
      {
        work: '',
        owner: currentUser.fullName,
        status: 'Open',
        eta: selectedDate,
        barrier: '',
        cost: 0,
        manhours: 1
      }
    ]);
  };

  const handleRemoveActivity = (index: number) => {
    setActivities(prev => prev.filter((_, i) => i !== index));
  };

  const handleActivityChange = (index: number, field: keyof ActivityItem, val: any) => {
    setActivities(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  // Live Deviation and Remarks Footnote Calculation
  let openDeviations = 0;
  let unexplainedDeviations = 0;

  UTILITY.concat(MHE).forEach(p => {
    if ((values[p.key] ?? 100) < 100) {
      openDeviations++;
      if (!(remarks[p.key] || '').trim()) unexplainedDeviations++;
    }
  });

  ROUTINE.forEach(r => {
    if ((values[r.key] || 'Done') !== 'Done') {
      openDeviations++;
      if (!(remarks[r.key] || '').trim()) unexplainedDeviations++;
    }
  });

  const getFootnoteText = () => {
    if (openDeviations === 0) return 'No deviations. Everything at 100%.';
    if (unexplainedDeviations === 0) {
      return `${openDeviations} ${openDeviations === 1 ? 'deviation' : 'deviations'}, all explained.`;
    }
    return `${unexplainedDeviations} of ${openDeviations} ${
      openDeviations === 1 ? 'deviation still needs' : 'deviations still need'
    } a remark.`;
  };

  const handleFileReport = (thenShare: boolean = false) => {
    if (!selectedSite) {
      alert('Please choose a warehouse site first.');
      return;
    }

    if (unexplainedDeviations > 0) {
      alert(`Please fill in remarks for all items below 100% (${unexplainedDeviations} unexplained deviations remaining).`);
      return;
    }

    if (pmCompleted > pmPlanned) {
      alert('Completed preventive maintenance count cannot exceed planned count.');
      return;
    }

    const extraAnswers = extras.collect();
    if (!extraAnswers) {
      alert('Please answer the questions under "More questions".');
      return;
    }

    setIsSubmitting(true);

    // Waits for the real save. On failure the form stays as typed and the
    // reason is shown, so nothing is lost and nothing is claimed.
    void submitDailySiteLog({
      extras: extraAnswers,
      site: selectedSite,
      date: selectedDate,
      values,
      remarks,
      pmPlanned,
      pmCompleted,
      pmRemark,
      highlights,
      activities: activities.filter(a => (a.work || '').trim().length > 0)
    }).then(res => {
      setIsSubmitting(false);
      if (!res.ok) return;
      if (thenShare) {
        setShareData(buildShareMailHtml(res.logId));
      } else if (onNavigateToDashboard) {
        onNavigateToDashboard();
      }
    });
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

  const fillQuickBenchmark = () => {
    const updatedValues: Record<string, any> = {};
    UTILITY.concat(MHE).forEach(p => { updatedValues[p.key] = 100; });
    ROUTINE.forEach(r => { updatedValues[r.key] = 'Done'; });
    setValues(updatedValues);
    setRemarks({});
    setPmPlanned(5);
    setPmCompleted(5);
    setPmRemark('All daily planned greasings and sensor calibrations completed OK.');
    setHighlights('Shift running at 100% capacity with zero stock risk.');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 font-sans animate-in fade-in duration-200">
      {/* Top Banner Header with Back Navigation */}
      <PageHeader
        title="Daily Site Report"
        subtitle="Equipment availability, routine checks, preventive maintenance and today's work."
        categoryBadge="OPS_01_DAILY"
        categoryColor="bg-teal-50 text-teal-700 border-teal-200"
        onBack={onBack || onNavigateToDashboard}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Operational Forms' },
          { label: 'Daily Site Activity' }
        ]}
        actions={
          <button
            type="button"
            onClick={fillQuickBenchmark}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Quick Clean Fill (100%)</span>
          </button>
        }
      />

      {/* SECTION 01: Report Scope */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            01
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Report Scope & Site Selection
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Site Facility *</label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              {userSites.map(sId => {
                const wh = warehouses.find(w => w.id === sId);
                return (
                  <option key={sId} value={sId}>
                    {sId} - {wh ? wh.name : sId}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Someone has already filed today. Same wording as every other
            service now, rather than a rose alarm reading like a fault. */}
        {existingReport && (
          <AlreadyFiled
            filing={{
              code: 'SITE_ACTIVITY',
              site: selectedSite,
              day: selectedDate,
              at: existingReport.timestamp || selectedDate,
              by: existingReport.pocName || '',
            }}
            amendNote="One report is kept per site per day. Ask them to correct it if something is wrong."
          />
        )}
      </div>

      {/* SECTION 02: Utility Equipment Availability */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            02
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Utility Equipment Availability (%)
          </h2>
        </div>

        <div className="space-y-3">
          {UTILITY.map((item) => {
            const val = values[item.key] ?? 100;
            const isBelow = val < 100;
            const isCritOn = isBelow && item.isCrit;

            return (
              <div 
                key={item.key}
                className={`p-3.5 rounded-xl border transition ${
                  isCritOn 
                    ? 'bg-rose-50/70 border-rose-300' 
                    : isBelow 
                    ? 'bg-amber-50/70 border-amber-300' 
                    : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{item.label}</span>
                    {item.isCrit && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 uppercase tracking-wider border border-rose-200">
                        Critical Stock Risk
                      </span>
                    )}
                  </div>

                  {/* Stepper Controls */}
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handlePctChange(item.key, val - 5)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => handlePctChange(item.key, Number(e.target.value))}
                      className={`w-16 text-center text-xs font-bold focus:outline-none ${
                        isCritOn ? 'text-rose-600' : isBelow ? 'text-amber-600' : 'text-slate-900'
                      }`}
                    />
                    <span className="pr-2 text-xs font-bold text-slate-400 select-none">%</span>
                    <button
                      type="button"
                      onClick={() => handlePctChange(item.key, val + 5)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mandatory Remark if below 100% */}
                {isBelow && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 animate-in fade-in duration-150">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Reason for {item.label} availability below 100% *
                    </label>
                    <textarea
                      rows={2}
                      value={remarks[item.key] || ''}
                      onChange={(e) => setRemarks({ ...remarks, [item.key]: e.target.value })}
                      placeholder={`Explain why ${item.label.toLowerCase()} is at ${val}% (required)...`}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 03: MHE Availability */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            03
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            MHE Fleet Availability (%)
          </h2>
        </div>

        <div className="space-y-3">
          {MHE.map((item) => {
            const val = values[item.key] ?? 100;
            const isBelow = val < 100;

            return (
              <div 
                key={item.key}
                className={`p-3.5 rounded-xl border transition ${
                  isBelow 
                    ? 'bg-amber-50/70 border-amber-300' 
                    : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-900">{item.label}</span>

                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handlePctChange(item.key, val - 5)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => handlePctChange(item.key, Number(e.target.value))}
                      className={`w-16 text-center text-xs font-bold focus:outline-none ${
                        isBelow ? 'text-amber-600' : 'text-slate-900'
                      }`}
                    />
                    <span className="pr-2 text-xs font-bold text-slate-400 select-none">%</span>
                    <button
                      type="button"
                      onClick={() => handlePctChange(item.key, val + 5)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isBelow && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 animate-in fade-in duration-150">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Reason for {item.label} downtime / deficit *
                    </label>
                    <textarea
                      rows={2}
                      value={remarks[item.key] || ''}
                      onChange={(e) => setRemarks({ ...remarks, [item.key]: e.target.value })}
                      placeholder={`Detail hydraulic/battery issue for ${item.label}...`}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 04: Routine Activity */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            04
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Routine Inspection & Gemba Checks
          </h2>
        </div>

        <div className="space-y-3">
          {ROUTINE.map((item) => {
            const val = values[item.key] || 'Done';
            const isBad = val !== 'Done';

            return (
              <div 
                key={item.key}
                className={`p-3.5 rounded-xl border transition ${
                  isBad 
                    ? 'bg-rose-50/70 border-rose-300' 
                    : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-bold text-slate-900">{item.label}</span>

                  <div className="inline-flex border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
                    {(['Done', 'Not Done', 'NA'] as const).map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleRoutineChange(item.key, option)}
                        className={`px-3 py-1.5 text-xs font-bold border-r last:border-r-0 transition ${
                          val === option
                            ? option === 'Done'
                              ? 'bg-teal-600 text-white'
                              : option === 'Not Done'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-700 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {isBad && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 animate-in fade-in duration-150">
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Reason why {item.label.toLowerCase()} was not completed *
                    </label>
                    <textarea
                      rows={2}
                      value={remarks[item.key] || ''}
                      onChange={(e) => setRemarks({ ...remarks, [item.key]: e.target.value })}
                      placeholder={`Explain roadblock or postponement for ${item.label}...`}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-300 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 05: Preventive Maintenance */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            05
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Preventive Maintenance (PM)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Planned Activities</label>
            <input
              type="number"
              min={0}
              value={pmPlanned}
              onChange={(e) => setPmPlanned(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Completed Activities</label>
            <input
              type="number"
              min={0}
              value={pmCompleted}
              onChange={(e) => setPmCompleted(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">PM Remark (Optional)</label>
            <textarea
              rows={2}
              value={pmRemark}
              onChange={(e) => setPmRemark(e.target.value)}
              placeholder="e.g. Dock levelers and battery charger greasing completed."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* SECTION 06: Ongoing Activities (Child collection) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
              06
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Ongoing Activities ({activities.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={handleAddActivity}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Activity
          </button>
        </div>

        <div className="space-y-3">
          {activities.map((act, idx) => (
            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase font-mono">
                  Activity #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveActivity(idx)}
                  className="text-rose-500 hover:text-rose-700 p-1 text-xs font-bold flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Remove
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-slate-700">What needs doing *</label>
                  <input
                    type="text"
                    value={act.work}
                    onChange={(e) => handleActivityChange(idx, 'work', e.target.value)}
                    placeholder="e.g. Replace faulty cold room door latch sensor"
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Owner</label>
                  <input
                    type="text"
                    value={act.owner}
                    onChange={(e) => handleActivityChange(idx, 'owner', e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Status</label>
                  <select
                    value={act.status}
                    onChange={(e) => handleActivityChange(idx, 'status', e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-bold"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Closing ETA</label>
                  <input
                    type="date"
                    value={act.eta}
                    onChange={(e) => handleActivityChange(idx, 'eta', e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Manhours</label>
                  <input
                    type="number"
                    min={0}
                    value={act.manhours}
                    onChange={(e) => handleActivityChange(idx, 'manhours', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="font-semibold text-slate-700">Barrier / Hold-up</label>
                  <input
                    type="text"
                    value={act.barrier}
                    onChange={(e) => handleActivityChange(idx, 'barrier', e.target.value)}
                    placeholder="What is holding it up (e.g. Spare part shipment delay)"
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 07: Highlights */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">
            07
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Notes
          </h2>
        </div>

        <textarea
          rows={3}
          value={highlights}
          onChange={(e) => setHighlights(e.target.value)}
          placeholder="Anything worth the operations control room team knowing..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
        />
      </div>

      {extras.node}

      {/* Prior 5 Submissions Timeline */}
      <SubmissionHistoryTimeline
        sheetId="SHEET_DAILY_SITE" 
        title="Last 5 reports"
      />

      {/* Sticky Bottom Action Bar */}
      {/* Sits clear of the mobile bottom bar rather than behind it. The bar
          is ~59px plus the home indicator, so on a phone this rides above
          that; from md: up there is no bar and it returns to bottom-4. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-40 bg-slate-900/90 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${
            openDeviations === 0 ? 'bg-teal-400' : unexplainedDeviations === 0 ? 'bg-amber-400' : 'bg-rose-400 animate-pulse'
          }`} />
          <span className="text-xs font-semibold text-slate-200">
            {getFootnoteText()}
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            disabled={isSubmitting || !!existingReport}
            onClick={() => handleFileReport(false)}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-teal-500/20 transition disabled:opacity-50"
          >
            {isSubmitting ? 'Filing…' : 'File report'}
          </button>

          <button
            type="button"
            disabled={isSubmitting || !!existingReport}
            onClick={() => handleFileReport(true)}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-600 transition disabled:opacity-50"
          >
            File and share
          </button>
        </div>
      </div>

      {/* Share Report Modal (Email & Gmail Direct Link) */}
      {shareData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-teal-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Share Daily Site Report
              </h3>
              <button 
                onClick={() => setShareData(null)}
                className="text-teal-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
              <ol className="list-decimal list-inside space-y-1.5 text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <li>Click <strong>Copy Rich HTML Report</strong> below.</li>
                <li>Open Gmail or email client.</li>
                <li>Press <strong>Ctrl+V</strong> (or long-press paste on mobile) into the message body.</li>
              </ol>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyRichHtml}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition ${
                    copySuccess ? 'bg-emerald-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {copySuccess ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copySuccess ? 'Copied Rich HTML ✓' : 'Copy Rich HTML Report'}
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

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Report Preview:
                </span>
                <div 
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: shareData.html }}
                />
              </div>
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
