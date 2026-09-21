import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Droplet,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Save,
  Plus,
  Minus,
  Sparkles,
  Wrench,
  DollarSign
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { SubmissionHistoryTimeline } from '../SubmissionHistoryTimeline';
import { useExtraQuestions } from './ExtraQuestions';

interface WashingAdhocFormProps {
  initialTab?: 'washing' | 'adhoc';
  onBack?: () => void;
  onSuccess?: () => void;
}

export const WashingAdhocForm: React.FC<WashingAdhocFormProps> = ({ 
  initialTab = 'washing', 
  onBack, 
  onSuccess 
}) => {
  const {
    currentDate,
    selectedShift,
    selectedWarehouseId,
    warehouses,
    addSheetRecord,
    notify
  } = useApp();

  const activeWh = warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];
  const [activeSubTab, setActiveSubTab] = useState<'washing' | 'adhoc'>(initialTab);

  // Washing Form State
  const [cratesTarget, setCratesTarget] = useState<number>(1200);
  const [cratesWashed, setCratesWashed] = useState<number>(1250);
  const [chemicalPpm, setChemicalPpm] = useState<number>(200);
  const [waterUsedKl, setWaterUsedKl] = useState<number>(3.2);
  const [nozzlePressureBar, setNozzlePressureBar] = useState<number>(6.5);
  const [dryCrateStock, setDryCrateStock] = useState<number>(4500);
  const [washingRemarks, setWashingRemarks] = useState<string>('');

  // Adhoc Maintenance Form State
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [vendor, setVendor] = useState<string>('');
  const [estimatedCost, setEstimatedCost] = useState<number>(5000);
  const [actualCost, setActualCost] = useState<number>(4800);
  const [workPermitNo, setWorkPermitNo] = useState<string>(`WP-${activeWh.code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  const [adhocStatus, setAdhocStatus] = useState<'Completed' | 'In Progress' | 'Awaiting Parts'>('Completed');
  const [adhocRemarks, setAdhocRemarks] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Questions an admin added to these services after the screens were built.
  const washingExtras = useExtraQuestions('WASHING', activeWh?.id);
  const adhocExtras = useExtraQuestions('ADHOC', activeWh?.id);

  const handleWashingSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const extraAnswers = washingExtras.collect();
    if (!extraAnswers) return; // the missing answers are marked on screen

    setIsSubmitting(true);

    const payload = {
      ...extraAnswers,
      cratesTarget,
      cratesWashed,
      chemicalPpm,
      waterUsedKl,
      nozzlePressureBar,
      dryCrateStock,
      achievementPct: Math.round((cratesWashed / cratesTarget) * 100),
      status: cratesWashed >= cratesTarget ? 'Verified' : 'Flagged',
      remarks: washingRemarks || `${cratesWashed} crates washed (${chemicalPpm} PPM sanitizing solution). Ready for morning pick lines.`
    };

    void addSheetRecord('SHEET_WASHING', { ...payload, warehouseId: activeWh.id }).then(res => {
      setIsSubmitting(false);
      if (!res.ok) return; // the reason is already on screen
      notify('success', 'Crate Washing Record Saved', `Logged ${cratesWashed} sanitized crates for ${activeWh.code}`);
      if (onSuccess) onSuccess();
    });
  };

  const handleAdhocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDescription.trim()) {
      notify('error', 'Task Required', 'Please enter a brief description of the adhoc repair/task.');
      return;
    }

    const extraAnswers = adhocExtras.collect();
    if (!extraAnswers) return; // the missing answers are marked on screen

    setIsSubmitting(true);

    const payload = {
      ...extraAnswers,
      taskDescription,
      vendor: vendor || 'In-House Facility Team',
      estimatedCost,
      actualCost,
      workPermitNo,
      status: adhocStatus,
      remarks: adhocRemarks || `Permit ${workPermitNo}: ${taskDescription} - Cost: ₹${actualCost}`
    };

    void addSheetRecord('SHEET_ADHOC', { ...payload, warehouseId: activeWh.id }).then(res => {
      setIsSubmitting(false);
      if (!res.ok) return; // the reason is already on screen
      notify('success', 'Adhoc Task Logged', `Logged ${workPermitNo} (₹${actualCost})`);
      if (onSuccess) onSuccess();
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title={activeSubTab === 'washing' ? 'Crate & Tray Washing / Sanitization' : 'Adhoc Tasks, Repairs & CAPEX Tracker'}
        subtitle={`Log operational hygiene and maintenance records for ${activeWh.name}.`}
        categoryBadge={activeSubTab === 'washing' ? 'OPS_05_WASH' : 'OPS_06_ADHOC'}
        categoryColor={activeSubTab === 'washing' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-orange-50 text-orange-700 border-orange-200'}
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Operations' },
          { label: activeSubTab === 'washing' ? 'Crate Washing' : 'Adhoc Repairs' }
        ]}
        actions={
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubTab('washing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'washing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Droplet className="w-3.5 h-3.5 text-sky-600" />
              <span>Crate Washing</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('adhoc')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'adhoc' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-orange-600" />
              <span>Adhoc Tasks</span>
            </button>
          </div>
        }
      />

      {activeSubTab === 'washing' ? (
        <form onSubmit={handleWashingSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Droplet className="w-4 h-4 text-sky-600" />
              Crate Washing Throughput & Sanitizer Dosing
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500">Target Crates</span>
                <input
                  type="number"
                  value={cratesTarget}
                  onChange={(e) => setCratesTarget(Number(e.target.value))}
                  className="w-full text-lg font-black px-2 py-1 rounded border border-slate-200 bg-white mt-1"
                />
              </div>

              <div className="bg-sky-50 p-4 rounded-xl border border-sky-200">
                <span className="text-[11px] font-bold text-sky-800">Actual Washed & Sanitized</span>
                <input
                  type="number"
                  value={cratesWashed}
                  onChange={(e) => setCratesWashed(Number(e.target.value))}
                  className="w-full text-lg font-black px-2 py-1 rounded border border-sky-300 bg-white text-sky-900 mt-1"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500">Chemical Dosing (PPM)</span>
                <input
                  type="number"
                  value={chemicalPpm}
                  onChange={(e) => setChemicalPpm(Number(e.target.value))}
                  className="w-full text-lg font-black px-2 py-1 rounded border border-slate-200 bg-white mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Water Used (KL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={waterUsedKl}
                  onChange={(e) => setWaterUsedKl(Number(e.target.value))}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Wash Nozzle Pressure (Bar)</label>
                <input
                  type="number"
                  step="0.5"
                  value={nozzlePressureBar}
                  onChange={(e) => setNozzlePressureBar(Number(e.target.value))}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dry Ready Crate Stock</label>
                <input
                  type="number"
                  value={dryCrateStock}
                  onChange={(e) => setDryCrateStock(Number(e.target.value))}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">POC Washing Remarks</label>
              <textarea
                rows={2}
                value={washingRemarks}
                onChange={(e) => setWashingRemarks(e.target.value)}
                placeholder="e.g. All fruit & grocery crates sanitized and dried for next dispatch shift."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          {washingExtras.node}

          {/* Prior 5 Submissions Timeline */}
          <SubmissionHistoryTimeline
            sheetId="SHEET_WASHING"
            title="Previous Crate Washing Entries (Last 5)"
          />

          <div className="flex items-center justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
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
              Save Crate Washing Log
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleAdhocSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-orange-600" />
              Adhoc Civil, Electrical or Equipment Maintenance
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Task / Repair Description *</label>
                <input
                  type="text"
                  required
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="e.g. Dock shutter #3 spring replacement and welding"
                  className="w-full font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vendor / Contractor Name</label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Shree Sai Engineering / In-House"
                  className="w-full font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Estimated Cost (₹)</label>
                <input
                  type="number"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Actual Final Cost (₹)</label>
                <input
                  type="number"
                  value={actualCost}
                  onChange={(e) => setActualCost(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-emerald-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Work Permit / Gate Pass #</label>
                <input
                  type="text"
                  value={workPermitNo}
                  onChange={(e) => setWorkPermitNo(e.target.value)}
                  className="w-full font-mono font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Task Status</label>
                <select
                  value={adhocStatus}
                  onChange={(e) => setAdhocStatus(e.target.value as any)}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                >
                  <option value="Completed">Completed (Signed Off)</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Awaiting Parts">Awaiting Parts / Approval</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Completion Notes</label>
              <textarea
                rows={2}
                value={adhocRemarks}
                onChange={(e) => setAdhocRemarks(e.target.value)}
                placeholder="e.g. Work tested in presence of shift supervisor. Shutter operating smoothly."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>

          {adhocExtras.node}

          {/* Prior 5 Submissions Timeline */}
          <SubmissionHistoryTimeline
            sheetId="SHEET_ADHOC"
            title="Previous Adhoc Maintenance Entries (Last 5)"
          />

          <div className="flex items-center justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
            ) : <div />}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Adhoc Maintenance Log
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
