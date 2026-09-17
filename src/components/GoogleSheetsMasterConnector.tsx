import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  FileSpreadsheet,
  Link,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Database,
  Zap,
  HelpCircle,
  Layers,
  Fuel,
  Activity,
  Check,
  Building2,
  Users,
  Search,
  Upload,
  ArrowRight,
  ShieldCheck,
  FileText,
  Sliders
} from 'lucide-react';
import { PageHeader } from './common/PageHeader';
import { ExpandButton, TableFullscreen } from './common/TableTools';
import { Warehouse, User } from '../types';
import { Plus as PlusIcon } from 'lucide-react';
import { Button } from './common/Button';
import { MasterDataTable } from './masterData/MasterDataTable';
import { MasterRowEditor } from './masterData/MasterRowEditor';
import { SITE_FIELDS, SERVICE_FIELDS, EMPTY_SITE, EMPTY_SERVICE } from './masterData/fieldConfigs';
import { suggestNextSiteCode, STATE_CODES, type EditMode } from '../lib/masterData/validate';

// Master Data browser — the three real tabs from MASTERDATA.md, in their
// documented column order (§2/§3/§4), each keyed by its real primary key.
const MASTER_DATA_TABS = [
  {
    key: 'POC_Master' as const,
    keyColumn: 'Access_ID',
    columns: [
      'Access_ID', 'POC_Email', 'POC_Name', 'WH_Code', 'Role', 'Site_Code', 'Service_Codes',
      'Contact_Number', 'Is_Primary', 'Active', 'Access_Start_Date', 'Access_End_Date',
      'Description', 'Reporting_Manager_Email', 'Last_Updated_By', 'Last_Updated_At'
    ]
  },
  {
    key: 'Site_Master' as const,
    keyColumn: 'Site_Code',
    columns: [
      'Site_Code', 'WH_Code', 'Facility_Name', 'SAP_Code', 'Cost_Center', 'Zone', 'State', 'City',
      'Address', 'Pincode', 'Channel', 'Entity', 'Business_Type', 'GSTIN', 'Lat_Long', 'Map_Link',
      'Services_Enabled', 'Go_Live_Date', 'Closure_Date', 'Active', 'Last_Updated_By', 'Last_Updated_At'
    ]
  },
  {
    key: 'Service_Registry' as const,
    keyColumn: 'Service_Code',
    columns: [
      'Service_Code', 'Service_Name', 'Needs_Approval', 'Needs_Delivery_Validation', 'Requires_Evidence',
      'Cadence', 'Submission_Window', 'SLA_Hours', 'AppScript_URL', 'Records_Tab', 'Audit_Tab',
      'Active', 'Last_Updated_By', 'Last_Updated_At'
    ]
  },
  {
    key: 'Master_Audit' as const,
    keyColumn: 'Audit_ID',
    columns: [
      'Audit_ID', 'Timestamp', 'Actor_Email', 'Action', 'Target_Tab', 'Target_Key',
      'Field_Changed', 'Old_Value', 'New_Value', 'Source', 'Notes'
    ]
  }
];

// Dropdowns is rendered separately below (not part of the row-table loop
// above) since it's columns-of-lists, not rows-of-records.
const DROPDOWNS_TAB_KEY = 'Dropdowns' as const;

export const GoogleSheetsMasterConnector: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const {
    warehouses,
    users,
    operationalSheets,
    notify,
    dieselLogs,
    dailySiteLogs,
    pocMasterSheetUrl,
    setPocMasterSheetUrl,
    lastPocSyncTime,
    syncWarehousesFromPocMaster,
    syncAdminMasterData,
    syncPocMasterFromUrl,
    sheetWebhookUrls,
    setSheetWebhookUrl,
    masterDataSpreadsheetId,
    setMasterDataSpreadsheetId,
    masterDataAppsScriptUrl,
    pocMasterRows,
    siteMasterRows,
    serviceRegistryRows,
    masterAuditRows,
    dropdownLists,
    lastMasterDataSyncAt,
    syncMasterData,
    importMasterDataFromJson,
    assignPocMasterRow,
    saveSiteMasterRow,
    saveServiceRegistryRow
  } = useApp();

  const [activeTab, setActiveTab] = useState<'master_data' | 'admin_sync' | 'script' | 'services' | 'faq'>('master_data');

  // Master Data (Live) tab — reads POC_Master / Site_Master / Service_Registry
  // via whichever of the two paths you last used (an Apps Script URL or a
  // bare Spreadsheet ID), same preference order syncMasterData falls back
  // through. Both are best-effort for reads — see masterDataSync.ts for why,
  // and why "Paste Master Data JSON" below is the actually-reliable path.
  const [masterDataIdInput, setMasterDataIdInput] = useState<string>(
    masterDataAppsScriptUrl || masterDataSpreadsheetId || ''
  );
  const [isSyncingMasterData, setIsSyncingMasterData] = useState(false);
  const [masterDataSyncResult, setMasterDataSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showMasterDataPasteModal, setShowMasterDataPasteModal] = useState(false);
  const [masterDataViewTab, setMasterDataViewTab] = useState<'POC_Master' | 'Site_Master' | 'Service_Registry' | 'Master_Audit' | 'Dropdowns'>('POC_Master');
  const [masterDataPasteText, setMasterDataPasteText] = useState('');
  const [isImportingMasterData, setIsImportingMasterData] = useState(false);

  // Site_Master / Service_Registry editor. `initial` is captured once per
  // open, so the drawer's dirty check compares against what was opened —
  // not against a row that a background re-sync has since replaced.
  const [editor, setEditor] = useState<{
    tab: 'site' | 'service';
    mode: EditMode;
    initial: Record<string, any>;
  } | null>(null);

  const openEditor = (tab: 'site' | 'service', mode: EditMode, row?: Record<string, any>) =>
    setEditor({
      tab,
      mode,
      initial: mode === 'edit' && row ? { ...row } : { ...(tab === 'site' ? EMPTY_SITE : EMPTY_SERVICE) },
    });

  /**
   * Small conveniences while adding a site, never while editing one:
   * picking a State suggests the next free Site_Code, and Cost_Center
   * follows SAP_Code (they are the same value on every existing row).
   * A code the admin has typed by hand is left alone.
   */
  const deriveSite = (next: Record<string, any>, changed: string, mode: EditMode) => {
    if (mode !== 'create') return next;
    const out = { ...next };
    if (changed === 'State') {
      const letters = STATE_CODES[out.State];
      const code = String(out.Site_Code || '');
      const isSuggestion = /^ZHPL-[A-Z]{2}-\d{2}$/.test(code) && !code.startsWith(`ZHPL-${letters}-`);
      if (!code || isSuggestion) out.Site_Code = suggestNextSiteCode(out.State, siteMasterRows);
    }
    if (changed === 'SAP_Code' && (!out.Cost_Center || out.Cost_Center === editor?.initial.SAP_Code)) {
      out.Cost_Center = out.SAP_Code;
    }
    return out;
  };

  // Assign / Edit POC — the one in-app place POC_Master allocation happens.
  // Writes through assignPocMasterRow (upsert-by-Access_ID via the Apps
  // Script bridge) — blank Access_ID means "create new row".
  const emptyPocForm = {
    Access_ID: '', POC_Email: '', POC_Name: '', WH_Code: '', Role: 'SITE_POC',
    Site_Code: '', Service_Codes: 'ALL', Contact_Number: '', Is_Primary: 'Yes', Active: 'Yes',
    Access_Start_Date: '', Access_End_Date: '', Description: '', Reporting_Manager_Email: ''
  };
  const [showAssignPocModal, setShowAssignPocModal] = useState(false);
  const [assignPocForm, setAssignPocForm] = useState(emptyPocForm);
  const [assignPocResult, setAssignPocResult] = useState<{ success: boolean; message: string } | null>(null);

  const openAssignPocModal = (existing?: typeof emptyPocForm) => {
    setAssignPocForm(existing ? { ...existing } : { ...emptyPocForm });
    setAssignPocResult(null);
    setShowAssignPocModal(true);
  };

  const handleAssignPocSubmit = async () => {
    if (!assignPocForm.POC_Email.trim() || !assignPocForm.POC_Name.trim() || !assignPocForm.Site_Code.trim()) {
      setAssignPocResult({ success: false, message: 'POC_Email, POC_Name and Site_Code are required.' });
      return;
    }
    setIsAssigningPoc(true);
    try {
      const res = await assignPocMasterRow(assignPocForm as any);
      setAssignPocResult(res);
      notify(res.success ? 'success' : 'error', res.success ? 'POC Allocation Saved' : 'Allocation Failed', res.message);
      if (res.success) {
        setShowAssignPocModal(false);
        setAssignPocForm(emptyPocForm);
      }
    } finally {
      setIsAssigningPoc(false);
    }
  };

  const handleMasterDataSync = async () => {
    setIsSyncingMasterData(true);
    setMasterDataSyncResult(null);
    const res = await syncMasterData(masterDataIdInput.trim());
    setMasterDataSyncResult({ ok: res.ok, message: res.message });
    notify(res.ok ? 'success' : 'error', res.ok ? 'Master Data Synced' : 'Sync Failed', res.message);
    setIsSyncingMasterData(false);
  };

  const handleMasterDataPaste = async () => {
    setIsImportingMasterData(true);
    const res = await importMasterDataFromJson(masterDataPasteText.trim());
    setIsImportingMasterData(false);
    setMasterDataSyncResult({ ok: res.ok, message: res.message });
    notify(res.ok ? 'success' : 'error', res.ok ? 'Master Data Imported' : 'Import Failed', res.message);
    if (res.ok) {
      setShowMasterDataPasteModal(false);
      setMasterDataPasteText('');
    }
  };
  const [gasUrlInput, setGasUrlInput] = useState<string>(pocMasterSheetUrl || '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string; added?: number; updated?: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [adminTableExpanded, setAdminTableExpanded] = useState<boolean>(false);
  const [isAssigningPoc, setIsAssigningPoc] = useState<boolean>(false);
  const [showMasterDataCode, setShowMasterDataCode] = useState<boolean>(false);
  const [copiedMasterDataCode, setCopiedMasterDataCode] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');

  // Manual Ingest state for Admin Master or POC Master
  const [showManualPasteModal, setShowManualPasteModal] = useState<boolean>(false);
  const [manualPasteType, setManualPasteType] = useState<'poc' | 'admin'>('poc');
  const [manualPasteText, setManualPasteText] = useState<string>('');

  // Per-service webhook URL inputs (Services tab) — local draft before saving to context
  const [webhookInputs, setWebhookInputs] = useState<Record<string, string>>({});
  const getWebhookDraft = (sheetId: string) =>
    webhookInputs[sheetId] !== undefined ? webhookInputs[sheetId] : (sheetWebhookUrls[sheetId] || '');

  const sampleAppsScriptCode = `/**
 * =========================================================================
 * WAREHOUSE OPERATIONS PLATFORM - GOOGLE APPS SCRIPT MASTER BRIDGE (v3.0)
 * =========================================================================
 * 
 * INSTRUCTIONS:
 * 1. Open your Master Google Sheet.
 * 2. Go to: Extensions > Apps Script.
 * 3. Replace all code in Code.gs with this entire script.
 * 4. Click Save (Ctrl+S).
 * 5. Click "Deploy" > "New Deployment" > Select "Web App".
 *    - Description: "Warehouse Ops Live Sync Bridge"
 *    - Execute as: "Me" (your email)
 *    - Who has access: "Anyone"
 * 6. Click "Deploy", copy the Web App URL, and paste it into the portal!
 */

// Handles GET requests from the portal (e.g. syncing POC Master or Admin Master)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getPocMaster';
    
    if (action === 'getPocMaster') {
      var sheet = ss.getSheetByName('POC_Master') || ss.getSheets()[0];
      var data = getSheetDataAsJson(sheet);
      return createJsonResponse({
        status: "success",
        sheetName: sheet.getName(),
        count: data.length,
        data: data
      });
    }
    
    if (action === 'getAdminMaster') {
      var adminSheet = ss.getSheetByName('Admin_Master');
      if (!adminSheet) {
        return createJsonResponse({
          status: "not_found",
          message: "Admin_Master tab not found yet. Please create a tab named 'Admin_Master'."
        });
      }
      var adminData = getSheetDataAsJson(adminSheet);
      return createJsonResponse({
        status: "success",
        sheetName: "Admin_Master",
        count: adminData.length,
        data: adminData
      });
    }
    
    if (action === 'getAllMaster') {
      var pocSheet = ss.getSheetByName('POC_Master') || ss.getSheets()[0];
      var adminSheet = ss.getSheetByName('Admin_Master');
      return createJsonResponse({
        status: "success",
        pocMaster: getSheetDataAsJson(pocSheet),
        adminMaster: adminSheet ? getSheetDataAsJson(adminSheet) : []
      });
    }

    return createJsonResponse({
      status: "online",
      message: "Warehouse Operations Bridge is active and ready.",
      version: "3.1"
    });
    
  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: err.toString()
    });
  }
}

// Handles POST requests from the portal (appending service submissions, diesel logs, daily logs, and updating POCs)
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Action: Auto-sync POC assignment from App to Sheet
    if (payload.action === 'updateWarehousePoc') {
      var pocSheet = ss.getSheetByName('POC_Master') || ss.getSheets()[0];
      var values = pocSheet.getDataRange().getValues();
      var headers = values[0];
      
      var sapCol = -1, nameCol = -1, pocNameCol = -1, pocContactCol = -1, pocEmailCol = -1;
      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c]).trim().toLowerCase();
        if (h.indexOf('sap') !== -1) sapCol = c;
        if (h.indexOf('facility') !== -1 || h.indexOf('warehouse') !== -1 || h === 'name') nameCol = c;
        if (h.indexOf('poc name') !== -1 || h === 'site poc' || h === 'poc') pocNameCol = c;
        if (h.indexOf('contact') !== -1 || h.indexOf('phone') !== -1 || h.indexOf('number') !== -1) pocContactCol = c;
        if (h.indexOf('email') !== -1) pocEmailCol = c;
      }
      
      var updatedRow = -1;
      var targetSap = String(payload.sapCode || '').trim().toLowerCase();
      var targetName = String(payload.facilityName || payload.name || '').trim().toLowerCase();
      var targetId = String(payload.warehouseId || '').trim().toLowerCase();
      
      for (var r = 1; r < values.length; r++) {
        var rowSap = sapCol !== -1 ? String(values[r][sapCol]).trim().toLowerCase() : '';
        var rowName = nameCol !== -1 ? String(values[r][nameCol]).trim().toLowerCase() : '';
        
        if ((targetSap && rowSap === targetSap) || (targetName && rowName === targetName) || (targetId && rowSap.indexOf(targetId) !== -1)) {
          updatedRow = r + 1; // 1-indexed in Sheet
          if (pocNameCol !== -1 && payload.sitePocName !== undefined) pocSheet.getRange(updatedRow, pocNameCol + 1).setValue(payload.sitePocName);
          if (pocContactCol !== -1 && payload.sitePocContact !== undefined) pocSheet.getRange(updatedRow, pocContactCol + 1).setValue(payload.sitePocContact);
          if (pocEmailCol !== -1 && payload.sitePocEmail !== undefined) pocSheet.getRange(updatedRow, pocEmailCol + 1).setValue(payload.sitePocEmail);
          break;
        }
      }
      
      if (updatedRow !== -1) {
        return createJsonResponse({
          status: "success",
          message: "Site POC updated in Sheet row #" + updatedRow + " for " + (payload.facilityName || payload.sapCode),
          row: updatedRow
        });
      } else {
        return createJsonResponse({
          status: "not_found",
          message: "Facility not found in POC_Master tab for SAP " + payload.sapCode
        });
      }
    }

    // 2. Action: Upsert a POC_Master row from the MasterData tab's "Assign / Edit
    // POC" form — Access_ID present = update that row (only changed fields are
    // written); blank = create a new row with the next AC-#### id. Every write
    // logs one Master_Audit row per changed field (MASTERDATA.md I3), and
    // updates are looked up by header name, never column index (I5).
    if (payload.action === 'upsertPocMaster') {
      var pocMasterSheet = ss.getSheetByName('POC_Master') || ss.getSheets()[0];
      var pmValues = pocMasterSheet.getDataRange().getValues();
      var pmHeaders = pmValues[0];
      var row = payload.row || {};
      var actorEmail = payload.actorEmail || 'APP';

      var colIndex = {};
      for (var pc = 0; pc < pmHeaders.length; pc++) {
        colIndex[String(pmHeaders[pc]).trim()] = pc;
      }
      var accessIdCol = colIndex['Access_ID'];

      var targetRowNum = -1;
      if (row.Access_ID && accessIdCol !== undefined) {
        for (var pr = 1; pr < pmValues.length; pr++) {
          if (String(pmValues[pr][accessIdCol]).trim() === String(row.Access_ID).trim()) {
            targetRowNum = pr + 1; // 1-indexed in Sheet
            break;
          }
        }
      }

      var nowIso = new Date().toISOString();

      if (targetRowNum === -1) {
        // Create — generate the next Access_ID if one wasn't supplied
        if (!row.Access_ID && accessIdCol !== undefined) {
          var maxNum = 0;
          for (var gr = 1; gr < pmValues.length; gr++) {
            var m = String(pmValues[gr][accessIdCol]).match(/AC-(\d+)/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
          }
          row.Access_ID = 'AC-' + ('0000' + (maxNum + 1)).slice(-4);
        }
        row.Last_Updated_By = actorEmail;
        row.Last_Updated_At = nowIso;

        var newRowArr = [];
        for (var nc = 0; nc < pmHeaders.length; nc++) {
          var newKey = String(pmHeaders[nc]).trim();
          newRowArr.push(row[newKey] !== undefined ? row[newKey] : '');
        }
        pocMasterSheet.appendRow(newRowArr);
        logMasterAudit(ss, 'CREATE', 'POC_Master', row.Access_ID, 'ALL', '', JSON.stringify(row), actorEmail);

        return createJsonResponse({
          status: "success",
          message: "Created POC_Master row " + row.Access_ID,
          accessId: row.Access_ID
        });
      } else {
        // Update — only the fields present in the submitted row, by header name
        var existingRow = pmValues[targetRowNum - 1];
        for (var key in row) {
          if (key === 'Access_ID' || colIndex[key] === undefined) continue;
          var oldVal = existingRow[colIndex[key]];
          var newVal = row[key];
          if (String(oldVal) !== String(newVal)) {
            pocMasterSheet.getRange(targetRowNum, colIndex[key] + 1).setValue(newVal);
            logMasterAudit(ss, 'UPDATE', 'POC_Master', row.Access_ID, key, oldVal, newVal, actorEmail);
          }
        }
        if (colIndex['Last_Updated_By'] !== undefined) pocMasterSheet.getRange(targetRowNum, colIndex['Last_Updated_By'] + 1).setValue(actorEmail);
        if (colIndex['Last_Updated_At'] !== undefined) pocMasterSheet.getRange(targetRowNum, colIndex['Last_Updated_At'] + 1).setValue(nowIso);

        return createJsonResponse({
          status: "success",
          message: "Updated POC_Master row " + row.Access_ID,
          accessId: row.Access_ID
        });
      }
    }

    var sheetName = payload.sheetName || 'AS_DailyLog_Master';
    var sheet = ss.getSheetByName(sheetName);
    
    // Auto-create tab if missing
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (payload.headers && payload.headers.length > 0) {
        sheet.appendRow(payload.headers);
        var headerRange = sheet.getRange(1, 1, 1, payload.headers.length);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#0F172A");
        headerRange.setFontColor("#FFFFFF");
      }
    }
    
    // Append row
    if (payload.rowValues && payload.rowValues.length > 0) {
      sheet.appendRow(payload.rowValues);
    }
    
    return createJsonResponse({
      status: "success",
      message: "Row logged into " + sheetName,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    return createJsonResponse({
      status: "error",
      message: err.toString()
    });
  }
}

// Helper: append one Master_Audit row (creates the tab with headers if missing).
// Never lets an audit-logging failure break the main write — see MASTERDATA.md I3.
function logMasterAudit(ss, action, targetTab, targetKey, fieldChanged, oldValue, newValue, actorEmail) {
  try {
    var auditSheet = ss.getSheetByName('Master_Audit');
    if (!auditSheet) {
      auditSheet = ss.insertSheet('Master_Audit');
      auditSheet.appendRow(['Audit_ID', 'Timestamp', 'Actor_Email', 'Action', 'Target_Tab', 'Target_Key', 'Field_Changed', 'Old_Value', 'New_Value', 'Source', 'Notes']);
    }
    var auditId = 'AUD-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    auditSheet.appendRow([auditId, new Date().toISOString(), actorEmail || 'APP', action, targetTab, targetKey, fieldChanged, oldValue, newValue, 'APP', '']);
  } catch (auditErr) {
    // Swallow — a broken audit log must never block the actual master-data write.
  }
}

// Helper: Convert sheet rows to JSON array of objects
function getSheetDataAsJson(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  var headers = values[0];
  var rows = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    var hasContent = false;
    
    for (var j = 0; j < headers.length; j++) {
      var headerKey = String(headers[j]).trim();
      if (headerKey) {
        obj[headerKey] = row[j] !== undefined ? row[j] : "";
        if (row[j] !== "") hasContent = true;
      }
    }
    if (hasContent) {
      rows.push(obj);
    }
  }
  return rows;
}

// Helper: Response formatting
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  // MasterData_Code.gs — a SEPARATE deployment from the script above. That one
  // (Code.gs) is the general operational bridge for daily logs, tied to the
  // "POC Master Sheet" URL on the admin_sync tab. THIS one is what the
  // "Spreadsheet ID or Apps Script Web App URL" field above and the
  // Assign/Edit POC form actually talk to (masterDataAppsScriptUrl) — it must
  // be deployed from Apps Script bound to the WarehouseOS_MasterData sheet
  // itself (the one with POC_Master / Site_Master / Service_Registry /
  // Master_Audit / Dropdowns tabs).
  const masterDataAppsScriptCode = `/**
 * WarehouseOS — MasterData_Code.gs
 *
 * Deploy this INTO THE WarehouseOS_MasterData SPREADSHEET (Extensions > Apps
 * Script), the one with the POC_Master / Site_Master / Service_Registry /
 * Master_Audit / Dropdowns tabs. This is a different deployment from the
 * general operational Code.gs shown on the other tab — its Web App URL goes
 * into "Spreadsheet ID or Apps Script Web App URL" on the MasterData tab.
 *
 * Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone within your organization (or Anyone, per your policy)
 * Copy the resulting /exec URL into that field.
 */

// GET — two modes, same data either way:
//  - plain visit (no ?mode param): returns the full master-data snapshot as
//    JSON. This is the reliable "Paste Master Data JSON" path: open this URL
//    in a normal browser tab, Ctrl+A / Ctrl+C the page, paste it into the app.
//  - ?mode=postmessage: returns an HTML page that posts the same snapshot to
//    its parent window — used by the in-app "Sync Master Data" button when
//    loaded in a hidden iframe. Best-effort; the app falls back to paste-JSON
//    when Google's sign-in wall blocks this.
function doGet(e) {
  var mode = e && e.parameter && e.parameter.mode;
  var snapshot = buildMasterDataSnapshot();

  if (mode === 'postmessage') {
    var json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
    var html = '<script>parent.postMessage({source:"wos-masterdata",payload:' + json + '}, "*");</script>' +
      '<body style="font-family:monospace;font-size:12px;padding:12px">Master data sent to the app.</body>';
    return HtmlService.createHtmlOutput(html);
  }

  return jsonResponse(snapshot);
}

function buildMasterDataSnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    status: 'success',
    generatedAt: new Date().toISOString(),
    pocMaster: sheetRowsAsJson(ss.getSheetByName('POC_Master')),
    siteMaster: sheetRowsAsJson(ss.getSheetByName('Site_Master')),
    serviceRegistry: sheetRowsAsJson(ss.getSheetByName('Service_Registry')),
    masterAudit: sheetRowsAsJson(ss.getSheetByName('Master_Audit')),
    dropdowns: dropdownsAsJson(ss.getSheetByName('Dropdowns'))
  };
}

// POST — action 'upsertPocMaster': create/update one POC_Master row by
// Access_ID (blank = create, auto-assigns the next AC-#### id). Only fields
// present in the submitted row are written, looked up by header name
// (MASTERDATA.md I5, never by column index). Every create/update logs one
// Master_Audit row per field changed (I3).
// The app posts a hidden HTML form with one field named "payload" (a form
// POST is the only way past the browser's CORS wall to a Web App). Its body
// is therefore "payload=%7B...", NOT raw JSON — so read e.parameter first
// and only fall back to a raw JSON body for callers that send one.
function readPayload(e) {
  if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  return JSON.parse(e.postData.contents);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // two admins can save in the same second
  try {
    var payload = readPayload(e);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var actor = payload.actorEmail || 'APP';

    if (payload.action === 'upsertPocMaster') {
      return upsertPocMaster(ss, payload.row || {}, actor);
    }
    if (payload.action === 'upsertSiteMaster') {
      return jsonResponse(upsertByKey(ss, 'Site_Master', 'Site_Code', payload.row || {}, payload.mode, actor));
    }
    if (payload.action === 'upsertServiceRegistry') {
      return jsonResponse(upsertByKey(ss, 'Service_Registry', 'Service_Code', payload.row || {}, payload.mode, actor));
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + payload.action });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Create or edit one row of Site_Master / Service_Registry, by header name
// (MASTERDATA.md I5). mode is explicit: 'create' refuses a key that already
// exists, so "add a site" can never overwrite one; 'edit' refuses a key that
// doesn't exist and NEVER writes the key column (I2 — other records point at
// it). One Master_Audit row per changed field (I3). No delete path (I1).
function upsertByKey(ss, tabName, keyColumn, row, mode, actorEmail) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return { status: 'error', message: 'Tab not found: ' + tabName };

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var colIndex = {};
  for (var c = 0; c < headers.length; c++) if (headers[c]) colIndex[headers[c]] = c;

  if (colIndex[keyColumn] === undefined) {
    return { status: 'error', message: tabName + ' has no ' + keyColumn + ' column.' };
  }

  var key = String(row[keyColumn] || '').trim();
  if (!key) return { status: 'error', message: keyColumn + ' is required.' };

  var targetRow = -1;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][colIndex[keyColumn]]).trim().toLowerCase() === key.toLowerCase()) {
      targetRow = r + 1;
      break;
    }
  }

  var nowIso = new Date().toISOString();

  if (mode === 'create') {
    if (targetRow !== -1) {
      return { status: 'error', message: key + ' already exists in ' + tabName + '. Nothing was written.' };
    }
    row.Last_Updated_By = actorEmail;
    row.Last_Updated_At = nowIso;
    var newRow = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(newRow);
    logMasterAudit(ss, 'CREATE', tabName, key, 'ALL', '', JSON.stringify(row), actorEmail);
    return { status: 'success', mode: 'created', key: key };
  }

  if (mode !== 'edit') return { status: 'error', message: 'mode must be create or edit.' };
  if (targetRow === -1) {
    return { status: 'error', message: key + ' does not exist in ' + tabName + '. Nothing was written.' };
  }

  var existing = values[targetRow - 1];
  var changed = 0;
  for (var field in row) {
    if (field === keyColumn || field === 'Last_Updated_By' || field === 'Last_Updated_At') continue;
    if (colIndex[field] === undefined) continue;
    var oldVal = existing[colIndex[field]];
    var newVal = row[field];
    if (String(oldVal) !== String(newVal)) {
      sheet.getRange(targetRow, colIndex[field] + 1).setValue(newVal);
      var action = field === 'Active' ? (newVal === 'Yes' ? 'REACTIVATE' : 'DEACTIVATE') : 'UPDATE';
      logMasterAudit(ss, action, tabName, key, field, oldVal, newVal, actorEmail);
      changed++;
    }
  }
  if (changed > 0) {
    if (colIndex['Last_Updated_By'] !== undefined) sheet.getRange(targetRow, colIndex['Last_Updated_By'] + 1).setValue(actorEmail);
    if (colIndex['Last_Updated_At'] !== undefined) sheet.getRange(targetRow, colIndex['Last_Updated_At'] + 1).setValue(nowIso);
  }
  return { status: 'success', mode: 'updated', key: key, changed: changed };
}

function upsertPocMaster(ss, row, actorEmail) {
  var sheet = ss.getSheetByName('POC_Master');
  var values = sheet.getDataRange().getValues();
  var headers = values[0];

  var colIndex = {};
  for (var c = 0; c < headers.length; c++) colIndex[String(headers[c]).trim()] = c;
  var accessIdCol = colIndex['Access_ID'];

  var targetRow = -1;
  if (row.Access_ID && accessIdCol !== undefined) {
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][accessIdCol]).trim() === String(row.Access_ID).trim()) {
        targetRow = r + 1;
        break;
      }
    }
  }

  var nowIso = new Date().toISOString();

  if (targetRow === -1) {
    if (!row.Access_ID && accessIdCol !== undefined) {
      var maxNum = 0;
      for (var g = 1; g < values.length; g++) {
        var m = String(values[g][accessIdCol]).match(/AC-(\\d+)/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
      row.Access_ID = 'AC-' + ('0000' + (maxNum + 1)).slice(-4);
    }
    row.Last_Updated_By = actorEmail;
    row.Last_Updated_At = nowIso;

    var newRow = [];
    for (var nc = 0; nc < headers.length; nc++) {
      var key = String(headers[nc]).trim();
      newRow.push(row[key] !== undefined ? row[key] : '');
    }
    sheet.appendRow(newRow);
    logMasterAudit(ss, 'CREATE', 'POC_Master', row.Access_ID, 'ALL', '', JSON.stringify(row), actorEmail);
    return jsonResponse({ status: 'success', message: 'Created POC_Master row ' + row.Access_ID, accessId: row.Access_ID });
  }

  var existing = values[targetRow - 1];
  for (var key in row) {
    if (key === 'Access_ID' || colIndex[key] === undefined) continue;
    var oldVal = existing[colIndex[key]];
    var newVal = row[key];
    if (String(oldVal) !== String(newVal)) {
      sheet.getRange(targetRow, colIndex[key] + 1).setValue(newVal);
      logMasterAudit(ss, 'UPDATE', 'POC_Master', row.Access_ID, key, oldVal, newVal, actorEmail);
    }
  }
  if (colIndex['Last_Updated_By'] !== undefined) sheet.getRange(targetRow, colIndex['Last_Updated_By'] + 1).setValue(actorEmail);
  if (colIndex['Last_Updated_At'] !== undefined) sheet.getRange(targetRow, colIndex['Last_Updated_At'] + 1).setValue(nowIso);

  return jsonResponse({ status: 'success', message: 'Updated POC_Master row ' + row.Access_ID, accessId: row.Access_ID });
}

// Master_Audit — app-written only; never let a broken audit log block the
// actual master-data write (MASTERDATA.md: "The app writes here. Do not type
// in this tab.").
function logMasterAudit(ss, action, targetTab, targetKey, fieldChanged, oldValue, newValue, actorEmail) {
  try {
    var sheet = ss.getSheetByName('Master_Audit');
    if (!sheet) {
      sheet = ss.insertSheet('Master_Audit');
      sheet.appendRow(['Audit_ID', 'Timestamp', 'Actor_Email', 'Action', 'Target_Tab', 'Target_Key', 'Field_Changed', 'Old_Value', 'New_Value', 'Source', 'Notes']);
    }
    var id = 'AUD-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow([id, new Date().toISOString(), actorEmail || 'APP', action, targetTab, targetKey, fieldChanged, oldValue, newValue, 'APP', '']);
  } catch (auditErr) {
    // Swallow — see comment above.
  }
}

// Row-based tabs (POC_Master, Site_Master, Service_Registry, Master_Audit) —
// header row 1, one object per row after that. Skips fully-blank rows.
function sheetRowsAsJson(sheet) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    var hasContent = false;
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      if (!key) continue;
      obj[key] = row[j] !== undefined ? row[j] : '';
      if (row[j] !== '') hasContent = true;
    }
    if (hasContent) rows.push(obj);
  }
  return rows;
}

// Dropdowns — column-based, NOT row-based: row 1 is the list name, every
// non-blank cell below it in that column is one allowed value (MASTERDATA.md
// §5). Do not run this through sheetRowsAsJson — wrong shape entirely.
function dropdownsAsJson(sheet) {
  if (!sheet) return {};
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return {};
  var headers = values[0];
  var out = {};
  for (var c = 0; c < headers.length; c++) {
    var listName = String(headers[c]).trim();
    if (!listName) continue;
    var list = [];
    for (var r = 1; r < values.length; r++) {
      var v = values[r][c];
      if (v !== '' && v !== undefined && v !== null) list.push(String(v).trim());
    }
    out[listName] = list;
  }
  return out;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedCode(true);
    notify('success', 'Script Copied', 'Google Apps Script code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleCopyMasterDataCode = () => {
    navigator.clipboard.writeText(masterDataAppsScriptCode);
    setCopiedMasterDataCode(true);
    notify('success', 'Script Copied', 'MasterData_Code.gs copied to clipboard!');
    setTimeout(() => setCopiedMasterDataCode(false), 3000);
  };

  const handleLiveSync = async () => {
    if (!gasUrlInput.trim()) {
      notify('warning', 'URL Required', 'Please enter your Google Apps Script Web App or Sheet link.');
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await syncPocMasterFromUrl(gasUrlInput.trim());
      setPocMasterSheetUrl(gasUrlInput.trim());
      setSyncResult({
        ok: res.ok,
        message: res.message,
        added: res.added,
        updated: res.updated
      });
      if (res.ok) {
        notify('success', 'POC Master Synced', res.message);
      } else {
        notify('error', 'Sync Failed', res.message);
      }
    } catch (err: any) {
      setSyncResult({
        ok: false,
        message: err.message || 'Error communicating with Google Sheet Webhook.'
      });
      notify('error', 'Sync Error', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualPasteSubmit = () => {
    if (!manualPasteText.trim()) return;

    try {
      if (manualPasteType === 'poc') {
        // Parse CSV or TSV
        const lines = manualPasteText.trim().split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return;

        const isTsv = lines[0].includes('\t');
        const delimiter = isTsv ? '\t' : ',';
        const firstRowTokens = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
        const hasHeader = firstRowTokens.some(h => {
          const l = h.toLowerCase();
          return l.includes('state') || l.includes('facility') || l.includes('warehouse') || l.includes('sap') || l.includes('poc') || l.includes('city');
        });

        const startIndex = hasHeader ? 1 : 0;
        const headers = hasHeader ? firstRowTokens : [];

        const parsedWarehouses: Partial<Warehouse>[] = [];

        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

          let state = '';
          let name = '';
          let sap = '';
          let city = '';
          let b2b = '';
          let b2c = '';
          let pocName = '';
          let pocContact = '';
          let pocEmail = '';
          let costCenter = '';
          let zone = 'North';

          if (hasHeader) {
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => {
              row[h.toLowerCase().trim()] = cols[idx] || '';
            });

            state = row['state'] || row['st'] || '';
            name = row['warehouse / facility name'] || row['facility name'] || row['facility'] || row['warehouse name'] || row['wh name'] || row['name'] || `Warehouse ${i}`;
            sap = row['sap code'] || row['sap'] || row['sapcode'] || '';
            city = row['city'] || '';
            b2b = row['b2b name'] || row['b2b'] || name;
            b2c = row['b2c name'] || row['b2c'] || name;
            pocName = row['site poc name'] || row['site poc'] || row['poc name'] || row['poc'] || '';
            pocContact = row['site poc contact number'] || row['poc contact'] || row['contact'] || row['phone'] || '';
            pocEmail = row['site poc email'] || row['email'] || row['poc email'] || (pocName ? `${pocName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@grofers.com` : '');
            costCenter = row['cost center'] || row['costcenter'] || (sap ? `CC-${sap}` : `CC-WH-${i}`);
            zone = row['zone'] || 'North';
          } else {
            // Positional Mapping (Sheet Default)
            state = cols[0] || '';
            name = cols[1] || `Facility ${i + 1}`;
            sap = cols[2] || '';
            city = cols[3] || '';
            b2b = cols[4] || name;
            b2c = cols[5] || name;
            pocName = cols[6] || '';
            pocContact = cols[7] || '';
            pocEmail = cols[8] || (pocName ? `${pocName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@grofers.com` : '');
            costCenter = cols[9] || (sap ? `CC-${sap}` : `CC-WH-${i + 1}`);
            zone = cols[10] || 'North';
          }

          const code = sap ? `WH-${sap.slice(-6)}` : `WH-${city ? city.slice(0, 3).toUpperCase() : 'HUB'}-${i + 1}`;
          const id = sap ? `WH_${sap.replace(/[^a-zA-Z0-9]/g, '_')}` : code.replace(/-/g, '_');

          parsedWarehouses.push({
            id,
            code,
            name,
            facilityName: name,
            sapCode: sap,
            state,
            city,
            b2bName: b2b,
            b2cName: b2c,
            costCenter,
            zone: zone as any,
            sitePocName: pocName,
            sitePocContact: pocContact,
            sitePocEmail: pocEmail,
            isActive: true
          });
        }

        const { added, updated, total } = syncWarehousesFromPocMaster(parsedWarehouses);
        setShowManualPasteModal(false);
        setManualPasteText('');
        notify('success', 'POC Master Data Ingested', `Successfully ingested ${parsedWarehouses.length} facilities (Added ${added} new, updated ${updated} POC allocations). Data is live across all tabs!`);
      } else {
        // Admin Master Ingestion
        const lines = manualPasteText.trim().split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return;

        const isTsv = lines[0].includes('\t');
        const delimiter = isTsv ? '\t' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

        const parsedAdmins: { fullName: string; email: string; department?: string; assignedServiceIds: string[] }[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = cols[idx] || '';
          });

          const fullName = row['Admin Name'] || row['Admin Full Name'] || row['Name'] || row['fullName'] || '';
          const email = row['Email'] || row['Email Address'] || row['email'] || '';
          const department = row['Department'] || row['department'] || 'Operations Management';
          const servicesRaw = row['Assigned Services'] || row['Services'] || row['assignedServiceIds'] || '';
          
          // Parse services string (e.g. "Diesel, Daily Site, Housekeeping" or sheet IDs)
          const serviceTokens = servicesRaw.split(',').map(s => s.trim().toLowerCase());
          const assignedServiceIds: string[] = [];

          serviceTokens.forEach(t => {
            if (t.includes('diesel') || t.includes('fuel')) assignedServiceIds.push('SHEET_DIESEL');
            if (t.includes('daily') || t.includes('site') || t.includes('checklist')) assignedServiceIds.push('SHEET_DAILY_SITE');
            if (t.includes('dg') || t.includes('power') || t.includes('water')) assignedServiceIds.push('SHEET_DG_POWER_WATER');
            if (t.includes('housekeeping') || t.includes('hk')) assignedServiceIds.push('SHEET_HOUSEKEEPING');
            if (t.includes('hvls') || t.includes('fan')) assignedServiceIds.push('SHEET_HVLS');
            if (t.includes('cold') || t.includes('freezer')) assignedServiceIds.push('SHEET_COLD');
            if (t.includes('mhe') || t.includes('reach') || t.includes('bopt')) assignedServiceIds.push('SHEET_MHE');
            if (t.includes('security') || t.includes('guard')) assignedServiceIds.push('SHEET_SECURITY');
            if (t.includes('fire') || t.includes('hydrant')) assignedServiceIds.push('SHEET_FIRE');
          });

          if (email) {
            parsedAdmins.push({
              fullName: fullName || email.split('@')[0],
              email,
              department,
              assignedServiceIds: assignedServiceIds.length > 0 ? assignedServiceIds : ['SHEET_DAILY_SITE', 'SHEET_DIESEL']
            });
          }
        }

        const { synced } = syncAdminMasterData(parsedAdmins);
        setShowManualPasteModal(false);
        setManualPasteText('');
        notify('success', 'Admin Master Synced', `Successfully assigned permissions for ${synced} Service Administrators.`);
      }
    } catch (e: any) {
      notify('error', 'Parse Error', e.message || 'Failed to parse sheet data.');
    }
  };

  const zones = ['ALL', 'North', 'South', 'West', 'East', 'Central'];

  const filteredWarehouses = warehouses.filter(w => {
    const q = searchFilter.toLowerCase();
    const matchesSearch =
      w.name.toLowerCase().includes(q) ||
      (w.sapCode && w.sapCode.toLowerCase().includes(q)) ||
      (w.city && w.city.toLowerCase().includes(q)) ||
      (w.state && w.state.toLowerCase().includes(q)) ||
      (w.sitePocName && w.sitePocName.toLowerCase().includes(q)) ||
      (w.sitePocEmail && w.sitePocEmail.toLowerCase().includes(q));

    const matchesZone = zoneFilter === 'ALL' || w.zone === zoneFilter;
    return matchesSearch && matchesZone;
  });

  const sitePocUsersCount = users.filter(u => u.role === 'SITE_POC').length;
  const adminUsers = users.filter(u => u.role === 'SERVICE_ADMIN' || u.role === 'SUPER_ADMIN');

  const masterServicesList = [
    {
      id: 'SHEET_DIESEL',
      name: 'Diesel Procurement (3 Triggers)',
      tabName: 'Diesel_Procurement_Master',
      recordsCount: dieselLogs.length,
      columns: ['Timestamp', 'Unique ID', 'Status', 'WH Name B2B', 'Fuel', 'Vendor', 'Qty (L)', 'Rate (₹)', 'Total Amount (₹)', 'Approval Status', 'Delivered Qty', 'POD Proof', 'Variance %'],
      icon: Fuel,
      color: 'text-amber-600 bg-amber-50 border-amber-200'
    },
    {
      id: 'SHEET_DAILY_SITE',
      name: 'Daily Site Activity & Checklist',
      tabName: 'AS_DailyLog / AS_OngoingActivity',
      recordsCount: dailySiteLogs.length,
      columns: ['LogID', 'Timestamp', 'Date', 'Site', 'POC_Name', 'POC_Email', 'UPS', 'DG', 'LT_Panel', 'Cold_Room', 'HVLS', 'Water_Coolers', 'Freezers_GGP', 'Buzzer_Uptime', 'RT', 'BOPT', 'Stackers', 'VRC', 'MTS_Inspection', 'Lights_Inspection', 'Air_Circulation', 'Gemba', 'PM_Planned', 'PM_Completed', 'Highlights'],
      icon: Activity,
      color: 'text-sky-600 bg-sky-50 border-sky-200'
    },
    // Exclude ids already hardcoded above — SHEET_DAILY_SITE and SHEET_DIESEL both exist in
    // operationalSheets too, and without this filter each rendered as two cards sharing one
    // webhook binding (saving either one silently "connected" both).
    ...operationalSheets.filter(s => s.id !== 'SHEET_DIESEL' && s.id !== 'SHEET_DAILY_SITE').slice(0, 8).map(s => ({
      id: s.id,
      name: s.title,
      tabName: `${s.title.replace(/[^a-zA-Z0-9]/g, '_')}_Master`,
      recordsCount: 12,
      columns: ['Timestamp', 'Site', 'Shift', 'Submitted By', ...(s.fieldsConfig || []).slice(0, 5).map(f => f.label), 'Status'],
      icon: FileSpreadsheet,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200'
    }))
  ];

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <PageHeader
        title="MasterData"
        description="POC_Master, Site_Master & Service_Registry — the single source for POC, site and service allocation. Paste-sync from your Master Data sheet below."
        icon={FileSpreadsheet}
        actions={
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleLiveSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync POC Master Now'}</span>
            </button>
          </div>
        }
      />

      {/* Hero Stats Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          <div className="md:col-span-2 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              LIVE TWO-WAY SYNC READY
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Dynamic Warehouse &amp; POC Synchronization
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              When a new warehouse is added to your Google Sheet in the future, the app automatically detects it, creates its facility profile, and generates its Site POC login credentials.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{warehouses.length}</div>
              <div className="text-xs text-slate-400 font-medium">Warehouses Synced</div>
              <div className="text-[10px] text-emerald-400 font-medium">All States Mapped</div>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex items-center gap-3">
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{sitePocUsersCount}</div>
              <div className="text-xs text-slate-400 font-medium">Site POC Accounts</div>
              <div className="text-[10px] text-sky-400 font-medium">Auto-Linked to Sites</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 shadow-xs gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('master_data')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'master_data'
              ? 'border-teal-600 text-teal-700 bg-teal-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Master Data (Live)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('admin_sync')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'admin_sync'
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Admin Master Sheet Bridge</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('script')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'script'
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Google Apps Script (Code.gs)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'services'
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Service Sheet Tabs ({masterServicesList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('faq')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'faq'
              ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Integration Guide</span>
        </button>
      </div>

      {/* Tab 0: Master Data (Live) — the real MASTERDATA.md pipeline: POC_Master / Site_Master / Service_Registry */}
      {activeTab === 'master_data' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-teal-600" />
                  WarehouseOS_MasterData — Live Read
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reads the real <strong>POC_Master</strong>, <strong>Site_Master</strong> and <strong>Service_Registry</strong> tabs.
                  Paste a bare <strong>Spreadsheet ID</strong> or a deployed <strong>Apps Script Web App URL</strong> —
                  auto-detected from what you paste. Both are best-effort; see the note below.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openAssignPocModal()}
                  className="px-3 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  Assign / Edit POC
                </button>
                <button
                  type="button"
                  onClick={() => setShowMasterDataPasteModal(true)}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Paste Master Data JSON
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>"Sync Master Data" below is best-effort, not guaranteed</strong> — Google requires a signed-in
                identity check for either read path, which an embedded request can't always complete. There's no
                further workaround for this without a real backend, which this project doesn't have. The reliable
                path is <strong>Paste Master Data JSON</strong>: open your Apps Script Web App URL directly in a
                browser tab, select all (Ctrl+A) and copy (Ctrl+C) the page's text, then paste it there.
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>Spreadsheet ID or Apps Script Web App URL</span>
                {lastMasterDataSyncAt && (
                  <span className="text-xs text-slate-400 font-normal">
                    Last Synced: <strong>{new Date(lastMasterDataSyncAt).toLocaleString()}</strong>
                  </span>
                )}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={masterDataIdInput}
                  onChange={(e) => setMasterDataIdInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs md:text-sm font-mono focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                  placeholder="1sb9xTktjtulq6gSS6L7xWqeMzIr6B8eEIO9pRiLYxgA  or  https://script.google.com/macros/s/.../exec"
                />
                <button
                  type="button"
                  onClick={handleMasterDataSync}
                  disabled={isSyncingMasterData}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg whitespace-nowrap shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingMasterData ? 'animate-spin' : ''}`} />
                  <span>{isSyncingMasterData ? 'Reading Sheet...' : 'Sync Master Data'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Spreadsheet ID = the part of the sheet's URL between <code>/d/</code> and <code>/edit</code>. Apps
                Script URL = whatever <strong>Deploy → Manage deployments</strong> gives you after deploying{' '}
                <code>MasterData_Code.gs</code> —{' '}
                <button type="button" onClick={() => setShowMasterDataCode(v => !v)} className="text-teal-700 hover:text-teal-800 font-semibold underline">
                  {showMasterDataCode ? 'hide the script' : 'get the script'}
                </button>.
              </p>
            </div>

            {showMasterDataCode && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Deploy this <strong>into the WarehouseOS_MasterData spreadsheet itself</strong> (Extensions → Apps Script) —
                    a separate deployment from the Code.gs on the "Google Apps Script (Code.gs)" tab. It's what reads AND
                    writes here: the GET side backs both "Sync Master Data" and "Paste Master Data JSON"; the POST side is
                    what "Assign / Edit POC", "Add site" and "Add service" actually call.{' '}
                    <strong>Already deployed an older copy?</strong> Paste this over it, then Deploy → Manage
                    deployments → ✏️ → Version: <strong>New version</strong> — a new deployment would change the URL.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyMasterDataCode}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all shrink-0"
                  >
                    {copiedMasterDataCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Script</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-[420px] border border-slate-800 leading-relaxed">
                  {masterDataAppsScriptCode}
                </pre>
              </div>
            )}

            {masterDataSyncResult && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  masterDataSyncResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {masterDataSyncResult.ok ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <p className="text-xs leading-relaxed">{masterDataSyncResult.message}</p>
              </div>
            )}
          </div>

          {/* Row counts — the honest signal that this actually read the real sheet */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-2xl font-extrabold text-slate-900">{pocMasterRows.length}</div>
              <div className="text-xs font-bold text-slate-500 mt-0.5">POC_Master rows</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-2xl font-extrabold text-slate-900">{siteMasterRows.length}</div>
              <div className="text-xs font-bold text-slate-500 mt-0.5">Site_Master rows</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <div className="text-2xl font-extrabold text-slate-900">{serviceRegistryRows.length}</div>
              <div className="text-xs font-bold text-slate-500 mt-0.5">Service_Registry rows</div>
            </div>
          </div>

          {/* Data browser — all five real tabs as sub-tabs. Four are rows-of-records
              (same table renderer); Dropdowns is columns-of-lists and gets its own. */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="flex items-center gap-1 border-b border-slate-200 px-3 pt-2 overflow-x-auto">
              {[...MASTER_DATA_TABS.map(t => ({
                  key: t.key as typeof masterDataViewTab,
                  count: t.key === 'POC_Master' ? pocMasterRows.length
                    : t.key === 'Site_Master' ? siteMasterRows.length
                    : t.key === 'Service_Registry' ? serviceRegistryRows.length
                    : masterAuditRows.length
                })),
                { key: DROPDOWNS_TAB_KEY as typeof masterDataViewTab, count: Object.keys(dropdownLists).length }
              ].map(t => {
                const isSelected = masterDataViewTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setMasterDataViewTab(t.key)}
                    className={`px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? 'border-teal-600 text-teal-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t.key}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${isSelected ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {masterDataViewTab === 'Dropdowns' ? (
              Object.keys(dropdownLists).length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No Dropdowns lists yet — sync or paste above to load them.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                  {Object.entries(dropdownLists).map(([listName, values]) => (
                    <div key={listName} className="border border-slate-200 rounded-xl p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-900">{listName}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-slate-100 text-slate-500">
                          {values.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {values.map((v, i) => (
                          <span key={i} className="text-[11px] font-mono bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (() => {
              const activeTabDef = MASTER_DATA_TABS.find(t => t.key === masterDataViewTab)!;
              const rows: Record<string, any>[] =
                masterDataViewTab === 'POC_Master' ? pocMasterRows :
                masterDataViewTab === 'Site_Master' ? siteMasterRows :
                masterDataViewTab === 'Service_Registry' ? serviceRegistryRows :
                masterAuditRows;

              // Double-click opens the editor for the three editable tabs.
              // Master_Audit is written by the app and the sheet script only,
              // so it gets filters and sorting but no edit affordance.
              const onEditRow =
                masterDataViewTab === 'POC_Master' ? (row: Record<string, any>) => openAssignPocModal(row as any)
                : masterDataViewTab === 'Site_Master' ? (row: Record<string, any>) => openEditor('site', 'edit', row)
                : masterDataViewTab === 'Service_Registry' ? (row: Record<string, any>) => openEditor('service', 'edit', row)
                : undefined;

              const addLabel =
                masterDataViewTab === 'Site_Master' ? 'Add site'
                : masterDataViewTab === 'Service_Registry' ? 'Add service'
                : masterDataViewTab === 'POC_Master' ? 'Assign POC'
                : null;

              const onAdd =
                masterDataViewTab === 'Site_Master' ? () => openEditor('site', 'create')
                : masterDataViewTab === 'Service_Registry' ? () => openEditor('service', 'create')
                : () => openAssignPocModal();

              return (
                <MasterDataTable
                  key={masterDataViewTab}
                  rows={rows}
                  columns={activeTabDef.columns}
                  keyColumn={activeTabDef.keyColumn}
                  onEditRow={onEditRow}
                  actions={
                    addLabel && (
                      <Button variant="primary" size="sm" icon={<PlusIcon className="w-3.5 h-3.5" />} onClick={onAdd}>
                        {addLabel}
                      </Button>
                    )
                  }
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab 2: Admin Master Sheet Bridge */}
      {activeTab === 'admin_sync' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  Admin Master Sheet Integration Ready
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You can provide the Admin Master Sheet data anytime by creating a tab named <strong>"Admin_Master"</strong> in your Google Sheet, or by pasting it directly below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setManualPasteType('admin');
                  setShowManualPasteModal(true);
                }}
                className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Paste Admin Master Sheet Data
              </button>
            </div>

            {/* Expected Format Guide */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                <FileText className="w-4 h-4 text-indigo-600" />
                Recommended Columns for "Admin_Master" Tab:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
                <div className="bg-white p-2.5 rounded border border-indigo-200">
                  <div className="font-bold text-indigo-900">1. Admin Name</div>
                  <div className="text-[10px] text-slate-500">e.g. Rakesh Sharma</div>
                </div>
                <div className="bg-white p-2.5 rounded border border-indigo-200">
                  <div className="font-bold text-indigo-900">2. Email Address</div>
                  <div className="text-[10px] text-slate-500">e.g. rakesh.sharma@grofers.com</div>
                </div>
                <div className="bg-white p-2.5 rounded border border-indigo-200">
                  <div className="font-bold text-indigo-900">3. Department</div>
                  <div className="text-[10px] text-slate-500">e.g. Energy &amp; Fuel Ops</div>
                </div>
                <div className="bg-white p-2.5 rounded border border-indigo-200">
                  <div className="font-bold text-indigo-900">4. Assigned Services</div>
                  <div className="text-[10px] text-slate-500">e.g. Diesel, DG, Daily Site</div>
                </div>
              </div>
            </div>

            {/* Current Configured Admins Table */}
            <TableFullscreen expanded={adminTableExpanded} onCollapse={() => setAdminTableExpanded(false)}>
            <div className="w-full space-y-2 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Currently Configured Administrators ({adminUsers.length})
                </h4>
                <ExpandButton expanded={adminTableExpanded} onToggle={() => setAdminTableExpanded((v) => !v)} />
              </div>

              <div
                className="border border-slate-200 rounded-xl overflow-auto"
                style={adminTableExpanded ? { maxHeight: 'calc(100vh - 10rem)' } : undefined}
              >
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-3">Admin User</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Department</th>
                      <th className="py-3 px-3">Assigned Services</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {adminUsers.map(adm => (
                      <tr key={adm.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{adm.fullName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{adm.email}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            adm.role === 'SUPER_ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {adm.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Service Admin'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {adm.department || 'Operations Management'}
                        </td>
                        <td className="py-2.5 px-3">
                          {adm.role === 'SUPER_ADMIN' ? (
                            <span className="text-[11px] font-bold text-purple-700">
                              All 15 Operational Services (Full Access)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(adm.assignedServiceIds || []).map((sid, i) => {
                                const matched = operationalSheets.find(s => s.id === sid);
                                return (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                                    {matched ? matched.title : sid.replace('SHEET_', '')}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </TableFullscreen>
          </div>
        </div>
      )}

      {/* Tab 3: Google Apps Script Code */}
      {activeTab === 'script' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Google Apps Script Webhook Code (Code.gs)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste this exact script into your Master Google Sheet (Extensions &gt; Apps Script) to enable two-way sync.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all shrink-0"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Full Script</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-[420px] border border-slate-800 leading-relaxed">
                {sampleAppsScriptCode}
              </pre>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-sky-900">
                <Sparkles className="w-4 h-4 text-sky-600" />
                How to deploy in 30 seconds:
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-700">
                <li>Open your Google Sheet and click <strong>Extensions &gt; Apps Script</strong>.</li>
                <li>Delete any existing template code and paste the script above. Press <strong>Ctrl+S (Save)</strong>.</li>
                <li>Click <strong>Deploy &gt; New Deployment</strong> at the top-right.</li>
                <li>Select type: <strong>Web App</strong>.</li>
                <li>Set <strong>Execute as:</strong> "Me" (your Google account) and <strong>Who has access:</strong> "Anyone".</li>
                <li>Click <strong>Deploy</strong>, copy the generated Web App URL, and paste it into the portal!</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Service Mapping */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Service Master Tabs in Google Sheet</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every service form writes into its dedicated tab with automatic header initialization.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
              {masterServicesList.length} Connected Services
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {masterServicesList.map((srv, idx) => {
              const IconComp = srv.icon;
              return (
                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg border ${srv.color}`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{srv.name}</h4>
                        <div className="text-xs font-mono text-emerald-700 flex items-center gap-1">
                          <FileSpreadsheet className="w-3 h-3" />
                          Tab: <strong>{srv.tabName}</strong>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      {srv.recordsCount} Rows
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[11px] text-slate-500 font-medium mb-1">Mapped Columns:</div>
                    <div className="flex flex-wrap gap-1">
                      {srv.columns.map((c, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Dedicated Sheet Webhook Connection (one Apps Script Web App per service) */}
                  {srv.id && (
                    <div className="pt-3 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Apps Script Web App URL
                        </span>
                        {sheetWebhookUrls[srv.id] ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Not connected
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={getWebhookDraft(srv.id)}
                          onChange={(e) => setWebhookInputs(prev => ({ ...prev, [srv.id as string]: e.target.value }))}
                          placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSheetWebhookUrl(srv.id as string, getWebhookDraft(srv.id).trim());
                            notify('success', 'Webhook Saved', `${srv.name} will now sync new submissions to its Google Sheet.`);
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 5: Integration FAQ */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="font-bold text-slate-900 text-base">Two-Way Google Sheets Architecture FAQ</h3>

            <div className="space-y-4 text-xs">
              <div className="border border-slate-200 rounded-xl p-4 space-y-1.5 bg-slate-50">
                <h4 className="font-bold text-slate-900 text-sm">Q: How does the auto-sync work when new warehouses arrive?</h4>
                <p className="text-slate-600 leading-relaxed">
                  Whenever new warehouses or site POCs are appended to your Google Sheet, clicking <strong>"Sync POC Master Now"</strong> (or opening the portal) executes the `getPocMaster` action. The app compares SAP codes and facility names, registers any newly added warehouses, and creates login accounts for the new POCs automatically.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-1.5 bg-slate-50">
                <h4 className="font-bold text-slate-900 text-sm">Q: Where should I attach the Admin Master Sheet?</h4>
                <p className="text-slate-600 leading-relaxed">
                  You can either add a new tab named <strong>"Admin_Master"</strong> inside the same Google Sheet workbook, or share the Admin data with us. Our script already supports reading the `Admin_Master` tab to configure service permissions dynamically.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-1.5 bg-slate-50">
                <h4 className="font-bold text-slate-900 text-sm">Q: Does this replace the need for Firebase?</h4>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Yes!</strong> All data persistence, audit logging, and warehouse directories are backed directly by your Google Sheet. Your team maintains 100% control over formulas, sharing permissions, and historical data exports.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Master Data Paste Modal — the reliable path (see the amber note on the Master Data (Live) tab) */}
      {showMasterDataPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-teal-600" />
                  Paste Master Data JSON
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Open your Apps Script Web App URL directly in a new tab, select all the page's text (Ctrl+A),
                  copy it (Ctrl+C), and paste it below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMasterDataPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            <textarea
              rows={8}
              value={masterDataPasteText}
              onChange={(e) => setMasterDataPasteText(e.target.value)}
              placeholder='{"status":"success","pocMaster":[...],"siteMaster":[...],"serviceRegistry":[...]}'
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMasterDataPasteModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMasterDataPaste}
                disabled={!masterDataPasteText.trim() || isImportingMasterData}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                {isImportingMasterData ? 'Importing' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign / Edit POC Modal — writes a POC_Master row via assignPocMasterRow
          (upsert by Access_ID through the Apps Script bridge). This is the one
          in-app place POC/site allocation happens; re-sync or re-paste to see
          the write reflected in the tables above. */}
      {editor && (
        <MasterRowEditor
          open
          mode={editor.mode}
          title={
            editor.mode === 'create'
              ? editor.tab === 'site' ? 'Add a new site' : 'Add a new service'
              : `${editor.tab === 'site' ? 'Site_Master' : 'Service_Registry'} · ${
                  editor.tab === 'site' ? editor.initial.Site_Code : editor.initial.Service_Code
                }`
          }
          keyField={editor.tab === 'site' ? 'Site_Code' : 'Service_Code'}
          fields={editor.tab === 'site' ? SITE_FIELDS : SERVICE_FIELDS}
          initial={editor.initial}
          derive={editor.tab === 'site' ? deriveSite : undefined}
          onClose={() => setEditor(null)}
          onSave={async (row, mode, originalKey) => {
            const res = editor.tab === 'site'
              ? await saveSiteMasterRow(row as any, mode, originalKey)
              : await saveServiceRegistryRow(row as any, mode, originalKey);
            if (res.success) notify('success', mode === 'create' ? 'Row added' : 'Row saved', res.message);
            return res;
          }}
        />
      )}

      {showAssignPocModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden space-y-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600" />
                  {assignPocForm.Access_ID ? `Edit POC — ${assignPocForm.Access_ID}` : 'Assign New POC'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Writes to POC_Master via the Apps Script bridge. Leave Access_ID blank to create a new row —
                  the sheet assigns the ID.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignPocModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {!masterDataAppsScriptUrl && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>No Apps Script Web App URL is set yet — set one above (Sync field) before this can write to the sheet.</span>
              </div>
            )}

            {/* Role decides scope, per MASTERDATA.md §6 — picking it auto-adjusts
                Site_Code / Service_Codes below so the row can't drift from the
                access-control model (SITE_POC = one site; WAREHOUSE_ADMIN = one
                site, all services; SERVICE_ADMIN = all sites, one service;
                SUPER_ADMIN = everything). */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Role — decides scope</label>
              <select
                value={assignPocForm.Role}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  const siteLocked = nextRole === 'SERVICE_ADMIN' || nextRole === 'SUPER_ADMIN';
                  const serviceLocked = nextRole === 'WAREHOUSE_ADMIN' || nextRole === 'SUPER_ADMIN';
                  setAssignPocForm(prev => ({
                    ...prev,
                    Role: nextRole,
                    Site_Code: siteLocked ? 'ALL' : (prev.Site_Code === 'ALL' ? '' : prev.Site_Code),
                    Service_Codes: serviceLocked ? 'ALL' : (prev.Service_Codes === 'ALL' ? '' : prev.Service_Codes),
                    Is_Primary: nextRole === 'SITE_POC' ? 'Yes' : 'No'
                  }));
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="SITE_POC">SITE_POC — files data for one site</option>
                <option value="WAREHOUSE_ADMIN">WAREHOUSE_ADMIN — everything at one site</option>
                <option value="SERVICE_ADMIN">SERVICE_ADMIN — one service, every site</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN — everything, plus master data</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'Access_ID', label: 'Access_ID (blank = new)' },
                { key: 'POC_Email', label: 'POC_Email *' },
                { key: 'POC_Name', label: 'POC_Name *' },
                { key: 'WH_Code', label: 'WH_Code (display only)' },
                { key: 'Contact_Number', label: 'Contact_Number' },
                { key: 'Access_Start_Date', label: 'Access_Start_Date (YYYY-MM-DD)' },
                { key: 'Access_End_Date', label: 'Access_End_Date (optional)' },
                { key: 'Reporting_Manager_Email', label: 'Reporting_Manager_Email' }
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{f.label}</label>
                  <input
                    type="text"
                    value={(assignPocForm as any)[f.key]}
                    onChange={(e) => setAssignPocForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Active</label>
                <select
                  value={assignPocForm.Active}
                  onChange={(e) => setAssignPocForm(prev => ({ ...prev, Active: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Description</label>
                <input
                  type="text"
                  value={assignPocForm.Description}
                  onChange={(e) => setAssignPocForm(prev => ({ ...prev, Description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            {/* Site_Code — locked to ALL for SERVICE_ADMIN / SUPER_ADMIN */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Site_Code {assignPocForm.Role === 'SERVICE_ADMIN' || assignPocForm.Role === 'SUPER_ADMIN' ? '(locked to ALL for this role)' : '*'}
              </label>
              <select
                value={assignPocForm.Site_Code}
                disabled={assignPocForm.Role === 'SERVICE_ADMIN' || assignPocForm.Role === 'SUPER_ADMIN'}
                onChange={(e) => setAssignPocForm(prev => ({ ...prev, Site_Code: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-60"
              >
                <option value="">— Select a site —</option>
                <option value="ALL">ALL — Nationwide</option>
                {siteMasterRows
                  .slice()
                  .sort((a, b) => a.Facility_Name.localeCompare(b.Facility_Name))
                  .map(s => (
                    <option key={s.Site_Code} value={s.Site_Code}>
                      {s.Facility_Name} ({s.Site_Code}){s.Active !== 'Yes' ? ' — inactive' : ''}
                    </option>
                  ))}
              </select>
              {siteMasterRows.length === 0 && (
                <p className="text-[11px] text-slate-400">No Site_Master rows loaded yet — paste Master Data JSON first to pick from the real site list.</p>
              )}
            </div>

            {/* Service_Codes — locked to ALL for WAREHOUSE_ADMIN / SUPER_ADMIN */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Service_Codes {assignPocForm.Role === 'WAREHOUSE_ADMIN' || assignPocForm.Role === 'SUPER_ADMIN' ? '(locked to ALL for this role)' : ''}
              </label>
              {assignPocForm.Role === 'WAREHOUSE_ADMIN' || assignPocForm.Role === 'SUPER_ADMIN' ? (
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500 font-mono">ALL</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignPocForm.Service_Codes === 'ALL'}
                      onChange={(e) => setAssignPocForm(prev => ({ ...prev, Service_Codes: e.target.checked ? 'ALL' : '' }))}
                    />
                    ALL
                  </label>
                  {serviceRegistryRows.map(svc => {
                    const selected = assignPocForm.Service_Codes !== 'ALL' &&
                      assignPocForm.Service_Codes.split(',').map(s => s.trim()).includes(svc.Service_Code);
                    return (
                      <label key={svc.Service_Code} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setAssignPocForm(prev => {
                            const current = prev.Service_Codes === 'ALL' ? [] : prev.Service_Codes.split(',').map(s => s.trim()).filter(Boolean);
                            const next = current.includes(svc.Service_Code)
                              ? current.filter(c => c !== svc.Service_Code)
                              : [...current, svc.Service_Code];
                            return { ...prev, Service_Codes: next.join(',') };
                          })}
                        />
                        {svc.Service_Code}
                      </label>
                    );
                  })}
                  {serviceRegistryRows.length === 0 && (
                    <p className="text-[11px] text-slate-400">No Service_Registry rows loaded yet — paste Master Data JSON first, or type a code directly isn't available in this picker.</p>
                  )}
                </div>
              )}
            </div>

            {assignPocResult && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                  assignPocResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {assignPocResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <span>{assignPocResult.message}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignPocModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignPocSubmit}
                disabled={isAssigningPoc}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs disabled:opacity-60"
              >
                {isAssigningPoc ? 'Saving…' : assignPocForm.Access_ID ? 'Save Changes' : 'Assign POC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Paste Modal */}
      {showManualPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                {manualPasteType === 'poc' ? 'Direct Ingest: POC Master Rows' : 'Direct Ingest: Admin Master Rows'}
              </h3>
              <button
                type="button"
                onClick={() => setShowManualPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Copy rows directly from your Google Sheet or Excel (including header row) and paste them below:
            </p>

            <textarea
              rows={8}
              value={manualPasteText}
              onChange={(e) => setManualPasteText(e.target.value)}
              placeholder={
                manualPasteType === 'poc'
                  ? 'State\tWarehouse / Facility Name\tSAP Code\tCity\tB2B Name\tSite POC Name\tSite POC Contact Number\tSite POC Email\nKarnataka\tFacility_Bangalore B4\t1510942B29\tBangalore\tBangalore B4 FC\tSuresh Rao\t+91 98100 12345\tsuresh.rao@grofers.com'
                  : 'Admin Name\tEmail Address\tDepartment\tAssigned Services\nRakesh Sharma\trakesh.sharma@grofers.com\tEnergy & Fuel Ops\tDiesel, DG Power & Water'
              }
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowManualPasteModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualPasteSubmit}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
              >
                Parse &amp; Sync Rows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
