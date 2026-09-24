/**
 * Master Data — sync with WarehouseOS_MasterData.
 *
 * TWO LIVE READ PATHS, same output shape — BOTH BEST-EFFORT, NEITHER
 * GUARANTEED. A third idea (a Drive file published "Anyone with the link")
 * was tried and rejected outright by Google with "Invalid argument" — this
 * organization's Workspace admin has disabled that kind of external sharing
 * entirely, and there is no client-side way around that (nor should there
 * be — it's a deliberate security policy). No backend/Service-Account route
 * either, by explicit choice: that would need a Google Cloud project this
 * user doesn't have and does not want to request.
 *
 * Given that, the RELIABLE path for Master Data is manual, not live:
 * parseMasterDataJson() / "Paste Master Data JSON" in the UI — open the
 * Apps Script URL yourself in a browser tab, copy the page, paste it in.
 * A plain page visit is unaffected by any of the restrictions below, since
 * it isn't an embedded/cross-origin request at all.
 *
 *  1. fetchMasterDataFromAppsScript(webAppUrl) — reads through a Code.gs
 *     `doGet` (domain-restricted "Execute as Me / Anyone within the
 *     organization" deployment — same style that works for Daily Site
 *     Report writes). Also enables writes (assigning a POC) via the same
 *     URL — the write side is reliable even though the read side isn't.
 *
 *  2. fetchMasterData(spreadsheetId) — reads the sheet directly via Google's
 *     own gviz/tq endpoint. No Apps Script to deploy at all.
 *
 * WHY fetch() DOESN'T WORK:
 * fetch() is subject to CORS. A sheet (or an Apps Script Web App) shared as
 * "Anyone within <workspace domain> with the link" needs the request to
 * carry the viewer's Google session cookies, and neither Google service
 * sends back an Access-Control-Allow-Origin header naming this app's
 * origin — so even a cookie-attached fetch() has its response blocked by
 * the browser before this code ever sees it.
 *
 * PATH 1 (gviz) uses a <script src="..."> tag — script loads aren't subject
 * to CORS the way fetch() reads are, and gviz supports wrapping its JSON in
 * a callback() call natively (responseHandler=<name>). That's JSONP.
 *
 * PATH 2 (Apps Script) does NOT use a <script> tag, on purpose — a <script
 * src> is a cross-site *subresource* fetch, and in testing, modern Chrome
 * would not reliably carry the viewer's Google sign-in along on that kind
 * of request even when the target was correctly shared, so the Apps Script
 * side kept coming back as if unauthenticated no matter what. Instead it
 * loads the URL in a hidden <iframe> — a navigation, not a subresource
 * fetch, the same class of request as the hidden-form-POST that already
 * works for writes — and the target page (see MasterData_Code.gs)
 * `postMessage()`s its data back to the parent. That sidesteps the read
 * restriction outright: postMessage is a channel a cross-origin frame is
 * always allowed to push through, regardless of CORS or cookie policy.
 *
 * TRADE-OFF, either path: this still depends on the viewer's browser
 * already being signed into a Google account that can open the sheet —
 * same as navigating to it in a new tab would need. It can only read what
 * the viewer's own Google session could read manually.
 *
 * WRITES (path 2 only) use the separate hidden-form-POST technique (see
 * submitViaHiddenForm in AppContext.tsx) — that solves a different problem
 * (posting without reading the response) and is not affected by any of
 * this file.
 */

import { ALL, PocMaster, SiteMaster, ServiceRegistry, MasterAudit, EffectiveAccess, Scoped } from '../types/masterData';
import { normaliseTime } from './masterData/validate';

let jsonpCounter = 0;

/**
 * Loads `url` in a hidden <iframe> (a navigation) and waits for that page to
 * postMessage() its data back — used for the Apps Script bridge instead of a
 * <script> tag. A <script src> is a cross-site *subresource* fetch, and
 * modern Chrome can decline to carry your Google sign-in along on that kind
 * of request even when the target is correctly shared with you. An iframe
 * navigation is the same class of request as the hidden-form-POST that
 * already works for writes, which is why this reaches the same authenticated
 * content reliably where the script-tag approach didn't.
 *
 * Requires the target page to actively call `parent.postMessage({source:
 * 'wos-masterdata', payload: ...}, '*')` itself (see MasterData_Code.gs)  —
 * this file can't reach into the iframe's DOM to read anything; postMessage
 * is the one channel a cross-origin frame is allowed to push data through.
 */
function loadViaPostMessage(url: string, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out reaching "${url}". Either it isn't shared with your Google account, or you're signed into the wrong account in this browser.`));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== 'wos-masterdata') return; // not our bridge — ignore
      try {
        // Loose origin check — Apps Script serves this from a *.google*.com host.
        if (event.origin && !/\.google(usercontent)?\.com$/.test(new URL(event.origin).hostname)) return;
      } catch {
        return;
      }
      cleanup();
      resolve(data.payload);
    };
    window.addEventListener('message', onMessage);

    // Strip any pre-existing "mode" param before adding ours, same reasoning
    // as before: a stray leftover param from manual testing shouldn't be able
    // to collide with the one we set.
    let finalUrl: string;
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('mode');
      parsed.searchParams.set('mode', 'postmessage');
      finalUrl = parsed.toString();
    } catch {
      const sep = url.includes('?') ? '&' : '?';
      finalUrl = `${url}${sep}mode=postmessage`;
    }

    iframe.src = finalUrl;
    document.body.appendChild(iframe);
  });
}

/** Reads one tab of a Google Sheet as row objects, via the gviz/tq visualization endpoint. */
function fetchSheetTabJsonp(spreadsheetId: string, tabName: string, timeoutMs = 15000): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const callbackName = `__wos_gviz_${Date.now()}_${jsonpCounter++}`;
    const scriptId = callbackName + '_script';

    const cleanup = () => {
      delete (window as any)[callbackName];
      const s = document.getElementById(scriptId);
      if (s) s.remove();
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timed out reading "${tabName}". Either the spreadsheet isn't shared with your Google ` +
        `account, or you're not signed into the right account in this browser.`
      ));
    }, timeoutMs);

    (window as any)[callbackName] = (resp: any) => {
      cleanup();
      try {
        if (!resp || resp.status === 'error') {
          const msg = resp?.errors?.[0]?.detailed_message || resp?.errors?.[0]?.message;
          reject(new Error(msg || `Google Sheets rejected the request for "${tabName}". Check the tab name is exact (case-sensitive).`));
          return;
        }
        const cols: string[] = resp.table.cols.map((c: any) => String(c.label || c.id || '').trim());
        const rows: Record<string, string>[] = resp.table.rows.map((r: any) => {
          const obj: Record<string, string> = {};
          (r.c || []).forEach((cell: any, i: number) => {
            const key = cols[i];
            if (key) obj[key] = cell ? String(cell.f ?? cell.v ?? '') : '';
          });
          return obj;
        });
        resolve(rows);
      } catch (e: any) {
        reject(new Error(`Couldn't parse the response for "${tabName}": ${e.message}`));
      }
    };

    const script = document.createElement('script');
    script.id = scriptId;
    script.src =
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq` +
      `?sheet=${encodeURIComponent(tabName)}` +
      `&tqx=out:json;responseHandler:${callbackName}`;
    script.onerror = () => {
      cleanup();
      reject(new Error(
        `Couldn't reach "${tabName}". Check the Spreadsheet ID is correct and the tab is shared ` +
        `with your Google account (or "Anyone within the organization").`
      ));
    };
    document.body.appendChild(script);
  });
}

const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const yesNo = (v: unknown): 'Yes' | 'No' => (s(v) === 'Yes' ? 'Yes' : 'No');

function mapPocRow(r: Record<string, any>): PocMaster {
  return {
    Access_ID: s(r['Access_ID']),
    POC_Email: s(r['POC_Email']).toLowerCase(),
    POC_Name: s(r['POC_Name']),
    WH_Code: s(r['WH_Code']),
    Role: s(r['Role']) as PocMaster['Role'],
    Site_Code: s(r['Site_Code']) as Scoped<string>,
    Service_Codes: s(r['Service_Codes']) as Scoped<string>,
    Contact_Number: s(r['Contact_Number']),
    Is_Primary: yesNo(r['Is_Primary']),
    Active: yesNo(r['Active']),
    Access_Start_Date: s(r['Access_Start_Date']),
    Access_End_Date: s(r['Access_End_Date']),
    Description: s(r['Description']),
    Reporting_Manager_Email: s(r['Reporting_Manager_Email']),
    Last_Updated_By: s(r['Last_Updated_By']),
    Last_Updated_At: s(r['Last_Updated_At'])
  };
}

function mapSiteRow(r: Record<string, any>): SiteMaster {
  return {
    Site_Code: s(r['Site_Code']),
    WH_Code: s(r['WH_Code']),
    Facility_Name: s(r['Facility_Name']),
    SAP_Code: s(r['SAP_Code']),
    Cost_Center: s(r['Cost_Center']),
    Zone: s(r['Zone']) as SiteMaster['Zone'],
    State: s(r['State']),
    City: s(r['City']),
    Address: s(r['Address']),
    Pincode: s(r['Pincode']),
    Channel: s(r['Channel']) as SiteMaster['Channel'],
    Entity: s(r['Entity']),
    Business_Type: s(r['Business_Type']) as SiteMaster['Business_Type'],
    GSTIN: s(r['GSTIN']),
    Lat_Long: s(r['Lat_Long']),
    Map_Link: s(r['Map_Link']),
    Services_Enabled: s(r['Services_Enabled']) as Scoped<string>,
    Go_Live_Date: s(r['Go_Live_Date']),
    Closure_Date: s(r['Closure_Date']),
    Active: yesNo(r['Active']),
    Last_Updated_By: s(r['Last_Updated_By']),
    Last_Updated_At: s(r['Last_Updated_At'])
  };
}

function mapServiceRow(r: Record<string, any>): ServiceRegistry {
  return {
    Service_Code: s(r['Service_Code']),
    Service_Name: s(r['Service_Name']),
    Needs_Approval: yesNo(r['Needs_Approval']),
    Needs_Delivery_Validation: yesNo(r['Needs_Delivery_Validation']),
    Requires_Evidence: yesNo(r['Requires_Evidence']),
    Cadence: s(r['Cadence']) as ServiceRegistry['Cadence'],
    // The sheet sends a typed 18:00 back as 18:00:00; keep the app's HH:MM.
    Submission_Window: normaliseTime(s(r['Submission_Window'])),
    SLA_Hours: s(r['SLA_Hours']) === '' ? '' : Number(r['SLA_Hours']),
    // 'AppScript_URL' is the current column name; 'Spreadsheet_ID' read as a fallback
    // for JSON pasted before the sheet column was renamed.
    AppScript_URL: s(r['AppScript_URL']) || s(r['Spreadsheet_ID']),
    Records_Tab: s(r['Records_Tab']) || 'Records',
    Audit_Tab: s(r['Audit_Tab']) || 'Audit',
    Active: yesNo(r['Active']),
    Last_Updated_By: s(r['Last_Updated_By']),
    Last_Updated_At: s(r['Last_Updated_At'])
  };
}

export async function fetchPocMaster(spreadsheetId: string, tabName = 'POC_Master'): Promise<PocMaster[]> {
  const rows = await fetchSheetTabJsonp(spreadsheetId, tabName);
  return rows.filter(r => s(r['Access_ID'])).map(mapPocRow);
}

export async function fetchSiteMaster(spreadsheetId: string, tabName = 'Site_Master'): Promise<SiteMaster[]> {
  const rows = await fetchSheetTabJsonp(spreadsheetId, tabName);
  return rows.filter(r => s(r['Site_Code'])).map(mapSiteRow);
}

export async function fetchServiceRegistry(spreadsheetId: string, tabName = 'Service_Registry'): Promise<ServiceRegistry[]> {
  const rows = await fetchSheetTabJsonp(spreadsheetId, tabName);
  return rows.filter(r => s(r['Service_Code'])).map(mapServiceRow);
}

function mapAuditRow(r: Record<string, any>): MasterAudit {
  return {
    Audit_ID: s(r['Audit_ID']),
    Timestamp: s(r['Timestamp']),
    Actor_Email: s(r['Actor_Email']),
    Action: s(r['Action']) as MasterAudit['Action'],
    Target_Tab: s(r['Target_Tab']) as MasterAudit['Target_Tab'],
    Target_Key: s(r['Target_Key']),
    Field_Changed: s(r['Field_Changed']),
    Old_Value: s(r['Old_Value']),
    New_Value: s(r['New_Value']),
    Source: s(r['Source']) as MasterAudit['Source'],
    Notes: s(r['Notes'])
  };
}

export interface MasterDataResult {
  pocMaster: PocMaster[];
  siteMaster: SiteMaster[];
  serviceRegistry: ServiceRegistry[];
  /** Master_Audit rows and Dropdowns lists — only populated via the Apps
   * Script path (fetchMasterDataFromAppsScript / parseMasterDataJson); the
   * raw-gviz path (fetchMasterData) doesn't read these two tabs, since
   * Dropdowns' column-based shape needs Code.gs's own parsing. */
  masterAudit: MasterAudit[];
  dropdowns: Record<string, string[]>;
  /** Populated per tab that failed — a tab missing here succeeded, even if the others didn't. */
  errors: { pocMaster?: string; siteMaster?: string; serviceRegistry?: string };
}

/**
 * Reads all three master tabs directly from Google Sheets (gviz), one tab
 * failing independently of the others — so "Site_Master timed out" doesn't
 * also hide that POC_Master actually worked.
 */
export async function fetchMasterData(spreadsheetId: string): Promise<MasterDataResult> {
  const [pocSettled, siteSettled, serviceSettled] = await Promise.allSettled([
    fetchPocMaster(spreadsheetId),
    fetchSiteMaster(spreadsheetId),
    fetchServiceRegistry(spreadsheetId)
  ]);

  const errors: MasterDataResult['errors'] = {};
  const pocMaster = pocSettled.status === 'fulfilled' ? pocSettled.value : (errors.pocMaster = pocSettled.reason?.message || String(pocSettled.reason), []);
  const siteMaster = siteSettled.status === 'fulfilled' ? siteSettled.value : (errors.siteMaster = siteSettled.reason?.message || String(siteSettled.reason), []);
  const serviceRegistry = serviceSettled.status === 'fulfilled' ? serviceSettled.value : (errors.serviceRegistry = serviceSettled.reason?.message || String(serviceSettled.reason), []);

  return { pocMaster, siteMaster, serviceRegistry, masterAudit: [], dropdowns: {}, errors };
}

/**
 * Reads all three tabs through a Code.gs `doGet` deployed on the Master
 * Data sheet (see MasterData_Code.gs) — same domain-restricted deployment
 * style already working for Daily Site Report writes. The script controls
 * the exact output shape, so no gviz table-parsing is needed here.
 */
export async function fetchMasterDataFromAppsScript(webAppUrl: string): Promise<MasterDataResult> {
  const resp = await loadViaPostMessage(webAppUrl.trim());
  return shapeAppsScriptResponse(resp);
}

function shapeAppsScriptResponse(resp: any): MasterDataResult {
  if (resp.status === 'error') {
    throw new Error(resp.message || 'The Master Data bridge returned an error.');
  }
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const dropdowns = resp.dropdowns && typeof resp.dropdowns === 'object' ? resp.dropdowns : {};
  return {
    pocMaster: arr(resp.pocMaster).map(mapPocRow),
    siteMaster: arr(resp.siteMaster).map(mapSiteRow),
    serviceRegistry: arr(resp.serviceRegistry).map(mapServiceRow),
    masterAudit: arr(resp.masterAudit).map(mapAuditRow),
    dropdowns,
    errors: {}
  };
}

/**
 * Manual fallback: parses the exact JSON MasterData_Code.gs's doGet returns
 * when you open its URL directly in a normal browser tab (no ?mode, no
 * ?callback — just the plain response). Live sync from inside the app hits a
 * real Google security wall (see the X-Frame-Options note above) that a
 * direct top-level visit never does, so this is the reliable path until a
 * real backend exists: open the URL yourself, copy the page's text, paste it
 * here.
 */
export function parseMasterDataJson(jsonText: string): MasterDataResult {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    throw new Error(`That doesn't look like valid JSON (make sure you copied the whole page): ${e.message}`);
  }
  return shapeAppsScriptResponse(parsed);
}

export interface RowDiff {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

/**
 * Compares an old and new snapshot of one master-data table by primary key,
 * for reporting what a fresh paste actually changed. Every paste is still
 * treated as the full current truth (the app fully replaces its local
 * mirror with `newRows`) — this only classifies each row for the summary
 * message, it doesn't change what gets kept.
 */
export function diffRows<T extends Record<string, any>>(oldRows: T[], newRows: T[], pk: keyof T): RowDiff {
  const oldMap = new Map(oldRows.map(r => [r[pk], r]));
  const newMap = new Map(newRows.map(r => [r[pk], r]));
  let added = 0, updated = 0, removed = 0, unchanged = 0;
  for (const [key, row] of newMap) {
    const prev = oldMap.get(key);
    if (!prev) added++;
    else if (JSON.stringify(prev) !== JSON.stringify(row)) updated++;
    else unchanged++;
  }
  for (const key of oldMap.keys()) if (!newMap.has(key)) removed++;
  return { added, updated, removed, unchanged };
}

/** `+3 / ~2 / -1` style fragment for one table's diff; omits an entry that's all-zero. */
export function formatRowDiff(label: string, d: RowDiff): string {
  if (d.added === 0 && d.updated === 0 && d.removed === 0) {
    return `${label}: unchanged (${d.unchanged})`;
  }
  const parts: string[] = [];
  if (d.added) parts.push(`+${d.added}`);
  if (d.updated) parts.push(`~${d.updated}`);
  if (d.removed) parts.push(`-${d.removed}`);
  return `${label}: ${parts.join(' / ')}`;
}

/**
 * MASTERDATA.md §6 "Effective access" — implemented exactly:
 *
 *   row.Active === 'Yes'
 *   AND (Access_Start_Date is blank OR today >= Access_Start_Date)
 *   AND (Access_End_Date  is blank OR today <= Access_End_Date)
 *   AND (Site_Code === 'ALL' OR Site_Master[Site_Code].Active === 'Yes')
 *
 * A person can hold several POC_Master rows (Access_ID is the PK, not
 * POC_Email) — this returns the first row that grants access, so one
 * expired/deactivated row never blocks a still-valid one for the same
 * person.
 */
export function computeEffectiveAccess(
  email: string,
  pocRows: PocMaster[],
  siteRows: SiteMaster[],
  today: string = new Date().toISOString().slice(0, 10)
): EffectiveAccess {
  const normEmail = email.trim().toLowerCase();
  const siteByCode = new Map(siteRows.map(row => [row.Site_Code, row]));
  const candidates = pocRows.filter(r => r.POC_Email === normEmail);

  for (const row of candidates) {
    if (row.Active !== 'Yes') continue;
    if (row.Access_Start_Date && today < row.Access_Start_Date) continue;
    if (row.Access_End_Date && today > row.Access_End_Date) continue;
    if (row.Site_Code !== ALL) {
      const site = siteByCode.get(row.Site_Code);
      if (!site || site.Active !== 'Yes') continue; // the cascade: site off -> POC denied
    }

    const siteScope = row.Site_Code === ALL ? ALL : [row.Site_Code];
    const serviceScope = row.Service_Codes === ALL
      ? ALL
      : row.Service_Codes.split(',').map(x => x.trim()).filter(Boolean);

    return { email: normEmail, row, role: row.Role, siteScope, serviceScope, granted: true };
  }

  return {
    email: normEmail,
    row: null,
    role: null,
    siteScope: [],
    serviceScope: [],
    granted: false,
    denialReason: candidates.length > 0
      ? 'Your access has expired, is not yet active, or your site has been deactivated.'
      : 'No POC_Master row exists for this email. A valid Grofers login is not enough on its own — ask your Super Admin to add you.'
  };
}

/**
 * A POC's effective services = Service_Codes ∩ Site_Master.Services_Enabled
 * (MASTERDATA.md §6, last line) — a service not enabled at the site is not
 * available even if the POC row says 'ALL'. Only meaningful for SITE_POC /
 * WAREHOUSE_ADMIN, who resolve to a single site; SERVICE_ADMIN and
 * SUPER_ADMIN scope by service or globally and pass through unchanged.
 */
export function effectiveServicesForPoc(access: EffectiveAccess, siteRows: SiteMaster[]): string[] | typeof ALL {
  if (!access.granted || access.siteScope === ALL) return access.serviceScope;

  const site = siteRows.find(row => row.Site_Code === access.siteScope[0]);
  if (!site) return [];

  if (site.Services_Enabled === ALL) return access.serviceScope;

  const enabledAtSite = site.Services_Enabled.split(',').map(x => x.trim());
  return access.serviceScope === ALL
    ? enabledAtSite
    : access.serviceScope.filter(code => enabledAtSite.includes(code));
}
