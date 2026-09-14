import { describe, expect, it } from 'vitest';
import type { DieselLog } from '../../types';
import {
  activeFilterCount,
  computeDieselDashboard,
  deliveredLitresOf,
  dieselFilterOptions,
  EMPTY_DIESEL_FILTERS,
  filterDieselLogs,
  formatDay,
  formatLitresShort,
  formatRupeesShort,
  indiaDay,
  presetRange,
  warehouseOf,
  type DieselDashboardFilters,
} from './dashboard';

let n = 0;
const log = (over: Partial<DieselLog>): DieselLog =>
  ({
    id: `d${++n}`,
    uniqueId: `PZHPL${1000 + n}`,
    timestamp: '2026-09-10T06:00:00.000Z',
    warehouseId: 'ZHPL-HR-03',
    submittedById: 'poc@zomato.com',
    emailAddress: 'poc@zomato.com',
    entity: 'B2B',
    whNameB2B: 'GGN3',
    whNameB2C: 'GGN3',
    costCenter: 'CPC-GGN3',
    zone: 'North',
    fuel: 'Diesel',
    type: 'Payment Only',
    vendorNamePayment: 'VK INTERNATIONAL',
    quantity: 100,
    ratePerLitre: 90,
    finalAmount: 9000,
    status: 'Payment Processing',
    ...over,
  }) as DieselLog;

const LOGS: DieselLog[] = [
  // North, B2B, Diesel, approved, delivered in full
  log({ uniqueId: 'DZHPL1', type: 'Delivery Only', vendorNamePayment: undefined, vendorNameDelivery: 'Fuel Buddy', quantity: 500, ratePerLitre: 90, finalAmount: 45000, status: 'Delivery Completed', validation: 'Delivered', timestamp: '2026-07-05T06:00:00Z' }),
  // South, B2C, DEF, approved, partial
  log({ uniqueId: 'DZHPL2', entity: 'B2C', whNameB2B: 'Vizag WHS', whNameB2C: 'Vizag WHS', costCenter: 'CC-AP-VIZAG-01', zone: 'South', fuel: 'DEF', type: 'Delivery Only', vendorNamePayment: undefined, vendorNameDelivery: 'Radha Automobiles', quantity: 200, ratePerLitre: 80, finalAmount: 16000, status: 'Partial Delivery', validation: 'Partial Delivered', deliveredQuantityLitres: 150, timestamp: '2026-08-12T06:00:00Z' }),
  // North, B2B, rejected
  log({ uniqueId: 'PZHPL3', quantity: 50, finalAmount: 5000, ratePerLitre: 100, status: 'Rejected', rejectionReason: 'dup', timestamp: '2026-08-20T06:00:00Z' }),
  // North, B2B, pending
  log({ uniqueId: 'PZHPL4', quantity: 300, finalAmount: 30000, ratePerLitre: 100, status: 'Pending Admin Approval', timestamp: '2026-09-10T06:00:00Z' }),
  // IST boundary: 19:00 UTC on 31 Aug = 00:30 IST on 1 Sep
  log({ uniqueId: 'PZHPL5', quantity: 100, finalAmount: 12000, ratePerLitre: 120, vendorNamePayment: 'Samruddhi Petroleum', timestamp: '2026-08-31T19:00:00Z' }),
  // Duplicate Unique ID of DZHPL1 — must be counted once
  log({ uniqueId: 'DZHPL1', quantity: 999, finalAmount: 99999, timestamp: '2026-07-06T06:00:00Z' }),
];

describe('dates', () => {
  it('uses the India day, not UTC', () => {
    expect(indiaDay('2026-08-31T19:00:00Z')).toBe('2026-09-01');
    expect(indiaDay('nonsense')).toBe('');
    expect(formatDay('2026-03-05')).toBe('5 Mar 2026');
  });

  it('turns each preset into a day range', () => {
    const t = '2026-09-14';
    const r = (preset: DieselDashboardFilters['preset'], from = '', to = '') => presetRange({ preset, from, to }, t);
    expect(r('')).toBeNull();
    expect(r('today')).toEqual([t, t]);
    expect(r('yesterday')).toEqual(['2026-09-13', '2026-09-13']);
    expect(r('last7')).toEqual(['2026-09-08', t]);
    expect(r('last30')).toEqual(['2026-08-16', t]);
    expect(r('currentMonth')).toEqual(['2026-09-01', t]);
    expect(r('prevMonth')).toEqual(['2026-08-01', '2026-08-31']);
    expect(r('quarter')).toEqual(['2026-07-01', t]);
    expect(r('custom', '2026-08-01')).toEqual(['2026-08-01', '9999-12-31']);
    expect(presetRange({ preset: 'prevMonth', from: '', to: '' }, '2026-01-10')).toEqual(['2025-12-01', '2025-12-31']);
  });
});

describe('field rules', () => {
  it('uses the warehouse name of the request’s own channel', () => {
    expect(warehouseOf(log({ entity: 'B2C', whNameB2B: 'A', whNameB2C: 'B' }))).toBe('B');
    expect(warehouseOf(log({ entity: 'B2B', whNameB2B: 'A', whNameB2C: 'B' }))).toBe('A');
    expect(warehouseOf(log({ whNameB2B: '', whNameB2C: '', warehouseId: 'ZHPL-DL-01' }))).toBe('ZHPL-DL-01');
  });

  it('counts delivered litres by validation', () => {
    expect(deliveredLitresOf(log({ validation: 'Delivered', quantity: 500 }))).toBe(500);
    expect(deliveredLitresOf(log({ validation: 'Partial Delivered', deliveredQuantityLitres: 150 }))).toBe(150);
    expect(deliveredLitresOf(log({ validation: 'Not Delivered', quantity: 500 }))).toBe(0);
    expect(deliveredLitresOf(log({ validation: undefined }))).toBe(0);
  });
});

describe('computeDieselDashboard', () => {
  const d = computeDieselDashboard(LOGS);

  it('counts each Unique ID once', () => {
    expect(d.kpi.records).toBe(5);
    expect(d.kpi.duplicatesRemoved).toBe(1);
    expect(d.kpi.totalSpend).toBe(45000 + 16000 + 5000 + 30000 + 12000);
  });

  it('splits spend and litres by channel and fuel', () => {
    expect(d.kpi.b2cSpend).toBe(16000);
    expect(d.kpi.b2bSpend).toBe(92000);
    expect(d.fuel.def).toEqual({ qty: 200, amount: 16000, orders: 1 });
    expect(d.fuel.diesel.orders).toBe(4);
    expect(d.kpi.deliveredQty).toBe(500 + 150);
  });

  it('reports approvals, rejections, pending and rates', () => {
    expect(d.kpi).toMatchObject({ approved: 3, rejected: 1, pending: 1, approvalRate: 60, deliveryRate: 20 });
    expect(d.kpi.avgRate).toBe((90 + 80 + 100 + 100 + 120) / 5);
  });

  it('buckets months in order, with the IST boundary in the new month', () => {
    expect(d.monthly.map((m) => m.month)).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026']);
    const sep = d.monthly.find((m) => m.month === 'Sep 2026')!;
    expect(sep.count).toBe(2);
    expect(sep.spend).toBe(42000);
    const aug = d.monthly.find((m) => m.month === 'Aug 2026')!;
    expect(aug).toMatchObject({ b2b: 5000, b2c: 16000, deliveryRate: 50, vendors: 2, warehouses: 2 });
    expect(d.kpi.firstDay).toBe('2026-07-05');
    expect(d.kpi.lastDay).toBe('2026-09-10');
  });

  it('builds weekly points, zones and warehouses by spend', () => {
    expect(d.weekly.length).toBeGreaterThan(1);
    expect(d.zones.map((z) => z.name)).toEqual(['North', 'South']);
    expect(d.topWarehouses.all[0]).toMatchObject({ name: 'GGN3', spend: 92000 });
    expect(d.topWarehouses.b2c.map((w) => w.name)).toEqual(['Vizag WHS']);
    expect(d.warehouses[0]).toMatchObject({ name: 'GGN3', costCenter: 'CPC-GGN3', zone: 'North', share: 85.19 });
  });

  it('ranks vendors and tags their average rate', () => {
    expect(d.vendorsByCount[0]).toMatchObject({ name: 'VK INTERNATIONAL', count: 2 });
    expect(d.vendorRates.map((v) => [v.name, v.rate, v.tag])).toEqual([
      ['Radha Automobiles', 80, 'BEST'],
      ['Fuel Buddy', 90, 'MID'],
      ['VK INTERNATIONAL', 100, 'MID'],
      ['Samruddhi Petroleum', 120, 'HIGH'],
    ]);
    expect(d.orderType).toEqual({ delivery: 2, payment: 3 });
  });

  it('writes insights from the data in view', () => {
    expect(d.insights.map((i) => i.icon)).toEqual(['zone', 'warehouse', 'split', 'trend', 'vendor']);
    expect(d.insights[0]).toMatchObject({ strong: 'North' });
  });

  it('is empty, not broken, with no requests', () => {
    const e = computeDieselDashboard([]);
    expect(e.kpi).toMatchObject({ records: 0, totalSpend: 0, approvalRate: 0, avgRate: 0 });
    expect(e.insights).toEqual([]);
  });
});

describe('filterDieselLogs', () => {
  const run = (over: Partial<DieselDashboardFilters>) =>
    filterDieselLogs(LOGS, { ...EMPTY_DIESEL_FILTERS, ...over }, '2026-09-14').map((l) => l.uniqueId);

  it('filters by date preset, month and custom range', () => {
    expect(run({ preset: 'currentMonth' })).toEqual(['PZHPL4', 'PZHPL5']);
    expect(run({ preset: 'prevMonth' })).toEqual(['DZHPL2', 'PZHPL3']);
    expect(run({ month: 'Jul 2026' })).toEqual(['DZHPL1', 'DZHPL1']);
    expect(run({ preset: 'custom', from: '2026-08-15', to: '2026-08-31' })).toEqual(['PZHPL3']);
  });

  it('filters by zone, channel, status, warehouse and vendor', () => {
    expect(run({ zone: 'South' })).toEqual(['DZHPL2']);
    expect(run({ entity: 'B2C' })).toEqual(['DZHPL2']);
    expect(run({ status: 'Pending' })).toEqual(['PZHPL4']);
    expect(run({ status: 'Rejected' })).toEqual(['PZHPL3']);
    expect(run({ warehouses: ['Vizag WHS'] })).toEqual(['DZHPL2']);
    expect(run({ vendors: ['Samruddhi Petroleum'] })).toEqual(['PZHPL5']);
  });

  it('searches vendor, warehouse, ID, cost center, zone and email', () => {
    expect(run({ search: 'radha' })).toEqual(['DZHPL2']);
    expect(run({ search: 'cc-ap' })).toEqual(['DZHPL2']);
    expect(run({ search: 'pzhpl4' })).toEqual(['PZHPL4']);
  });

  it('counts active filters for the Clear button', () => {
    expect(activeFilterCount(EMPTY_DIESEL_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_DIESEL_FILTERS, zone: 'North', vendors: ['x'], search: ' a ' })).toBe(3);
  });
});

describe('dieselFilterOptions', () => {
  it('lists months in order, warehouses by spend and vendors by orders', () => {
    const o = dieselFilterOptions(LOGS);
    expect(o.months).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026']);
    expect(o.warehouses[0]).toBe('GGN3');
    expect(o.vendors[0]).toBe('VK INTERNATIONAL');
    expect(o.suggestions.map((s) => s.group)).toContain('Unique ID');
  });
});

describe('formatting', () => {
  it('reads money and litres the way the team does', () => {
    expect(formatRupeesShort(149_300_000)).toBe('₹14.93 Cr');
    expect(formatRupeesShort(7_547_000)).toBe('₹75.47 L');
    expect(formatRupeesShort(99_800)).toBe('₹99.8K');
    expect(formatRupeesShort(11)).toBe('₹11');
    expect(formatLitresShort(1_690_000)).toBe('16.9L L');
    expect(formatLitresShort(55_600)).toBe('55.6K L');
    expect(formatLitresShort(700)).toBe('700 L');
  });
});
