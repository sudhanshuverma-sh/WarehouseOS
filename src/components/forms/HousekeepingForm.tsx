import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Plus,
  Minus,
  Save,
  ArrowLeft,
  Sparkles,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { SubmissionHistoryTimeline } from '../SubmissionHistoryTimeline';

interface HousekeepingFormProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

export const HousekeepingForm: React.FC<HousekeepingFormProps> = ({ onBack, onSuccess }) => {
  const {
    currentDate,
    selectedShift,
    selectedWarehouseId,
    warehouses,
    currentUser,
    addSheetRecord,
    notify
  } = useApp();

  const activeWh = warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];

  const [agency, setAgency] = useState<'SMS' | 'Vedanta' | 'Others'>('SMS');
  const [mstAvailable, setMstAvailable] = useState<number>(3);
  const [rac, setRac] = useState<number>(1);
  const [hkSupervisor, setHkSupervisor] = useState<number>(2);
  const [approvedCount, setApprovedCount] = useState<number>(18);
  const [woCount, setWoCount] = useState<number>(3);
  const [ongroundCount, setOngroundCount] = useState<number>(14);
  const [yesterdayDeploymentPct, setYesterdayDeploymentPct] = useState<number>(80);
  const [lob, setLob] = useState<string>('HP');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-calculated fields
  const hkRequiredOnGround = Math.max(0, approvedCount - woCount);
  const deploymentPct = hkRequiredOnGround > 0 
    ? Math.round((ongroundCount / hkRequiredOnGround) * 1000) / 10 
    : 0;

  const getStatusBadge = () => {
    if (deploymentPct >= 95) {
      return { label: 'Compliant (100%)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2 };
    } else if (deploymentPct >= 80) {
      return { label: 'Moderate Shortage', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertTriangle };
    } else {
      return { label: 'Critical Shortage (<80%)', color: 'bg-rose-100 text-rose-800 border-rose-300', icon: AlertTriangle };
    }
  };

  const statusBadge = getStatusBadge();
  const StatusIcon = statusBadge.icon;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newRecord = {
      agency,
      mstAvailable,
      rac,
      hkSupervisor,
      approvedCount,
      woCount,
      hkRequiredOnGround,
      ongroundCount,
      deploymentPct,
      yesterdayDeploymentPct,
      lob,
      status: deploymentPct >= 90 ? 'Compliant' : 'Shortage',
      remarks: remarks || `${ongroundCount} on-ground deployed out of ${hkRequiredOnGround} required (${deploymentPct}%).`
    };

    void addSheetRecord('SHEET_HOUSEKEEPING', newRecord).then(res => {
      setIsSubmitting(false);
      if (!res.ok) return; // the reason is already on screen
      notify('success', 'Housekeeping Roster Saved', `Logged ${ongroundCount} headcount for ${agency} (${deploymentPct}% deployment)`);
      if (onSuccess) {
        onSuccess();
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Housekeeping Deployment & Agency Roster"
        subtitle={`Reconciles approved contractual headcounts vs actual onground deployment by manpower agency for ${activeWh.name}.`}
        categoryBadge="OPS_02_HK"
        categoryColor="bg-indigo-50 text-indigo-700 border-indigo-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Manpower & Rosters' },
          { label: 'Housekeeping' }
        ]}
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Today's Deployment</span>
              <div className="text-2xl font-black text-slate-900">{deploymentPct}%</div>
            </div>
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${statusBadge.color}`}>
              <StatusIcon className="w-4 h-4" />
              <span>{statusBadge.label}</span>
            </div>
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Agency & Location Selection */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            1. Manpower Agency & Site Metadata
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Manpower Agency</label>
              <div className="grid grid-cols-3 gap-2">
                {(['SMS', 'Vedanta', 'Others'] as const).map(ag => (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => setAgency(ag)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                      agency === ag
                        ? ag === 'SMS'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : ag === 'Vedanta'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ag}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Line of Business (LOB)</label>
              <select
                value={lob}
                onChange={(e) => setLob(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-teal-500"
              >
                <option value="HP">HP (Hyperlocal / Quick Commerce)</option>
                <option value="Grocery">Grocery B2B</option>
                <option value="ColdChain">Cold Chain & Dairy</option>
                <option value="FC_Hub">Mega Fulfillment Hub</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Yesterday's Deployment %</label>
              <input
                type="number"
                value={yesterdayDeploymentPct}
                onChange={(e) => setYesterdayDeploymentPct(Number(e.target.value))}
                className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Contractual Headcount vs Week-Off */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            2. Approved Contract Count vs Week-Off (W/O)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Approved Count */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500">Approved Count</span>
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => setApprovedCount(Math.max(1, approvedCount - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xl font-black text-slate-900">{approvedCount}</span>
                <button
                  type="button"
                  onClick={() => setApprovedCount(approvedCount + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Week-Off Count */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500">Week-Off (W/O)</span>
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => setWoCount(Math.max(0, woCount - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xl font-black text-slate-900">{woCount}</span>
                <button
                  type="button"
                  onClick={() => setWoCount(woCount + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Net Required on Ground (Auto-calc) */}
            <div className="bg-teal-50/70 p-4 rounded-xl border border-teal-200">
              <span className="text-[11px] font-bold text-teal-800">Required on Ground</span>
              <div className="text-2xl font-black text-teal-900 mt-2">{hkRequiredOnGround}</div>
              <span className="text-[10px] text-teal-600 font-semibold">(Approved {approvedCount} - W/O {woCount})</span>
            </div>

            {/* Supervisor Count */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500">HK Supervisors</span>
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => setHkSupervisor(Math.max(0, hkSupervisor - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xl font-black text-slate-900">{hkSupervisor}</span>
                <button
                  type="button"
                  onClick={() => setHkSupervisor(hkSupervisor + 1)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Actual Onground Deployment */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              3. Today's Actual On-Ground Physical Count
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              Shift: <strong className="text-slate-800">{selectedShift}</strong> • Date: <strong className="text-slate-800">{currentDate}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
            {/* Big Stepper for Onground Count */}
            <div className="sm:col-span-2 bg-slate-900 text-white p-5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 font-medium">Headcount on Warehouse Floor</span>
                <div className="text-3xl font-black text-white mt-1">{ongroundCount} Persons</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Target required: <span className="text-teal-400 font-bold">{hkRequiredOnGround}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOngroundCount(Math.max(0, ongroundCount - 1))}
                  className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xl font-bold transition shadow-sm"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setOngroundCount(ongroundCount + 1)}
                  className="w-12 h-12 rounded-xl bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center text-xl font-bold transition shadow-sm"
                >
                  +
                </button>
              </div>
            </div>

            {/* Live Deployment Score Card */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Deployment Rate</span>
              <div className={`text-3xl font-black mt-1 ${
                deploymentPct >= 95 ? 'text-emerald-600' : deploymentPct >= 80 ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {deploymentPct}%
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {ongroundCount >= hkRequiredOnGround
                  ? 'Full compliance achieved'
                  : `Shortfall of ${hkRequiredOnGround - ongroundCount} workers`}
              </span>
            </div>
          </div>

          {/* Remarks */}
          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Site POC Notes / Shortage Reasons (Optional)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. 2 workers absent due to medical leave. Contractor arranged 1 replacement for evening shift."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Prior 5 Submissions Timeline */}
        <SubmissionHistoryTimeline 
          sheetId="SHEET_HOUSEKEEPING" 
          title="Previous Housekeeping Entries (Last 5)"
        />

        {/* Submit Bar */}
        <div className="flex items-center justify-between pt-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
            >
              Cancel
            </button>
          ) : <div />}

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving to Database...' : 'Save Housekeeping Record'}
          </button>
        </div>
      </form>
    </div>
  );
};
