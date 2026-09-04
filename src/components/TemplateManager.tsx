import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FileText, 
  Plus, 
  Settings, 
  Eye, 
  Layers, 
  CheckCircle2, 
  Clock, 
  Sliders,
  X,
  PlusCircle,
  Trash2
} from 'lucide-react';
import { TaskTemplate, FieldDefinition, FieldType } from '../types';
import { PageHeader } from './common/PageHeader';

interface TemplateManagerProps {
  onBack?: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ onBack }) => {
  const { templates, addTemplate, toggleTemplateStatus, currentUser } = useApp();

  const [selectedTemplateForSchema, setSelectedTemplateForSchema] = useState<TaskTemplate | null>(null);
  const [isAddTemplateModalOpen, setIsAddTemplateModalOpen] = useState(false);

  // New Template Form State
  const [code, setCode] = useState('CHK_HVAC_01');
  const [title, setTitle] = useState('Central HVAC & Air Handling Unit (AHU) Check');
  const [category, setCategory] = useState('Facility & Climate');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ADHOC'>('DAILY');
  const [shift, setShift] = useState<'MORNING' | 'EVENING' | 'NIGHT'>('MORNING');
  const [description, setDescription] = useState('Verification of AHU fan belt tension, filter differential pressure, and chilled water valve actuation.');
  
  const [fields, setFields] = useState<FieldDefinition[]>([
    {
      key: 'ahuStaticPressure',
      label: 'AHU Static Differential Pressure (mm WC)',
      type: 'number',
      required: true,
      unit: 'mmWC',
      min: 10,
      max: 100
    },
    {
      key: 'supplyAirTemperature',
      label: 'Supply Duct Air Temperature',
      type: 'temperature',
      required: true,
      unit: '°C',
      min: 12,
      max: 26
    },
    {
      key: 'fanBeltVisualCheck',
      label: 'V-Belt Tension & Wear Inspected OK',
      type: 'boolean',
      required: true
    }
  ]);

  const handleAddField = () => {
    const newKey = `param_${Date.now().toString().slice(-4)}`;
    setFields(prev => [
      ...prev,
      {
        key: newKey,
        label: 'New Checkpoint Parameter',
        type: 'text',
        required: true
      }
    ]);
  };

  const handleRemoveField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, key: keyof FieldDefinition, value: any) => {
    setFields(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !title) return;

    const fieldsConfig: Record<string, FieldDefinition> = {};
    fields.forEach(f => {
      fieldsConfig[f.key] = f;
    });

    addTemplate({
      id: code,
      code,
      title,
      category,
      frequency,
      shift,
      isActive: true,
      description,
      fieldsConfig
    });

    setIsAddTemplateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Dynamic Task Template Schemas"
        subtitle="Manage JSON schemas, validation rules, field definitions, and schedule frequencies for automated checklist generation."
        categoryBadge={`${templates.length} Schemas`}
        categoryColor="bg-indigo-50 text-indigo-700 border-indigo-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'System Setup' },
          { label: 'Template Schemas' }
        ]}
        actions={
          currentUser.role === 'SUPER_ADMIN' ? (
            <button
              onClick={() => setIsAddTemplateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Template</span>
            </button>
          ) : undefined
        }
      />

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {templates.map(tpl => {
          const fieldsCount = Object.keys(tpl.fieldsConfig).length;

          return (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-indigo-300 hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-indigo-700 border border-slate-200">
                    {tpl.code}
                  </span>
                  <button
                    onClick={() => toggleTemplateStatus(tpl.id)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition ${
                      tpl.isActive 
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {tpl.isActive ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">{tpl.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {tpl.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Category:</span>
                    <strong className="text-slate-800">{tpl.category}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Default Shift:</span>
                    <strong className="text-amber-700 font-semibold">{tpl.shift}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Frequency:</span>
                    <strong className="text-slate-800">{tpl.frequency}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Configured Dynamic Fields:</span>
                    <strong className="text-indigo-700 font-bold">{fieldsCount} Fields</strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400">Doc ID: {tpl.id}</span>
                <button
                  onClick={() => setSelectedTemplateForSchema(tpl)}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition flex items-center gap-1"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  View Schema
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: View fieldsConfig JSON Schema */}
      {selectedTemplateForSchema && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">{selectedTemplateForSchema.title}</h3>
                <p className="text-[10px] font-mono text-indigo-300">
                  Collection: task_templates/{selectedTemplateForSchema.id}
                </p>
              </div>
              <button 
                onClick={() => setSelectedTemplateForSchema(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div>
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">
                  Configured Field Keys & Rules ({Object.keys(selectedTemplateForSchema.fieldsConfig).length})
                </h4>
                <div className="space-y-2">
                  {(Object.entries(selectedTemplateForSchema.fieldsConfig) as [string, FieldDefinition][]).map(([key, f]) => (
                    <div key={key} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-indigo-700">{key}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono uppercase">
                          {f.type}
                        </span>
                      </div>
                      <div className="text-slate-800 font-medium mt-1">{f.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Required: <strong>{f.required ? 'Yes' : 'No'}</strong></span>
                        {f.unit && <span>Unit: <strong>{f.unit}</strong></span>}
                        {f.min !== undefined && <span>Min: <strong>{f.min}</strong></span>}
                        {f.max !== undefined && <span>Max: <strong>{f.max}</strong></span>}
                      </div>
                      {f.warningThreshold && (
                        <div className="mt-1.5 text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                          Threshold Warning: {f.warningThreshold.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                  Raw Firestore Schema Map:
                </h4>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedTemplateForSchema.fieldsConfig, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedTemplateForSchema(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Template */}
      {isAddTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Define New Checklist Template</h3>
              <button 
                onClick={() => setIsAddTemplateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Template Code (Doc ID) *</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Category *</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Template Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Shift *</label>
                    <select
                      value={shift}
                      onChange={(e) => setShift(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="MORNING">Morning</option>
                      <option value="EVENING">Evening</option>
                      <option value="NIGHT">Night</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Frequency *</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="DAILY">DAILY</option>
                      <option value="WEEKLY">WEEKLY</option>
                      <option value="MONTHLY">MONTHLY</option>
                    </select>
                  </div>
                </div>

                {/* Dynamic Fields Builder */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Dynamic Form Fields ({fields.length})
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-semibold"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Add Field
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {fields.map((f, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Key (Code identifier)</span>
                            <input
                              type="text"
                              value={f.key}
                              onChange={(e) => handleFieldChange(i, 'key', e.target.value)}
                              className="w-full px-2 py-1 bg-white rounded border border-slate-300 font-mono text-[11px]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Field Label</span>
                            <input
                              type="text"
                              value={f.label}
                              onChange={(e) => handleFieldChange(i, 'label', e.target.value)}
                              className="w-full px-2 py-1 bg-white rounded border border-slate-300 text-[11px]"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <span className="text-[10px] text-slate-400 block">Type</span>
                              <select
                                value={f.type}
                                onChange={(e) => handleFieldChange(i, 'type', e.target.value as FieldType)}
                                className="w-full px-2 py-1 bg-white rounded border border-slate-300 text-[11px]"
                              >
                                <option value="number">Number</option>
                                <option value="text">Text</option>
                                <option value="boolean">Boolean (Yes/No)</option>
                                <option value="temperature">Temperature</option>
                                <option value="textarea">Textarea</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveField(i)}
                              className="text-rose-500 hover:text-rose-700 p-1 mt-4"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsAddTemplateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
