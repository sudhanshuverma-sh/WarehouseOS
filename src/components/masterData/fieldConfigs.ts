/**
 * Which fields the master-data editor shows, in what order, and how.
 *
 * Kept as data rather than JSX so Site_Master and Service_Registry share one
 * editor, and so adding a column later is a line here rather than a new form.
 * Order follows MASTERDATA.md's column order, grouped so the fields someone
 * fills when a site opens come first and the ones that fill in later
 * (GSTIN, map link, closure) come after.
 */

import type { SiteMaster, ServiceRegistry } from '../../types/masterData';
import { ZONES, CHANNELS, BUSINESS_TYPES, CADENCES, STATE_CODES } from '../../lib/masterData/validate';

export type FieldKind = 'text' | 'select' | 'date' | 'time' | 'number' | 'yesno' | 'textarea' | 'url';

export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  required?: boolean;
  hint?: string;
  /** Take the full row width in the two-column grid. */
  wide?: boolean;
  /** Group heading shown above this field. */
  section?: string;
}

export const SITE_FIELDS: FieldDef[] = [
  { name: 'Site_Code', label: 'Site Code', kind: 'text', required: true, section: 'Identity',
    hint: 'ZHPL-{STATE}-{NN}. Suggested from the state you pick.' },
  { name: 'State', label: 'State', kind: 'select', required: true, options: Object.keys(STATE_CODES).sort() },
  { name: 'WH_Code', label: 'WH Code', kind: 'text', required: true },
  { name: 'Facility_Name', label: 'Facility Name', kind: 'text', required: true },
  { name: 'Zone', label: 'Zone', kind: 'select', required: true, options: ZONES },
  { name: 'City', label: 'City', kind: 'text' },
  { name: 'Channel', label: 'Channel', kind: 'select', required: true, options: CHANNELS,
    hint: 'Decides which EB-DG tab the site writes to.' },
  { name: 'Business_Type', label: 'Business Type', kind: 'select', required: true, options: BUSINESS_TYPES },
  { name: 'Entity', label: 'Entity', kind: 'text', required: true, wide: true },

  { name: 'Address', label: 'Address', kind: 'textarea', wide: true, section: 'Location' },
  { name: 'Pincode', label: 'Pincode', kind: 'text' },
  { name: 'Lat_Long', label: 'Lat / Long', kind: 'text' },
  { name: 'Map_Link', label: 'Map Link', kind: 'url', wide: true },

  { name: 'SAP_Code', label: 'SAP Code', kind: 'text', section: 'Finance' },
  { name: 'Cost_Center', label: 'Cost Center', kind: 'text', hint: 'Normally the same as SAP Code.' },
  { name: 'GSTIN', label: 'GSTIN', kind: 'text', wide: true },

  { name: 'Services_Enabled', label: 'Services Enabled', kind: 'text', wide: true, section: 'Operations',
    hint: 'ALL, or comma-separated service codes. Drives who is expected to file.' },
  { name: 'Go_Live_Date', label: 'Go-Live Date', kind: 'date' },
  { name: 'Closure_Date', label: 'Closure Date', kind: 'date', hint: 'Required when the site is inactive.' },
  { name: 'Active', label: 'Active', kind: 'yesno', hint: 'Sites are never deleted — switch off to close one.' },
];

export const SERVICE_FIELDS: FieldDef[] = [
  { name: 'Service_Code', label: 'Service Code', kind: 'text', required: true, section: 'Identity',
    hint: 'Capitals and underscores, e.g. COLD_ROOM.' },
  { name: 'Service_Name', label: 'Service Name', kind: 'text', required: true },

  { name: 'Cadence', label: 'Cadence', kind: 'select', required: true, options: CADENCES, section: 'Schedule' },
  { name: 'Submission_Window', label: 'Submission Window', kind: 'time',
    hint: 'Filed after this is late, not missing.' },
  { name: 'SLA_Hours', label: 'SLA Hours', kind: 'number', hint: 'Only meaningful when approval is needed.' },

  { name: 'Needs_Approval', label: 'Needs Approval', kind: 'yesno', section: 'Workflow' },
  { name: 'Needs_Delivery_Validation', label: 'Needs Delivery Validation', kind: 'yesno' },
  { name: 'Requires_Evidence', label: 'Requires Evidence', kind: 'yesno' },

  { name: 'AppScript_URL', label: 'Apps Script URL', kind: 'url', wide: true, section: 'Sheet',
    hint: 'The deployed /exec URL for this service’s sheet.' },
  { name: 'Records_Tab', label: 'Records Tab', kind: 'text' },
  { name: 'Audit_Tab', label: 'Audit Tab', kind: 'text' },
  { name: 'Active', label: 'Active', kind: 'yesno', section: 'Status' },
];

export const EMPTY_SITE: Partial<SiteMaster> = {
  Site_Code: '', WH_Code: '', Facility_Name: '', SAP_Code: '', Cost_Center: '', Zone: '' as never,
  State: '', City: '', Address: '', Pincode: '', Channel: '' as never,
  Entity: 'Zomato Hyperpure Private Limited', Business_Type: '' as never, GSTIN: '', Lat_Long: '',
  Map_Link: '', Services_Enabled: 'ALL', Go_Live_Date: '', Closure_Date: '', Active: 'Yes',
};

export const EMPTY_SERVICE: Partial<ServiceRegistry> = {
  Service_Code: '', Service_Name: '', Needs_Approval: 'No', Needs_Delivery_Validation: 'No',
  Requires_Evidence: 'No', Cadence: 'DAILY', Submission_Window: '', SLA_Hours: '', AppScript_URL: '',
  Records_Tab: 'Records', Audit_Tab: 'Audit', Active: 'Yes',
};
