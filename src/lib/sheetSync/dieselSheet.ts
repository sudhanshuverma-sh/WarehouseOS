/**
 * The Diesel sheet contract: app record → the 21 columns of the ZHPL
 * Diesel master sheet, by header name.
 *
 * This list and DIESEL_HEADER in scripts/Diesel_Code.gs must agree. They
 * are checked against each other in the tests, so a change to one that is
 * not made to the other fails the build rather than surfacing as a refused
 * write weeks later.
 *
 * Note this is NARROWER than the export: the export carries every field on
 * the record, while the sheet carries the columns that sheet has. Sending
 * a column the sheet lacks is refused by the script by design, so the
 * mapping here is deliberately limited to what the sheet actually holds.
 */

import type { DieselLog } from '../../types';
import type { SheetPayload } from './sheetSync';

export const DIESEL_SHEET_HEADER = [
  'Timestamp',
  'Email Address',
  'Entity',
  'WH NAME (B2B)',
  'WH NAME (B2C)',
  'COST CENTER',
  'Zone',
  'Fuel',
  'Type',
  'Vendor Name(Payment)',
  'Quantity',
  'Rate per Litres',
  'Final Amount',
  'QR Code Image',
  'Vendor Name(Delivery)',
  'Order Quantity',
  'Unique ID',
  'Status',
  'Validation',
  'Delivered Quantity',
  "POD's",
] as const;

/** Sheet header → the value for that column. */
const VALUE_FOR: Record<string, (r: DieselLog) => string | number> = {
  Timestamp: (r) => r.timestamp ?? '',
  'Email Address': (r) => r.emailAddress ?? '',
  Entity: (r) => r.entity ?? '',
  'WH NAME (B2B)': (r) => r.whNameB2B ?? '',
  'WH NAME (B2C)': (r) => r.whNameB2C ?? '',
  'COST CENTER': (r) => r.costCenter ?? '',
  Zone: (r) => r.zone ?? '',
  Fuel: (r) => r.fuel ?? '',
  Type: (r) => r.type ?? '',
  'Vendor Name(Payment)': (r) => r.vendorNamePayment ?? '',
  // Blank rather than 0 throughout: a Payment Only request has no
  // delivery, and a 0 in the sheet would be summed as a real zero-litre
  // delivery by anyone building a pivot on top of it.
  Quantity: (r) => r.quantity ?? '',
  'Rate per Litres': (r) => r.ratePerLitre ?? '',
  'Final Amount': (r) => r.finalAmount ?? '',
  'QR Code Image': (r) => r.qrCodeImageUrl ?? '',
  'Vendor Name(Delivery)': (r) => r.vendorNameDelivery ?? '',
  'Order Quantity': (r) => r.orderQuantityLitres ?? '',
  'Unique ID': (r) => r.uniqueId ?? '',
  Status: (r) => r.status ?? '',
  Validation: (r) => r.validation ?? '',
  'Delivered Quantity': (r) => r.deliveredQuantityLitres ?? '',
  "POD's": (r) => r.podUrl ?? '',
};

export function buildDieselSheetPayload(log: DieselLog): SheetPayload {
  const header = [...DIESEL_SHEET_HEADER];
  return {
    action: 'upsertDieselRow',
    // The script upserts on this, so a delivery validation or an approval
    // edits the request's own row instead of appending a near-duplicate.
    key: log.uniqueId,
    tab: 'Records',
    header,
    values: header.map((h) => VALUE_FOR[h](log)),
  };
}
