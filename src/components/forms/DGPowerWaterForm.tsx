import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Zap,
  Fuel,
  Droplet,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Save,
  Clock,
  Sparkles,
  Layers,
  Activity
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { SubmissionHistoryTimeline } from '../SubmissionHistoryTimeline';

interface DGPowerWaterFormProps {
  onBack?: () => void;
  onSuccess?: () => void;
}

export const DGPowerWaterForm: React.FC<DGPowerWaterFormProps> = ({ onBack, onSuccess }) => {
  const {
    currentDate,
    selectedShift,
    selectedWarehouseId,
    warehouses,
    addSheetRecord,
    notify
  } = useApp();

  const activeWh = warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];

  // DG 01 (500 KVA)
  const [dg1HsdOpening, setDg1HsdOpening] = useState<number>(1420);
  const [dg1HsdReceived, setDg1HsdReceived] = useState<number>(2000);
  const [dg1HsdConsumption, setDg1HsdConsumption] = useState<number>(120);
  const [dg1KwhOpening, setDg1KwhOpening] = useState<number>(14820);
  const [dg1KwhClosing, setDg1KwhClosing] = useState<number>(15240);
  const [dg1RunHours, setDg1RunHours] = useState<number>(3.0);
  const [dg1CumulativeHours, setDg1CumulativeHours] = useState<number>(1240);
  const [dg1BCheckDone, setDg1BCheckDone] = useState<boolean>(true);
  const [dg1BCheckDueHours, setDg1BCheckDueHours] = useState<number>(250);

  // DG 02 (500 KVA)
  const [dg2HsdOpening, setDg2HsdOpening] = useState<number>(850);
  const [dg2HsdReceived, setDg2HsdReceived] = useState<number>(0);
  const [dg2HsdConsumption, setDg2HsdConsumption] = useState<number>(0);
  const [dg2KwhOpening, setDg2KwhOpening] = useState<number>(8400);
  const [dg2KwhClosing, setDg2KwhClosing] = useState<number>(8400);
  const [dg2RunHours, setDg2RunHours] = useState<number>(0);
  const [dg2CumulativeHours, setDg2CumulativeHours] = useState<number>(620);
  const [dg2BCheckDone, setDg2BCheckDone] = useState<boolean>(true);
  const [dg2BCheckDueHours, setDg2BCheckDueHours] = useState<number>(380);

  // DEF Details
  const [defStockOpening, setDefStockOpening] = useState<number>(180);
  const [defStockAdded, setDefStockAdded] = useState<number>(40);
  const [defUsed, setDefUsed] = useState<number>(15);

  // Grid Power (EB)
  const [ebKwhOpening, setEbKwhOpening] = useState<number>(120400);
  const [ebKwhClosing, setEbKwhClosing] = useState<number>(124610);
  const [ebKwhMf, setEbKwhMf] = useState<number>(1.0);
  const [ebKvahOpening, setEbKvahOpening] = useState<number>(122800);
  const [ebKvahClosing, setEbKvahClosing] = useState<number>(127100);
  const [ebPowerFactor, setEbPowerFactor] = useState<number>(0.98);

  // Reliability & Water
  const [govtSupplyHours, setGovtSupplyHours] = useState<number>(21.0);
  const [waterOpeningKl, setWaterOpeningKl] = useState<number>(142.5);
  const [waterClosingKl, setWaterClosingKl] = useState<number>(168.0);
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-calculated fields
  const dg1HsdClosing = Math.max(0, dg1HsdOpening + dg1HsdReceived - dg1HsdConsumption);
  const dg1KwhConsumption = Math.max(0, dg1KwhClosing - dg1KwhOpening);
  const dg1UnitPerLitre = dg1HsdConsumption > 0 ? Math.round((dg1KwhConsumption / dg1HsdConsumption) * 10) / 10 : 0;
  const dg1LitrePerHour = dg1RunHours > 0 ? Math.round((dg1HsdConsumption / dg1RunHours) * 10) / 10 : 0;

  const dg2HsdClosing = Math.max(0, dg2HsdOpening + dg2HsdReceived - dg2HsdConsumption);
  const dg2KwhConsumption = Math.max(0, dg2KwhClosing - dg2KwhOpening);

  const defStockClosing = Math.max(0, defStockOpening + defStockAdded - defUsed);

  const ebKwhDiff = Math.max(0, ebKwhClosing - ebKwhOpening);
  const ebUnitsConsumed = Math.round(ebKwhDiff * ebKwhMf);

  const govtSupplyPct = Math.min(100, Math.round((govtSupplyHours / 24) * 1000) / 10);
  const dgSupplyPct = Math.max(0, Math.round((100 - govtSupplyPct) * 10) / 10);

  const waterDiffKl = Math.max(0, Math.round((waterClosingKl - waterOpeningKl) * 10) / 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const logPayload = {
      dg1HsdOpening,
      dg1HsdReceived,
      dg1HsdConsumption,
      dg1HsdClosing,
      dg1KwhOpening,
      dg1KwhClosing,
      dg1KwhConsumption,
      dg1UnitPerLitre,
      dg1LitrePerHour,
      dg1RunHours,
      dg1CumulativeHours,
      dg1BCheckDone,
      dg1BCheckDueHours,

      dg2HsdOpening,
      dg2HsdReceived,
      dg2HsdConsumption,
      dg2HsdClosing,
      dg2KwhOpening,
      dg2KwhClosing,
      dg2KwhConsumption,
      dg2RunHours,
      dg2CumulativeHours,
      dg2BCheckDone,
      dg2BCheckDueHours,

      defStockOpening,
      defStockAdded,
      defUsed,
      defStockClosing,

      ebKwhOpening,
      ebKwhClosing,
      ebKwhDiff,
      ebKwhMf,
      ebKwhUnitsConsumed: ebUnitsConsumed,
      ebKvahOpening,
      ebKvahClosing,
      ebPowerFactor,

      govtSupplyHours,
      govtSupplyPct,
      dgSupplyPct,

      waterOpeningKl,
      waterClosingKl,
      waterConsumptionKl: waterDiffKl,
      remarks: remarks || `EB Units: ${ebUnitsConsumed} kWh (PF: ${ebPowerFactor}), DG-1: ${dg1RunHours} hrs, Water: ${waterDiffKl} KL.`
    };

    addSheetRecord('SHEET_DG_POWER_WATER', logPayload);
    notify('success', 'DG & Energy Report Logged', `Recorded ${ebUnitsConsumed} EB kWh and DG metrics for ${activeWh.code}`);

    setIsSubmitting(false);
    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Daily DG (500 KVA x2), EB Grid & Water Sheet"
        subtitle={`Captures diesel generator fuel levels, power generation efficiency, grid consumption, and municipal water usage for ${activeWh.name}.`}
        categoryBadge="OPS_03_DG_PWR"
        categoryColor="bg-amber-50 text-amber-700 border-amber-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Energy & Utilities' },
          { label: 'DG, EB & Water' }
        ]}
        actions={
          <div className="flex items-center gap-3">
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Grid Reliability</span>
              <div className="text-lg font-black text-emerald-600">{govtSupplyPct}%</div>
            </div>
            <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Power Factor</span>
              <div className={`text-lg font-black ${ebPowerFactor >= 0.95 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {ebPowerFactor}
              </div>
            </div>
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: DG Set 01 (500 KVA) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-600" />
              1. DG NO.- 01 (KVA - 500) Fuel & Power Log
            </h2>
            <span className="text-xs font-mono font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
              DG-1 Active Primary
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Opening (L)</label>
              <input
                type="number"
                value={dg1HsdOpening}
                onChange={(e) => setDg1HsdOpening(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Received (L)</label>
              <input
                type="number"
                value={dg1HsdReceived}
                onChange={(e) => setDg1HsdReceived(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Consumption (L)</label>
              <input
                type="number"
                value={dg1HsdConsumption}
                onChange={(e) => setDg1HsdConsumption(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-rose-700"
              />
            </div>
            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              <span className="text-[10px] font-bold text-amber-800 uppercase">HSD Closing (L)</span>
              <div className="text-base font-black text-amber-900 mt-1">{dg1HsdClosing} L</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-100">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">KWH Opening</label>
              <input
                type="number"
                value={dg1KwhOpening}
                onChange={(e) => setDg1KwhOpening(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">KWH Closing</label>
              <input
                type="number"
                value={dg1KwhClosing}
                onChange={(e) => setDg1KwhClosing(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">DG Run Hours</label>
              <input
                type="number"
                step="0.5"
                value={dg1RunHours}
                onChange={(e) => setDg1RunHours(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Unit / Litre Efficiency</span>
              <div className="text-base font-black text-slate-900 mt-1">{dg1UnitPerLitre} units/L</div>
            </div>
          </div>
        </div>

        {/* Section 2: DG Set 02 (500 KVA - Standby) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-slate-600" />
              2. DG NO.- 02 (KVA - 500) Standby Backup
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              DG-2 Standby
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Opening (L)</label>
              <input
                type="number"
                value={dg2HsdOpening}
                onChange={(e) => setDg2HsdOpening(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Received (L)</label>
              <input
                type="number"
                value={dg2HsdReceived}
                onChange={(e) => setDg2HsdReceived(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">HSD Consumed (L)</label>
              <input
                type="number"
                value={dg2HsdConsumption}
                onChange={(e) => setDg2HsdConsumption(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase">HSD Closing</span>
              <div className="text-base font-black text-slate-900 mt-1">{dg2HsdClosing} L</div>
            </div>
          </div>
        </div>

        {/* Section 3: DEF Fluid Stock & Grid Power (EB) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* DEF Fluid */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Droplet className="w-4 h-4 text-cyan-600" />
              3. DEF Details (Diesel Exhaust Fluid)
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Opening Stock (L)</label>
                <input
                  type="number"
                  value={defStockOpening}
                  onChange={(e) => setDefStockOpening(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Stock Added (L)</label>
                <input
                  type="number"
                  value={defStockAdded}
                  onChange={(e) => setDefStockAdded(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-emerald-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">DEF Used (L)</label>
                <input
                  type="number"
                  value={defUsed}
                  onChange={(e) => setDefUsed(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-rose-700"
                />
              </div>
              <div className="bg-cyan-50 p-2.5 rounded-xl border border-cyan-200">
                <span className="text-[10px] font-bold text-cyan-800 uppercase">Closing Stock</span>
                <div className="text-base font-black text-cyan-900 mt-1">{defStockClosing} L</div>
              </div>
            </div>
          </div>

          {/* Water Consumption */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-teal-600" />
              4. Water Consumption (KL)
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Opening Meter (KL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={waterOpeningKl}
                  onChange={(e) => setWaterOpeningKl(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Closing Meter (KL)</label>
                <input
                  type="number"
                  step="0.1"
                  value={waterClosingKl}
                  onChange={(e) => setWaterClosingKl(Number(e.target.value))}
                  className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>
              <div className="col-span-2 bg-teal-50 p-3 rounded-xl border border-teal-200 flex items-center justify-between">
                <span className="text-xs font-bold text-teal-900">Total Shift Water Used:</span>
                <span className="text-lg font-black text-teal-900">{waterDiffKl} KL</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Grid Power Consumption (EB - Electricity Board) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              5. Grid Power Consumption (State Electricity Board EB Meter)
            </h2>
            <span className="text-xs text-slate-500 font-semibold">
              Units Consumed: <strong className="text-slate-900">{ebUnitsConsumed.toLocaleString()} kWh</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">KWH Opening</label>
              <input
                type="number"
                value={ebKwhOpening}
                onChange={(e) => setEbKwhOpening(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">KWH Closing</label>
              <input
                type="number"
                value={ebKwhClosing}
                onChange={(e) => setEbKwhClosing(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Multiplying Factor (MF)</label>
              <input
                type="number"
                step="0.1"
                value={ebKwhMf}
                onChange={(e) => setEbKwhMf(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Power Factor (PF)</label>
              <input
                type="number"
                step="0.01"
                min="0.70"
                max="1.00"
                value={ebPowerFactor}
                onChange={(e) => setEbPowerFactor(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Govt Supply Run (Hrs)</label>
              <input
                type="number"
                step="0.5"
                max="24"
                value={govtSupplyHours}
                onChange={(e) => setGovtSupplyHours(Number(e.target.value))}
                className="w-full font-bold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Prior 5 Submissions Timeline */}
        <SubmissionHistoryTimeline 
          sheetId="SHEET_DG_POWER_WATER" 
          title="Previous DG, Grid & Water Entries (Last 5)"
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
            {isSubmitting ? 'Saving Energy Log...' : 'Save DG & Energy Record'}
          </button>
        </div>
      </form>
    </div>
  );
};
