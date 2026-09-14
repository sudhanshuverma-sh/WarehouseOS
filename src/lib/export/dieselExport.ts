/**
 * What a diesel export contains: exactly the Diesel Google Sheet.
 *
 * Same 21 headers, same order, same values — produced by the same function
 * that writes the sheet (dieselSheetValue). A file downloaded from the app
 * and the sheet itself can be laid side by side, or pasted one into the
 * other, without renaming or reordering a column.
 */

import type { DieselLog } from '../../types';
import { DIESEL_SHEET_HEADER, dieselSheetValue } from '../sheetSync/dieselSheet';
import type { ExportSpec } from './exporter';

/** Written as real numbers in .xlsx so they can be summed; everything else stays text. */
const NUMERIC_COLUMNS = new Set(['Quantity', 'Rate per Litres', 'Final Amount', 'Order Quantity', 'Delivered Quantity']);

/** Photo links in the file open the photo, as they do in the sheet. */
const origin = () => (typeof window !== 'undefined' ? window.location.origin : undefined);

export const DIESEL_EXPORT: ExportSpec<DieselLog> = {
  label: 'Diesel & DEF procurement',
  serviceCode: 'DIESEL',
  dateOf: (r) => r.timestamp,
  siteOf: (r) => r.warehouseId,
  columns: DIESEL_SHEET_HEADER.map((header) => ({
    header,
    value: (r: DieselLog) => dieselSheetValue(header, r, origin()),
    numeric: NUMERIC_COLUMNS.has(header),
  })),
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
