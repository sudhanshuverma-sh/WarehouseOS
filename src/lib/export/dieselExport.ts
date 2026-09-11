/**
 * What a diesel export contains.
 *
 * Built around the question it actually gets asked — "a month of diesel:
 * by whom, how much" — so the answer is readable without a pivot table.
 * Requestor and quantity come early; ids and audit trail come last.
 */

import type { DieselLog } from '../../types';
import type { ExportSpec } from './exporter';

/**
 * Ordered vs. delivered vs. billed are three different numbers and a
 * Payment Only row has no delivery at all. Rather than pick one and label
 * it "Quantity", all three are exported and the one the money was
 * calculated from is named explicitly.
 */
export const DIESEL_EXPORT: ExportSpec<DieselLog> = {
  label: 'Diesel & DEF procurement',
  serviceCode: 'DIESEL',
  dateOf: (r) => r.timestamp,
  siteOf: (r) => r.warehouseId,
  columns: [
    { header: 'Date', value: (r) => (r.timestamp ? r.timestamp.slice(0, 10) : '') },
    { header: 'Site_Code', value: (r) => r.warehouseId },
    { header: 'WH_Name', value: (r) => r.whNameB2B || r.whNameB2C || '' },
    { header: 'Zone', value: (r) => r.zone },
    { header: 'Cost_Center', value: (r) => r.costCenter },
    { header: 'Entity', value: (r) => r.entity },

    // Who asked for it — the "by whom" half of the question.
    { header: 'Requested_By', value: (r) => r.submittedByName },
    { header: 'Requested_By_Email', value: (r) => r.emailAddress },

    { header: 'Fuel', value: (r) => r.fuel },
    { header: 'Request_Type', value: (r) => r.type },
    { header: 'Vendor', value: (r) => r.vendorNamePayment || r.vendorNameDelivery || '' },

    // The "how much" half. Blank stays blank: a Payment Only row has no
    // ordered or delivered quantity, and writing 0 would understate
    // delivery performance when these are summed.
    { header: 'Ordered_Litres', value: (r) => r.orderQuantityLitres ?? '' },
    { header: 'Delivered_Litres', value: (r) => r.deliveredQuantityLitres ?? '' },
    { header: 'Billed_Litres', value: (r) => r.quantity ?? '' },
    { header: 'Rate_Per_Litre', value: (r) => r.ratePerLitre },
    { header: 'Final_Amount', value: (r) => r.finalAmount },

    { header: 'Status', value: (r) => r.status },
    { header: 'Delivery_Validation', value: (r) => r.validation ?? '' },
    { header: 'Rejection_Reason', value: (r) => r.rejectionReason ?? '' },

    { header: 'Validated_By', value: (r) => r.validatedByName ?? '' },
    { header: 'Validated_At', value: (r) => r.validatedAt ?? '' },
    { header: 'Approved_By', value: (r) => r.adminApprovedBy ?? '' },
    { header: 'Approved_At', value: (r) => r.adminApprovedAt ?? '' },

    { header: 'Request_ID', value: (r) => r.uniqueId },
    { header: 'POD_URL', value: (r) => r.podUrl ?? '' },
    { header: 'Notes', value: (r) => r.notes ?? '' },
  ],
};

export interface DieselSummaryRow {
  name: string;
  email: string;
  requests: number;
  litres: number;
  amount: number;
}

export interface DieselSummary {
  requests: number;
  litres: number;
  amount: number;
  byPerson: DieselSummaryRow[];
  bySite: { site: string; requests: number; litres: number; amount: number }[];
}

/**
 * The "by whom, how much" totals, shown before the download so the sender
 * can sanity-check the file rather than discovering a bad month after
 * forwarding it.
 *
 * Rejected requests are excluded from money and volume: they were never
 * fulfilled, and counting them would overstate spend. They still appear as
 * rows in the CSV, because "who asked for something that was refused" is a
 * real question the totals should not silently erase.
 */
export function summariseDiesel(rows: DieselLog[]): DieselSummary {
  const counted = rows.filter((r) => r.status !== 'Rejected');

  const people = new Map<string, DieselSummaryRow>();
  const sites = new Map<string, { site: string; requests: number; litres: number; amount: number }>();

  for (const r of counted) {
    // Billed quantity is what the money was calculated from, so it is what
    // the totals use — delivered may be short, ordered may never arrive.
    const litres = Number(r.quantity) || 0;
    const amount = Number(r.finalAmount) || 0;

    const key = (r.emailAddress || r.submittedByName || 'unknown').toLowerCase();
    const person = people.get(key) ?? {
      name: r.submittedByName || r.emailAddress || 'Unknown',
      email: r.emailAddress || '',
      requests: 0,
      litres: 0,
      amount: 0,
    };
    person.requests++;
    person.litres += litres;
    person.amount += amount;
    people.set(key, person);

    const siteKey = r.warehouseId || 'unknown';
    const site = sites.get(siteKey) ?? { site: siteKey, requests: 0, litres: 0, amount: 0 };
    site.requests++;
    site.litres += litres;
    site.amount += amount;
    sites.set(siteKey, site);
  }

  const round = <T extends { litres: number; amount: number }>(x: T): T => ({
    ...x,
    litres: Math.round(x.litres * 10) / 10,   // litres to 1dp
    amount: Math.round(x.amount * 100) / 100, // money to 2dp
  });

  return {
    requests: counted.length,
    litres: Math.round(counted.reduce((s, r) => s + (Number(r.quantity) || 0), 0) * 10) / 10,
    amount: Math.round(counted.reduce((s, r) => s + (Number(r.finalAmount) || 0), 0) * 100) / 100,
    byPerson: [...people.values()].map(round).sort((a, b) => b.amount - a.amount),
    bySite: [...sites.values()].map(round).sort((a, b) => b.amount - a.amount),
  };
}
