import { describe, it, expect } from 'vitest';
import { buildExport, csvCell, dateRange, ExportNotPermittedError, type ExportSpec } from './exporter';
import { capabilitiesFor } from '../permissions';
import type { User, UserRole } from '../../types';
import { DIESEL_EXPORT, summariseDiesel } from './dieselExport';
import type { DieselLog } from '../../types';

const userWith = (role: UserRole, warehouseId?: string): User =>
  ({ id: 'u1', fullName: 'Test', email: 't@zomato.com', role, warehouseId }) as User;

const caps = (role: UserRole, site?: string) => capabilitiesFor(userWith(role, site));

interface Row {
  site: string;
  day: string;
  who: string;
  amount: number;
}

const SPEC: ExportSpec<Row> = {
  label: 'Test',
  serviceCode: 'TEST',
  dateOf: (r) => r.day,
  siteOf: (r) => r.site,
  columns: [
    { header: 'Site', value: (r) => r.site },
    { header: 'Date', value: (r) => r.day },
    { header: 'Who', value: (r) => r.who },
    { header: 'Amount', value: (r) => r.amount },
  ],
};

const ROWS: Row[] = [
  { site: 'ZHPL-DL-01', day: '2026-08-05', who: 'Gyan', amount: 100 },
  { site: 'ZHPL-DL-01', day: '2026-09-02', who: 'Gyan', amount: 200 },
  { site: 'ZHPL-HR-04', day: '2026-09-03', who: 'Dharmender', amount: 300 },
];

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Rate mismatch, re-quoted')).toBe('"Rate mismatch, re-quoted"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves plain values alone and blanks null/undefined', () => {
    expect(csvCell('DIESEL')).toBe('DIESEL');
    expect(csvCell(1234.5)).toBe('1234.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('does not turn a real zero into blank', () => {
    expect(csvCell(0)).toBe('0');
  });
});

describe('permission', () => {
  it('refuses a POC even when the rows are handed straight in', () => {
    // The button is hidden for a POC, but hiding is not the control —
    // a stale tab or a switched persona must still be refused.
    expect(() => buildExport(ROWS, SPEC, {}, caps('SITE_POC', 'ZHPL-DL-01'))).toThrow(ExportNotPermittedError);
  });

  it('refuses a warehouse admin', () => {
    expect(() => buildExport(ROWS, SPEC, {}, caps('WAREHOUSE_ADMIN', 'ZHPL-DL-01'))).toThrow(
      ExportNotPermittedError,
    );
  });

  it('allows super admin and service admin', () => {
    expect(buildExport(ROWS, SPEC, {}, caps('SUPER_ADMIN')).rowCount).toBe(3);
    expect(buildExport(ROWS, SPEC, {}, caps('SERVICE_ADMIN')).rowCount).toBe(3);
  });
});

describe('date range filtering', () => {
  const c = caps('SUPER_ADMIN');

  it('includes both endpoints', () => {
    const r = buildExport(ROWS, SPEC, { from: '2026-09-02', to: '2026-09-03' }, c);
    expect(r.rowCount).toBe(2);
  });

  it('filters a month', () => {
    expect(buildExport(ROWS, SPEC, { from: '2026-08-01', to: '2026-08-31' }, c).rowCount).toBe(1);
  });

  it('excludes rows with no usable date when a range is set', () => {
    // Including them would put undated rows in every month's report.
    const withBlank = [...ROWS, { site: 'ZHPL-DL-01', day: '', who: 'X', amount: 1 }];
    expect(buildExport(withBlank, SPEC, { from: '2026-01-01', to: '2026-12-31' }, c).rowCount).toBe(3);
    expect(buildExport(withBlank, SPEC, {}, c).rowCount).toBe(4);
  });

  it('handles full ISO timestamps, not just plain dates', () => {
    const ts = [{ site: 'ZHPL-DL-01', day: '2026-09-02T18:30:00.000Z', who: 'G', amount: 1 }];
    expect(buildExport(ts, SPEC, { from: '2026-09-02', to: '2026-09-02' }, c).rowCount).toBe(1);
  });
});

describe('site scope', () => {
  it('narrows to a requested site', () => {
    const r = buildExport(ROWS, SPEC, { site: 'ZHPL-HR-04' }, caps('SUPER_ADMIN'));
    expect(r.rowCount).toBe(1);
    expect(r.csv).toContain('Dharmender');
    expect(r.csv).not.toContain('Gyan');
  });

  it("'ALL' means every site the caller may see", () => {
    expect(buildExport(ROWS, SPEC, { site: 'ALL' }, caps('SUPER_ADMIN')).rowCount).toBe(3);
  });
});

describe('csv shape', () => {
  const c = caps('SUPER_ADMIN');

  it('writes a header plus one line per row, CRLF separated', () => {
    const r = buildExport(ROWS, SPEC, {}, c);
    const lines = r.csv.split('\r\n');
    expect(lines[0]).toContain('Site,Date,Who,Amount');
    expect(lines).toHaveLength(4);
  });

  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(buildExport(ROWS, SPEC, {}, c).csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('names the file by service, scope and span', () => {
    const r = buildExport(ROWS, SPEC, { site: 'ZHPL-DL-01', from: '2026-09-01', to: '2026-09-30' }, c);
    expect(r.filename).toBe('TEST_ZHPL-DL-01_2026-09-01_to_2026-09-30.csv');
  });

  it('produces a header-only file rather than failing when nothing matches', () => {
    const r = buildExport(ROWS, SPEC, { from: '2030-01-01', to: '2030-12-31' }, c);
    expect(r.rowCount).toBe(0);
    expect(r.csv.split('\r\n')).toHaveLength(1);
  });
});

describe('dateRange', () => {
  const today = new Date('2026-09-11T00:00:00Z');

  it('last 30 days includes today', () => {
    expect(dateRange('last30', today)).toEqual({ from: '2026-08-13', to: '2026-09-11' });
  });

  it('this month starts on the 1st', () => {
    expect(dateRange('thisMonth', today).from).toBe('2026-09-01');
  });

  it('last month covers the whole previous month', () => {
    expect(dateRange('lastMonth', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('gets February right in a leap year', () => {
    expect(dateRange('lastMonth', new Date('2028-03-10T00:00:00Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

// ---------------------------------------------------------------------
// The real thing the user asked for: a month of diesel, by whom, how much
// ---------------------------------------------------------------------
const log = (over: Partial<DieselLog>): DieselLog =>
  ({
    id: 'd1',
    uniqueId: 'DSL-1',
    timestamp: '2026-09-05T10:00:00.000Z',
    warehouseId: 'ZHPL-DL-01',
    submittedById: 'u1',
    submittedByName: 'Gyan Jaiswal',
    emailAddress: 'gyan.jaiswal@zomato.com',
    fuel: 'Diesel',
    type: 'Payment Only',
    quantity: 100,
    ratePerLitre: 90,
    finalAmount: 9000,
    status: 'Approved',
    ...over,
  }) as DieselLog;

describe('diesel export', () => {
  const c = caps('SUPER_ADMIN');

  it('leads with the columns the question asks about', () => {
    const r = buildExport([log({})], DIESEL_EXPORT, {}, c);
    const header = r.csv.split('\r\n')[0];
    expect(header).toContain('Requested_By');
    expect(header).toContain('Billed_Litres');
    expect(header).toContain('Final_Amount');
  });

  it('quotes a vendor name containing a comma', () => {
    const r = buildExport([log({ vendorNamePayment: 'Shell India, Gurgaon' })], DIESEL_EXPORT, {}, c);
    expect(r.csv).toContain('"Shell India, Gurgaon"');
  });

  it('keeps a missing delivery quantity blank rather than 0', () => {
    // A Payment Only row never had a delivery. Writing 0 would understate
    // delivery performance once these are summed.
    const r = buildExport([log({ type: 'Payment Only' })], DIESEL_EXPORT, {}, c);
    const cells = r.csv.split('\r\n')[1].split(',');
    const header = r.csv.split('\r\n')[0].split(',');
    expect(cells[header.indexOf('Delivered_Litres')]).toBe('');
  });
});

describe('summariseDiesel', () => {
  it('totals by person, biggest spender first', () => {
    const s = summariseDiesel([
      log({ emailAddress: 'a@zomato.com', submittedByName: 'A', quantity: 100, finalAmount: 9000 }),
      log({ emailAddress: 'b@zomato.com', submittedByName: 'B', quantity: 50, finalAmount: 4500 }),
      log({ emailAddress: 'a@zomato.com', submittedByName: 'A', quantity: 20, finalAmount: 1800 }),
    ]);
    expect(s.requests).toBe(3);
    expect(s.litres).toBe(170);
    expect(s.amount).toBe(15300);
    expect(s.byPerson[0]).toMatchObject({ name: 'A', requests: 2, litres: 120, amount: 10800 });
  });

  it('treats one person as one row regardless of email case', () => {
    const s = summariseDiesel([
      log({ emailAddress: 'A@zomato.com' }),
      log({ emailAddress: 'a@zomato.com' }),
    ]);
    expect(s.byPerson).toHaveLength(1);
    expect(s.byPerson[0].requests).toBe(2);
  });

  it('excludes rejected requests from the totals', () => {
    const s = summariseDiesel([
      log({ finalAmount: 9000, quantity: 100 }),
      log({ status: 'Rejected', finalAmount: 5000, quantity: 60 }),
    ]);
    expect(s.amount).toBe(9000);
    expect(s.litres).toBe(100);
    expect(s.requests).toBe(1);
  });

  it('groups by site', () => {
    const s = summariseDiesel([
      log({ warehouseId: 'ZHPL-DL-01', finalAmount: 9000 }),
      log({ warehouseId: 'ZHPL-HR-04', finalAmount: 1000 }),
      log({ warehouseId: 'ZHPL-DL-01', finalAmount: 500 }),
    ]);
    expect(s.bySite[0]).toMatchObject({ site: 'ZHPL-DL-01', requests: 2, amount: 9500 });
  });

  it('rounds money to 2dp and litres to 1dp', () => {
    const s = summariseDiesel([log({ quantity: 10.55, finalAmount: 949.999 })]);
    expect(s.litres).toBe(10.6);
    expect(s.amount).toBe(950);
  });

  it('survives missing quantities without producing NaN', () => {
    const s = summariseDiesel([log({ quantity: undefined, finalAmount: undefined })]);
    expect(s.litres).toBe(0);
    expect(s.amount).toBe(0);
  });
});
