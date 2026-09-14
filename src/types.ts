export type UserRole = 'SUPER_ADMIN' | 'SERVICE_ADMIN' | 'WAREHOUSE_ADMIN' | 'SITE_POC';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ADHOC';
export type Shift = 'MORNING' | 'EVENING' | 'NIGHT';
export type SubmissionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
export type DieselProcurementType = 'Delivery Only' | 'Payment Only';
export type DieselStatus =
  | 'Pending Admin Approval'
  | 'Approved'
  | 'Rejected'
  | 'Payment Processing'
  | 'Completed'
  | 'Ready for Delivery'
  | 'Pending Validation'
  | 'Delivery Completed'
  | 'Partial Delivery'
  | 'Not Delivered';
export type DieselValidation = 'Pending Validation' | 'Delivered' | 'Partial Delivered' | 'Not Delivered';
export type SiteHealthStatus = 'clear' | 'partial' | 'critical' | 'missing';

export interface Warehouse {
  id: string; // e.g. WH_DEL_01, WH_MUM_M10, etc.
  code: string;
  name: string;
  facilityName?: string;
  sapCode?: string;
  state?: string;
  b2bName?: string;
  b2cName?: string;
  entity: string;
  costCenter: string;
  zone: 'North' | 'South' | 'West' | 'East' | 'Central';
  city: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  sitePocName?: string;
  sitePocEmail?: string;
  sitePocContact?: string;
  channel?: 'B2B' | 'B2C' | 'BOTH';
  businessType?: string;
  division?: string;
  pincode?: string;
  latLong?: string;
  mapsUrl?: string;
  gstin?: string;
}

export interface User {
  id: string; // Firebase Auth uid
  email: string;
  fullName: string;
  role: UserRole;
  department?: string;
  assignedServiceIds?: string[]; // Services this admin manages across all warehouses
  warehouseId?: string; // Optional for SUPER_ADMIN & SERVICE_ADMIN
  isActive: boolean;
  createdAt: string;
  avatar?: string;
  phone?: string;
}

/** `evidence` holds an attachment id: an uploaded photo or a Google Drive link. */
export type FieldType =
  | 'text' | 'number' | 'percentage' | 'boolean' | 'select' | 'temperature' | 'textarea' | 'time' | 'date' | 'evidence';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unit?: string;
  options?: string[];
  helperText?: string;
  min?: number;
  max?: number;
  defaultValue?: any;
  isCritical?: boolean;
  warningThreshold?: {
    min?: number;
    max?: number;
    message: string;
  };
}

export interface TaskTemplate {
  id: string; // Template Code (e.g. CHK_GEN_01)
  code: string;
  title: string;
  category: string;
  frequency: Frequency;
  shift: Shift;
  isActive: boolean;
  fieldsConfig: Record<string, FieldDefinition>;
  description?: string;
}

export interface TaskSubmission {
  id: string; // Deterministic Doc ID: SUB_{YYYYMMDD}_{warehouseId}_{templateId}_{shift}
  submissionDate: string; // YYYY-MM-DD
  shift: Shift;
  status: SubmissionStatus;
  templateId: string;
  warehouseId: string;
  submittedById: string;
  submittedByName?: string;
  submittedAt: string;
  dataPayload: Record<string, any>;
  notes?: string;
}

export interface DieselLog {
  id: string; // Doc ID: DSL_{warehouseId}_{uniqueId}
  uniqueId: string; // e.g. PZHPL1042 or DZHPL1043 or DSL-DEL-901
  timestamp: string;
  emailAddress?: string; // Requestor Email Address (e.g. sudhanshu.verma@grofers.com)
  entity?: string; // Entity (e.g. HyperLogistics India Pvt Ltd)
  whNameB2B?: string; // WH NAME (B2B)
  whNameB2C?: string; // WH NAME (B2C)
  costCenter?: string; // COST CENTER (e.g. CC-DEL-FN2-01)
  zone?: string; // Zone (North | South | West | East | Central)
  warehouseId: string;
  submittedById: string;
  submittedByName?: string;
  fuel: 'Diesel' | 'DEF';
  type: DieselProcurementType;
  vendorNamePayment?: string; // required when type = Payment Only
  vendorNameDelivery?: string; // required when type = Delivery Only
  quantity?: number; // Quantity used for the Final Amount calculation (both types)
  orderQuantityLitres?: number; // What was ordered from the vendor — Delivery Only only
  deliveredQuantityLitres?: number; // Actual quantity received — filled at delivery validation
  ratePerLitre: number;
  finalAmount: number; // = quantity * ratePerLitre, system-calculated
  qrCodeImageUrl?: string; // QR Code Image or invoice receipt
  podUrl?: string; // POD's Proof of Delivery file or camera photo
  podTimestamp?: string;
  podUploadedByName?: string;
  status: DieselStatus;
  validation?: DieselValidation; // Delivery Only only — never applies to Payment Only
  threadId?: string; // Email thread ID (e.g. thrd_18ec59a2f1b0)
  notes?: string;
  rejectionReason?: string; // required when status = Rejected
  validatedByName?: string;
  validatedAt?: string;
  adminApprovalNotes?: string;
  adminApprovedAt?: string;
  adminApprovedBy?: string;
  lastEmailTriggeredAt?: string;
}

/**
 * Vendor Master — replaces the hardcoded vendor list so admins can add/retire
 * vendors without a code change (diesel procurement spec, section 24).
 */
export interface Vendor {
  id: string;
  name: string;
  vendorType: 'Payment' | 'Delivery' | 'Both';
  email?: string;
  isActive: boolean;
}

/**
 * Diesel Procurement Audit Trail — one entry per state-changing action
 * (submit, approve, reject, validate, POD upload). Never deleted.
 */
export interface DieselAuditEntry {
  id: string;
  logId: string;
  uniqueId: string;
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'VALIDATED' | 'POD_UPLOADED' | 'DELETED';
  performedByName: string;
  performedByEmail?: string;
  timestamp: string;
  details?: string;
}

export interface EmailLogEntry {
  id: string;
  uniqueId: string;
  threadId: string;
  timestamp: string;
  type: 'REQUEST_SUBMISSION' | 'ADMIN_APPROVAL' | 'ADMIN_REJECTION' | 'POD_UPLOAD';
  to: string;
  cc: string;
  subject: string;
  htmlBody: string;
  plainText: string;
  status: 'SENT' | 'SIMULATED';
  triggerEvent: string;
}

/**
 * AppSheet & Control Room Schema: Daily Site Activity (AS_DailyLog + AS_OngoingActivity)
 */
export interface OngoingActivity {
  rowId: string;
  logId: string;
  srNo: number;
  work: string;
  owner: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Blocked';
  eta: string;
  barrier?: string;
  cost?: number;
  manhours?: number;
  overdue?: boolean;
}

export interface DailySiteLog {
  logId: string;
  site: string; // warehouseId e.g. "WH_DEL_01" or "Delhi Hub"
  date: string; // YYYY-MM-DD
  timestamp: string;
  pocName: string;
  pocEmail: string;

  // Utility Availability (%)
  ups: number;
  upsRemark?: string;
  dg: number;
  dgRemark?: string;
  ltPanel: number;
  ltPanelRemark?: string;
  coldRoom: number; // Critical stock risk
  coldRoomRemark?: string;
  hvls: number;
  hvlsRemark?: string;
  waterCoolers: number;
  waterCoolersRemark?: string;
  freezersGgp: number; // Critical stock risk
  freezersGgpRemark?: string;
  doorBuzzer: number;
  doorBuzzerRemark?: string;

  // MHE Availability (%)
  rt: number;
  rtRemark?: string;
  bopt: number;
  boptRemark?: string;
  stackers: number;
  stackersRemark?: string;
  vrc: number;
  vrcRemark?: string;

  // Routine Activity Checks (Done / Not Done / NA)
  mtsInspection: 'Done' | 'Not Done' | 'NA';
  mtsRemark?: string;
  lightsInspection: 'Done' | 'Not Done' | 'NA';
  lightsRemark?: string;
  airCirculation: 'Done' | 'Not Done' | 'NA';
  airCirculationRemark?: string;
  gemba: 'Done' | 'Not Done' | 'NA';
  gembaRemark?: string;

  // Preventive Maintenance
  pmPlanned: number;
  pmCompleted: number;
  pmRemark?: string;

  // Highlights
  highlights?: string;

  // Derived state
  worstStatus: SiteHealthStatus;
  deviationsCount: number;
  activities: OngoingActivity[];
}

/**
 * Housekeeping Deployment Log Model
 */
export interface HousekeepingLog {
  id: string;
  date: string;
  warehouseId: string;
  agency: 'SMS' | 'Vedanta' | 'Others';
  mstAvailable: number;
  rac: number;
  hkSupervisor: number;
  approvedCount: number;
  woCount: number;
  hkRequiredOnGround: number;
  ongroundCount: number;
  deploymentPct: number;
  yesterdayDeploymentPct?: number;
  lob?: string;
  status: 'Compliant' | 'Shortage' | 'Over-deployed';
  remarks?: string;
  submittedByName: string;
  submittedAt: string;
}

/**
 * Daily DG, Power & Water Consumption Log Model
 */
export interface DGPowerWaterLog {
  id: string;
  date: string;
  warehouseId: string;
  shift: Shift;

  // DG 01 (500 KVA)
  dg1HsdOpening: number;
  dg1HsdReceived: number;
  dg1HsdConsumption: number;
  dg1HsdClosing: number;
  dg1KwhOpening: number;
  dg1KwhClosing: number;
  dg1KwhConsumption: number;
  dg1UnitPerLitre: number;
  dg1LitrePerHour: number;
  dg1RunHours: number;
  dg1CumulativeHours: number;
  dg1BCheckDone: boolean;
  dg1BCheckDueHours: number;

  // DG 02 (500 KVA)
  dg2HsdOpening: number;
  dg2HsdReceived: number;
  dg2HsdConsumption: number;
  dg2HsdClosing: number;
  dg2KwhOpening: number;
  dg2KwhClosing: number;
  dg2KwhConsumption: number;
  dg2UnitPerLitre: number;
  dg2LitrePerHour: number;
  dg2RunHours: number;
  dg2CumulativeHours: number;
  dg2BCheckDone: boolean;
  dg2BCheckDueHours: number;

  // DEF Stock
  defStockOpening: number;
  defStockAdded: number;
  defUsed: number;
  defStockClosing: number;

  // Grid Power (EB)
  ebKwhOpening: number;
  ebKwhClosing: number;
  ebKwhDiff: number;
  ebKwhMf: number; // Multiplying factor
  ebKwhUnitsConsumed: number;
  ebKvahOpening: number;
  ebKvahClosing: number;
  ebPowerFactor: number;

  // Govt vs DG Reliability
  govtSupplyHours: number;
  govtSupplyPct: number;
  dgSupplyPct: number;

  // Water Consumption
  waterOpeningKl: number;
  waterClosingKl: number;
  waterConsumptionKl: number;

  remarks?: string;
  submittedByName: string;
  submittedAt: string;
}

/**
 * Operational Sheets Registry in the Warehouse Operations Ecosystem
 */
export interface OperationalSheetDef {
  id: string;
  code: string;
  title: string;
  category: 'Daily Operations' | 'Energy & Fuel' | 'MHE & Fleet' | 'EHS & Facilities' | 'Manpower' | 'Custom Forms';
  iconName: string;
  frequency: string;
  description: string;
  fieldsCount: number;
  tableTarget: string;
  defaultShift: Shift;
  isCustom?: boolean;
  fieldsConfig?: FieldDefinition[];
}

/**
 * Generic Sheet-wise Database Record
 */
export interface SheetRowRecord {
  id: string;
  sheetId: string;
  warehouseId: string;
  date: string;
  shift: Shift;
  submittedByName: string;
  submittedAt: string;
  status: 'Verified' | 'Pending' | 'Flagged';
  data: Record<string, any>;
  remarks?: string;
}

/**
 * Service & Responsibility Assignment (Site-wise and Admin-wise Matrix)
 */
export interface ServiceAssignment {
  id: string; // e.g. "ASN_DEL01_DAILY_SITE"
  serviceId: string; // matches OperationalSheetDef.id (e.g. "SHEET_DAILY_SITE")
  serviceCode: string; // e.g. "OPS_01_SITE"
  serviceName: string; // e.g. "Daily Site Activity Report (Master)"
  serviceCategory: string; // e.g. "Daily Operations"
  warehouseId: string; // e.g. "WH_BLR_B4" or "GLOBAL_ALL"
  warehouseCode: string; // e.g. "WH-BLR-B4"
  warehouseName: string; // e.g. "Facility_Bangalore B4"
  adminLeadId: string; // user id of admin lead in-charge
  adminLeadName: string; // name of admin lead
  adminLeadEmail: string; // email of admin lead
  primaryPocId: string; // user id of on-ground POC
  primaryPocName: string; // name of primary site POC
  primaryPocEmail: string; // email of primary POC
  secondaryPocName?: string;
  secondaryPocEmail?: string;
  frequency: string; // e.g. "DAILY (Every Shift)", "PER SHIFT", "HOURLY"
  slaHours: number; // e.g. 2, 4, 8 hours
  escalationEmail?: string;
  status: 'ACTIVE' | 'AUDIT_PENDING' | 'VACANT';
  lastFilingDate?: string;
  notes?: string;
  updatedAt: string;
}
