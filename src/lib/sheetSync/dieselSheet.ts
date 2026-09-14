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

/**
 * A photo link someone can open from the sheet. The app stores uploads at
 * /api/attachments/…, which means nothing inside a spreadsheet, so it gets
 * the app's own address in front. Drive links are already complete. A demo
 * data: URL is hundreds of KB — more than a cell holds — so it is described
 * instead of copied.
 */
const photoLink = (v: string | undefined, origin?: string): string => {
  if (!v) return '';
  if (v.startsWith('data:')) return '(photo attached in app)';
  return origin && v.startsWith('/') ? origin + v : v;
};

/**
 * The sheet's Status column is the admin's decision only: Approved or
 * Rejected, and blank while it is still waiting. Where a request went after
 * approval (payment processing, delivered, partial…) is the Validation
 * column's job, not this one's.
 */
export function sheetStatus(status: string | undefined): string {
  if (!status || status === 'Pending Admin Approval') return '';
  return status === 'Rejected' ? 'Rejected' : 'Approved';
}

/** Sheet header → the value for that column. */
const VALUE_FOR: Record<string, (r: DieselLog, origin?: string) => string | number> = {
  Timestamp: (r) => r.timestamp ?? '',
  'Email Address': (r) => r.emailAddress ?? '',
  Entity: (r) => r.entity ?? '',
  // Only the name for the request's own channel: a B2C request leaves the
  // B2B name blank, and the other way round.
  'WH NAME (B2B)': (r) => (r.entity === 'B2C' ? '' : r.whNameB2B ?? ''),
  'WH NAME (B2C)': (r) => (r.entity === 'B2B' ? '' : r.whNameB2C ?? ''),
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
  'QR Code Image': (r, origin) => photoLink(r.qrCodeImageUrl, origin),
  'Vendor Name(Delivery)': (r) => r.vendorNameDelivery ?? '',
  'Order Quantity': (r) => r.orderQuantityLitres ?? '',
  'Unique ID': (r) => r.uniqueId ?? '',
  Status: (r) => sheetStatus(r.status),
  Validation: (r) => r.validation ?? '',
  'Delivered Quantity': (r) => r.deliveredQuantityLitres ?? '',
  "POD's": (r, origin) => photoLink(r.podUrl, origin),
};

/** One column of one request, exactly as the sheet shows it. Also what the export uses. */
export function dieselSheetValue(header: string, log: DieselLog, origin?: string): string | number {
  return VALUE_FOR[header](log, origin);
}

/** One request → one row. `origin` (e.g. https://warehouseos.apps.blinkit.in) completes photo links. */
export function buildDieselSheetPayload(log: DieselLog, origin?: string): SheetPayload {
  const header = [...DIESEL_SHEET_HEADER];
  return {
    action: 'upsertDieselRow',
    // The script upserts on this, so a delivery validation or an approval
    // edits the request's own row instead of appending a near-duplicate.
    key: log.uniqueId,
    tab: 'Records',
    header,
    values: header.map((h) => VALUE_FOR[h](log, origin)),
  };
}

export interface SheetBatchPayload {
  action: 'upsertDieselRows';
  tab: string;
  header: string[];
  rows: { key: string; values: (string | number)[] }[];
}

/**
 * Every request in one post — the "Send all to sheet" catch-up. Rows the
 * sheet already has are updated in place, missing ones are added, so it is
 * safe to press as often as you like.
 */
export function buildDieselSheetBatch(logs: DieselLog[], origin?: string): SheetBatchPayload {
  const header = [...DIESEL_SHEET_HEADER];
  return {
    action: 'upsertDieselRows',
    tab: 'Records',
    header,
    rows: logs
      .filter((l) => l.uniqueId)
      .map((l) => ({ key: l.uniqueId, values: header.map((h) => VALUE_FOR[h](l, origin)) })),
  };
}
