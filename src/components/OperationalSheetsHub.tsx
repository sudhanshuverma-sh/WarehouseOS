import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ClipboardCheck, 
  Fuel, 
  Zap, 
  Users, 
  Truck, 
  Cpu, 
  BatteryCharging, 
  ThermometerSnowflake, 
  Sliders, 
  ShieldAlert, 
  Wind, 
  Droplet, 
  Layers, 
  ArrowUpDown, 
  Lock,
  Search,
  CheckCircle2,
  Table,
  ArrowRight,
  PlusCircle,
  Database,
  Eye
} from 'lucide-react';
import { OperationalSheetDef } from '../types';
import { PageHeader } from './common/PageHeader';

interface OperationalSheetsHubProps {
  onSelectSheet: (sheetId: string) => void;
  onOpenCreateForm?: () => void;
  onOpenDatabase?: (sheetId?: string) => void;
  onBack?: () => void;
}

export const OperationalSheetsHub: React.FC<OperationalSheetsHubProps> = ({ 
  onSelectSheet, 
  onOpenCreateForm,
  onOpenDatabase,
  onBack
}) => {
  const { operationalSheets, activeSheetId, setActiveSheetId } = useApp();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const iconsMap: Record<string, React.ReactNode> = {
    ClipboardCheck: <ClipboardCheck className="w-5 h-5 text-teal-600" />,
    Fuel: <Fuel className="w-5 h-5 text-amber-600" />,
    Zap: <Zap className="w-5 h-5 text-amber-500" />,
    Users: <Users className="w-5 h-5 text-indigo-600" />,
    Truck: <Truck className="w-5 h-5 text-blue-600" />,
    Cpu: <Cpu className="w-5 h-5 text-emerald-600" />,
    BatteryCharging: <BatteryCharging className="w-5 h-5 text-emerald-500" />,
    ThermometerSnowflake: <ThermometerSnowflake className="w-5 h-5 text-cyan-600" />,
    Sliders: <Sliders className="w-5 h-5 text-purple-600" />,
    ShieldAlert: <ShieldAlert className="w-5 h-5 text-rose-600" />,
    Wind: <Wind className="w-5 h-5 text-teal-500" />,
    Droplet: <Droplet className="w-5 h-5 text-sky-600" />,
    Layers: <Layers className="w-5 h-5 text-orange-600" />,
    ArrowUpDown: <ArrowUpDown className="w-5 h-5 text-indigo-500" />,
    Lock: <Lock className="w-5 h-5 text-slate-700" />
  };

  const categories = ['ALL', 'Daily Operations', 'Energy & Fuel', 'MHE & Fleet', 'EHS & Facilities', 'Manpower', 'Custom Forms'];

  const filteredSheets = operationalSheets.filter(sheet => {
    const matchesSearch = sheet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          sheet.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          sheet.tableTarget.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || sheet.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleLaunchSheet = (sheet: OperationalSheetDef) => {
    setActiveSheetId(sheet.id);
    onSelectSheet(sheet.id);
  };

  const handleViewDatabase = (sheet: OperationalSheetDef) => {
    setActiveSheetId(sheet.id);
    if (onOpenDatabase) {
      onOpenDatabase(sheet.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Warehouse Operations Sheets Hub"
        subtitle="Replaces fragmented multi-tab Google spreadsheets with structured digital forms, RBAC validation, and instant database archiving."
        categoryBadge={`${operationalSheets.length} Sheets System`}
        categoryColor="bg-teal-50 text-teal-700 border-teal-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Operations' },
          { label: 'Sheets Hub' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onOpenCreateForm && (
              <button
                onClick={onOpenCreateForm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Add New Form</span>
              </button>
            )}

            {onOpenDatabase && (
              <button
                onClick={() => onOpenDatabase()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Database Viewer</span>
              </button>
            )}
          </div>
        }
      />

      {/* Category Pills & Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sheet, target table..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 w-56"
          />
        </div>
      </div>

      {/* Sheets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSheets.map((sheet, index) => {
          const isSelected = activeSheetId === sheet.id;

          return (
            <div
              key={sheet.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between ${
                isSelected ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                    {iconsMap[sheet.iconName] || <Table className="w-5 h-5 text-slate-700" />}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {sheet.code}
                    </span>
                    {sheet.isCustom && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                        Custom
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800">
                      {sheet.fieldsCount} cols
                    </span>
                  </div>
                </div>

                <h3 className="font-bold text-slate-900 text-sm">{sheet.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {sheet.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Table:</span>
                    <code className="text-teal-700 font-mono font-bold">{sheet.tableTarget}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Frequency:</span>
                    <span className="font-semibold text-slate-800">{sheet.frequency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="font-semibold text-slate-800">{sheet.category}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleViewDatabase(sheet)}
                  className="px-2.5 py-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-semibold rounded-lg transition flex items-center gap-1"
                  title="View recorded data in database explorer"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  View DB
                </button>

                <button
                  type="button"
                  onClick={() => handleLaunchSheet(sheet)}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm"
                >
                  Open Sheet Form
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Create New Form Quick Card */}
        {onOpenCreateForm && (
          <div
            onClick={onOpenCreateForm}
            className="bg-slate-50 hover:bg-teal-50/50 border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-2xl p-6 transition flex flex-col items-center justify-center text-center cursor-pointer group min-h-[240px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-white group-hover:bg-teal-600 text-slate-400 group-hover:text-white flex items-center justify-center transition shadow-sm mb-3">
              <PlusCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm group-hover:text-teal-700">
              + Add Another Operational Form
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mt-1">
              Build custom form schemas with custom data types, validation thresholds, and Firestore table targets.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
