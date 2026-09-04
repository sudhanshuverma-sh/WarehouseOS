import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  Database, 
  FileCode, 
  CheckCircle2, 
  Lock, 
  Layers, 
  Copy, 
  Check,
  Table,
  Cpu
} from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'collections' | 'sheets' | 'rules' | 'idempotency'>('collections');

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const securityRulesCode = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to extract user role and warehouse scope
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    function isSuperAdmin() {
      return request.auth != null && getUserData().role == 'SUPER_ADMIN';
    }
    
    function isAssignedPoc(warehouseId) {
      return request.auth != null && 
             getUserData().role == 'SITE_POC' && 
             getUserData().warehouseId == warehouseId;
    }

    // 1. Warehouses Collection (Master Facility Registry)
    match /warehouses/{warehouseId} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin();
    }

    // 2. Users Collection (RBAC Profiles)
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if isSuperAdmin();
    }

    // 3. Daily Site Logs (AS_DailyLog - 43 columns)
    match /daily_site_logs/{logId} {
      allow read: if request.auth != null && (
        isSuperAdmin() || resource.data.site == getUserData().warehouseId
      );
      allow create: if request.auth != null && (
        isSuperAdmin() || isAssignedPoc(request.resource.data.site)
      );
      allow update, delete: if isSuperAdmin();
    }

    // 4. Ongoing Site Activities (AS_OngoingActivity child records)
    match /ongoing_activities/{activityId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && (
        isSuperAdmin() || isAssignedPoc(request.resource.data.warehouseId)
      );
      allow delete: if isSuperAdmin();
    }

    // 5. Diesel & Fuel Procurement Logs
    match /diesel_logs/{dieselLogId} {
      allow read: if request.auth != null && (
        isSuperAdmin() || resource.data.warehouseId == getUserData().warehouseId
      );
      allow create, update: if request.auth != null && (
        isSuperAdmin() || isAssignedPoc(request.resource.data.warehouseId)
      );
      allow delete: if isSuperAdmin();
    }

    // 6. Generic Checklist Submissions
    match /task_submissions/{submissionId} {
      allow read: if request.auth != null && (
        isSuperAdmin() || resource.data.warehouseId == getUserData().warehouseId
      );
      allow create: if request.auth != null && (
        isSuperAdmin() || isAssignedPoc(request.resource.data.warehouseId)
      );
      allow update: if request.auth != null && (
        isSuperAdmin() || isAssignedPoc(resource.data.warehouseId)
      );
      allow delete: if isSuperAdmin();
    }
  }
}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-700 overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Backend Architecture & 15-Sheet Ecosystem</h3>
              <p className="text-xs text-slate-400">Firebase Firestore Schema, AS_DailyLog Model & RBAC Policies</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-5 pt-2 gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-4 py-2.5 font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'collections'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Firestore Collections & Tables
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`px-4 py-2.5 font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sheets'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-4 h-4" />
            15 Operational Sheets Schema
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2.5 font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'rules'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Security Rules (RBAC)
          </button>
          <button
            onClick={() => setActiveTab('idempotency')}
            className={`px-4 py-2.5 font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'idempotency'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            Deterministic Doc IDs
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {activeTab === 'collections' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. AS_DailyLog */}
                <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-teal-400">1. /daily_site_logs (AS_DailyLog)</span>
                    <span className="text-[10px] bg-teal-950 text-teal-300 px-1.5 py-0.5 rounded border border-teal-800 font-mono">
                      43 Columns • Doc ID: LOG_&#123;YYYYMMDD&#125;_&#123;WH&#125;_&#123;UID&#125;
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Central AppSheet daily operational model: UPS, DG, LT Panel, Cold Room (critical), HVLS, Water Coolers, Freezers GGP (critical), Door Buzzer, RT, BOPT, Stackers, VRC, Routine MTS/Lights/Air/Gemba, PM planned vs completed, executive highlights, and calculated worst status.
                  </p>
                </div>

                {/* 2. AS_OngoingActivity */}
                <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-400">2. /ongoing_activities (AS_OngoingActivity)</span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800 font-mono">
                      Doc ID: ACT_&#123;logId&#125;_&#123;idx&#125;
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Child table tracking action items: work description, owner, status (Open, In Progress, Completed, Blocked), closing ETA, barrier/hold-up, cost, and manhours.
                  </p>
                </div>

                {/* 3. Diesel Logs */}
                <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-400">3. /diesel_logs (Diesel Procurement)</span>
                    <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800 font-mono">
                      Doc ID: DSL_&#123;warehouseId&#125;_&#123;UID&#125;
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Fuel inward reconciliation: vendor, ratePerLitre, orderQty vs deliveredQty, finalAmount, POD & QR image attachments, automated discrepancy detection.
                  </p>
                </div>

                {/* 4. Warehouses */}
                <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-300">4. /warehouses (Master Registry)</span>
                    <span className="text-[10px] bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
                      Doc ID: WH_&#123;CITY&#125;_01
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Facility code, costCenter, operational zone, legal entity, capacity, and assigned Site POC email.
                  </p>
                </div>

                {/* 5. Users */}
                <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-400">5. /users (RBAC Identity)</span>
                    <span className="text-[10px] bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800 font-mono">
                      Doc ID: &#123;auth.uid&#125;
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Maps Firebase Auth UID to user role (SUPER_ADMIN vs SITE_POC) and locked warehouseId scope.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sheets' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-3">
                <h4 className="font-bold text-teal-400 text-sm">
                  15 Operational Sheets System Mapping
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-teal-400 block font-sans">01. Daily Site Activity (AS_DailyLog)</strong>
                    <span className="text-slate-400">43 cols • Daily • Facility Health & Deviations</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-amber-400 block font-sans">02. Diesel Procurement (diesel_logs)</strong>
                    <span className="text-slate-400">18 cols • Inward Event • Fuel Discrepancy & POD</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-amber-300 block font-sans">03. EB / DG Power Log (AS_EBDG_Log)</strong>
                    <span className="text-slate-400">16 cols • Daily / Shift • Meter Readings & Run Hours</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-indigo-400 block font-sans">04. Attendance & Shift Strength</strong>
                    <span className="text-slate-400">14 cols • Per Shift • Headcount & Overtime Hours</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-blue-400 block font-sans">05. RT Reach Truck Maintenance</strong>
                    <span className="text-slate-400">15 cols • Daily • Mast, Hydraulics & Battery V</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-emerald-400 block font-sans">06. BOPT Pallet Truck Log</strong>
                    <span className="text-slate-400">12 cols • Daily • Tiller Arm & Wheel Health</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-teal-300 block font-sans">07. UPS & Battery Bank</strong>
                    <span className="text-slate-400">14 cols • Daily • Load % & Electrolyte Levels</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-cyan-400 block font-sans">08. Cold Room & Freezer Chain</strong>
                    <span className="text-slate-400">18 cols • Hourly/Shift • Core Temp & Defrost Log</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-purple-400 block font-sans">09. LT Panel & Capacitor Bank</strong>
                    <span className="text-slate-400">14 cols • Daily • Power Factor & Breaker Trip Logs</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-rose-400 block font-sans">10. Fire Safety & Hydrant System</strong>
                    <span className="text-slate-400">16 cols • Daily / Weekly • Pressure Bar & Jockey Pump</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-teal-400 block font-sans">11. HVLS Ventilation System</strong>
                    <span className="text-slate-400">11 cols • Daily • VFD Hz & Blade Clearance</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-sky-400 block font-sans">12. Water Coolers & RO Plant</strong>
                    <span className="text-slate-400">12 cols • Daily • TDS Levels & Filter Health</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-orange-400 block font-sans">13. Stackers & Material Hoists</strong>
                    <span className="text-slate-400">12 cols • Daily • Cable Tension & Emergency Stop</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-indigo-400 block font-sans">14. Vertical Reciprocating Conveyor (VRC)</strong>
                    <span className="text-slate-400">15 cols • Daily • Interlocks & Limit Switches</span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <strong className="text-slate-300 block font-sans">15. Security & Gate Inward Log</strong>
                    <span className="text-slate-400">16 cols • Continuous • Vehicle In/Out & Seal Verification</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">
                  Production Firestore Security Rules (<code className="text-teal-400">firestore.rules</code>)
                </span>
                <button
                  onClick={() => handleCopy(securityRulesCode, 'rules')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 flex items-center gap-1 text-[11px]"
                >
                  {copiedSection === 'rules' ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSection === 'rules' ? 'Copied' : 'Copy Rules'}
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl font-mono text-[11px] text-slate-300 border border-slate-800 overflow-x-auto leading-relaxed">
                {securityRulesCode}
              </pre>
            </div>
          )}

          {activeTab === 'idempotency' && (
            <div className="space-y-4">
              <div className="p-4 bg-teal-950/60 border border-teal-800 rounded-xl space-y-3">
                <h4 className="font-bold text-teal-300 text-sm">
                  Deterministic Unique Key Formulas
                </h4>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Daily Site Activity Doc ID:</span>
                    <span className="text-teal-400 font-bold">
                      LOG_&#123;YYYYMMDD&#125;_&#123;warehouseId&#125;_&#123;uniqueRandom&#125;
                    </span>
                    <p className="text-slate-400 text-[10px] font-sans mt-1">
                      Example: <code className="text-amber-300">LOG_20260819_DEL_01_742</code>
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Task Submission Doc ID:</span>
                    <span className="text-emerald-400 font-bold">
                      SUB_&#123;YYYYMMDD&#125;_&#123;warehouseId&#125;_&#123;templateId&#125;_&#123;shift&#125;
                    </span>
                    <p className="text-slate-400 text-[10px] font-sans mt-1">
                      Example: <code className="text-amber-300">SUB_20260819_WH_DEL_01_CHK_GEN_01_MORNING</code>
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Diesel Log Doc ID:</span>
                    <span className="text-amber-400 font-bold">
                      DSL_&#123;warehouseId&#125;_&#123;uniqueId&#125;
                    </span>
                    <p className="text-slate-400 text-[10px] font-sans mt-1">
                      Example: <code className="text-amber-300">DSL_WH_DEL_01_DSL-DEL-901</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-lg transition"
          >
            Close Schema Reference
          </button>
        </div>
      </div>
    </div>
  );
};
