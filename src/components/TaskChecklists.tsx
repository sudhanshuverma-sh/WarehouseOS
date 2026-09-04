import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Sparkles, 
  Lock, 
  Calendar, 
  Building2, 
  Layers, 
  Send, 
  Check, 
  AlertTriangle,
  Info,
  Thermometer,
  ShieldCheck,
  FileCheck2
} from 'lucide-react';
import { TaskTemplate, Shift, FieldDefinition, TaskSubmission } from '../types';
import confetti from 'canvas-confetti';
import { PageHeader } from './common/PageHeader';
import { SubmissionHistoryTimeline } from './SubmissionHistoryTimeline';

interface TaskChecklistsProps {
  onBack?: () => void;
}

export const TaskChecklists: React.FC<TaskChecklistsProps> = ({ onBack }) => {
  const { 
    currentUser, 
    warehouses, 
    templates, 
    submissions, 
    selectedWarehouseId, 
    setSelectedWarehouseId,
    selectedShift,
    setSelectedShift,
    currentDate,
    setCurrentDate,
    computeSubmissionId,
    submitTask,
    getSubmissionForTemplate
  } = useApp();

  // Active warehouse resolution
  const activeWarehouseId = (currentUser.role === 'SITE_POC' && currentUser.warehouseId) 
    ? currentUser.warehouseId 
    : (selectedWarehouseId === 'ALL' ? warehouses[0]?.id || 'WH_DEL_01' : selectedWarehouseId);

  const activeWarehouse = warehouses.find(w => w.id === activeWarehouseId);

  // Active templates filter
  const activeTemplates = templates.filter(t => t.isActive);

  // Active template being filled in modal or expanded
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [inspectSubmission, setInspectSubmission] = useState<TaskSubmission | null>(null);

  // Open Form Modal
  const handleOpenForm = (tpl: TaskTemplate) => {
    const existing = getSubmissionForTemplate(activeWarehouseId, tpl.id, selectedShift, currentDate);
    if (existing && existing.status === 'COMPLETED') {
      setInspectSubmission(existing);
      return;
    }

    setSelectedTemplate(tpl);
    setFormData({});
    setNotes('');
    setFormErrors({});
  };

  // Quick Pre-Fill Realistic Test Data
  const handleQuickPreFill = (tpl: TaskTemplate) => {
    const samplePayload: Record<string, any> = {};
    Object.entries(tpl.fieldsConfig).forEach(([key, field]) => {
      if (field.type === 'number') {
        if (key.includes('Fuel')) samplePayload[key] = 75;
        else if (key.includes('Voltage')) samplePayload[key] = 230;
        else if (key.includes('RunHours') || key.includes('Hours')) samplePayload[key] = 1485.5;
        else if (key.includes('guards') || key.includes('Guards')) samplePayload[key] = 8;
        else if (key.includes('Fleet') || key.includes('Count')) samplePayload[key] = 12;
        else samplePayload[key] = 10;
      } else if (field.type === 'temperature') {
        if (key.includes('zoneA') || key.includes('Chiller')) samplePayload[key] = 3.4;
        else if (key.includes('zoneB') || key.includes('Freezer')) samplePayload[key] = -19.5;
        else if (key.includes('coolant')) samplePayload[key] = 72;
        else samplePayload[key] = 4.0;
      } else if (field.type === 'boolean') {
        samplePayload[key] = true;
      } else if (field.type === 'select') {
        samplePayload[key] = field.options ? field.options[0] : '';
      } else if (field.type === 'textarea') {
        samplePayload[key] = 'All routine physical parameters inspected and verified according to standard operational manual.';
      } else {
        samplePayload[key] = 'Normal';
      }
    });

    setFormData(samplePayload);
    setNotes('Verified during regular site physical rounds.');
    setFormErrors({});
  };

  // Handle Input Change
  const handleInputChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Submit Form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    // Validate required fields
    const errors: Record<string, string> = {};
    (Object.entries(selectedTemplate.fieldsConfig) as [string, FieldDefinition][]).forEach(([key, field]) => {
      if (field.required && (formData[key] === undefined || formData[key] === '' || formData[key] === null)) {
        errors[key] = `${field.label} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const res = submitTask({
      templateId: selectedTemplate.id,
      warehouseId: activeWarehouseId,
      shift: selectedShift,
      date: currentDate,
      dataPayload: formData,
      notes
    });

    if (res.success) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
      setSelectedTemplate(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title="Daily Operational Checklists"
        subtitle="Enforces single verified submission per facility, per shift, with automated validation rules and history."
        categoryBadge="OPS_ENGINE"
        categoryColor="bg-indigo-50 text-indigo-700 border-indigo-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Checklists' },
          { label: 'Daily Shifts' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Warehouse Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">Site:</span>
              {currentUser.role === 'SITE_POC' ? (
                <span className="font-bold text-indigo-700">
                  {currentUser.warehouseId} ({activeWarehouse?.city})
                </span>
              ) : (
                <select
                  value={activeWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} - {w.city} ({w.name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Shift Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">Shift:</span>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as Shift)}
                className="bg-transparent font-bold text-amber-700 focus:outline-none cursor-pointer"
              >
                <option value="MORNING">Morning Shift</option>
                <option value="EVENING">Evening Shift</option>
                <option value="NIGHT">Night Shift</option>
              </select>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        }
      />

      {/* Target Doc ID Reference Info Bar */}
      <div className="bg-indigo-900 text-indigo-100 p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner border border-indigo-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-300 shrink-0" />
          <span>
            Target Firestore Document Key Formula: <code className="bg-indigo-950 px-2 py-0.5 rounded text-amber-300 font-mono text-[11px]">SUB_{currentDate.replace(/-/g, '')}_{activeWarehouseId}_&#123;templateId&#125;_{selectedShift}</code>
          </span>
        </div>
        <span className="text-[11px] text-indigo-300">
          Logged in as: <strong className="text-white">{currentUser.fullName}</strong> ({currentUser.role})
        </span>
      </div>

      {/* Template Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {activeTemplates.map((tpl) => {
          const submission = getSubmissionForTemplate(activeWarehouseId, tpl.id, selectedShift, currentDate);
          const isCompleted = submission?.status === 'COMPLETED';
          const expectedDocId = computeSubmissionId(currentDate, activeWarehouseId, tpl.id, selectedShift);
          const fieldCount = Object.keys(tpl.fieldsConfig).length;

          return (
            <div
              key={tpl.id}
              className={`rounded-xl border transition flex flex-col justify-between shadow-sm overflow-hidden ${
                isCompleted 
                  ? 'bg-emerald-50/40 border-emerald-200' 
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {tpl.code}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 ${
                    isCompleted 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {isCompleted ? <Check className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                    {isCompleted ? 'COMPLETED & LOCKED' : 'PENDING ACTION'}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">{tpl.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {tpl.description || 'Standard daily operational verification parameters.'}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Category:</span>
                    <strong className="text-slate-700">{tpl.category}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Configured Fields:</span>
                    <strong className="text-slate-700">{fieldCount} Parameters</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Frequency & Shift:</span>
                    <strong className="text-slate-700">{tpl.frequency} • {tpl.shift}</strong>
                  </div>
                </div>

                {isCompleted && submission && (
                  <div className="mt-3 p-2.5 bg-emerald-100/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-900">
                    <div className="font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      Verified at {new Date(submission.submittedAt).toLocaleTimeString()}
                    </div>
                    <div className="text-emerald-800 mt-0.5">
                      Submitted by {submission.submittedByName || submission.submittedById}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono text-slate-400 truncate max-w-[170px]" title={expectedDocId}>
                  {expectedDocId}
                </div>

                {isCompleted ? (
                  <button
                    onClick={() => handleOpenForm(tpl)}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    View Submission
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenForm(tpl)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Fill Checklist
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Dynamic Form for Filling Checklist */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                    {selectedTemplate.code}
                  </span>
                  <h3 className="font-bold text-sm">{selectedTemplate.title}</h3>
                </div>
                <p className="text-[11px] font-mono text-indigo-300 mt-0.5 truncate max-w-md">
                  Doc ID: {computeSubmissionId(currentDate, activeWarehouseId, selectedTemplate.id, selectedShift)}
                </p>
              </div>

              {/* Quick Auto-Fill button for speedy testing */}
              <button
                type="button"
                onClick={() => handleQuickPreFill(selectedTemplate)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-medium transition"
                title="Populate valid realistic mock inputs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Quick Test Fill
              </button>
            </div>

            {/* Modal Body: Dynamic Fields Form */}
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <span>Facility: <strong className="text-slate-800">{activeWarehouse?.name}</strong></span>
                  <span>Shift: <strong className="text-amber-700">{selectedShift}</strong></span>
                  <span>Date: <strong className="text-slate-800">{currentDate}</strong></span>
                </div>

                {/* Dynamic Fields generated from fieldsConfig */}
                <div className="space-y-4 pt-2">
                  {(Object.entries(selectedTemplate.fieldsConfig) as [string, FieldDefinition][]).map(([key, field]) => {
                    const value = formData[key] ?? '';
                    const error = formErrors[key];

                    // Check warning thresholds
                    let warningMsg = '';
                    if (field.warningThreshold && value !== '') {
                      const numVal = Number(value);
                      if (field.warningThreshold.min !== undefined && numVal < field.warningThreshold.min) {
                        warningMsg = field.warningThreshold.message;
                      }
                      if (field.warningThreshold.max !== undefined && numVal > field.warningThreshold.max) {
                        warningMsg = field.warningThreshold.message;
                      }
                    }

                    return (
                      <div key={key} className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                          <span>
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                          </span>
                          {field.unit && <span className="text-[11px] text-slate-400 font-mono">[{field.unit}]</span>}
                        </label>

                        {/* Text / Number / Temperature */}
                        {(field.type === 'text' || field.type === 'number' || field.type === 'temperature') && (
                          <div className="relative">
                            <input
                              type={field.type === 'text' ? 'text' : 'number'}
                              step={field.type === 'temperature' ? '0.1' : '1'}
                              min={field.min}
                              max={field.max}
                              value={value}
                              onChange={(e) => handleInputChange(key, field.type === 'text' ? e.target.value : parseFloat(e.target.value) || '')}
                              placeholder={field.helperText || `Enter ${field.label}`}
                              className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:outline-none transition ${
                                error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'
                              }`}
                            />
                            {field.type === 'temperature' && (
                              <Thermometer className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                            )}
                          </div>
                        )}

                        {/* Select Dropdown */}
                        {field.type === 'select' && (
                          <select
                            value={value}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:outline-none transition ${
                              error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 bg-white'
                            }`}
                          >
                            <option value="">-- Select Option --</option>
                            {field.options?.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}

                        {/* Boolean Switch / Checkbox */}
                        {field.type === 'boolean' && (
                          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) => handleInputChange(key, e.target.checked)}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <span className="text-xs font-medium text-slate-700">
                              {value ? 'Verified OK & In Compliance' : 'Click to Verify Compliance'}
                            </span>
                          </label>
                        )}

                        {/* Textarea */}
                        {field.type === 'textarea' && (
                          <textarea
                            rows={3}
                            value={value}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            placeholder={field.helperText || 'Enter remarks or site notes...'}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        )}

                        {/* Helper Text & Error Message */}
                        {field.helperText && field.type !== 'textarea' && (
                          <p className="text-[11px] text-slate-400">{field.helperText}</p>
                        )}
                        {error && (
                          <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {error}
                          </p>
                        )}
                        {warningMsg && (
                          <div className="p-2 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {warningMsg}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* General Remarks */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <label className="text-xs font-semibold text-slate-800">
                      Overall Shift Notes / Handover Remarks
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional remarks for central auditing..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Submission History Timeline for this Template */}
                  <div className="pt-2">
                    <SubmissionHistoryTimeline 
                      templateId={selectedTemplate.id}
                      warehouseId={selectedWarehouseId}
                      title="Your Recent Submissions for this Checklist (Last 5)"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit & Lock Checklist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Locked Completed Submission */}
      {inspectSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-emerald-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                <div>
                  <h3 className="font-bold text-sm">Verified Checklist Record</h3>
                  <p className="text-[10px] font-mono text-emerald-200">{inspectSubmission.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setInspectSubmission(null)}
                className="text-emerald-200 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Warehouse</span>
                  <span className="font-bold text-slate-800">{inspectSubmission.warehouseId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Shift & Date</span>
                  <span className="font-bold text-slate-800">{inspectSubmission.shift} • {inspectSubmission.submissionDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Logged By</span>
                  <span className="font-bold text-slate-800">{inspectSubmission.submittedByName || inspectSubmission.submittedById}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Logged At</span>
                  <span className="font-bold text-slate-800">{new Date(inspectSubmission.submittedAt).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Captured Dynamic Parameters:
                </h4>
                <div className="bg-slate-900 text-slate-100 p-3.5 rounded-lg text-xs font-mono overflow-x-auto">
                  <pre>{JSON.stringify(inspectSubmission.dataPayload, null, 2)}</pre>
                </div>
              </div>

              {inspectSubmission.notes && (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                  <strong className="text-slate-700 block mb-0.5">Remarks:</strong>
                  <p className="text-slate-600">{inspectSubmission.notes}</p>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectSubmission(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
