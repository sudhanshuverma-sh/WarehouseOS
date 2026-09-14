import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Table, 
  Layers, 
  Code, 
  Sparkles, 
  HelpCircle,
  X,
  FileText
} from 'lucide-react';
import { FieldDefinition, FieldType, OperationalSheetDef, Shift } from '../types';

interface CreateNewFormModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onFormCreated?: (newSheetId: string) => void;
}

export const CreateNewFormModal: React.FC<CreateNewFormModalProps> = ({ isOpen = true, onClose, onFormCreated }) => {
  const { addOperationalSheet, operationalSheets } = useApp();

  const [title, setTitle] = useState('');
  const [code, setCode] = useState(`OPS_${String(operationalSheets.length + 1).padStart(2, '0')}_CUST`);
  const [category, setCategory] = useState<'Daily Operations' | 'Energy & Fuel' | 'MHE & Fleet' | 'EHS & Facilities' | 'Manpower' | 'Custom Forms'>('Custom Forms');
  const [frequency, setFrequency] = useState('DAILY');
  const [defaultShift, setDefaultShift] = useState<Shift>('MORNING');
  const [tableTarget, setTableTarget] = useState(`AS_Custom_${Date.now().toString().slice(-4)}_Log`);
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('ClipboardCheck');

  // Custom Form Fields List
  const [fields, setFields] = useState<FieldDefinition[]>([
    {
      key: 'equipmentStatusPct',
      label: 'Overall Equipment Availability',
      type: 'percentage',
      required: true,
      min: 0,
      max: 100,
      defaultValue: 100,
      isCritical: true,
      helperText: 'Enter 0-100% (below 100% triggers mandatory deviation remark)'
    },
    {
      key: 'inspectionDone',
      label: 'Visual Safety Inspection',
      type: 'select',
      required: true,
      options: ['Done', 'Not Done', 'NA'],
      defaultValue: 'Done'
    },
    {
      key: 'readingValue',
      label: 'Main Meter Reading / Pressure Bar',
      type: 'number',
      required: false,
      unit: 'Units / Bar',
      helperText: 'Current reading value'
    },
    {
      key: 'remarks',
      label: 'Operational Remarks & Hold-ups',
      type: 'textarea',
      required: false,
      helperText: 'Detail any abnormalities or maintenance needs'
    }
  ]);

  const handleAddField = () => {
    const nextIdx = fields.length + 1;
    const newField: FieldDefinition = {
      key: `field_${nextIdx}`,
      label: `New Field ${nextIdx}`,
      type: 'number',
      required: false,
      defaultValue: '',
      helperText: ''
    };
    setFields([...fields, newField]);
  };

  const handleRemoveField = (index: number) => {
    if (fields.length <= 1) {
      alert('Form must have at least one field.');
      return;
    }
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, key: keyof FieldDefinition, value: any) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    // auto update key if label changed
    if (key === 'label') {
      const generatedKey = value.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '');
      if (generatedKey) {
        updated[index].key = generatedKey;
      }
    }
    setFields(updated);
  };

  const handleCreateForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Please enter a Form Title.');
      return;
    }

    const sheetId = `SHEET_${code.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;

    const newSheet: OperationalSheetDef = {
      id: sheetId,
      code: code.trim().toUpperCase(),
      title: title.trim(),
      category,
      frequency,
      defaultShift,
      tableTarget: tableTarget.trim() || `AS_${code}_Log`,
      description: description.trim() || `Custom operational sheet for ${title}`,
      fieldsCount: fields.length + 4, // fields + standard audit columns
      iconName,
      isCustom: true,
      fieldsConfig: fields
    };

    void addOperationalSheet(newSheet).then(res => {
      if (!res.ok) return; // the reason is already on screen; the builder stays open
      if (onFormCreated) {
        onFormCreated(sheetId);
      }
      if (onClose) {
        onClose();
      }
    });
  };

  const loadPresetTemplate = (preset: 'cold' | 'battery' | 'safety' | 'audit') => {
    if (preset === 'cold') {
      setTitle('Chiller Air Curtain & Defrost Log');
      setDescription('Hourly monitoring of cold room air velocity, door seals, and defrost drain heat tape.');
      setCategory('Daily Operations');
      setFields([
        { key: 'chillerTemp', label: 'Chiller Temp (°C)', type: 'temperature', required: true, defaultValue: 3.5, isCritical: true },
        { key: 'freezerTemp', label: 'Deep Freezer Temp (°C)', type: 'temperature', required: true, defaultValue: -18.0, isCritical: true },
        { key: 'airCurtainVelocity', label: 'Air Curtain Velocity (m/s)', type: 'number', required: true, defaultValue: 8.5 },
        { key: 'doorSealCondition', label: 'Magnetic Door Gasket Seal', type: 'select', required: true, options: ['Good', 'Damaged', 'Ice Build-up'] },
        { key: 'defrostDrainClear', label: 'Defrost Drain Line Clear', type: 'select', required: true, options: ['Done', 'Blocked'] }
      ]);
    } else if (preset === 'battery') {
      setTitle('MHE Battery Charging Station Log');
      setDescription('Pre-shift battery water gravity check, charger DC voltage, and ventilation exhaust fan status.');
      setCategory('MHE & Fleet');
      setFields([
        { key: 'stationAvailability', label: 'Charging Bays Operational (%)', type: 'percentage', required: true, defaultValue: 100 },
        { key: 'waterSpecificGravity', label: 'Electrolyte Specific Gravity (SG)', type: 'number', required: true, defaultValue: 1.28 },
        { key: 'exhaustBlowerRunning', label: 'Exhaust Hydrogen Blower Active', type: 'select', required: true, options: ['Running', 'Tripped / Off'] },
        { key: 'eyewashStationChecked', label: 'Emergency Eye-Wash Station Tested', type: 'select', required: true, options: ['Done', 'Not Done'] }
      ]);
    } else if (preset === 'safety') {
      setTitle('Dock Leveler & Shutter Door Safety Sheet');
      setDescription('Daily hydraulic lip extension, bumper rubber pads, safety wheel chocks, and sectional door cable checks.');
      setCategory('EHS & Facilities');
      setFields([
        { key: 'dockAvailability', label: 'Dock Leveler Availability (%)', type: 'percentage', required: true, defaultValue: 100 },
        { key: 'wheelChocksAvailable', label: 'Wheel Chocks in Position', type: 'select', required: true, options: ['Yes', 'No'] },
        { key: 'hydraulicLipWorking', label: 'Lip Extension Cylinder Smooth', type: 'select', required: true, options: ['Pass', 'Fail'] },
        { key: 'dockShelterSeals', label: 'Dock Shelter Side Pads Sealed', type: 'select', required: true, options: ['Good', 'Torn / Worn'] }
      ]);
    } else if (preset === 'audit') {
      setTitle('Warehouse 5S & Gemba Walk Audit');
      setDescription('Shift-wise housekeeping score, aisle yellow-line markings, trash compactor status, and pallet stacking safety.');
      setCategory('Daily Operations');
      setFields([
        { key: 'aisleCleanlinessScore', label: 'Aisle 5S Cleanliness Score (1-10)', type: 'number', required: true, min: 1, max: 10, defaultValue: 9 },
        { key: 'palletStackHeightSafe', label: 'Pallet Stacking Height Within Limit (<5m)', type: 'select', required: true, options: ['Compliant', 'Violation Observed'] },
        { key: 'emergencyExitsClear', label: '100% Emergency Exits Unobstructed', type: 'select', required: true, options: ['Yes - All Clear', 'Blocked by Pallets'], isCritical: true },
        { key: 'supervisorGembaNotes', label: 'Gemba Observations & Action Items', type: 'textarea', required: false }
      ]);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 font-sans animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 uppercase tracking-wider">
              Form & Sheet Builder
            </span>
            <span className="text-xs text-slate-400">Dynamic Firestore / AppSheet Engine</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Create New Operational Sheet / Form</h1>
          <p className="text-xs text-slate-500">
            Define custom field types, critical alert rules, target database tables, and deploy immediately to site POCs.
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Visual Guide: How Adding Any Future Sheet Works */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs">
        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
          <HelpCircle className="w-4 h-4 text-teal-600" />
          How Adding Any Future Sheet Works in this System (3 Easy Steps)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">1</span>
              Name & Categorize
            </div>
            <p className="text-slate-500 leading-relaxed">
              Enter Title (e.g. <em>Washing & Sanitization</em>), Code (e.g. <em>OPS_16_WASH</em>), Category, and Target Table.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">2</span>
              Configure Field Columns
            </div>
            <p className="text-slate-500 leading-relaxed">
              Add columns with data types (Numbers, Percentages, Checkboxes, Dropdowns, Temperatures) & critical risk flags.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">3</span>
              Instant Deployment
            </div>
            <p className="text-slate-500 leading-relaxed">
              Click <strong>"Publish & Deploy Form"</strong>. The new form immediately appears on all POC mobile screens & in the Database Explorer.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Template Presets */}
      <div className="bg-gradient-to-r from-teal-900 to-slate-900 rounded-2xl p-4 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-bold">Start with a pre-configured warehouse schema:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadPresetTemplate('cold')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-teal-200 rounded-lg text-xs font-semibold transition border border-white/10"
          >
            Cold Chain Defrost
          </button>
          <button
            type="button"
            onClick={() => loadPresetTemplate('battery')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-teal-200 rounded-lg text-xs font-semibold transition border border-white/10"
          >
            Battery Charging Bay
          </button>
          <button
            type="button"
            onClick={() => loadPresetTemplate('safety')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-teal-200 rounded-lg text-xs font-semibold transition border border-white/10"
          >
            Dock Levelers
          </button>
          <button
            type="button"
            onClick={() => loadPresetTemplate('audit')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-teal-200 rounded-lg text-xs font-semibold transition border border-white/10"
          >
            5S Gemba Walk
          </button>
        </div>
      </div>

      <form onSubmit={handleCreateForm} className="space-y-6">
        {/* SECTION 1: Basic Form Meta */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">1</span>
            Sheet Metadata & Routing
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sheet Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Daily Inverter Battery Bank Inspection"
                className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sheet Code *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. OPS_16_INVERTER"
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="Daily Operations">Daily Operations</option>
                <option value="Energy & Fuel">Energy & Fuel</option>
                <option value="MHE & Fleet">MHE & Fleet</option>
                <option value="EHS & Facilities">EHS & Facilities</option>
                <option value="Manpower">Manpower</option>
                <option value="Custom Forms">Custom Forms</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Target Database Table</label>
              <input
                type="text"
                value={tableTarget}
                onChange={(e) => setTableTarget(e.target.value)}
                placeholder="e.g. AS_Inverter_Log"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Logging Frequency</label>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="e.g. DAILY / PER SHIFT"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Default Shift</label>
              <select
                value={defaultShift}
                onChange={(e) => setDefaultShift(e.target.value as Shift)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="MORNING">Morning (06:00 - 14:00)</option>
                <option value="EVENING">Evening (14:00 - 22:00)</option>
                <option value="NIGHT">Night (22:00 - 06:00)</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what operational checks this sheet validates..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Custom Columns / Fields Builder */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">2</span>
              Form Fields & Validation Rules ({fields.length})
            </h2>

            <button
              type="button"
              onClick={handleAddField}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-700 uppercase">
                    Field #{idx + 1}: <code className="text-teal-700">{field.key}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveField(idx)}
                    className="text-rose-500 hover:text-rose-700 p-1 text-xs font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Field Label *</label>
                    <input
                      type="text"
                      required
                      value={field.label}
                      onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                      placeholder="e.g. Battery Bus Voltage (V)"
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Data Type</label>
                    <select
                      value={field.type}
                      onChange={(e) => handleFieldChange(idx, 'type', e.target.value as FieldType)}
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-semibold"
                    >
                      <option value="percentage">Percentage (0-100%)</option>
                      <option value="number">Numeric / Meter Value</option>
                      <option value="text">Short Text</option>
                      <option value="select">Dropdown Options</option>
                      <option value="temperature">Temperature (°C)</option>
                      <option value="boolean">Yes / No (Boolean)</option>
                      <option value="textarea">Multi-line Textarea</option>
                      <option value="date">Date</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Default Value / Unit</label>
                    <input
                      type="text"
                      value={field.unit || field.defaultValue || ''}
                      onChange={(e) => handleFieldChange(idx, 'defaultValue', e.target.value)}
                      placeholder="e.g. 100% or °C"
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300"
                    />
                  </div>

                  {field.type === 'select' && (
                    <div className="sm:col-span-3 space-y-1">
                      <label className="font-semibold text-slate-700">Dropdown Options (Comma separated)</label>
                      <input
                        type="text"
                        value={(field.options || []).join(', ')}
                        onChange={(e) => handleFieldChange(idx, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        placeholder="e.g. Pass, Fail, Warning, NA"
                        className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-mono text-[11px]"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-3 flex flex-wrap gap-4 pt-1 items-center">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span>Mandatory Field</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-rose-700 font-medium">
                      <input
                        type="checkbox"
                        checked={field.isCritical || false}
                        onChange={(e) => handleFieldChange(idx, 'isCritical', e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      <span>Flag as Critical Safety / Cold Chain Risk</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex justify-end gap-3 pt-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-teal-600/20 transition flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Publish & Deploy Form
          </button>
        </div>
      </form>
    </div>
  );
};
