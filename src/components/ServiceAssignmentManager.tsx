import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  UserCheck,
  Building2,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  FileSpreadsheet,
  Mail,
  Clock,
  Save,
  X,
  Users,
  Briefcase,
  Check,
  Sparkles,
  HelpCircle,
  Phone
} from 'lucide-react';
import { ServiceAssignment } from '../types';
import { PageHeader } from './common/PageHeader';

interface ServiceAssignmentManagerProps {
  onNavigateTab?: (tab: string) => void;
  onBack?: () => void;
}

export const ServiceAssignmentManager: React.FC<ServiceAssignmentManagerProps> = ({ onNavigateTab, onBack }) => {
  const {
    serviceAssignments,
    updateServiceAssignment,
    addServiceAssignment,
    deleteServiceAssignment,
    bulkUpdateServiceAssignments,
    warehouses,
    operationalSheets,
    setNotification
  } = useApp();

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('ALL');
  const [selectedAdminFilter, setSelectedAdminFilter] = useState('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ServiceAssignment | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Bulk assign state
  const [bulkSiteId, setBulkSiteId] = useState(warehouses[0]?.id || 'WH_BLR_B4');
  const [bulkAdminId, setBulkAdminId] = useState('USR_ADMIN_01');
  const [bulkAdminName, setBulkAdminName] = useState('Sudhanshu Verma (Regional Head)');
  const [bulkAdminEmail, setBulkAdminEmail] = useState('sudhanshu.v@warehouseops.internal');

  // Predefined service options
  const standardServices = useMemo(() => [
    { id: 'SHEET_DAILY_SITE', code: 'OPS_01_SITE', name: 'Daily Site Activity Report (Master)', category: 'Daily Operations' },
    { id: 'SHEET_HOUSEKEEPING', code: 'OPS_02_HK', name: 'Housekeeping Deployment & Audit', category: 'Manpower' },
    { id: 'SHEET_DG_POWER_WATER', code: 'ENG_01_DG', name: 'DG Fuel, Grid Power & Water Log', category: 'Energy & Fuel' },
    { id: 'SHEET_DIESEL', code: 'ENG_02_DSL', name: 'Diesel Inward & Tank Dispensation', category: 'Energy & Fuel' },
    { id: 'SHEET_WASHING', code: 'OPS_03_WASH', name: 'Crate Washing & Hygiene Cycles', category: 'Daily Operations' },
    { id: 'SHEET_ADHOC', code: 'MNT_01_ADHOC', name: 'Adhoc Maintenance & Repairs Tracker', category: 'EHS & Facilities' },
    { id: 'SHEET_COLD_ROOM', code: 'REF_01_COLD', name: 'Cold Room Temperature & Defrost Log', category: 'EHS & Facilities' },
    { id: 'SHEET_MHE_FLEET', code: 'FLT_01_MHE', name: 'MHE / Forklift Battery & Fleet Health', category: 'MHE & Fleet' },
    { id: 'SHEET_FIRE_SAFETY', code: 'EHS_01_FIRE', name: 'Fire Safety & Hydrant Pressure Audit', category: 'EHS & Facilities' },
    { id: 'SHEET_PEST_CONTROL', code: 'EHS_02_PEST', name: 'Pest Control & Bait Station Inspection', category: 'EHS & Facilities' },
  ], []);

  // Predefined admin options
  const adminOptions = [
    { id: 'USR_ADMIN_01', name: 'Sudhanshu Verma (Regional Head)', email: 'sudhanshu.v@warehouseops.internal' },
    { id: 'USR_ADMIN_02', name: 'Priya Nair (Operations Director)', email: 'priya.n@warehouseops.internal' },
    { id: 'USR_ADMIN_03', name: 'Rajesh Kumar (Technical Facility Head)', email: 'rajesh.k@warehouseops.internal' },
    { id: 'USR_ADMIN_04', name: 'Amit Patel (Compliance & Quality Lead)', email: 'amit.p@warehouseops.internal' },
  ];

  // Predefined POC options mapped to sites
  const pocDirectory: Record<string, Array<{ id: string; name: string; email: string }>> = {
    'WH_BLR_B4': [
      { id: 'USR_POC_BLR_1', name: 'Kavita Sundaram (Lead POC)', email: 'kavita.s@warehouseops.internal' },
      { id: 'USR_POC_BLR_2', name: 'Rohan Deshmukh (Facility Tech)', email: 'rohan.d@warehouseops.internal' },
      { id: 'USR_POC_BLR_3', name: 'Arun Kumar (Electrical POC)', email: 'arun.k@warehouseops.internal' }
    ],
    'WH_DEL_D1': [
      { id: 'USR_POC_DEL_1', name: 'Manish Rawat (Lead POC)', email: 'manish.r@warehouseops.internal' },
      { id: 'USR_POC_DEL_2', name: 'Vikram Choudhary (Shift Engr)', email: 'vikram.c@warehouseops.internal' }
    ],
    'WH_MUM_M2': [
      { id: 'USR_POC_MUM_1', name: 'Sanjay Kulkarni (Lead POC)', email: 'sanjay.k@warehouseops.internal' },
      { id: 'USR_POC_MUM_2', name: 'Deepak Sawant (Mechanical Lead)', email: 'deepak.s@warehouseops.internal' }
    ],
    'WH_HYD_H3': [
      { id: 'USR_POC_HYD_1', name: 'Ananya Reddy (Lead POC)', email: 'ananya.r@warehouseops.internal' },
      { id: 'USR_POC_HYD_2', name: 'Kiran Rao (Operations POC)', email: 'kiran.r@warehouseops.internal' }
    ]
  };

  // Form state for Add/Edit
  const [formData, setFormData] = useState<Partial<ServiceAssignment>>({
    serviceId: 'SHEET_DAILY_SITE',
    serviceCode: 'OPS_01_SITE',
    serviceName: 'Daily Site Activity Report (Master)',
    serviceCategory: 'Daily Operations',
    warehouseId: 'WH_BLR_B4',
    warehouseCode: 'WH-BLR-B4',
    warehouseName: 'Facility_Bangalore B4',
    adminLeadId: 'USR_ADMIN_01',
    adminLeadName: 'Sudhanshu Verma (Regional Head)',
    adminLeadEmail: 'sudhanshu.v@warehouseops.internal',
    primaryPocId: 'USR_POC_BLR_1',
    primaryPocName: 'Kavita Sundaram (Lead POC)',
    primaryPocEmail: 'kavita.s@warehouseops.internal',
    secondaryPocName: '',
    secondaryPocEmail: '',
    escalationEmail: 'ops-escalations@warehouseops.internal',
    frequency: 'DAILY (Every Shift)',
    slaHours: 2,
    status: 'ACTIVE',
    notes: ''
  });

  // Filtered rows
  const filteredAssignments = useMemo(() => {
    return serviceAssignments.filter((item) => {
      // Site filter
      if (selectedSiteFilter !== 'ALL' && item.warehouseId !== selectedSiteFilter) {
        return false;
      }
      // Admin filter
      if (selectedAdminFilter !== 'ALL' && item.adminLeadId !== selectedAdminFilter) {
        return false;
      }
      // Category filter
      if (selectedCategoryFilter !== 'ALL' && item.serviceCategory !== selectedCategoryFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'ALL' && item.status !== selectedStatusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${item.serviceName} ${item.serviceCategory} ${item.warehouseName} ${item.adminLeadName} ${item.adminLeadEmail} ${item.primaryPocName} ${item.primaryPocEmail}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [serviceAssignments, selectedSiteFilter, selectedAdminFilter, selectedCategoryFilter, selectedStatusFilter, searchQuery]);

  // Distinct values for filters
  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    serviceAssignments.forEach(s => set.add(s.serviceCategory));
    return Array.from(set);
  }, [serviceAssignments]);

  const distinctAdmins = useMemo(() => {
    const map = new Map<string, string>();
    serviceAssignments.forEach(s => map.set(s.adminLeadId, s.adminLeadName));
    return Array.from(map.entries());
  }, [serviceAssignments]);

  // Open Edit Modal
  const handleOpenEdit = (assignment: ServiceAssignment) => {
    setEditingAssignment(assignment);
    setFormData({ ...assignment });
    setIsEditModalOpen(true);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingAssignment(null);
    const defaultWh = warehouses[0] || { id: 'WH_BLR_B4', code: 'WH-BLR-B4', name: 'Facility_Bangalore B4', city: 'Bangalore' };
    const defaultPoc = pocDirectory[defaultWh.id]?.[0] || { id: 'USR_POC_BLR_1', name: 'Site POC', email: 'poc@warehouseops.internal' };
    const defaultAdmin = adminOptions[0];

    setFormData({
      serviceId: standardServices[0].id,
      serviceCode: standardServices[0].code,
      serviceName: standardServices[0].name,
      serviceCategory: standardServices[0].category,
      warehouseId: defaultWh.id,
      warehouseCode: defaultWh.code,
      warehouseName: defaultWh.name,
      adminLeadId: defaultAdmin.id,
      adminLeadName: defaultAdmin.name,
      adminLeadEmail: defaultAdmin.email,
      primaryPocId: defaultPoc.id,
      primaryPocName: defaultPoc.name,
      primaryPocEmail: defaultPoc.email,
      secondaryPocName: '',
      secondaryPocEmail: '',
      escalationEmail: 'ops-escalations@warehouseops.internal',
      frequency: 'DAILY (Every Shift)',
      slaHours: 2,
      status: 'ACTIVE',
      notes: ''
    });
    setIsEditModalOpen(true);
  };

  // Save Assignment
  const handleSaveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.serviceName || !formData.warehouseId || !formData.adminLeadName || !formData.primaryPocName) {
      alert('Please complete all required fields.');
      return;
    }

    if (editingAssignment) {
      updateServiceAssignment(editingAssignment.id, formData);
    } else {
      const newId = `ASN_${(formData.warehouseCode || 'SITE').replace(/[^a-zA-Z0-9]/g, '')}_${(formData.serviceCode || 'SERV').replace(/[^a-zA-Z0-9]/g, '')}`;
      const newRecord: ServiceAssignment = {
        ...(formData as ServiceAssignment),
        id: newId,
        updatedAt: new Date().toISOString()
      };
      addServiceAssignment(newRecord);
    }
    setIsEditModalOpen(false);
  };

  // Quick inline status toggle
  const handleToggleStatus = (assignment: ServiceAssignment) => {
    const nextStatus: ServiceAssignment['status'] = assignment.status === 'ACTIVE' ? 'AUDIT_PENDING' : 'ACTIVE';
    updateServiceAssignment(assignment.id, { status: nextStatus });
  };

  // Delete Assignment
  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove the service assignment for "${name}"?`)) {
      deleteServiceAssignment(id);
    }
  };

  // Bulk Apply Admin to Site
  const handleExecuteBulkAssign = (e: React.FormEvent) => {
    e.preventDefault();
    const targetWh = warehouses.find(w => w.id === bulkSiteId);
    const idsToUpdate = serviceAssignments
      .filter(item => item.warehouseId === bulkSiteId)
      .map(item => item.id);

    if (idsToUpdate.length > 0) {
      bulkUpdateServiceAssignments(idsToUpdate, {
        adminLeadId: bulkAdminId,
        adminLeadName: bulkAdminName,
        adminLeadEmail: bulkAdminEmail
      });
      setNotification({
        type: 'success',
        message: `Assigned ${bulkAdminName} to ${idsToUpdate.length} services at ${targetWh?.city || bulkSiteId}`
      });
    } else {
      setNotification({
        type: 'warning',
        message: `No active services found for the selected facility.`
      });
    }
    setIsBulkModalOpen(false);
  };

  // Export Matrix to CSV
  const handleExportCSV = () => {
    const headers = [
      'ID', 'Service Name', 'Service Code', 'Category', 'Warehouse ID', 'Warehouse Name',
      'Admin Lead Name', 'Admin Lead Email', 'Primary POC Name', 'Primary POC Email',
      'Frequency', 'SLA Hours', 'Status', 'Last Updated'
    ];

    const rows = filteredAssignments.map(a => [
      `"${a.id}"`,
      `"${a.serviceName}"`,
      `"${a.serviceCode}"`,
      `"${a.serviceCategory}"`,
      `"${a.warehouseId}"`,
      `"${a.warehouseName}"`,
      `"${a.adminLeadName}"`,
      `"${a.adminLeadEmail}"`,
      `"${a.primaryPocName}"`,
      `"${a.primaryPocEmail}"`,
      `"${a.frequency}"`,
      `"${a.slaHours}"`,
      `"${a.status}"`,
      `"${a.updatedAt}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Master_Service_Assignments_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans animate-in fade-in duration-200">
      {/* Top Header Banner */}
      <PageHeader
        title="Master Responsibility Matrix & Service Assignments"
        subtitle="Manage end-to-end service accountability site-wise and admin-wise. Assign designated Admins and Site POCs for Daily Reports, Housekeeping, Energy, and specialized logs."
        categoryBadge="Master Governance Table"
        categoryColor="bg-blue-50 text-blue-700 border-blue-200"
        onBack={onBack}
        backLabel="Back"
        breadcrumbs={[
          { label: 'Portal', onClick: onBack },
          { label: 'Administration' },
          { label: 'Service Responsibility Matrix' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('adminDashboard')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition border border-amber-300 cursor-pointer shadow-2xs"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                <span>Open Admin Service Dashboard</span>
              </button>
            )}
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition border border-indigo-200 cursor-pointer shadow-2xs"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Bulk Site Assignment</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Matrix CSV</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Assign New Service</span>
            </button>
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Services</span>
            <span className="text-xl font-black text-slate-900">{serviceAssignments.length} Services</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Warehouses Covered</span>
            <span className="text-xl font-black text-slate-900">{warehouses.length} Facilities</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Admin Supervisors</span>
            <span className="text-xl font-black text-slate-900">{distinctAdmins.length} Leads</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Active Coverage</span>
            <span className="text-xl font-black text-emerald-600">
              {Math.round((serviceAssignments.filter(s => s.status === 'ACTIVE').length / (serviceAssignments.length || 1)) * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Query Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search service, admin, site POC, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Site Filter */}
          <div>
            <select
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Facilities (4 Sites)</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.city} ({w.code})</option>
              ))}
            </select>
          </div>

          {/* Admin Filter */}
          <div>
            <select
              value={selectedAdminFilter}
              onChange={(e) => setSelectedAdminFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Admin Leads</option>
              {distinctAdmins.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="AUDIT_PENDING">Audit Pending Only</option>
              <option value="VACANT">Vacant Only</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1 shrink-0">Category:</span>
          <button
            onClick={() => setSelectedCategoryFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-bold text-xs whitespace-nowrap transition border ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            All Categories ({serviceAssignments.length})
          </button>
          {distinctCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg font-bold text-xs whitespace-nowrap transition border ${
                selectedCategoryFilter === cat
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Master Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
              Service Responsibility Matrix ({filteredAssignments.length} Assignments)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Click edit to reassign Admins or Site POCs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Service & Category</th>
                <th className="p-3">Facility / Site</th>
                <th className="p-3">Assigned Admin Lead</th>
                <th className="p-3">Assigned Site POC</th>
                <th className="p-3">Frequency & SLA</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No service assignments match the selected filters. Click <strong>+ Assign New Service</strong> to add one.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment, idx) => {
                  const wh = warehouses.find(w => w.id === assignment.warehouseId);
                  const isAudit = assignment.status === 'AUDIT_PENDING';
                  const isVacant = assignment.status === 'VACANT';

                  return (
                    <tr 
                      key={assignment.id} 
                      className={`hover:bg-slate-50/80 transition ${
                        isAudit ? 'bg-amber-50/20' : isVacant ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>

                      {/* Service Name & Category */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{assignment.serviceName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {assignment.serviceCode}
                          </span>
                          <span className="text-[10px] font-medium text-teal-700 bg-teal-50 px-2 py-0.2 rounded-full border border-teal-200">
                            {assignment.serviceCategory}
                          </span>
                        </div>
                      </td>

                      {/* Facility / Site */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{assignment.warehouseName || wh?.name || assignment.warehouseId}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {assignment.warehouseCode || wh?.code} {wh ? `• ${wh.city}` : ''}
                        </span>
                      </td>

                      {/* Assigned Admin Lead */}
                      <td className="p-3">
                        <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{assignment.adminLeadName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{assignment.adminLeadEmail}</span>
                        </div>
                      </td>

                      {/* Assigned Site POC */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{assignment.primaryPocName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{assignment.primaryPocEmail}</span>
                        </div>
                        {assignment.secondaryPocName && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Backup: {assignment.secondaryPocName}
                          </div>
                        )}
                      </td>

                      {/* Frequency & SLA */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-700">
                          {assignment.frequency}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Response SLA: {assignment.slaHours}h</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(assignment)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer border ${
                            assignment.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : assignment.status === 'AUDIT_PENDING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title="Click to toggle status"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            assignment.status === 'ACTIVE' ? 'bg-emerald-500' : assignment.status === 'AUDIT_PENDING' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} />
                          {assignment.status}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(assignment)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="Edit Assignment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(assignment.id, assignment.serviceName)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Add / Edit Service Assignment */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {editingAssignment ? 'Edit Service Responsibility' : 'Assign Service to Site & Admin'}
                  </h3>
                  <p className="text-xs text-indigo-200/80">Configure operational ownership and SLA governance</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Service Selection */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700">Operational Service *</label>
                  <select
                    value={formData.serviceId}
                    onChange={(e) => {
                      const selected = standardServices.find(s => s.id === e.target.value);
                      if (selected) {
                        setFormData({
                          ...formData,
                          serviceId: selected.id,
                          serviceCode: selected.code,
                          serviceName: selected.name,
                          serviceCategory: selected.category
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-teal-500"
                  >
                    {standardServices.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                    ))}
                  </select>
                </div>

                {/* Warehouse / Site */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Target Facility / Warehouse *</label>
                  <select
                    value={formData.warehouseId}
                    onChange={(e) => {
                      const wh = warehouses.find(w => w.id === e.target.value);
                      const defaultPoc = pocDirectory[e.target.value]?.[0];
                      setFormData({
                        ...formData,
                        warehouseId: e.target.value,
                        warehouseCode: wh ? wh.code : e.target.value,
                        warehouseName: wh ? wh.name : e.target.value,
                        primaryPocId: defaultPoc?.id || formData.primaryPocId,
                        primaryPocName: defaultPoc?.name || formData.primaryPocName,
                        primaryPocEmail: defaultPoc?.email || formData.primaryPocEmail
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-teal-500"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.city} ({w.code} - {w.name})</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Assignment Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="ACTIVE">ACTIVE (Mandatory Monitoring)</option>
                    <option value="AUDIT_PENDING">AUDIT_PENDING (Review Required)</option>
                    <option value="VACANT">VACANT (Unassigned)</option>
                  </select>
                </div>

                {/* Admin Lead Assignment */}
                <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-200">
                  <h4 className="font-bold text-indigo-950 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    Admin Lead Accountability
                  </h4>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Assign Admin Supervisor *</label>
                  <select
                    value={formData.adminLeadId}
                    onChange={(e) => {
                      const adm = adminOptions.find(a => a.id === e.target.value);
                      if (adm) {
                        setFormData({
                          ...formData,
                          adminLeadId: adm.id,
                          adminLeadName: adm.name,
                          adminLeadEmail: adm.email
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-indigo-500"
                  >
                    {adminOptions.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Admin Email</label>
                  <input
                    type="email"
                    required
                    value={formData.adminLeadEmail || ''}
                    onChange={(e) => setFormData({ ...formData, adminLeadEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Site POC Assignment */}
                <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-200">
                  <h4 className="font-bold text-emerald-950 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Site POC Execution Responsibility
                  </h4>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Primary Site POC Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.primaryPocName || ''}
                    onChange={(e) => setFormData({ ...formData, primaryPocName: e.target.value })}
                    placeholder="e.g. Kavita Sundaram"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">POC Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.primaryPocEmail || ''}
                    onChange={(e) => setFormData({ ...formData, primaryPocEmail: e.target.value })}
                    placeholder="poc@warehouseops.internal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Secondary / Backup POC</label>
                  <input
                    type="text"
                    value={formData.secondaryPocName || ''}
                    onChange={(e) => setFormData({ ...formData, secondaryPocName: e.target.value })}
                    placeholder="e.g. Rohan Deshmukh"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Backup POC Email</label>
                  <input
                    type="email"
                    value={formData.secondaryPocEmail || ''}
                    onChange={(e) => setFormData({ ...formData, secondaryPocEmail: e.target.value })}
                    placeholder="backup.poc@warehouseops.internal"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Reporting SLA and Frequency */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Reporting Frequency</label>
                  <input
                    type="text"
                    value={formData.frequency || ''}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    placeholder="e.g. DAILY (Every Shift)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">SLA Resolution Hours</label>
                  <input
                    type="number"
                    min="1"
                    max="72"
                    value={formData.slaHours || 2}
                    onChange={(e) => setFormData({ ...formData, slaHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700">Operational Notes & Handover Protocol</label>
                  <textarea
                    rows={2}
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="e.g. In case of unresolved deviations > 2 hours, notify regional technical head."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save Responsibility Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Bulk Assign Admin to All Site Services */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Bulk Site Reassignment</h3>
                  <p className="text-xs text-indigo-200/80">Batch assign an Admin to all services at a facility</p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteBulkAssign} className="p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Target Facility / Warehouse *</label>
                <select
                  value={bulkSiteId}
                  onChange={(e) => setBulkSiteId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-indigo-500"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.city} Central Hub ({w.code})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Assign Admin Supervisor *</label>
                <select
                  value={bulkAdminId}
                  onChange={(e) => {
                    const adm = adminOptions.find(a => a.id === e.target.value);
                    if (adm) {
                      setBulkAdminId(adm.id);
                      setBulkAdminName(adm.name);
                      setBulkAdminEmail(adm.email);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold focus:ring-2 focus:ring-indigo-500"
                >
                  {adminOptions.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                  ))}
                </select>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-indigo-900 text-[11px] leading-relaxed">
                <strong>Batch Operation:</strong> This will update all services assigned to the selected facility to report to <strong>{bulkAdminName}</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Apply Bulk Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
