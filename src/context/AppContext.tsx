import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Warehouse,
  User,
  TaskTemplate,
  TaskSubmission,
  DieselLog,
  DailySiteLog,
  OngoingActivity,
  OperationalSheetDef,
  Shift,
  SiteHealthStatus,
  ServiceAssignment,
  FieldDefinition,
  EmailLogEntry,
  DieselStatus,
  DieselValidation,
  DieselProcurementType,
  Vendor,
  DieselAuditEntry
} from '../types';
import { PocMaster, SiteMaster, ServiceRegistry, MasterAudit } from '../types/masterData';
import { fetchMasterData, fetchMasterDataFromAppsScript, parseMasterDataJson, diffRows, formatRowDiff } from '../lib/masterDataSync';
import { servicesForSite } from '../lib/permissions';
import { buildDieselSheetPayload } from '../lib/sheetSync/dieselSheet';
import { validateSite, validateService, type EditMode, type MasterWriteResult } from '../lib/masterData/validate';
import {
  INITIAL_WAREHOUSES,
  INITIAL_USERS,
  INITIAL_TEMPLATES,
  INITIAL_SUBMISSIONS,
  INITIAL_DIESEL_LOGS,
  INITIAL_DAILY_SITE_LOGS,
  OPERATIONAL_SHEETS,
  INITIAL_SHEET_RECORDS,
  INITIAL_SERVICE_ASSIGNMENTS,
  INITIAL_VENDORS,
  VENDOR_EMAIL_MAP,
  FIXED_CC_EMAILS,
  POD_CC_EMAILS
} from '../data/initialData';

export interface ComplianceMatrixResult {
  ok: boolean;
  days: number;
  dayLabels: string[];
  dayKeys: string[];
  overall: number;
  rows: {
    site: string;
    cells: SiteHealthStatus[];
    filed: number;
    missed: number;
    rate: number;
    streak: number;
  }[];
}

export interface BriefingResult {
  ok: boolean;
  dateLabel: string;
  dateShort: string;
  lead: string;
  paragraphs: { site: string; text: string }[];
  totals: {
    expected: number;
    filed: number;
    missing: number;
    clear: number;
    partial: number;
    critical: number;
    openActivities: number;
    overdue: number;
  };
  missing: string[];
  overdue: { site: string; work: string; eta: string }[];
}

export interface SiteHistoryResult {
  ok: boolean;
  site: string;
  days: number;
  rate: number;
  filed: number;
  missed: number;
  cells: {
    blank?: boolean;
    day?: number;
    label?: string;
    status?: SiteHealthStatus;
    poc?: string;
    time?: string;
    devCount?: number;
    isToday?: boolean;
    logId?: string;
  }[];
  filers: { name: string; count: number }[];
}

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  warehouses: Warehouse[];
  templates: TaskTemplate[];
  submissions: TaskSubmission[];
  dieselLogs: DieselLog[];
  dailySiteLogs: DailySiteLog[];
  housekeepingLogs: any[];
  dgPowerLogs: any[];
  operationalSheets: OperationalSheetDef[];
  setOperationalSheets: React.Dispatch<React.SetStateAction<OperationalSheetDef[]>>;
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  
  // Generic Sheet Records Database
  sheetRecords: Record<string, any[]>;
  addSheetRecord: (sheetId: string, recordData: Record<string, any>) => { ok: boolean; id: string; message: string };
  addOperationalSheet: (sheetDef: OperationalSheetDef) => { ok: boolean; message: string };
  exportSheetData: (sheetId: string, format: 'csv' | 'json') => void;

  // Sheet Column & Schema Customization
  updateSheetColumns: (sheetId: string, fields: FieldDefinition[]) => void;
  addColumnToSheet: (sheetId: string, field: FieldDefinition) => void;
  removeColumnFromSheet: (sheetId: string, fieldKey: string) => void;

  // Service Responsibility Matrix (Admin & Site POC Master Table)
  serviceAssignments: ServiceAssignment[];
  updateServiceAssignment: (id: string, updates: Partial<ServiceAssignment>) => void;
  addServiceAssignment: (assignment: ServiceAssignment) => void;
  deleteServiceAssignment: (id: string) => void;
  bulkUpdateServiceAssignments: (ids: string[], updates: Partial<ServiceAssignment>) => void;
  getAssignedServicesForUser: (user?: User) => string[];
  isServiceAccessible: (sheetId: string, user?: User) => boolean;

  selectedWarehouseId: string; // 'ALL' or specific ID
  setSelectedWarehouseId: (id: string) => void;
  selectedShift: Shift;
  setSelectedShift: (shift: Shift) => void;
  currentDate: string; // YYYY-MM-DD
  setCurrentDate: (date: string) => void;
  
  // Submission & Fuel Operations
  computeSubmissionId: (date: string, warehouseId: string, templateId: string, shift: Shift) => string;
  getSubmissionForTemplate: (warehouseId: string, templateId: string, shift: Shift, date?: string) => TaskSubmission | undefined;
  submitTask: (data: {
    templateId: string;
    warehouseId: string;
    shift: Shift;
    date: string;
    dataPayload: Record<string, any>;
    notes?: string;
  }) => { success: boolean; message: string; submissionId?: string };
  
  // Diesel Procurement — Role-Based Requisition Lifecycle
  emailLogs: EmailLogEntry[];
  vendors: Vendor[];
  addVendor: (data: { name: string; vendorType: Vendor['vendorType']; email?: string }) => { success: boolean; message: string };
  updateVendor: (vendorId: string, updates: Partial<Vendor>) => void;
  toggleVendorActive: (vendorId: string) => void;
  dieselAuditLog: DieselAuditEntry[];

  submitDieselProcurement: (data: {
    emailAddress: string;
    entity: string;
    whNameB2B: string;
    whNameB2C: string;
    costCenter: string;
    zone: string;
    warehouseId: string;
    fuel: 'Diesel' | 'DEF';
    type: DieselProcurementType;
    vendorNamePayment?: string;
    vendorNameDelivery?: string;
    quantity: number;
    orderQuantityLitres?: number;
    ratePerLitre: number;
    qrCodeImageUrl?: string;
    notes?: string;
  }) => { success: boolean; logId: string; uniqueId: string; threadId: string; message: string } | { success: false; message: string; logId?: undefined; uniqueId?: undefined; threadId?: undefined };

  approveDieselLog: (logId: string, notes?: string) => { success: boolean; message: string };
  rejectDieselLog: (logId: string, reason: string) => { success: boolean; message: string };
  validateDelivery: (logId: string, payload: {
    validation: 'Delivered' | 'Partial Delivered' | 'Not Delivered';
    deliveredQuantityLitres: number;
    podUrl: string;
    notes?: string;
  }) => { success: boolean; message: string };
  /** @deprecated use validateDelivery — kept temporarily for any lingering call sites during migration */
  validateAndUploadPOD: (logId: string, payload: {
    deliveredQuantityLitres: number;
    podUrl: string;
    notes?: string;
  }) => { success: boolean; isDiscrepancy: boolean; message: string };
  updateDieselLog: (logId: string, updates: Partial<DieselLog>) => void;
  deleteDieselLog: (logId: string) => void;
  buildDieselMailPreview: (logId: string) => { subject: string; html: string; plain: string; composeUrl: string; to: string; cc: string } | null;

  createDieselLog: (data: Omit<DieselLog, 'id' | 'timestamp' | 'submittedById' | 'submittedByName' | 'finalAmount' | 'validation'> & {
    uniqueId?: string;
  }) => { success: boolean; message: string; logId?: string; isDiscrepancy: boolean };

  // Daily Site Activity (43 columns AS_DailyLog + AS_OngoingActivity)
  submitDailySiteLog: (payload: {
    site: string;
    date: string;
    values: Record<string, any>;
    remarks: Record<string, string>;
    pmPlanned: number;
    pmCompleted: number;
    pmRemark?: string;
    highlights?: string;
    activities: {
      work: string;
      owner: string;
      status: 'Open' | 'In Progress' | 'Completed' | 'Blocked';
      eta: string;
      barrier?: string;
      cost?: number;
      manhours?: number;
    }[];
  }) => { ok: boolean; logId: string; message: string };

  getExistingDailyReport: (site: string, date: string) => DailySiteLog | undefined;
  getComplianceMatrix: (endDateStr: string, days?: number) => ComplianceMatrixResult;
  getBriefing: (dateStr: string) => BriefingResult;
  getSiteHistory: (site: string, days?: number) => SiteHistoryResult;
  buildShareMailHtml: (logId: string) => { subject: string; html: string; plain: string; composeUrl: string };

  // Template & Warehouse Management
  addTemplate: (template: Omit<TaskTemplate, 'id'> & { id?: string }) => void;
  toggleTemplateStatus: (templateId: string) => void;
  addWarehouse: (warehouse: Warehouse) => void;
  toggleWarehouseStatus: (warehouseId: string) => void;
  setWarehouses: React.Dispatch<React.SetStateAction<Warehouse[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  
  // Dynamic POC Master & Admin Master Sync
  pocMasterSheetUrl: string;
  setPocMasterSheetUrl: (url: string) => void;
  lastPocSyncTime: string | null;
  syncWarehousesFromPocMaster: (newWarehouses: Partial<Warehouse>[], newPocs?: Partial<User>[]) => { added: number; updated: number; total: number };
  syncAdminMasterData: (admins: { fullName: string; email: string; department?: string; assignedServiceIds: string[] }[]) => { synced: number };
  syncPocMasterFromUrl: (url: string) => Promise<{ ok: boolean; message: string; count?: number; added?: number; updated?: number }>;
  updateWarehousePoc: (warehouseId: string, pocDetails: { sitePocName: string; sitePocContact: string; sitePocEmail: string }) => Promise<{ ok: boolean; message: string; sheetSynced: boolean }>;

  // Per-service Google Sheet webhook URLs (each service gets its own dedicated Sheet + Apps Script Web App)
  sheetWebhookUrls: Record<string, string>;
  setSheetWebhookUrl: (sheetId: string, url: string) => void;

  // Master Data — live read from WarehouseOS_MasterData (POC_Master / Site_Master / Service_Registry),
  // per MASTERDATA.md. Raw rows only; not yet the source of truth for `warehouses`/`users` above.
  masterDataSpreadsheetId: string;
  setMasterDataSpreadsheetId: (id: string) => void;
  pocMasterRows: PocMaster[];
  siteMasterRows: SiteMaster[];
  serviceRegistryRows: ServiceRegistry[];
  masterAuditRows: MasterAudit[];
  dropdownLists: Record<string, string[]>;
  lastMasterDataSyncAt: string | null;
  syncMasterData: (idOrAppsScriptUrl?: string) => Promise<{ ok: boolean; message: string; counts?: { poc: number; site: number; service: number } }>;
  importMasterDataFromJson: (jsonText: string) => { ok: boolean; message: string; counts?: { poc: number; site: number; service: number } };
  masterDataAppsScriptUrl: string;
  setMasterDataAppsScriptUrl: (url: string) => void;
  assignPocMasterRow: (row: Partial<PocMaster>) => Promise<{ success: boolean; message: string }>;
  /** Create or edit a Site_Master row. Validates first; never changes Site_Code on edit. */
  saveSiteMasterRow: (row: Partial<SiteMaster>, mode: EditMode, originalKey?: string) => Promise<MasterWriteResult>;
  /** Create or edit a Service_Registry row. Validates first; never changes Service_Code on edit. */
  saveServiceRegistryRow: (row: Partial<ServiceRegistry>, mode: EditMode, originalKey?: string) => Promise<MasterWriteResult>;

  // Reset & Notifications
  resetToDefaultData: () => void;
  notification: { message: string; type: 'success' | 'error' | 'warning' | 'info' } | null;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'warning' | 'info' } | null) => void;
  notify: (type: 'success' | 'error' | 'warning' | 'info', titleOrMsg?: string, maybeMsg?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'warehouse_portal_v3_';

const UTILITY_KEYS = [
  { label: 'UPS', key: 'ups', remarkKey: 'upsRemark' },
  { label: 'DG', key: 'dg', remarkKey: 'dgRemark' },
  { label: 'LT Panel', key: 'ltPanel', remarkKey: 'ltPanelRemark' },
  { label: 'Cold Room', key: 'coldRoom', remarkKey: 'coldRoomRemark', isCrit: true },
  { label: 'HVLS', key: 'hvls', remarkKey: 'hvlsRemark' },
  { label: 'Water Coolers', key: 'waterCoolers', remarkKey: 'waterCoolersRemark' },
  { label: 'Freezers GGP', key: 'freezersGgp', remarkKey: 'freezersGgpRemark', isCrit: true },
  { label: 'Door Buzzer', key: 'doorBuzzer', remarkKey: 'doorBuzzerRemark' }
];

const MHE_KEYS = [
  { label: 'RT', key: 'rt', remarkKey: 'rtRemark' },
  { label: 'BOPT', key: 'bopt', remarkKey: 'boptRemark' },
  { label: 'Stackers', key: 'stackers', remarkKey: 'stackersRemark' },
  { label: 'VRC', key: 'vrc', remarkKey: 'vrcRemark' }
];

const ROUTINE_KEYS = [
  { label: 'MTS Inspection', key: 'mtsInspection', remarkKey: 'mtsRemark' },
  { label: 'Lights Inspection', key: 'lightsInspection', remarkKey: 'lightsRemark' },
  { label: 'Air Circulation', key: 'airCirculation', remarkKey: 'airCirculationRemark' },
  { label: 'Gemba', key: 'gemba', remarkKey: 'gembaRemark' }
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'currentUser');
    return saved ? JSON.parse(saved) : INITIAL_USERS[0]; // Super Admin default
  });

  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'warehouses');
    const rawList: Warehouse[] = saved ? JSON.parse(saved) : INITIAL_WAREHOUSES;
    // Deduplicate and ensure strictly unique IDs:
    const seenIds = new Set<string>();
    const sanitized: Warehouse[] = [];
    rawList.forEach((wh, idx) => {
      let uniqueId = wh.id || (wh.sapCode && wh.sapCode !== 'N/A' ? `WH_${wh.sapCode}` : `WH_LOC_${idx + 1}`);
      uniqueId = uniqueId.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (seenIds.has(uniqueId.toLowerCase())) {
        uniqueId = `${uniqueId}_${idx + 1}`;
      }
      seenIds.add(uniqueId.toLowerCase());
      sanitized.push({
        ...wh,
        id: uniqueId,
        code: wh.code || uniqueId.replace('WH_', 'WH-')
      });
    });
    return sanitized;
  });

  const [pocMasterSheetUrl, setPocMasterSheetUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + 'pocMasterSheetUrl') || 'https://script.google.com/macros/s/AKfycbx.../exec';
  });

  const [lastPocSyncTime, setLastPocSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + 'lastPocSyncTime') || null;
  });

  // Per-service Google Apps Script Web App URLs (one dedicated Sheet per service, e.g. SHEET_DAILY_SITE)
  const [sheetWebhookUrls, setSheetWebhookUrls] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'sheetWebhookUrls');
    return saved ? JSON.parse(saved) : {};
  });

  const setSheetWebhookUrl = (sheetId: string, url: string) => {
    setSheetWebhookUrls(prev => ({ ...prev, [sheetId]: url }));
  };

  // Master Data — raw rows read live from WarehouseOS_MasterData (MASTERDATA.md).
  const [masterDataSpreadsheetId, setMasterDataSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + 'masterDataSpreadsheetId') || '1sb9xTktjtulq6gSS6L7xWqeMzIr6B8eEIO9pRiLYxgA';
  });
  const [pocMasterRows, setPocMasterRows] = useState<PocMaster[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'pocMasterRows');
    return saved ? JSON.parse(saved) : [];
  });
  const [siteMasterRows, setSiteMasterRows] = useState<SiteMaster[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'siteMasterRows');
    return saved ? JSON.parse(saved) : [];
  });
  const [serviceRegistryRows, setServiceRegistryRows] = useState<ServiceRegistry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'serviceRegistryRows');
    return saved ? JSON.parse(saved) : [];
  });
  const [masterAuditRows, setMasterAuditRows] = useState<MasterAudit[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'masterAuditRows');
    return saved ? JSON.parse(saved) : [];
  });
  const [dropdownLists, setDropdownLists] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'dropdownLists');
    return saved ? JSON.parse(saved) : {};
  });
  const [lastMasterDataSyncAt, setLastMasterDataSyncAt] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + 'lastMasterDataSyncAt') || null;
  });
  const [masterDataAppsScriptUrl, setMasterDataAppsScriptUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PREFIX + 'masterDataAppsScriptUrl') || '';
  });

  /**
   * Accepts either a bare Spreadsheet ID (gviz, read-only) or a
   * script.google.com Apps Script URL (reads + writes). Both are best-effort
   * for reads — see the top of masterDataSync.ts for why, and why the
   * reliable path for Master Data is manual (parseMasterDataJson /
   * "Paste Master Data JSON" in the UI), not either of these.
   */
  const syncMasterData = async (idOrAppsScriptUrl?: string) => {
    const input = (idOrAppsScriptUrl || masterDataAppsScriptUrl || masterDataSpreadsheetId).trim();
    if (!input) {
      return { ok: false, message: 'Paste the WarehouseOS_MasterData Spreadsheet ID or Apps Script Web App URL first.' };
    }
    try {
      const viaAppsScript = input.includes('script.google.com');
      const { pocMaster, siteMaster, serviceRegistry, masterAudit, dropdowns, errors } = viaAppsScript
        ? await fetchMasterDataFromAppsScript(input)
        : await fetchMasterData(input);

      if (viaAppsScript) setMasterDataAppsScriptUrl(input);
      else setMasterDataSpreadsheetId(input);

      // Save whatever came back — a Site_Master failure shouldn't discard a POC_Master success.
      if (pocMaster.length || !errors.pocMaster) setPocMasterRows(pocMaster);
      if (siteMaster.length || !errors.siteMaster) setSiteMasterRows(siteMaster);
      if (serviceRegistry.length || !errors.serviceRegistry) setServiceRegistryRows(serviceRegistry);
      if (masterAudit.length) setMasterAuditRows(masterAudit);
      if (Object.keys(dropdowns).length) setDropdownLists(dropdowns);

      const failedTabs = Object.entries(errors).filter(([, msg]) => msg);
      const now = new Date().toISOString();

      if (failedTabs.length === 3) {
        return { ok: false, message: failedTabs.map(([tab, msg]) => `${tab}: ${msg}`).join(' | ') };
      }

      setLastMasterDataSyncAt(now);
      const summary = `Synced ${pocMaster.length} POC_Master, ${siteMaster.length} Site_Master, ${serviceRegistry.length} Service_Registry rows.`;
      const warning = failedTabs.length
        ? ` (Couldn't read: ${failedTabs.map(([tab, msg]) => `${tab} — ${msg}`).join('; ')})`
        : '';
      return {
        ok: true,
        message: summary + warning,
        counts: { poc: pocMaster.length, site: siteMaster.length, service: serviceRegistry.length }
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Could not read the Master Data sheet.' };
    }
  };

  /**
   * Manual fallback for Master Data: parses the exact JSON MasterData_Code.gs
   * returns when its URL is opened directly in a browser tab (paste-in,
   * not live) — the reliable path since live reads hit Google's own
   * X-Frame-Options wall on anything embedded (see masterDataSync.ts).
   */
  const importMasterDataFromJson = (jsonText: string) => {
    try {
      const { pocMaster, siteMaster, serviceRegistry, masterAudit, dropdowns } = parseMasterDataJson(jsonText);

      // Reconcile diff against what's currently loaded, BEFORE overwriting —
      // the paste is always the full current truth (full-snapshot replace),
      // this is only for reporting what changed since the last paste.
      const pocDiff = diffRows(pocMasterRows, pocMaster, 'Access_ID');
      const siteDiff = diffRows(siteMasterRows, siteMaster, 'Site_Code');
      const serviceDiff = diffRows(serviceRegistryRows, serviceRegistry, 'Service_Code');

      setPocMasterRows(pocMaster);
      setSiteMasterRows(siteMaster);
      setServiceRegistryRows(serviceRegistry);
      setMasterAuditRows(masterAudit);
      setDropdownLists(dropdowns);
      setLastMasterDataSyncAt(new Date().toISOString());
      return {
        ok: true,
        message: [
          formatRowDiff('POC_Master', pocDiff),
          formatRowDiff('Site_Master', siteDiff),
          formatRowDiff('Service_Registry', serviceDiff)
        ].join(' · '),
        counts: { poc: pocMaster.length, site: siteMaster.length, service: serviceRegistry.length }
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Could not parse that as Master Data JSON.' };
    }
  };

  /**
   * Assigns/edits a POC_Master row through the Apps Script bridge (upsert by
   * Access_ID — blank Access_ID means "create new"). Fire-and-forget, same
   * hidden-form-POST technique as pushDailyLogToSheet; requires
   * masterDataAppsScriptUrl to be set (the gviz-only read path has no write
   * counterpart — Google Sheets doesn't expose one without Apps Script).
   */
  const assignPocMasterRow = async (row: Partial<PocMaster>) => {
    if (!masterDataAppsScriptUrl) {
      return { success: false, message: 'Deploy the Master Data Apps Script bridge first — writes need it even though reads alone don’t.' };
    }
    // Sheets path: fire-and-forget. The hidden-form POST can't read a response,
    // so this reports "sent", never "saved" — the two are not the same thing.
    submitViaHiddenForm(masterDataAppsScriptUrl, { action: 'upsertPocMaster', row, actorEmail: currentUser.email });
    return { success: true, message: `Sent to the sheet. Re-sync or re-paste in a few seconds to confirm it landed and see it in the tables.` };
  };

  /**
   * One save routine for Site_Master and Service_Registry, so both follow
   * the same order: validate, write, then reflect locally.
   *
   * The local update is optimistic on the Sheets path on purpose. The
   * hidden-form POST cannot read its response, so without it an admin who
   * adds a site sees nothing change and adds it again. The message still
   * says "sent", never "saved" — the sheet is the record on that path, and
   * a re-sync is what proves the write landed.
   */
  const saveMasterRow = async <Row extends { Last_Updated_By: string; Last_Updated_At: string }>(opts: {
    row: Partial<Row>;
    mode: EditMode;
    keyField: keyof Row & string;
    tab: 'Site_Master' | 'Service_Registry';
    action: 'upsertSiteMaster' | 'upsertServiceRegistry';
    validate: () => ReturnType<typeof validateSite>;
    setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  }): Promise<MasterWriteResult> => {
    const errors = opts.validate();
    if (errors.length) {
      return { success: false, message: errors[0].message, errors };
    }

    const key = String(opts.row[opts.keyField] ?? '').trim();
    const stamped = {
      ...opts.row,
      [opts.keyField]: key,
      Last_Updated_By: currentUser.email,
      Last_Updated_At: new Date().toISOString(),
    } as Row;

    const applyLocally = () =>
      opts.setRows(prev =>
        opts.mode === 'create'
          ? [...prev, stamped]
          : prev.map(r => (String(r[opts.keyField]) === key ? { ...r, ...stamped } : r))
      );

    if (!masterDataAppsScriptUrl) {
      return {
        success: false,
        message: 'Set the Master Data Apps Script URL first (Sync field above) — writes go through it.',
      };
    }

    submitViaHiddenForm(masterDataAppsScriptUrl, {
      action: opts.action,
      mode: opts.mode,
      row: stamped,
      actorEmail: currentUser.email,
    });
    applyLocally();
    return {
      success: true,
      message: `${key} sent to the sheet. Re-sync in a few seconds to confirm it landed.`,
    };
  };

  const saveSiteMasterRow = (row: Partial<SiteMaster>, mode: EditMode, originalKey?: string) =>
    saveMasterRow<SiteMaster>({
      row, mode, keyField: 'Site_Code', tab: 'Site_Master', action: 'upsertSiteMaster',
      validate: () => validateSite(row, siteMasterRows, mode, originalKey),
      setRows: setSiteMasterRows,
    });

  const saveServiceRegistryRow = (row: Partial<ServiceRegistry>, mode: EditMode, originalKey?: string) =>
    saveMasterRow<ServiceRegistry>({
      row, mode, keyField: 'Service_Code', tab: 'Service_Registry', action: 'upsertServiceRegistry',
      validate: () => validateService(row, serviceRegistryRows, mode, originalKey),
      setRows: setServiceRegistryRows,
    });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'masterDataSpreadsheetId', masterDataSpreadsheetId);
  }, [masterDataSpreadsheetId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'pocMasterRows', JSON.stringify(pocMasterRows));
  }, [pocMasterRows]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'siteMasterRows', JSON.stringify(siteMasterRows));
  }, [siteMasterRows]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'serviceRegistryRows', JSON.stringify(serviceRegistryRows));
  }, [serviceRegistryRows]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'masterAuditRows', JSON.stringify(masterAuditRows));
  }, [masterAuditRows]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'dropdownLists', JSON.stringify(dropdownLists));
  }, [dropdownLists]);

  useEffect(() => {
    if (lastMasterDataSyncAt) {
      localStorage.setItem(STORAGE_KEY_PREFIX + 'lastMasterDataSyncAt', lastMasterDataSyncAt);
    }
  }, [lastMasterDataSyncAt]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'masterDataAppsScriptUrl', masterDataAppsScriptUrl);
  }, [masterDataAppsScriptUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'pocMasterSheetUrl', pocMasterSheetUrl);
  }, [pocMasterSheetUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'sheetWebhookUrls', JSON.stringify(sheetWebhookUrls));
  }, [sheetWebhookUrls]);

  useEffect(() => {
    if (lastPocSyncTime) {
      localStorage.setItem(STORAGE_KEY_PREFIX + 'lastPocSyncTime', lastPocSyncTime);
    }
  }, [lastPocSyncTime]);

  const [templates, setTemplates] = useState<TaskTemplate[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'templates');
    return saved ? JSON.parse(saved) : INITIAL_TEMPLATES;
  });

  const [submissions, setSubmissions] = useState<TaskSubmission[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'submissions');
    return saved ? JSON.parse(saved) : INITIAL_SUBMISSIONS;
  });

  const [dieselLogs, setDieselLogs] = useState<DieselLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'dieselLogs');
    return saved ? JSON.parse(saved) : INITIAL_DIESEL_LOGS;
  });

  const [vendors, setVendors] = useState<Vendor[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'vendors');
    return saved ? JSON.parse(saved) : INITIAL_VENDORS;
  });

  const [dieselAuditLog, setDieselAuditLog] = useState<DieselAuditEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'dieselAuditLog');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'vendors', JSON.stringify(vendors));
  }, [vendors]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'dieselAuditLog', JSON.stringify(dieselAuditLog));
  }, [dieselAuditLog]);

  const [dailySiteLogs, setDailySiteLogs] = useState<DailySiteLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'dailySiteLogs');
    return saved ? JSON.parse(saved) : INITIAL_DAILY_SITE_LOGS;
  });

  const [operationalSheets, setOperationalSheets] = useState<OperationalSheetDef[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'operationalSheets');
    return saved ? JSON.parse(saved) : OPERATIONAL_SHEETS;
  });

  const [sheetRecords, setSheetRecords] = useState<Record<string, any[]>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'sheetRecords');
    return saved ? JSON.parse(saved) : INITIAL_SHEET_RECORDS;
  });

  const [serviceAssignments, setServiceAssignments] = useState<ServiceAssignment[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'serviceAssignments');
    return saved ? JSON.parse(saved) : INITIAL_SERVICE_ASSIGNMENTS;
  });

  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + 'emailLogs');
    return saved ? JSON.parse(saved) : [
      {
        id: 'EML_INIT_01',
        uniqueId: 'DZHPL1041',
        threadId: 'thrd_18ec59a2f1b0',
        timestamp: '2026-08-19T06:30:15Z',
        type: 'REQUEST_SUBMISSION',
        to: 'rajesh.sharma@grofers.com',
        cc: 'anshul.nahal@grofers.com,umesh.raghav@grofers.com,varun.singh@grofers.com,jyoti.kumari@fuelbuddy.in',
        subject: '[DZHPL1041] Diesel Delivery Request - Farukhnagar WH',
        htmlBody: '<p>Fuel Procurement request logged for 2,000L @ ₹89.50 (₹1,79,000)</p>',
        plainText: 'Fuel Procurement request logged for 2,000L @ ₹89.50',
        status: 'SENT',
        triggerEvent: 'Form Submit by Site POC'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + 'emailLogs', JSON.stringify(emailLogs));
    } catch (e) {
      console.error(e);
    }
  }, [emailLogs]);

  const [activeSheetId, setActiveSheetId] = useState<string>('SHEET_DAILY_SITE');
  // Today's real local date, not UTC — toISOString() would roll over early for IST
  // (UTC+5:30) users filing a report before ~5:30am, showing yesterday's date instead.
  const [currentDate, setCurrentDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [selectedShift, setSelectedShift] = useState<Shift>('MORNING');

  const [selectedWarehouseId, setSelectedWarehouseIdState] = useState<string>(() => {
    if (currentUser.role === 'SITE_POC' && currentUser.warehouseId) {
      return currentUser.warehouseId;
    }
    return 'ALL';
  });

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);

  // Sync selectedWarehouseId when currentUser changes
  useEffect(() => {
    if (currentUser.role === 'SITE_POC' && currentUser.warehouseId) {
      setSelectedWarehouseIdState(currentUser.warehouseId);
    }
    localStorage.setItem(STORAGE_KEY_PREFIX + 'currentUser', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'warehouses', JSON.stringify(warehouses));
  }, [warehouses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'submissions', JSON.stringify(submissions));
  }, [submissions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'dieselLogs', JSON.stringify(dieselLogs));
  }, [dieselLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'dailySiteLogs', JSON.stringify(dailySiteLogs));
  }, [dailySiteLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'operationalSheets', JSON.stringify(operationalSheets));
  }, [operationalSheets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'sheetRecords', JSON.stringify(sheetRecords));
  }, [sheetRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'serviceAssignments', JSON.stringify(serviceAssignments));
  }, [serviceAssignments]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const setSelectedWarehouseId = (id: string) => {
    if (currentUser.role === 'SITE_POC' && currentUser.warehouseId && id !== currentUser.warehouseId) {
      setNotification({
        type: 'warning',
        message: `RBAC Restricted: As a SITE POC, you can only operate inside your assigned warehouse (${currentUser.warehouseId}).`
      });
      return;
    }
    setSelectedWarehouseIdState(id);
  };

  const computeSubmissionId = (date: string, warehouseId: string, templateId: string, shift: Shift): string => {
    const cleanDate = date.replace(/-/g, '');
    return `SUB_${cleanDate}_${warehouseId}_${templateId}_${shift}`;
  };

  const getSubmissionForTemplate = (
    warehouseId: string,
    templateId: string,
    shift: Shift,
    date: string = currentDate
  ): TaskSubmission | undefined => {
    const subId = computeSubmissionId(date, warehouseId, templateId, shift);
    return submissions.find(s => s.id === subId);
  };

  const submitTask = ({
    templateId,
    warehouseId,
    shift,
    date,
    dataPayload,
    notes
  }: {
    templateId: string;
    warehouseId: string;
    shift: Shift;
    date: string;
    dataPayload: Record<string, any>;
    notes?: string;
  }) => {
    const submissionId = computeSubmissionId(date, warehouseId, templateId, shift);

    const existingIndex = submissions.findIndex(s => s.id === submissionId);
    if (existingIndex !== -1 && submissions[existingIndex].status === 'COMPLETED') {
      const msg = `Duplicate blocked: A verified submission (${submissionId}) already exists for this date and shift.`;
      setNotification({ type: 'error', message: msg });
      return { success: false, message: msg };
    }

    const newSubmission: TaskSubmission = {
      id: submissionId,
      submissionDate: date,
      shift,
      status: 'COMPLETED',
      templateId,
      warehouseId,
      submittedById: currentUser.id,
      submittedByName: currentUser.fullName,
      submittedAt: new Date().toISOString(),
      dataPayload,
      notes
    };

    if (existingIndex !== -1) {
      const updated = [...submissions];
      updated[existingIndex] = newSubmission;
      setSubmissions(updated);
    } else {
      setSubmissions(prev => [newSubmission, ...prev]);
    }

    setNotification({
      type: 'success',
      message: `Checklist recorded successfully! Doc ID: ${submissionId}`
    });

    return {
      success: true,
      message: 'Submission completed and locked successfully.',
      submissionId
    };
  };

  /**
   * Diesel Procurement Workflow matching Google Form & Google Apps Script
   */
  const submitDieselProcurement = (data: {
    emailAddress: string;
    entity: string;
    whNameB2B: string;
    whNameB2C: string;
    costCenter: string;
    zone: string;
    warehouseId: string;
    fuel: 'Diesel' | 'DEF';
    type: DieselProcurementType;
    vendorNamePayment?: string;
    vendorNameDelivery?: string;
    quantity: number;
    orderQuantityLitres?: number;
    ratePerLitre: number;
    qrCodeImageUrl?: string;
    notes?: string;
  }) => {
    // ---- Business-rule validation (rules #7-#17 of the procurement spec) ----
    if (!data.type) {
      return { success: false as const, message: 'Please select procurement type.' };
    }
    if (data.type === 'Payment Only' && !data.vendorNamePayment) {
      return { success: false as const, message: 'Please select a payment vendor.' };
    }
    if (data.type === 'Delivery Only' && !data.vendorNameDelivery) {
      return { success: false as const, message: 'Please select a delivery vendor.' };
    }
    if (data.type === 'Delivery Only' && !(Number(data.orderQuantityLitres) > 0)) {
      return { success: false as const, message: 'Please enter the order quantity.' };
    }
    if (!(Number(data.quantity) > 0) || !(Number(data.ratePerLitre) > 0)) {
      return { success: false as const, message: 'Please enter a valid quantity/rate.' };
    }

    // Generate the Unique ID — separate sequential counters per type, never reused.
    // Recomputed from the current log list each time so it survives resets/imports safely.
    const prefix = data.type === 'Payment Only' ? 'PZHPL' : 'DZHPL';
    const existingNumbers = dieselLogs
      .filter(l => l.uniqueId?.startsWith(prefix))
      .map(l => parseInt(l.uniqueId.replace(prefix, ''), 10))
      .filter(n => !isNaN(n));
    const nextNumber = (existingNumbers.length > 0 ? Math.max(...existingNumbers) : 1000) + 1;
    const uniqueId = `${prefix}${nextNumber}`;
    const docId = `DSL_${data.warehouseId}_${uniqueId}`;
    const threadId = `thrd_${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36)}`;

    const qty = Number(data.quantity || 0);
    const rate = Number(data.ratePerLitre || 0);
    const finalAmount = Math.round(qty * rate * 100) / 100;

    const vendorName = data.type === 'Payment Only' ? (data.vendorNamePayment || '') : (data.vendorNameDelivery || '');
    const vendorEmail = VENDOR_EMAIL_MAP[vendorName] || '';
    const ccList = vendorEmail ? `${FIXED_CC_EMAILS},${vendorEmail}` : FIXED_CC_EMAILS;

    const newLog: DieselLog = {
      id: docId,
      uniqueId,
      timestamp: new Date().toISOString(),
      emailAddress: data.emailAddress || currentUser.email,
      entity: data.entity || 'HyperLogistics India Pvt Ltd',
      whNameB2B: data.whNameB2B,
      whNameB2C: data.whNameB2C,
      costCenter: data.costCenter,
      zone: data.zone,
      warehouseId: data.warehouseId,
      submittedById: currentUser.id,
      submittedByName: currentUser.fullName,
      fuel: data.fuel || 'Diesel',
      type: data.type,
      vendorNamePayment: data.type === 'Payment Only' ? data.vendorNamePayment : undefined,
      vendorNameDelivery: data.type === 'Delivery Only' ? data.vendorNameDelivery : undefined,
      quantity: data.quantity,
      orderQuantityLitres: data.type === 'Delivery Only' ? data.orderQuantityLitres : undefined,
      deliveredQuantityLitres: undefined,
      ratePerLitre: rate,
      finalAmount,
      qrCodeImageUrl: data.qrCodeImageUrl,
      status: 'Pending Admin Approval',
      validation: data.type === 'Delivery Only' ? 'Pending Validation' : undefined,
      threadId,
      notes: data.notes,
      lastEmailTriggeredAt: new Date().toISOString()
    };

    setDieselLogs(prev => [newLog, ...prev]);
    pushDieselLogToSheet(newLog);

    setDieselAuditLog(prev => [{
      id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      logId: docId,
      uniqueId,
      action: 'CREATED',
      performedByName: currentUser.fullName,
      performedByEmail: currentUser.email,
      timestamp: newLog.timestamp,
      details: `${data.type} requisition created for ${data.whNameB2B}.`
    }, ...prev]);

    // Construct Email Subject & Body for request trigger
    const subject = `[${uniqueId}] ${data.type === 'Payment Only' ? 'Fuel Payment Request' : 'Diesel Delivery Request'} - ${data.whNameB2B}`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;background:#ffffff;">
        <div style="background:#0F172A;padding:16px 20px;color:#ffffff;">
          <h2 style="margin:0;font-size:17px;font-weight:bold;">Fuel Procurement Request Notification</h2>
          <div style="font-size:12px;opacity:0.85;margin-top:4px;">Request ID: <strong>${uniqueId}</strong> &bull; Status: <span style="background:#F59E0B;color:#000000;padding:2px 6px;border-radius:4px;font-weight:bold;">PENDING</span></div>
        </div>
        <div style="padding:18px 20px;">
          <p style="font-size:13px;color:#334155;margin-top:0;">A new fuel procurement ticket has been logged by <strong>${currentUser.fullName}</strong> (${data.emailAddress}).</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;width:40%;">Requestor:</td><td style="padding:8px 12px;">${data.emailAddress}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Entity:</td><td style="padding:8px 12px;">${data.entity}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">WH Name (B2B):</td><td style="padding:8px 12px;">${data.whNameB2B}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">WH Name (B2C):</td><td style="padding:8px 12px;">${data.whNameB2C}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Cost Center:</td><td style="padding:8px 12px;">${data.costCenter}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Zone:</td><td style="padding:8px 12px;">${data.zone}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Fuel Type:</td><td style="padding:8px 12px;">${data.fuel}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Type:</td><td style="padding:8px 12px;">${data.type}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Vendor:</td><td style="padding:8px 12px;">${vendorName || '—'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Quantity:</td><td style="padding:8px 12px;">${qty.toLocaleString()} Litres</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Rate Per Litre:</td><td style="padding:8px 12px;">₹${rate.toFixed(2)}</td></tr>
            <tr style="background:#EFF6FF;"><td style="padding:10px 12px;font-weight:bold;color:#1D4ED8;">Final Calculated Amount:</td><td style="padding:10px 12px;font-weight:bold;color:#1D4ED8;font-size:15px;">₹${finalAmount.toLocaleString('en-IN')}</td></tr>
          </table>
          ${data.notes ? `<p style="font-size:12px;color:#64748B;background:#F8FAFC;padding:8px 12px;border-radius:6px;margin-bottom:0;"><strong>Site Notes:</strong> ${data.notes}</p>` : ''}
        </div>
        <div style="background:#F1F5F9;padding:12px 20px;font-size:11px;color:#64748B;border-top:1px solid #E2E8F0;">
          This email was triggered automatically by the Warehouse Management Portal. CC sent to Admin & Vendor Fulfillment teams.
        </div>
      </div>
    `;

    const plainText = `[${uniqueId}] ${data.type} - ${data.whNameB2B}\nRequestor: ${data.emailAddress}\nVendor: ${vendorName}\nQuantity: ${qty} L @ ₹${rate}/L\nFinal Amount: ₹${finalAmount.toLocaleString('en-IN')}\nStatus: PENDING ADMIN APPROVAL`;

    const newEmailLog: EmailLogEntry = {
      id: `EML_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      uniqueId,
      threadId,
      timestamp: new Date().toISOString(),
      type: 'REQUEST_SUBMISSION',
      to: data.emailAddress,
      cc: ccList,
      subject,
      htmlBody,
      plainText,
      status: 'SENT',
      triggerEvent: `Form Submission by ${currentUser.fullName}`
    };

    setEmailLogs(prev => [newEmailLog, ...prev]);

    setNotification({
      type: 'success',
      message: `Diesel request [${uniqueId}] submitted! Notification email triggered to ${data.emailAddress} and CC to ${ccList}.`
    });

    return {
      success: true,
      logId: docId,
      uniqueId,
      threadId,
      message: `Procurement request [${uniqueId}] submitted successfully.`
    };
  };

  const approveDieselLog = (logId: string, notes?: string) => {
    const target = dieselLogs.find(l => l.id === logId);
    if (!target) return { success: false, message: 'Log not found' };

    // Rule #31: a POC may never approve their own request.
    if (target.submittedById === currentUser.id && currentUser.role === 'SITE_POC') {
      return { success: false, message: 'You cannot approve your own requisition.' };
    }

    // Rule #23/#24: exactly two decisions. Approving routes by type into its own status track
    // (never mixing Payment Only and Delivery Only statuses — rule #27).
    const updatedStatus: DieselStatus = target.type === 'Delivery Only' ? 'Ready for Delivery' : 'Payment Processing';
    const now = new Date().toISOString();

    setDieselLogs(prev =>
      prev.map(l => {
        if (l.id === logId) {
          return {
            ...l,
            status: updatedStatus,
            adminApprovalNotes: notes || l.adminApprovalNotes,
            adminApprovedAt: now,
            adminApprovedBy: currentUser.fullName,
            lastEmailTriggeredAt: now
          };
        }
        return l;
      })
    );
    pushDieselUpdateToSheet(target.uniqueId, { status: updatedStatus });

    setDieselAuditLog(prev => [{
      id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      logId,
      uniqueId: target.uniqueId,
      action: 'APPROVED',
      performedByName: currentUser.fullName,
      performedByEmail: currentUser.email,
      timestamp: now,
      details: notes || undefined
    }, ...prev]);

    // Reply Email to Thread
    const subject = `Re: [${target.uniqueId}] Fuel Procurement Request - APPROVED`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;background:#ffffff;">
        <div style="background:#059669;padding:16px 20px;color:#ffffff;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:16px;">Request Approved by Admin Team</h2>
          <div style="font-size:12px;opacity:0.9;margin-top:2px;">Request ID: <strong>${target.uniqueId}</strong> &bull; Approved by <strong>${currentUser.fullName}</strong></div>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#334155;">
          <p>The fuel procurement request for <strong>${target.whNameB2B || target.warehouseId}</strong> (Amount: <strong>₹${target.finalAmount.toLocaleString('en-IN')}</strong>) has been approved.</p>
          ${notes ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;padding:10px 14px;border-radius:6px;color:#166534;margin:12px 0;"><strong>Approval Remarks:</strong> ${notes}</div>` : ''}
          <p style="margin-bottom:0;color:#64748B;font-size:12px;">Site POC can now coordinate fuel delivery and validate received quantity at tanker arrival.</p>
        </div>
      </div>
    `;

    const plainText = `[${target.uniqueId}] APPROVED\nApproved by: ${currentUser.fullName}\nSite: ${target.whNameB2B}\nRemarks: ${notes || 'None'}`;

    const newEmailLog: EmailLogEntry = {
      id: `EML_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      uniqueId: target.uniqueId,
      threadId: target.threadId || `thrd_${target.uniqueId}`,
      timestamp: now,
      type: 'ADMIN_APPROVAL',
      to: target.emailAddress || currentUser.email,
      cc: POD_CC_EMAILS,
      subject,
      htmlBody,
      plainText,
      status: 'SENT',
      triggerEvent: `Admin Approval by ${currentUser.fullName}`
    };

    setEmailLogs(prev => [newEmailLog, ...prev]);

    setNotification({
      type: 'success',
      message: `Request [${target.uniqueId}] APPROVED. Mail reply sent to thread.`
    });

    return { success: true, message: `Request [${target.uniqueId}] approved.` };
  };

  const rejectDieselLog = (logId: string, reason: string) => {
    const target = dieselLogs.find(l => l.id === logId);
    if (!target) return { success: false, message: 'Log not found' };

    // Rule #24: rejection requires a reason.
    if (!reason || !reason.trim()) {
      return { success: false, message: 'Please enter a rejection reason.' };
    }

    const updatedStatus: DieselStatus = 'Rejected';
    const now = new Date().toISOString();

    setDieselLogs(prev =>
      prev.map(l => {
        if (l.id === logId) {
          return {
            ...l,
            status: updatedStatus,
            rejectionReason: reason,
            adminApprovalNotes: reason,
            adminApprovedAt: now,
            adminApprovedBy: currentUser.fullName,
            lastEmailTriggeredAt: now
          };
        }
        return l;
      })
    );
    // Note: the real master sheet header has no "Rejection Reason" column — only Status.
    // The reason itself stays in the app's own audit log (dieselAuditLog), not the sheet.
    pushDieselUpdateToSheet(target.uniqueId, { status: updatedStatus });

    setDieselAuditLog(prev => [{
      id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      logId,
      uniqueId: target.uniqueId,
      action: 'REJECTED',
      performedByName: currentUser.fullName,
      performedByEmail: currentUser.email,
      timestamp: now,
      details: reason
    }, ...prev]);

    const subject = `Re: [${target.uniqueId}] Fuel Procurement Request - REJECTED`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;background:#ffffff;">
        <div style="background:#DC2626;padding:16px 20px;color:#ffffff;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:16px;">Request Rejected by Admin Team</h2>
          <div style="font-size:12px;opacity:0.9;margin-top:2px;">Request ID: <strong>${target.uniqueId}</strong> &bull; Rejected by <strong>${currentUser.fullName}</strong></div>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#334155;">
          <p>The fuel procurement request for <strong>${target.whNameB2B || target.warehouseId}</strong> has been rejected.</p>
          <div style="background:#FEF2F2;border:1px solid #FECACA;padding:10px 14px;border-radius:6px;color:#991B1B;margin:12px 0;"><strong>Rejection Reason:</strong> ${reason}</div>
          <p style="margin-bottom:0;color:#64748B;font-size:12px;">Please contact the Fuel Operations admin for clarification or re-submit with revised details.</p>
        </div>
      </div>
    `;

    const plainText = `[${target.uniqueId}] REJECTED\nRejected by: ${currentUser.fullName}\nSite: ${target.whNameB2B}\nReason: ${reason}`;

    const newEmailLog: EmailLogEntry = {
      id: `EML_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      uniqueId: target.uniqueId,
      threadId: target.threadId || `thrd_${target.uniqueId}`,
      timestamp: now,
      type: 'ADMIN_REJECTION',
      to: target.emailAddress || currentUser.email,
      cc: POD_CC_EMAILS,
      subject,
      htmlBody,
      plainText,
      status: 'SENT',
      triggerEvent: `Admin Rejection by ${currentUser.fullName}`
    };

    setEmailLogs(prev => [newEmailLog, ...prev]);

    setNotification({
      type: 'warning',
      message: `Request [${target.uniqueId}] REJECTED. Notification sent.`
    });

    return { success: true, message: `Request [${target.uniqueId}] rejected.` };
  };

  /**
   * Delivery Validation (Delivery Only only) — spec rules #17-#20.
   * Validation is derived from the quantities, never left to contradict them:
   *   Delivered Quantity == Order Quantity      -> Delivered
   *   0 < Delivered Quantity < Order Quantity   -> Partial Delivered  (a normal business outcome, not an error)
   *   Delivered Quantity == 0                   -> Not Delivered
   * Delivered Quantity is capped at Order Quantity (no admin-override path implemented yet).
   * POD is mandatory before this can complete.
   */
  const validateDelivery = (
    logId: string,
    payload: {
      validation: 'Delivered' | 'Partial Delivered' | 'Not Delivered';
      deliveredQuantityLitres: number;
      podUrl: string;
      notes?: string;
    }
  ) => {
    const target = dieselLogs.find(l => l.id === logId);
    if (!target) return { success: false, message: 'Log not found' };

    if (target.type !== 'Delivery Only') {
      return { success: false, message: 'Only Delivery Only requisitions go through delivery validation.' };
    }
    if (!payload.podUrl) {
      return { success: false, message: 'Please upload POD before completing the delivery validation.' };
    }

    const orderedQty = target.orderQuantityLitres || 0;
    const rawDeliveredQty = Number(payload.deliveredQuantityLitres || 0);
    if (rawDeliveredQty < 0) {
      return { success: false, message: 'Please enter a valid quantity/rate.' };
    }
    // Rule #18: normally prevent Delivered Quantity > Order Quantity (no override flow yet).
    const deliveredQty = Math.min(rawDeliveredQty, orderedQty);

    const validation: DieselValidation =
      deliveredQty === 0 ? 'Not Delivered' : deliveredQty >= orderedQty ? 'Delivered' : 'Partial Delivered';
    const finalStatus: DieselStatus =
      validation === 'Delivered' ? 'Delivery Completed' : validation === 'Partial Delivered' ? 'Partial Delivery' : 'Not Delivered';
    const variance = orderedQty - deliveredQty;
    const isDiscrepancy = variance !== 0;
    const now = new Date().toISOString();

    setDieselLogs(prev =>
      prev.map(l => {
        if (l.id === logId) {
          return {
            ...l,
            status: finalStatus,
            validation,
            deliveredQuantityLitres: deliveredQty,
            podUrl: payload.podUrl,
            podTimestamp: now,
            podUploadedByName: currentUser.fullName,
            validatedByName: currentUser.fullName,
            validatedAt: now,
            notes: payload.notes || l.notes,
            lastEmailTriggeredAt: now
          };
        }
        return l;
      })
    );
    pushDieselUpdateToSheet(target.uniqueId, {
      status: finalStatus,
      validation,
      deliveredQuantityLitres: deliveredQty,
      podUrl: payload.podUrl
    });

    setDieselAuditLog(prev => [
      {
        id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
        logId,
        uniqueId: target.uniqueId,
        action: 'VALIDATED',
        performedByName: currentUser.fullName,
        performedByEmail: currentUser.email,
        timestamp: now,
        details: `${validation} — ${deliveredQty}/${orderedQty} L`
      },
      {
        id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900) + 1}`,
        logId,
        uniqueId: target.uniqueId,
        action: 'POD_UPLOADED',
        performedByName: currentUser.fullName,
        performedByEmail: currentUser.email,
        timestamp: now
      },
      ...prev
    ]);

    // Trigger POD Validation Email Reply to Thread
    const subject = `Re: [${target.uniqueId}] POD Uploaded & Delivery Validated - ${validation.toUpperCase()}`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;background:#ffffff;">
        <div style="background:${isDiscrepancy ? '#B45309' : '#047857'};padding:16px 20px;color:#ffffff;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:16px;">Delivery Validated & POD Uploaded</h2>
          <div style="font-size:12px;opacity:0.9;margin-top:2px;">Request ID: <strong>${target.uniqueId}</strong> &bull; Audit Result: <strong>${validation.toUpperCase()}</strong></div>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#334155;">
          <p>Site POC <strong>${currentUser.fullName}</strong> has validated diesel arrival at <strong>${target.whNameB2B || target.warehouseId}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Ordered Quantity:</td><td style="padding:8px 12px;">${orderedQty} L</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Delivered Quantity:</td><td style="padding:8px 12px;">${deliveredQty} L</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Variance:</td><td style="padding:8px 12px;font-weight:bold;color:${isDiscrepancy ? '#DC2626' : '#16A34A'};">${variance > 0 ? `-${variance} L Shortage` : variance < 0 ? `+${Math.abs(variance)} L Excess` : '0 L (Exact Match)'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Audit Status:</td><td style="padding:8px 12px;font-weight:bold;color:${isDiscrepancy ? '#D97706' : '#059669'};">${validation}</td></tr>
          </table>
          ${payload.podUrl ? `
            <div style="margin:16px 0;background:#F8FAFC;padding:12px;border-radius:8px;border:1px dashed #CBD5E1;">
              <p style="font-weight:bold;font-size:12px;margin:0 0 8px 0;">Proof of Delivery (POD) Document Attached:</p>
              <a href="${payload.podUrl}" target="_blank" style="color:#0284C7;text-decoration:none;font-weight:bold;font-size:13px;">&rarr; View Uploaded POD Document / Challan</a>
            </div>
          ` : ''}
          ${payload.notes ? `<p style="font-size:12px;color:#64748B;background:#F8FAFC;padding:8px 12px;border-radius:6px;margin-bottom:0;"><strong>Site POC Remarks:</strong> ${payload.notes}</p>` : ''}
        </div>
      </div>
    `;

    const plainText = `[${target.uniqueId}] POD UPLOADED & VALIDATED\nSite: ${target.whNameB2B}\nOrdered: ${orderedQty} L | Delivered: ${deliveredQty} L\nValidation: ${validation}\nPOD URL: ${payload.podUrl}\nRemarks: ${payload.notes || '-'}`;

    const newEmailLog: EmailLogEntry = {
      id: `EML_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      uniqueId: target.uniqueId,
      threadId: target.threadId || `thrd_${target.uniqueId}`,
      timestamp: now,
      type: 'POD_UPLOAD',
      to: target.emailAddress || currentUser.email,
      cc: POD_CC_EMAILS,
      subject,
      htmlBody,
      plainText,
      status: 'SENT',
      triggerEvent: `POD Upload & Validation by ${currentUser.fullName}`
    };

    setEmailLogs(prev => [newEmailLog, ...prev]);

    if (isDiscrepancy) {
      setNotification({
        type: 'warning',
        message: `POD Recorded with Discrepancy (${variance}L shortage)! Email update sent to Admin & Vendor.`
      });
    } else {
      setNotification({
        type: 'success',
        message: `POD Uploaded & Delivery 100% Verified for [${target.uniqueId}]! Email update sent.`
      });
    }

    return {
      success: true,
      isDiscrepancy,
      message: `Delivery validated as ${validation}.`
    };
  };

  /** @deprecated thin compatibility wrapper — auto-derives the Validation dropdown value from quantity, then calls validateDelivery. */
  const validateAndUploadPOD = (
    logId: string,
    payload: { deliveredQuantityLitres: number; podUrl: string; notes?: string }
  ) => {
    const target = dieselLogs.find(l => l.id === logId);
    const orderedQty = target?.orderQuantityLitres || 0;
    const deliveredQty = Number(payload.deliveredQuantityLitres || 0);
    const validation: 'Delivered' | 'Partial Delivered' | 'Not Delivered' =
      deliveredQty === 0 ? 'Not Delivered' : deliveredQty >= orderedQty ? 'Delivered' : 'Partial Delivered';
    const res = validateDelivery(logId, { ...payload, validation });
    return { success: res.success, isDiscrepancy: deliveredQty !== orderedQty, message: res.message };
  };

  // Vendor Master (spec section 24) — lets Admin add/retire vendors with no code change.
  const addVendor = (data: { name: string; vendorType: Vendor['vendorType']; email?: string }) => {
    if (!data.name.trim()) return { success: false, message: 'Please enter a vendor name.' };
    if (vendors.some(v => v.name.toLowerCase() === data.name.trim().toLowerCase())) {
      return { success: false, message: `Vendor "${data.name}" already exists.` };
    }
    const newVendor: Vendor = {
      id: `VND_${Date.now()}`,
      name: data.name.trim(),
      vendorType: data.vendorType,
      email: data.email?.trim(),
      isActive: true
    };
    setVendors(prev => [...prev, newVendor]);
    setNotification({ type: 'success', message: `Vendor "${newVendor.name}" added.` });
    return { success: true, message: `Vendor "${newVendor.name}" added.` };
  };

  const updateVendor = (vendorId: string, updates: Partial<Vendor>) => {
    setVendors(prev => prev.map(v => (v.id === vendorId ? { ...v, ...updates } : v)));
  };

  const toggleVendorActive = (vendorId: string) => {
    setVendors(prev => prev.map(v => (v.id === vendorId ? { ...v, isActive: !v.isActive } : v)));
  };

  const updateDieselLog = (logId: string, updates: Partial<DieselLog>) => {
    setDieselLogs(prev =>
      prev.map(l => {
        if (l.id === logId) {
          return {
            ...l,
            ...updates
          };
        }
        return l;
      })
    );
    setNotification({
      type: 'success',
      message: 'Diesel record updated successfully.'
    });
  };

  /**
   * A POC can delete their own mistaken requisition, but only before it's gone anywhere —
   * once Admin has approved it (or it's mid/post-delivery), it's a real transaction and stays.
   * Admins can delete any record. Deletion is still logged to the audit trail, never silent.
   */
  const deleteDieselLog = (logId: string) => {
    const target = dieselLogs.find(l => l.id === logId);
    if (!target) return;

    const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'SERVICE_ADMIN' || currentUser.role === 'WAREHOUSE_ADMIN';
    if (!isAdmin) {
      if (target.submittedById !== currentUser.id) {
        setNotification({ type: 'error', message: 'You can only delete your own requisitions.' });
        return;
      }
      const deletableStatuses: DieselStatus[] = ['Pending Admin Approval', 'Rejected'];
      if (!deletableStatuses.includes(target.status)) {
        setNotification({ type: 'error', message: `[${target.uniqueId}] can no longer be deleted — it's already ${target.status}.` });
        return;
      }
    }

    setDieselLogs(prev => prev.filter(l => l.id !== logId));

    setDieselAuditLog(prev => [{
      id: `AUD_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      logId,
      uniqueId: target.uniqueId,
      action: 'DELETED',
      performedByName: currentUser.fullName,
      performedByEmail: currentUser.email,
      timestamp: new Date().toISOString()
    }, ...prev]);

    setNotification({
      type: 'info',
      message: `Requisition [${target.uniqueId}] deleted.`
    });
  };

  const buildDieselMailPreview = (logId: string) => {
    const log = dieselLogs.find(l => l.id === logId);
    if (!log) return null;

    const vendor = log.vendorNamePayment || log.vendorNameDelivery || '';
    const vendorEmail = VENDOR_EMAIL_MAP[vendor] || '';
    const cc = vendorEmail ? `${FIXED_CC_EMAILS},${vendorEmail}` : FIXED_CC_EMAILS;
    const to = log.emailAddress || 'sudhanshu.verma@grofers.com';
    const subject = `[${log.uniqueId}] Fuel Procurement Request - ${log.whNameB2B || log.warehouseId}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;background:#ffffff;">
        <div style="background:#0F172A;padding:16px 20px;color:#ffffff;">
          <h2 style="margin:0;font-size:17px;font-weight:bold;">Fuel Procurement Request Notification</h2>
          <div style="font-size:12px;opacity:0.85;margin-top:4px;">Request ID: <strong>${log.uniqueId}</strong> &bull; Status: <strong>${log.status.toUpperCase()}</strong></div>
        </div>
        <div style="padding:18px 20px;font-size:13px;color:#334155;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;">
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;width:40%;">Requestor:</td><td style="padding:8px 12px;">${to}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">WH Name (B2B):</td><td style="padding:8px 12px;">${log.whNameB2B || log.warehouseId}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Cost Center:</td><td style="padding:8px 12px;">${log.costCenter || '—'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Vendor:</td><td style="padding:8px 12px;">${vendor || '—'}</td></tr>
            <tr style="background:#F8FAFC;"><td style="padding:8px 12px;font-weight:bold;">Quantity:</td><td style="padding:8px 12px;">${(log.orderQuantityLitres || log.quantity || 0).toLocaleString()} Litres</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Rate Per Litre:</td><td style="padding:8px 12px;">₹${log.ratePerLitre.toFixed(2)}</td></tr>
            <tr style="background:#EFF6FF;"><td style="padding:10px 12px;font-weight:bold;color:#1D4ED8;">Final Calculated Amount:</td><td style="padding:10px 12px;font-weight:bold;color:#1D4ED8;font-size:15px;">₹${log.finalAmount.toLocaleString('en-IN')}</td></tr>
          </table>
        </div>
      </div>
    `;

    const plain = `[${log.uniqueId}] Fuel Procurement Request\nTo: ${to}\nCC: ${cc}\nAmount: ₹${log.finalAmount}\nStatus: ${log.status}`;
    const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;

    return { subject, html, plain, composeUrl, to, cc };
  };

  /**
   * Pushes one diesel request into the linked Google Sheet.
   *
   * Best-effort by design: no linked sheet is the normal state, and a
   * push that fails must not disturb the submission that already saved.
   * The script upserts on Unique ID, so calling this again after an
   * approval or a delivery validation edits that request's own row.
   */
  const mirrorDieselToSheet = (log: DieselLog) => {
    try {
      // Same registry and same transport as every other service.
      const url = sheetWebhookUrls['SHEET_DIESEL'];
      if (!url) return;
      submitViaHiddenForm(url, buildDieselSheetPayload(log));
    } catch {
      /* the sheet is a mirror; the record is already saved locally */
    }
  };

  const createDieselLog = (
    data: Omit<DieselLog, 'id' | 'timestamp' | 'submittedById' | 'submittedByName' | 'finalAmount' | 'validation'> & {
      uniqueId?: string;
    }
  ) => {
    const generatedUniqueId = data.uniqueId || `DSL-${data.warehouseId.replace('WH_', '')}-${Math.floor(100 + Math.random() * 900)}`;
    const docId = `DSL_${data.warehouseId}_${generatedUniqueId}`;

    const finalAmount = Math.round((data.deliveredQuantityLitres || data.orderQuantityLitres || 0) * data.ratePerLitre * 100) / 100;
    const isDiscrepancy = Number(data.orderQuantityLitres || 0) !== Number(data.deliveredQuantityLitres || data.orderQuantityLitres || 0);
    const validation: DieselValidation = isDiscrepancy ? 'Partial Delivered' : 'Delivered';

    const newLog: DieselLog = {
      ...data,
      id: docId,
      uniqueId: generatedUniqueId,
      timestamp: new Date().toISOString(),
      submittedById: currentUser.id,
      submittedByName: currentUser.fullName,
      finalAmount,
      validation,
      status: data.status || 'Delivery Completed'
    };

    setDieselLogs(prev => [newLog, ...prev]);

    // Mirror into the Google Sheet, if one is linked. Deliberately after
    // the local write and deliberately not awaited: the sheet is a copy,
    // and Google being slow must never look like a failed submission to
    // the person who just filed it.
    mirrorDieselToSheet(newLog);

    if (isDiscrepancy) {
      setNotification({
        type: 'warning',
        message: `Discrepancy Detected! Ordered: ${data.orderQuantityLitres}L vs Delivered: ${data.deliveredQuantityLitres}L. Flagged for Audit.`
      });
    } else {
      setNotification({
        type: 'success',
        message: `Diesel Inward Log created successfully. Doc ID: ${docId}`
      });
    }

    return {
      success: true,
      message: isDiscrepancy ? 'Diesel log flagged with discrepancy' : 'Diesel log saved & verified',
      logId: docId,
      isDiscrepancy
    };
  };

  /**
   * Generic Sheet Records Engine
   */
  const addSheetRecord = (sheetId: string, recordData: Record<string, any>) => {
    const id = `REC_${sheetId.replace('SHEET_', '')}_${Date.now().toString().slice(-6)}`;
    const newRecord = {
      id,
      date: recordData.date || currentDate,
      warehouseId: recordData.warehouseId || (currentUser.warehouseId || warehouses[0].id),
      shift: recordData.shift || selectedShift,
      submittedByName: currentUser.fullName,
      submittedAt: new Date().toISOString(),
      status: recordData.status || 'Verified',
      ...recordData
    };

    setSheetRecords(prev => {
      const currentList = prev[sheetId] || [];
      return {
        ...prev,
        [sheetId]: [newRecord, ...currentList]
      };
    });

    setNotification({
      type: 'success',
      message: `Record added to ${sheetId} (ID: ${id})`
    });

    return { ok: true, id, message: 'Record saved successfully.' };
  };

  const addOperationalSheet = (sheetDef: OperationalSheetDef) => {
    setOperationalSheets(prev => [...prev, sheetDef]);
    setNotification({
      type: 'success',
      message: `New Form "${sheetDef.title}" created & added to Operational Sheets!`
    });
    return { ok: true, message: 'Form created successfully.' };
  };

  const exportSheetData = (sheetId: string, format: 'csv' | 'json') => {
    let rows: any[] = [];
    if (sheetId === 'SHEET_DAILY_SITE') {
      rows = dailySiteLogs;
    } else if (sheetId === 'SHEET_DIESEL') {
      rows = dieselLogs;
    } else {
      rows = sheetRecords[sheetId] || [];
    }

    if (rows.length === 0) {
      setNotification({ type: 'warning', message: 'No records available to export for this sheet.' });
      return;
    }

    if (format === 'json') {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rows, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `${sheetId}_export_${currentDate}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      // CSV
      const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      const csvRows = [
        keys.join(','),
        ...rows.map(row => 
          keys.map(k => {
            const val = row[k];
            if (val === undefined || val === null) return '""';
            if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            return `"${String(val).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ];
      const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', csvContent);
      downloadAnchor.setAttribute('download', `${sheetId}_export_${currentDate}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    setNotification({ type: 'success', message: `Exported ${rows.length} rows as ${format.toUpperCase()}` });
  };

  /**
   * Column & Schema Customization Engine for ANY Sheet
   */
  const updateSheetColumns = (sheetId: string, fields: FieldDefinition[]) => {
    setOperationalSheets(prev =>
      prev.map(sheet => {
        if (sheet.id === sheetId) {
          return {
            ...sheet,
            fieldsConfig: fields,
            fieldsCount: fields.length
          };
        }
        return sheet;
      })
    );
    setNotification({
      type: 'success',
      message: `Schema updated for ${sheetId}. ${fields.length} columns active.`
    });
  };

  const addColumnToSheet = (sheetId: string, field: FieldDefinition) => {
    setOperationalSheets(prev =>
      prev.map(sheet => {
        if (sheet.id === sheetId) {
          const existing = sheet.fieldsConfig || [];
          // Avoid duplicate keys
          const filtered = existing.filter(f => f.key !== field.key);
          const updated = [...filtered, field];
          return {
            ...sheet,
            fieldsConfig: updated,
            fieldsCount: updated.length
          };
        }
        return sheet;
      })
    );
    setNotification({
      type: 'success',
      message: `Column "${field.label}" (${field.key}) added to sheet schema!`
    });
  };

  const removeColumnFromSheet = (sheetId: string, fieldKey: string) => {
    setOperationalSheets(prev =>
      prev.map(sheet => {
        if (sheet.id === sheetId) {
          const existing = sheet.fieldsConfig || [];
          const updated = existing.filter(f => f.key !== fieldKey);
          return {
            ...sheet,
            fieldsConfig: updated,
            fieldsCount: updated.length
          };
        }
        return sheet;
      })
    );
    setNotification({
      type: 'info',
      message: `Column "${fieldKey}" removed from sheet schema.`
    });
  };

  /**
   * Service & Responsibility Matrix Operations (Admin & POC Site-wise Mapping)
   */
  const updateServiceAssignment = (id: string, updates: Partial<ServiceAssignment>) => {
    setServiceAssignments(prev =>
      prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      })
    );
    setNotification({
      type: 'success',
      message: `Service responsibility updated successfully.`
    });
  };

  const addServiceAssignment = (assignment: ServiceAssignment) => {
    setServiceAssignments(prev => [assignment, ...prev]);
    setNotification({
      type: 'success',
      message: `New service responsibility mapping created (${assignment.serviceName} - ${assignment.warehouseName}).`
    });
  };

  const deleteServiceAssignment = (id: string) => {
    setServiceAssignments(prev => prev.filter(item => item.id !== id));
    setNotification({
      type: 'info',
      message: `Service responsibility mapping removed.`
    });
  };

  const bulkUpdateServiceAssignments = (ids: string[], updates: Partial<ServiceAssignment>) => {
    const idSet = new Set(ids);
    setServiceAssignments(prev =>
      prev.map(item => {
        if (idSet.has(item.id)) {
          return {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      })
    );
    setNotification({
      type: 'success',
      message: `Batch updated ${ids.length} service assignments!`
    });
  };

  /**
   * Service Assignment Access Scoping Engine:
   * Super Admins access all services.
   * Site POCs access every service sheet for their own site (they file into all of them).
   * Service Admins access their assigned services across ALL nationwide warehouses.
   */
  const getAssignedServicesForUser = (user: User = currentUser): string[] => {
    if (user.role === 'SUPER_ADMIN') {
      return operationalSheets.map(s => s.id);
    }
    // A site POC files the services actually enabled at THEIR site, not every
    // service in the catalogue (MASTERDATA.md §6: a POC's effective services
    // are their own codes intersected with the site's Services_Enabled).
    // servicesForSite falls back to the full list when a site has no
    // assignment rows at all, so the 115 sites still missing assignments are
    // not locked out by a data gap.
    if (user.role === 'SITE_POC') {
      return servicesForSite(user.warehouseId, serviceAssignments, operationalSheets.map(s => s.id));
    }
    const set = new Set<string>();
    if (user.assignedServiceIds) {
      user.assignedServiceIds.forEach(s => set.add(s));
    }
    serviceAssignments.forEach(asg => {
      if (
        asg.adminLeadId === user.id ||
        (asg.adminLeadEmail && asg.adminLeadEmail.toLowerCase() === user.email.toLowerCase()) ||
        (asg.adminLeadName && user.fullName.toLowerCase().includes(asg.adminLeadName.toLowerCase().split(' ')[0]))
      ) {
        if (asg.serviceId) set.add(asg.serviceId);
      }
    });
    // Fallback if none assigned: allow default daily operations
    if (set.size === 0 && (user.role === 'SERVICE_ADMIN' || user.role === 'WAREHOUSE_ADMIN')) {
      return ['SHEET_DAILY_SITE', 'SHEET_HOUSEKEEPING', 'SHEET_DG_POWER_WATER', 'SHEET_DIESEL', 'SHEET_WASHING'];
    }
    return Array.from(set);
  };

  const isServiceAccessible = (sheetId: string, user: User = currentUser): boolean => {
    if (user.role === 'SUPER_ADMIN') return true;
    // Every other role, POC included, is checked against their own service
    // scope. A POC used to short-circuit to `true` here, which is what let a
    // service that isn't enabled at their site show up on their filing desk.
    const allowed = getAssignedServicesForUser(user);
    return allowed.includes(sheetId);
  };

  /**
   * Daily Site Activity Report Implementation (Exact match to AppSheet AS_DailyLog logic)
   */
  const getExistingDailyReport = (site: string, date: string): DailySiteLog | undefined => {
    return dailySiteLogs.find(l => l.site === site && l.date === date);
  };

  /**
   * Submit to a Google Apps Script Web App via a form POST into a real popup window.
   * fetch() is subject to browser CORS, which blocks a domain-restricted ("Anyone within Grofers")
   * Apps Script deployment regardless of whether the caller is logged in. A real HTML form
   * submission is NOT subject to CORS at all (CORS only stops JS from *reading* a cross-origin
   * response, not from submitting to one).
   *
   * Why a popup and not a hidden <iframe>: Chrome now withholds third-party cookies — including
   * your Google login session — from anything embedded INSIDE the page, which is exactly what a
   * hidden iframe is. That silently turned every submission into an anonymous, logged-out request,
   * which a domain-restricted deployment correctly rejects with 401 (confirmed via DevTools on
   * this exact URL). A popup window is its own top-level browsing context — its address bar
   * really is script.google.com — so it's not "third-party" and carries your login cookie exactly
   * like manually opening the URL in a new tab does.
   *
   * Trade-off: we still can't read Google's response this way, so it's pure fire-and-forget — fine
   * here since the record is already saved locally before this is ever called. The popup is small
   * and tucked in a corner, and closes itself automatically a few seconds after submitting.
   */
  const submitViaHiddenForm = (url: string, payload: any) => {
    try {
      const popupName = `sheet_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const width = 420;
      const height = 280;
      const left = Math.max(0, window.screen.width - width - 20);
      const top = Math.max(0, window.screen.height - height - 80);

      const popup = window.open('about:blank', popupName, `width=${width},height=${height},left=${left},top=${top}`);

      if (!popup) {
        console.error(
          'Sheet sync popup was blocked by the browser — this call must happen directly inside a user click ' +
          '(e.g. the Submit button), not after an await/setTimeout. Look for a "popup blocked" icon in the address bar.'
        );
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      form.target = popupName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(payload);
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();
      form.remove();

      // Close the popup once the submission has had time to land. Closing a window mid-navigation
      // aborts its in-flight request, so this delay needs to comfortably cover a cold Apps Script
      // execution, not just a warm one.
      setTimeout(() => {
        try {
          if (!popup.closed) popup.close();
        } catch {
          // Ignore — user may have already closed it themselves.
        }
      }, 6000);
    } catch (err) {
      console.error('Sheet sync (popup form) failed to submit:', err);
    }
  };

  /**
   * Push a filed Daily Site Report straight into the real AS_DailyLog / AS_OngoingActivity
   * Google Sheet via its dedicated Apps Script Web App (see SHEET_DAILY_SITE in sheetWebhookUrls).
   * Fire-and-forget: the log is already saved locally, so a sync failure here never blocks the POC.
   */
  const pushDailyLogToSheet = (log: DailySiteLog) => {
    const url = sheetWebhookUrls['SHEET_DAILY_SITE'];
    if (!url) return;

    // Sheet's "Site" column uses the human facility name / Site_Key (e.g. "Kundli"),
    // not the app's internal warehouse ID (e.g. "WH_DEL_01") — resolve before sending.
    const siteWarehouse = warehouses.find(w => w.id === log.site);
    const siteName = siteWarehouse ? siteWarehouse.name : log.site;

    submitViaHiddenForm(url, {
      action: 'submitDailyLog',
      log: {
        logId: log.logId,
            timestamp: log.timestamp,
            date: log.date,
            site: siteName,
            pocName: log.pocName,
            pocEmail: log.pocEmail,
            ups: log.ups, upsRemark: log.upsRemark || '',
            dg: log.dg, dgRemark: log.dgRemark || '',
            ltPanel: log.ltPanel, ltPanelRemark: log.ltPanelRemark || '',
            coldRoom: log.coldRoom, coldRoomRemark: log.coldRoomRemark || '',
            hvls: log.hvls, hvlsRemark: log.hvlsRemark || '',
            waterCoolers: log.waterCoolers, waterCoolersRemark: log.waterCoolersRemark || '',
            freezersGgp: log.freezersGgp, freezersGgpRemark: log.freezersGgpRemark || '',
            doorBuzzer: log.doorBuzzer, doorBuzzerRemark: log.doorBuzzerRemark || '',
            rt: log.rt, rtRemark: log.rtRemark || '',
            bopt: log.bopt, boptRemark: log.boptRemark || '',
            stackers: log.stackers, stackersRemark: log.stackersRemark || '',
            vrc: log.vrc, vrcRemark: log.vrcRemark || '',
            mtsInspection: log.mtsInspection, mtsRemark: log.mtsRemark || '',
            lightsInspection: log.lightsInspection, lightsRemark: log.lightsRemark || '',
            airCirculation: log.airCirculation, airCirculationRemark: log.airCirculationRemark || '',
            gemba: log.gemba, gembaRemark: log.gembaRemark || '',
            pmPlanned: log.pmPlanned,
            pmCompleted: log.pmCompleted,
            pmRemark: log.pmRemark || '',
            highlights: log.highlights || ''
          },
      activities: log.activities.map(a => ({
        rowId: a.rowId,
        logId: a.logId,
        srNo: a.srNo,
        work: a.work,
        owner: a.owner,
        status: a.status,
        eta: a.eta,
        barrier: a.barrier || '',
        cost: a.cost || 0,
        manhours: a.manhours || 0
      }))
    });
  };

  /**
   * Push a new Diesel requisition into the real ZHPL master sheet — one row,
   * columns in the exact order/names of the real CSV header (see
   * DIESEL_COLUMN_ORDER in SheetDataExplorer.tsx / DieselTracker.tsx).
   * Fire-and-forget: the log is already saved locally before this is called.
   */
  const pushDieselLogToSheet = (log: DieselLog) => {
    const url = sheetWebhookUrls['SHEET_DIESEL'];
    if (!url) return;

    submitViaHiddenForm(url, {
      action: 'submitDiesel',
      row: {
        timestamp: log.timestamp,
        emailAddress: log.emailAddress || '',
        entity: log.entity || '',
        whNameB2B: log.whNameB2B || '',
        whNameB2C: log.whNameB2C || '',
        costCenter: log.costCenter || '',
        zone: log.zone || '',
        fuel: log.fuel,
        type: log.type,
        vendorNamePayment: log.vendorNamePayment || '',
        quantity: log.quantity ?? '',
        ratePerLitre: log.ratePerLitre,
        finalAmount: log.finalAmount,
        qrCodeImageUrl: log.qrCodeImageUrl || '',
        vendorNameDelivery: log.vendorNameDelivery || '',
        orderQuantityLitres: log.orderQuantityLitres ?? '',
        uniqueId: log.uniqueId,
        status: log.status,
        validation: log.validation || '',
        deliveredQuantityLitres: log.deliveredQuantityLitres ?? '',
        podUrl: log.podUrl || ''
      }
    });
  };

  /**
   * Pushes a status-track change (approve / reject / validate) for an
   * EXISTING Diesel row, found by Unique ID — only the given fields are
   * overwritten, matching the append-then-update pattern already proven for
   * Master Data's upsertPocMaster (see MasterData_Code.gs).
   */
  const pushDieselUpdateToSheet = (uniqueId: string, updates: Record<string, any>) => {
    const url = sheetWebhookUrls['SHEET_DIESEL'];
    if (!url) return;
    submitViaHiddenForm(url, { action: 'updateDiesel', uniqueId, updates });
  };

  const submitDailySiteLog = (payload: {
    site: string;
    date: string;
    values: Record<string, any>;
    remarks: Record<string, string>;
    pmPlanned: number;
    pmCompleted: number;
    pmRemark?: string;
    highlights?: string;
    activities: {
      work: string;
      owner: string;
      status: 'Open' | 'In Progress' | 'Completed' | 'Blocked';
      eta: string;
      barrier?: string;
      cost?: number;
      manhours?: number;
    }[];
  }) => {
    const existing = getExistingDailyReport(payload.site, payload.date);
    if (existing) {
      const msg = `Duplicate blocked: A report for ${payload.site} on ${payload.date} already exists (filed by ${existing.pocName}).`;
      setNotification({ type: 'error', message: msg });
      return { ok: false, logId: '', message: msg };
    }

    const logId = `LOG_${payload.date.replace(/-/g, '')}_${payload.site.replace('WH_', '')}_${Math.floor(100 + Math.random() * 900)}`;

    // Evaluate deviations and worst severity
    let deviationsCount = 0;
    let worstStatus: SiteHealthStatus = 'clear';

    // Check utility
    UTILITY_KEYS.forEach(u => {
      const val = payload.values[u.key] ?? 100;
      if (val < 100) {
        deviationsCount++;
        if (u.isCrit) worstStatus = 'critical';
        else if (worstStatus !== 'critical') worstStatus = 'partial';
      }
    });

    // Check MHE
    MHE_KEYS.forEach(m => {
      const val = payload.values[m.key] ?? 100;
      if (val < 100) {
        deviationsCount++;
        if (worstStatus !== 'critical') worstStatus = 'partial';
      }
    });

    // Check Routine
    ROUTINE_KEYS.forEach(r => {
      const val = payload.values[r.key] || 'Done';
      if (val !== 'Done') {
        deviationsCount++;
        worstStatus = 'critical';
      }
    });

    const ongoingActivities: OngoingActivity[] = (payload.activities || []).map((a, i) => ({
      rowId: `ACT_${logId}_${i + 1}`,
      logId,
      srNo: i + 1,
      work: a.work,
      owner: a.owner,
      status: a.status,
      eta: a.eta,
      barrier: a.barrier,
      cost: a.cost || 0,
      manhours: a.manhours || 0,
      overdue: a.eta ? new Date(a.eta) < new Date(payload.date) : false
    }));

    const newLog: DailySiteLog = {
      logId,
      site: payload.site,
      date: payload.date,
      timestamp: new Date().toISOString(),
      pocName: currentUser.fullName,
      pocEmail: currentUser.email,
      ups: payload.values.ups ?? 100,
      upsRemark: payload.remarks.ups,
      dg: payload.values.dg ?? 100,
      dgRemark: payload.remarks.dg,
      ltPanel: payload.values.ltPanel ?? 100,
      ltPanelRemark: payload.remarks.ltPanel,
      coldRoom: payload.values.coldRoom ?? 100,
      coldRoomRemark: payload.remarks.coldRoom,
      hvls: payload.values.hvls ?? 100,
      hvlsRemark: payload.remarks.hvls,
      waterCoolers: payload.values.waterCoolers ?? 100,
      waterCoolersRemark: payload.remarks.waterCoolers,
      freezersGgp: payload.values.freezersGgp ?? 100,
      freezersGgpRemark: payload.remarks.freezersGgp,
      doorBuzzer: payload.values.doorBuzzer ?? 100,
      doorBuzzerRemark: payload.remarks.doorBuzzer,
      rt: payload.values.rt ?? 100,
      rtRemark: payload.remarks.rt,
      bopt: payload.values.bopt ?? 100,
      boptRemark: payload.remarks.bopt,
      stackers: payload.values.stackers ?? 100,
      stackersRemark: payload.remarks.stackers,
      vrc: payload.values.vrc ?? 100,
      vrcRemark: payload.remarks.vrc,
      mtsInspection: payload.values.mtsInspection || 'Done',
      mtsRemark: payload.remarks.mtsInspection,
      lightsInspection: payload.values.lightsInspection || 'Done',
      lightsRemark: payload.remarks.lightsInspection,
      airCirculation: payload.values.airCirculation || 'Done',
      airCirculationRemark: payload.remarks.airCirculation,
      gemba: payload.values.gemba || 'Done',
      gembaRemark: payload.remarks.gemba,
      pmPlanned: payload.pmPlanned || 0,
      pmCompleted: payload.pmCompleted || 0,
      pmRemark: payload.pmRemark,
      highlights: payload.highlights,
      worstStatus,
      deviationsCount,
      activities: ongoingActivities
    };

    setDailySiteLogs(prev => [newLog, ...prev]);
    pushDailyLogToSheet(newLog);

    setNotification({
      type: 'success',
      message: `Daily Site Report filed for ${payload.site}. Log ID: ${logId}`
    });

    return { ok: true, logId, message: `Report filed for ${payload.site}.` };
  };

  /**
   * Compliance Matrix (21 Days)
   */
  const getComplianceMatrix = (endDateStr: string, days: number = 21): ComplianceMatrixResult => {
    const end = new Date(endDateStr + 'T00:00:00');
    const dayKeys: string[] = [];
    const dayLabels: string[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400000);
      const isoKey = d.toISOString().split('T')[0];
      dayKeys.push(isoKey);
      dayLabels.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    }

    const rows = warehouses.map(wh => {
      const cells: SiteHealthStatus[] = dayKeys.map(k => {
        const log = dailySiteLogs.find(l => l.site === wh.id && l.date === k);
        return log ? log.worstStatus : 'missing';
      });

      const filed = cells.filter(c => c !== 'missing').length;
      let streak = 0;
      for (let j = cells.length - 1; j >= 0; j--) {
        if (cells[j] === 'missing') break;
        streak++;
      }

      return {
        site: wh.id,
        cells,
        filed,
        missed: days - filed,
        rate: Math.round((filed / days) * 100),
        streak
      };
    });

    rows.sort((a, b) => a.rate - b.rate || a.site.localeCompare(b.site));

    const totalFiled = rows.reduce((t, r) => t + r.filed, 0);
    const overall = Math.round((totalFiled / Math.max(1, rows.length * days)) * 100);

    return {
      ok: true,
      days,
      dayLabels,
      dayKeys,
      rows,
      overall
    };
  };

  /**
   * Director's Daily Briefing Prose Summary
   */
  const getBriefing = (dateStr: string): BriefingResult => {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const dateShort = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const todaysLogs = dailySiteLogs.filter(l => l.date === dateStr);
    const filedSites = new Set(todaysLogs.map(l => l.site));
    const missingSites = warehouses.filter(w => !filedSites.has(w.id)).map(w => w.id);

    const criticalLogs = todaysLogs.filter(l => l.worstStatus === 'critical');
    const partialLogs = todaysLogs.filter(l => l.worstStatus === 'partial');
    const clearLogs = todaysLogs.filter(l => l.worstStatus === 'clear');

    const allActivities = todaysLogs.flatMap(l => l.activities);
    const overdueActivities = allActivities.filter(a => a.overdue);

    let lead = '';
    if (todaysLogs.length === 0) {
      lead = 'No site has reported yet today.';
    } else if (criticalLogs.length === 0 && partialLogs.length === 0) {
      lead = `${todaysLogs.length} of ${warehouses.length} sites reported. Nothing below full availability across all warehouse chillers and MHE fleet.`;
    } else {
      lead = `${todaysLogs.length} of ${warehouses.length} sites reported. ${
        criticalLogs.length
          ? `${criticalLogs.length} ${criticalLogs.length === 1 ? 'site carries' : 'sites carry'} cold-chain or critical operational risk.`
          : `${partialLogs.length} sites show minor equipment deviations.`
      }`;
    }

    const paragraphs: { site: string; text: string }[] = [...criticalLogs, ...partialLogs].map(l => {
      const devItems: string[] = [];
      if (l.coldRoom < 100) devItems.push(`cold room at ${l.coldRoom}%${l.coldRoomRemark ? ' (' + l.coldRoomRemark + ')' : ''}`);
      if (l.freezersGgp < 100) devItems.push(`freezers at ${l.freezersGgp}%${l.freezersGgpRemark ? ' (' + l.freezersGgpRemark + ')' : ''}`);
      if (l.rt < 100) devItems.push(`RT Reach Truck at ${l.rt}%${l.rtRemark ? ' (' + l.rtRemark + ')' : ''}`);
      if (l.bopt < 100) devItems.push(`BOPT at ${l.bopt}%${l.boptRemark ? ' (' + l.boptRemark + ')' : ''}`);
      if (l.dg < 100) devItems.push(`DG fuel at ${l.dg}%${l.dgRemark ? ' (' + l.dgRemark + ')' : ''}`);
      if (l.lightsInspection !== 'Done') devItems.push(`lights inspection: ${l.lightsInspection}`);

      const text = devItems.length > 0
        ? devItems.join('; ') + (l.highlights ? '. ' + l.highlights : '')
        : l.highlights || 'Standard operation.';

      return {
        site: l.site,
        text
      };
    });

    return {
      ok: true,
      dateLabel,
      dateShort,
      lead,
      paragraphs,
      totals: {
        expected: warehouses.length,
        filed: todaysLogs.length,
        missing: missingSites.length,
        clear: clearLogs.length,
        partial: partialLogs.length,
        critical: criticalLogs.length,
        openActivities: allActivities.filter(a => a.status !== 'Completed').length,
        overdue: overdueActivities.length
      },
      missing: missingSites,
      overdue: overdueActivities.map(a => ({
        site: a.logId.split('_')[2] || 'Hub',
        work: a.work,
        eta: a.eta
      }))
    };
  };

  /**
   * Site Filing History for Drawer Calendar (35 days)
   */
  const getSiteHistory = (site: string, days: number = 35): SiteHistoryResult => {
    const end = new Date();
    const cells: any[] = [];
    const filersMap: Record<string, number> = {};
    let filed = 0;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86400000);
      const isoKey = d.toISOString().split('T')[0];
      const log = dailySiteLogs.find(l => l.site === site && l.date === isoKey);

      if (log) {
        filed++;
        filersMap[log.pocName] = (filersMap[log.pocName] || 0) + 1;
      }

      cells.push({
        blank: false,
        day: d.getDate(),
        label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        status: log ? log.worstStatus : 'missing',
        poc: log ? log.pocName : '',
        time: log ? log.timestamp.substring(11, 16) : '',
        devCount: log ? log.deviationsCount : 0,
        isToday: i === 0,
        logId: log ? log.logId : undefined
      });
    }

    const filers = Object.entries(filersMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ok: true,
      site,
      days,
      rate: Math.round((filed / days) * 100),
      filed,
      missed: days - filed,
      cells,
      filers
    };
  };

  /**
   * Share Report via Rich HTML / Gmail Compose Generator
   */
  const buildShareMailHtml = (logId: string) => {
    const log = dailySiteLogs.find(l => l.logId === logId);
    if (!log) {
      return {
        subject: 'Daily Site Activity Report',
        html: '<p>Report not found.</p>',
        plain: 'Report not found.',
        composeUrl: ''
      };
    }

    const subject = `Daily Site Activity Report - ${log.site} - ${log.date}`;
    const accent = log.worstStatus === 'critical' ? '#D8483A' : log.worstStatus === 'partial' ? '#E6A226' : '#0E8C77';

    const html = `
      <div style="font-family:Arial,sans-serif;background:#F6F8F8;padding:20px;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #DFE7E8;border-radius:12px;overflow:hidden;">
          <div style="background:${accent};padding:20px 24px;color:#ffffff;">
            <h2 style="margin:0;font-size:20px;">Daily Site Activity Report</h2>
            <div style="font-size:13px;opacity:0.9;margin-top:4px;">${log.site} &bull; ${log.date} &bull; Status: ${log.worstStatus.toUpperCase()}</div>
          </div>
          <div style="padding:20px 24px;">
            <p><strong>Filed By:</strong> ${log.pocName} (${log.pocEmail})</p>
            <p><strong>Highlights:</strong> ${log.highlights || 'All systems normal.'}</p>
            <hr style="border:none;border-top:1px solid #DFE7E8;margin:16px 0;" />
            <h4 style="color:#10222A;margin-bottom:8px;">Utility Equipment Availability</h4>
            <table width="100%" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
              <tr style="background:#F0F4F4;"><th>Item</th><th>Availability</th><th>Remark</th></tr>
              <tr><td>Cold Room (Stock Risk)</td><td>${log.coldRoom}%</td><td>${log.coldRoomRemark || '—'}</td></tr>
              <tr><td>Freezers GGP (Stock Risk)</td><td>${log.freezersGgp}%</td><td>${log.freezersGgpRemark || '—'}</td></tr>
              <tr><td>DG (Generator)</td><td>${log.dg}%</td><td>${log.dgRemark || '—'}</td></tr>
              <tr><td>UPS</td><td>${log.ups}%</td><td>${log.upsRemark || '—'}</td></tr>
            </table>
            <h4 style="color:#10222A;margin-top:16px;margin-bottom:8px;">MHE Availability</h4>
            <table width="100%" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
              <tr style="background:#F0F4F4;"><th>Item</th><th>Availability</th><th>Remark</th></tr>
              <tr><td>Reach Truck (RT)</td><td>${log.rt}%</td><td>${log.rtRemark || '—'}</td></tr>
              <tr><td>BOPT</td><td>${log.bopt}%</td><td>${log.boptRemark || '—'}</td></tr>
            </table>
          </div>
        </div>
      </div>
    `;

    const plain = `DAILY SITE ACTIVITY REPORT\nSite: ${log.site}\nDate: ${log.date}\nPOC: ${log.pocName}\nStatus: ${log.worstStatus}\nHighlights: ${log.highlights || '-'}`;
    const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=${encodeURIComponent(subject)}`;

    return { subject, html, plain, composeUrl };
  };

  const addTemplate = (templateData: Omit<TaskTemplate, 'id'> & { id?: string }) => {
    const id = templateData.id || `CHK_${templateData.code || 'CUST_' + Date.now().toString().slice(-4)}`;
    const newTemplate: TaskTemplate = {
      ...templateData,
      id,
      code: templateData.code || id
    };
    setTemplates(prev => [...prev, newTemplate]);
    setNotification({
      type: 'success',
      message: `Template "${newTemplate.title}" created with doc ID: ${id}`
    });
  };

  const toggleTemplateStatus = (templateId: string) => {
    setTemplates(prev =>
      prev.map(t => (t.id === templateId ? { ...t, isActive: !t.isActive } : t))
    );
  };

  const addWarehouse = (wh: Warehouse) => {
    setWarehouses(prev => [...prev, wh]);
    setNotification({
      type: 'success',
      message: `Warehouse "${wh.name}" registered with doc ID: ${wh.id}`
    });
  };

  const toggleWarehouseStatus = (warehouseId: string) => {
    setWarehouses(prev =>
      prev.map(w => (w.id === warehouseId ? { ...w, isActive: !w.isActive } : w))
    );
  };

  /**
   * Dynamic Merge for POC Master:
   * Adds any new warehouse facilities and updates existing ones with latest POC details.
   * Also creates or updates User accounts for the site POCs!
   */
  const syncWarehousesFromPocMaster = (
    incomingWarehouses: Partial<Warehouse>[],
    incomingPocs?: Partial<User>[]
  ): { added: number; updated: number; total: number } => {
    let added = 0;
    let updated = 0;

    setWarehouses(prevWhs => {
      const existingMap = new Map<string, Warehouse>();
      // Index by id, sapCode, code, and normalized name
      prevWhs.forEach(w => {
        if (w.id) existingMap.set(w.id.toLowerCase(), w);
        if (w.sapCode && w.sapCode !== 'N/A') existingMap.set(w.sapCode.toLowerCase(), w);
        if (w.code) existingMap.set(w.code.toLowerCase(), w);
        if (w.name) existingMap.set(w.name.toLowerCase(), w);
      });

      const nextList = [...prevWhs];
      const takenIds = new Set<string>(nextList.map(w => w.id.toLowerCase()));

      incomingWarehouses.forEach((inc, idx) => {
        if (!inc.name && !inc.facilityName && !inc.b2bName && !inc.code && !inc.sapCode) return;
        
        const sapKey = inc.sapCode && inc.sapCode !== 'N/A' ? inc.sapCode.toLowerCase() : undefined;
        const codeKey = inc.code?.toLowerCase();
        const idKey = inc.id?.toLowerCase();
        const nameKey = inc.name?.toLowerCase() || inc.facilityName?.toLowerCase();

        let matched = (idKey && existingMap.get(idKey)) || 
                      (sapKey && existingMap.get(sapKey)) || 
                      (codeKey && existingMap.get(codeKey)) ||
                      (nameKey && existingMap.get(nameKey));

        if (matched) {
          // Update existing
          const index = nextList.findIndex(w => w.id === matched!.id);
          if (index !== -1) {
            nextList[index] = {
              ...nextList[index],
              ...inc,
              id: matched.id, // preserve unique ID
              code: inc.code || matched.code,
              name: inc.name || matched.name,
              facilityName: inc.facilityName || inc.name || matched.facilityName,
              sapCode: inc.sapCode || matched.sapCode,
              state: inc.state || matched.state,
              city: inc.city || matched.city,
              sitePocName: inc.sitePocName || matched.sitePocName,
              sitePocEmail: inc.sitePocEmail || matched.sitePocEmail,
              sitePocContact: inc.sitePocContact || matched.sitePocContact,
              isActive: inc.isActive ?? matched.isActive
            };
            updated++;
          }
        } else {
          // New Warehouse - generate strictly unique ID
          let rawId = inc.id || (inc.sapCode && inc.sapCode !== 'N/A' ? `WH_${inc.sapCode}` : inc.code ? inc.code.replace(/-/g, '_') : `WH_AUTO_${Date.now()}_${idx + 1}`);
          let cleanId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
          if (takenIds.has(cleanId.toLowerCase())) {
            cleanId = `${cleanId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          }
          takenIds.add(cleanId.toLowerCase());

          const newWh: Warehouse = {
            id: cleanId,
            code: inc.code || (cleanId.startsWith('WH_') ? cleanId.replace('WH_', 'WH-') : `WH-${cleanId}`),
            name: inc.name || inc.facilityName || `Facility_${inc.city || 'Hub'}_${idx + 1}`,
            facilityName: inc.facilityName || inc.name || `Facility_${inc.city || 'Hub'}_${idx + 1}`,
            sapCode: inc.sapCode || 'N/A',
            state: inc.state || 'General',
            city: inc.city || 'Hub',
            b2bName: inc.b2bName || inc.name || 'B2B Hub',
            b2cName: inc.b2cName || inc.name || 'Blinkit Hub',
            entity: inc.entity || 'HyperLogistics India Pvt Ltd',
            costCenter: inc.costCenter || `CC-${cleanId}`,
            zone: (inc.zone as any) || 'North',
            address: inc.address || `${inc.city || 'Warehouse Hub'}, ${inc.state || 'India'}`,
            isActive: inc.isActive ?? true,
            createdAt: new Date().toISOString(),
            sitePocName: inc.sitePocName || 'Site POC',
            sitePocEmail: inc.sitePocEmail || 'poc@grofers.com',
            sitePocContact: inc.sitePocContact || ''
          };
          nextList.push(newWh);
          existingMap.set(cleanId.toLowerCase(), newWh);
          if (newWh.sapCode && newWh.sapCode !== 'N/A') existingMap.set(newWh.sapCode.toLowerCase(), newWh);
          if (newWh.name) existingMap.set(newWh.name.toLowerCase(), newWh);
          added++;
        }
      });

      return nextList;
    });

    // Auto-create or update Site POC user accounts for the newly imported or updated warehouses
    setUsers(prevUsers => {
      const userMap = new Map<string, User>();
      prevUsers.forEach(u => userMap.set(u.email.toLowerCase(), u));
      const nextUsers = [...prevUsers];

      incomingWarehouses.forEach(wh => {
        if (wh.sitePocEmail && wh.sitePocEmail.includes('@')) {
          const emailKey = wh.sitePocEmail.toLowerCase();
          const existingUser = userMap.get(emailKey);
          if (existingUser) {
            // Update assigned warehouse if needed
            if (existingUser.role === 'SITE_POC' && wh.id && !existingUser.warehouseId) {
              const uIdx = nextUsers.findIndex(u => u.id === existingUser.id);
              if (uIdx !== -1) {
                nextUsers[uIdx] = { ...nextUsers[uIdx], warehouseId: wh.id };
              }
            }
          } else {
            // Create POC User
            const newPocUser: User = {
              id: `usr_poc_${Math.random().toString(36).substring(2, 9)}`,
              email: wh.sitePocEmail,
              fullName: wh.sitePocName ? `${wh.sitePocName} (Site POC)` : `POC ${wh.name || 'Site'}`,
              role: 'SITE_POC',
              warehouseId: wh.id,
              phone: wh.sitePocContact || '',
              isActive: true,
              createdAt: new Date().toISOString(),
              avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 10000000)}?w=150&auto=format&fit=crop&q=80`
            };
            nextUsers.push(newPocUser);
            userMap.set(emailKey, newPocUser);
          }
        }
      });

      return nextUsers;
    });

    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    setLastPocSyncTime(nowStr);

    return { added, updated, total: warehouses.length + added };
  };

  /**
   * Dynamic Ingestion for Admin Master Data:
   * Syncs admins who are assigned to specific services (e.g. Fuel, Housekeeping, Operations).
   */
  const syncAdminMasterData = (admins: { fullName: string; email: string; department?: string; assignedServiceIds: string[] }[]): { synced: number } => {
    let synced = 0;
    setUsers(prevUsers => {
      const nextUsers = [...prevUsers];
      admins.forEach(admin => {
        if (!admin.email || !admin.email.includes('@')) return;
        const emailKey = admin.email.toLowerCase();
        const existingIdx = nextUsers.findIndex(u => u.email.toLowerCase() === emailKey);
        if (existingIdx !== -1) {
          nextUsers[existingIdx] = {
            ...nextUsers[existingIdx],
            fullName: admin.fullName || nextUsers[existingIdx].fullName,
            department: admin.department || nextUsers[existingIdx].department,
            role: nextUsers[existingIdx].role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SERVICE_ADMIN',
            assignedServiceIds: admin.assignedServiceIds && admin.assignedServiceIds.length > 0 
              ? admin.assignedServiceIds 
              : nextUsers[existingIdx].assignedServiceIds
          };
          synced++;
        } else {
          // New Service Admin
          const newAdmin: User = {
            id: `usr_adm_${Math.random().toString(36).substring(2, 9)}`,
            email: admin.email,
            fullName: admin.fullName,
            role: 'SERVICE_ADMIN',
            department: admin.department || 'Operations Management',
            assignedServiceIds: admin.assignedServiceIds || [],
            isActive: true,
            createdAt: new Date().toISOString()
          };
          nextUsers.push(newAdmin);
          synced++;
        }
      });
      return nextUsers;
    });
    return { synced };
  };

  /**
   * Fetch from live Google Apps Script Webhook or Google Sheets CSV endpoint
   */
  const syncPocMasterFromUrl = async (url: string): Promise<{ ok: boolean; message: string; count?: number; added?: number; updated?: number }> => {
    if (!url || !url.trim()) {
      return { ok: false, message: 'Please provide a valid Google Apps Script Web App or Sheet URL.' };
    }

    try {
      let fetchUrl = url.trim();

      // Auto-detect standard Google Sheet URL (e.g. https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...)
      if (fetchUrl.includes('docs.google.com/spreadsheets/d/')) {
        const idMatch = fetchUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = fetchUrl.match(/[#&?]gid=([0-9]+)/);
        if (idMatch && idMatch[1]) {
          const sheetId = idMatch[1];
          const gid = (gidMatch && gidMatch[1]) ? gidMatch[1] : '0';
          // Use Google Sheets CSV visualization export (works directly if sheet is shared as Anyone with Link or Published)
          fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
        }
      } else if (fetchUrl.includes('script.google.com') && !fetchUrl.includes('action=')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'action=getPocMaster';
      }

      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/csv, text/plain, */*' }
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      let rawData: any[] = [];

      if ((contentType.includes('application/json') || fetchUrl.includes('action=getPocMaster')) && !fetchUrl.includes('gviz/tq')) {
        const json = await res.json();
        rawData = Array.isArray(json) ? json : (json.data || json.warehouses || json.rows || []);
      } else {
        // Parse CSV or TSV text
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 1) {
          const isTsv = lines[0].includes('\t');
          const delimiter = isTsv ? '\t' : ',';
          const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
            const obj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              obj[h] = cols[idx] || '';
            });
            rawData.push(obj);
          }
        }
      }

      if (!rawData || rawData.length === 0) {
        return { ok: false, message: 'No warehouse rows found in the sheet payload.' };
      }

      // Map dynamic columns to standard Warehouse fields
      const mappedWarehouses: Partial<Warehouse>[] = rawData.map((row: any, idx: number) => {
        const state = row['State'] || row['STATE'] || row['state'] || '';
        const name = row['Warehouse / Facility Name'] || row['Facility Name'] || row['Facility'] || row['Warehouse Name'] || row['name'] || row['WH Name'] || `Warehouse ${idx + 1}`;
        const sap = row['SAP Code'] || row['SAP code'] || row['SapCode'] || row['sapCode'] || row['SAP'] || '';
        const city = row['City'] || row['CITY'] || row['city'] || '';
        const b2b = row['B2B Name'] || row['B2B name'] || row['B2B'] || name;
        const b2c = row['B2C Name'] || row['B2C name'] || row['B2C'] || name;
        const pocName = row['Site POC Name'] || row['Site POC'] || row['POC Name'] || row['POC'] || row['sitePocName'] || '';
        const pocContact = row['Site POC Contact Number'] || row['POC Contact'] || row['Contact'] || row['Phone'] || row['sitePocContact'] || '';
        const pocEmail = row['Site POC Email'] || row['Email'] || row['POC Email'] || row['sitePocEmail'] || (pocName ? `${pocName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@grofers.com` : '');
        const costCenter = row['Cost Center'] || row['costCenter'] || (sap ? `CC-${sap}` : `CC-WH-${idx + 1}`);
        const entity = row['Entity'] || row['entity'] || 'HyperLogistics India Pvt Ltd';
        const zone = row['Zone'] || row['zone'] || 'North';

        const code = row['Code'] || row['code'] || (sap ? `WH-${sap.slice(-6)}` : `WH-${city ? city.slice(0, 3).toUpperCase() : 'HUB'}-${idx + 1}`);
        const id = row['id'] || (sap ? `WH_${sap.replace(/[^a-zA-Z0-9]/g, '_')}` : code.replace(/-/g, '_'));

        return {
          id,
          code,
          name,
          facilityName: name,
          sapCode: sap,
          state,
          city,
          b2bName: b2b,
          b2cName: b2c,
          entity,
          costCenter,
          zone,
          sitePocName: pocName,
          sitePocContact: pocContact,
          sitePocEmail: pocEmail,
          isActive: true
        };
      });

      const { added, updated, total } = syncWarehousesFromPocMaster(mappedWarehouses);
      setPocMasterSheetUrl(url);

      setNotification({
        type: 'success',
        message: `POC Master Synced: ${added} new warehouses added, ${updated} updated. Total active: ${total}.`
      });

      return {
        ok: true,
        message: `Successfully synced ${mappedWarehouses.length} records from Google Sheet.`,
        count: mappedWarehouses.length,
        added,
        updated
      };
    } catch (err: any) {
      console.error('POC Master Sync Error:', err);
      const isFailedToFetch = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('CORS'));
      const isOrgRestrictedUrl = url.includes('/a/macros/');
      
      let friendlyMessage = err.message || 'Network error';
      if (isFailedToFetch) {
        if (isOrgRestrictedUrl) {
          friendlyMessage = "Access Blocked (Google Workspace Domain Restricted): Your Web App URL contains '/a/macros/grofers.com/'. Google requires user login redirect which browsers block via CORS. In Apps Script > Deploy > New Deployment: Set 'Execute as: Me' and 'Who has access: Anyone'. Alternatively, click 'Paste Sheet Rows (CSV/TSV)' to import instantly!";
        } else {
          friendlyMessage = "CORS / Access Permission Error: Google Apps Script Web App could not be reached directly from browser. Please ensure the Web App is deployed with 'Who has access: Anyone' (not 'Only myself'). Or click 'Paste Sheet Rows (CSV/TSV)' above for instant 1-click import.";
        }
      }

      return {
        ok: false,
        message: friendlyMessage
      };
    }
  };

  /**
   * Assign or Update POC for any Warehouse in the App
   * Automatically persists locally and auto-syncs the row in Master Google Sheet
   */
  const updateWarehousePoc = async (
    warehouseId: string,
    pocDetails: {
      sitePocName: string;
      sitePocContact: string;
      sitePocEmail: string;
    }
  ): Promise<{ ok: boolean; message: string; sheetSynced: boolean }> => {
    let updatedWh: Warehouse | undefined;

    setWarehouses(prev => {
      return prev.map(w => {
        if (w.id === warehouseId || (w.sapCode && w.sapCode === warehouseId) || (w.code && w.code === warehouseId)) {
          updatedWh = {
            ...w,
            sitePocName: pocDetails.sitePocName.trim(),
            sitePocContact: pocDetails.sitePocContact.trim(),
            sitePocEmail: pocDetails.sitePocEmail.trim()
          };
          return updatedWh;
        }
        return w;
      });
    });

    // Also create/update user in users registry
    if (pocDetails.sitePocEmail && pocDetails.sitePocEmail.includes('@')) {
      const emailKey = pocDetails.sitePocEmail.toLowerCase().trim();
      setUsers(prevUsers => {
        const existingIdx = prevUsers.findIndex(u => u.email.toLowerCase() === emailKey);
        if (existingIdx !== -1) {
          const next = [...prevUsers];
          next[existingIdx] = {
            ...next[existingIdx],
            fullName: pocDetails.sitePocName.trim() || next[existingIdx].fullName,
            phone: pocDetails.sitePocContact.trim() || next[existingIdx].phone,
            warehouseId: warehouseId
          };
          return next;
        } else {
          const newPocUser: User = {
            id: `usr_poc_${Math.random().toString(36).substring(2, 9)}`,
            email: pocDetails.sitePocEmail.trim(),
            fullName: pocDetails.sitePocName.trim() || 'Site POC',
            role: 'SITE_POC',
            warehouseId: warehouseId,
            phone: pocDetails.sitePocContact.trim(),
            isActive: true,
            createdAt: new Date().toISOString()
          };
          return [...prevUsers, newPocUser];
        }
      });
    }

    // Auto-sync directly to Google Sheet via Webhook if configured
    let sheetSynced = false;
    let syncMsg = 'POC assigned in application.';

    if (pocMasterSheetUrl && pocMasterSheetUrl.trim() && !pocMasterSheetUrl.includes('AKfycbx...')) {
      try {
        const payload = {
          action: 'updateWarehousePoc',
          warehouseId: warehouseId,
          sapCode: updatedWh?.sapCode || warehouseId,
          facilityName: updatedWh?.name || updatedWh?.facilityName || warehouseId,
          sitePocName: pocDetails.sitePocName.trim(),
          sitePocContact: pocDetails.sitePocContact.trim(),
          sitePocEmail: pocDetails.sitePocEmail.trim(),
          timestamp: new Date().toISOString()
        };

        const res = await fetch(pocMasterSheetUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          sheetSynced = true;
          syncMsg = data?.message || 'Updated & synced in Master Google Sheet!';
        }
      } catch (e: any) {
        console.warn('Google Sheet auto-sync warning (POC saved in app):', e);
        syncMsg = `Saved in portal. (Google Sheet sync note: ${e.message || 'Background sync'})`;
      }
    }

    setNotification({
      type: 'success',
      message: `POC for ${updatedWh?.name || warehouseId} updated: ${pocDetails.sitePocName || 'Assigned'}. ${sheetSynced ? '⚡ Synced to Google Sheet.' : ''}`
    });

    return {
      ok: true,
      message: syncMsg,
      sheetSynced
    };
  };

  const resetToDefaultData = () => {
    setWarehouses(INITIAL_WAREHOUSES);
    setTemplates(INITIAL_TEMPLATES);
    setSubmissions(INITIAL_SUBMISSIONS);
    setDieselLogs(INITIAL_DIESEL_LOGS);
    setDailySiteLogs(INITIAL_DAILY_SITE_LOGS);
    setOperationalSheets(OPERATIONAL_SHEETS);
    setSheetRecords(INITIAL_SHEET_RECORDS);
    setServiceAssignments(INITIAL_SERVICE_ASSIGNMENTS);
    setCurrentUser(INITIAL_USERS[0]);
    setSelectedWarehouseIdState('ALL');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'warehouses');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'templates');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'submissions');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'dieselLogs');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'dailySiteLogs');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'operationalSheets');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'sheetRecords');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'serviceAssignments');
    localStorage.removeItem(STORAGE_KEY_PREFIX + 'currentUser');
    setNotification({
      type: 'info',
      message: 'System database restored to default benchmark records.'
    });
  };

  const notify = (type: 'success' | 'error' | 'warning' | 'info', titleOrMsg?: string, maybeMsg?: string) => {
    const message = maybeMsg ? `${titleOrMsg ? `${titleOrMsg}: ` : ''}${maybeMsg}` : (titleOrMsg || '');
    setNotification({ type, message });
  };

  const housekeepingLogs = useMemo(() => {
    return sheetRecords['SHEET_HOUSEKEEPING'] || [];
  }, [sheetRecords]);

  const dgPowerLogs = useMemo(() => {
    return sheetRecords['SHEET_DG_POWER_WATER'] || [];
  }, [sheetRecords]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        warehouses,
        templates,
        submissions,
        dieselLogs,
        dailySiteLogs,
        housekeepingLogs,
        dgPowerLogs,
        emailLogs,
        vendors,
        addVendor,
        updateVendor,
        toggleVendorActive,
        dieselAuditLog,
        submitDieselProcurement,
        approveDieselLog,
        rejectDieselLog,
        validateDelivery,
        validateAndUploadPOD,
        updateDieselLog,
        deleteDieselLog,
        buildDieselMailPreview,
        operationalSheets,
        setOperationalSheets,
        sheetRecords,
        addSheetRecord,
        addOperationalSheet,
        exportSheetData,
        updateSheetColumns,
        addColumnToSheet,
        removeColumnFromSheet,
        serviceAssignments,
        updateServiceAssignment,
        addServiceAssignment,
        deleteServiceAssignment,
        bulkUpdateServiceAssignments,
        getAssignedServicesForUser,
        isServiceAccessible,
        activeSheetId,
        setActiveSheetId,
        selectedWarehouseId,
        setSelectedWarehouseId,
        selectedShift,
        setSelectedShift,
        currentDate,
        setCurrentDate,
        computeSubmissionId,
        getSubmissionForTemplate,
        submitTask,
        createDieselLog,
        submitDailySiteLog,
        getExistingDailyReport,
        getComplianceMatrix,
        getBriefing,
        getSiteHistory,
        buildShareMailHtml,
        addTemplate,
        toggleTemplateStatus,
        addWarehouse,
        toggleWarehouseStatus,
        setWarehouses,
        setUsers,
        pocMasterSheetUrl,
        setPocMasterSheetUrl,
        lastPocSyncTime,
        syncWarehousesFromPocMaster,
        syncAdminMasterData,
        syncPocMasterFromUrl,
        updateWarehousePoc,
        sheetWebhookUrls,
        setSheetWebhookUrl,
        masterDataSpreadsheetId,
        setMasterDataSpreadsheetId,
        pocMasterRows,
        siteMasterRows,
        serviceRegistryRows,
        masterAuditRows,
        dropdownLists,
        lastMasterDataSyncAt,
        syncMasterData,
        importMasterDataFromJson,
        masterDataAppsScriptUrl,
        setMasterDataAppsScriptUrl,
        assignPocMasterRow,
        saveSiteMasterRow,
        saveServiceRegistryRow,
        resetToDefaultData,
        notification,
        setNotification,
        notify
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
