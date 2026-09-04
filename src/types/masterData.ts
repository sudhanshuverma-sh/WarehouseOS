/**
 * Master Data types — mirror MASTERDATA.md column-for-column.
 * If this file and MASTERDATA.md ever disagree, MASTERDATA.md is right (see its §0).
 *
 * These are the RAW row shapes as they exist in the WarehouseOS_MasterData
 * spreadsheet (POC_Master / Site_Master / Service_Registry tabs). They are
 * intentionally separate from the app's internal `User` / `Warehouse` types
 * in ../types.ts — this is the repository-interface boundary MASTERDATA.md
 * §9 (I8) asks for. Adapters that map these onto the internal app types live
 * in ../lib/masterDataSync.ts, not here.
 */

export type Role = 'SITE_POC' | 'WAREHOUSE_ADMIN' | 'SERVICE_ADMIN' | 'SUPER_ADMIN';
export type YesNo = 'Yes' | 'No';
export type Channel = 'B2B' | 'B2C' | 'BOTH';
export type Zone = 'North' | 'South' | 'East' | 'West' | 'Central';
export type BusinessType = 'WHS' | 'Grozo' | 'HP' | 'SS B2B';
export type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'EVENT_DRIVEN';

/** The literal 'ALL' marks a nationwide/all-service scope. Check for it before treating a value as an FK. */
export const ALL = 'ALL' as const;
export type Scoped<T extends string> = T | typeof ALL;

export interface PocMaster {
  Access_ID: string;                 // PK — e.g. AC-0001. Immutable.
  POC_Email: string;                 // NOT unique — one person may hold several rows
  POC_Name: string;
  WH_Code: string;                   // display only — never join on this
  Role: Role;
  Site_Code: Scoped<string>;         // FK -> SiteMaster.Site_Code, or 'ALL'
  Service_Codes: Scoped<string>;     // FK -> ServiceRegistry.Service_Code, comma-separated, or 'ALL'
  Contact_Number: string;            // text, not number — leading zeros / '+91' matter
  Is_Primary: YesNo;
  Active: YesNo;
  Access_Start_Date: string | '';    // YYYY-MM-DD
  Access_End_Date: string | '';      // blank = open-ended
  Description: string;
  Reporting_Manager_Email: string;
  Last_Updated_By: string;           // app-written
  Last_Updated_At: string;           // app-written, ISO 8601 with offset
}

export interface SiteMaster {
  Site_Code: string;                 // PK, immutable — ZHPL-{STATE}-{NN}
  WH_Code: string;
  Facility_Name: string;
  SAP_Code: string;
  Cost_Center: string;               // always === SAP_Code
  Zone: Zone;
  State: string;
  City: string;                      // empty on all rows today (not in source data)
  Address: string;
  Pincode: string;                   // text
  Channel: Channel;
  Entity: string;
  Business_Type: BusinessType;
  GSTIN: string;                     // text
  Lat_Long: string;                  // inconsistent formats — parse defensively
  Map_Link: string;
  Services_Enabled: Scoped<string>;  // drives the compliance denominator
  Go_Live_Date: string | '';         // empty on all rows today
  Closure_Date: string | '';
  Active: YesNo;
  Last_Updated_By: string;
  Last_Updated_At: string;
}

export interface ServiceRegistry {
  Service_Code: string;              // PK, immutable
  Service_Name: string;
  Needs_Approval: YesNo;             // only DIESEL is Yes today
  Needs_Delivery_Validation: YesNo;  // only DIESEL is Yes today
  Requires_Evidence: YesNo;
  Cadence: Cadence;
  Submission_Window: string;         // 'HH:MM'
  SLA_Hours: number | '';
  AppScript_URL: string;              // empty until that service's Apps Script Web App is deployed
  Records_Tab: string;
  Audit_Tab: string;
  Active: YesNo;
  Last_Updated_By: string;
  Last_Updated_At: string;
}

export interface MasterAudit {
  Audit_ID: string;
  Timestamp: string;
  Actor_Email: string;
  Action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE' | 'VALIDATION_FAIL';
  Target_Tab: 'POC_Master' | 'Site_Master' | 'Service_Registry';
  Target_Key: string;
  Field_Changed: string;
  Old_Value: string;
  New_Value: string;
  Source: 'APP' | 'SCRIPT' | 'MANUAL_EDIT';
  Notes: string;
}

/**
 * Resolved access for one signed-in identity — the OUTPUT of the MASTERDATA.md
 * §6 "effective access" algorithm. Never assign scope/role directly; always
 * derive it via computeEffectiveAccess() in ../lib/masterDataSync.ts.
 */
export interface EffectiveAccess {
  email: string;
  row: PocMaster | null;                  // the winning POC_Master row, if any
  role: Role | null;
  siteScope: string[] | typeof ALL;       // resolved site codes, or 'ALL'
  serviceScope: string[] | typeof ALL;    // resolved service codes, or 'ALL'
  granted: boolean;
  denialReason?: string;
}
