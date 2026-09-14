/**
 * The API against a fake database.
 *
 * What these prove is the part that lives in this repo's TypeScript: that
 * a bad request is refused before the database is touched, that amounts
 * and statuses are computed rather than taken from the body, and that
 * every query runs as the caller. What the database itself enforces (RLS,
 * no self-approval) is proved by scripts/smoke.mjs against real Postgres.
 */

import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Queryable } from './db';
import { createRoutes } from './routes';

type Answer = (text: string, values: unknown[]) => { rows: any[] } | undefined;

interface Call {
  actor: string;
  text: string;
  values: unknown[];
}

class FakeDb {
  calls: Call[] = [];
  constructor(private readonly answer: Answer) {}

  async withActor<T>(actor: string, fn: (c: Queryable) => Promise<T>): Promise<T> {
    const client = {
      query: async (text: string, values: unknown[] = []) => {
        this.calls.push({ actor, text, values });
        const result = this.answer(text, values) ?? { rows: [] };
        return { rowCount: result.rows.length, ...result };
      },
    } as unknown as Queryable;
    return fn(client);
  }

  async healthy() {
    return true;
  }

  sql(fragment: string) {
    return this.calls.filter((c) => c.text.includes(fragment));
  }
}

const servers: { close: () => void }[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function api(answer: Answer, email = 'poc@zomato.com') {
  const db = new FakeDb(answer);
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createRoutes({ db, identity: { mode: 'dev', resolve: async () => ({ email }) } }));
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init: RequestInit = { method, headers: { ...headers } };
    if (body instanceof Uint8Array) {
      init.body = body;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)['content-type'] = 'application/json';
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call };
}

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const dieselRow = (over: Record<string, unknown> = {}) => ({
  request_id: 'PZHPL1001',
  site_code: 'ZHPL-HR-03',
  requested_at: new Date('2026-09-14T04:00:00Z'),
  requester_email: 'poc@zomato.com',
  procurement_type: 'Payment Only',
  vendor_name: 'IOCL',
  fuel: 'Diesel',
  quantity: 200,
  rate_per_litre: 89.5,
  final_amount: 17900,
  status: 'Pending Admin Approval',
  ...over,
});

const paymentRequest = {
  siteCode: 'ZHPL-HR-03',
  type: 'Payment Only',
  vendorNamePayment: 'IOCL',
  quantity: 200,
  ratePerLitre: 89.5,
  finalAmount: 1, // must be ignored
};

describe('POST /api/diesel', () => {
  it('refuses an incomplete request without touching the database', async () => {
    const { db, call } = await api(() => undefined);
    const res = await call('POST', '/diesel', { ...paymentRequest, vendorNamePayment: '' });
    expect(res).toEqual({ status: 400, body: expect.objectContaining({ message: 'Please select a payment vendor.' }) });
    expect(db.calls).toHaveLength(0);
  });

  it('computes the amount, files as the caller, and queues the sheet copy in the same transaction', async () => {
    const { db, call } = await api((text, values) =>
      text.includes('insert into diesel_request') ? { rows: [dieselRow({ final_amount: values[13] })] } : undefined,
    );
    const res = await call('POST', '/diesel', paymentRequest);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ uniqueId: 'PZHPL1001', finalAmount: 17900, siteCode: 'ZHPL-HR-03' });
    expect(db.sql('insert into diesel_request')[0].values[13]).toBe(17900);
    expect(db.sql('fn_enqueue_sheet_copy')[0].values[0]).toBe('DIESEL');
    expect(new Set(db.calls.map((c) => c.actor))).toEqual(new Set(['poc@zomato.com']));
  });

  it('refuses a QR image that does not belong to this site', async () => {
    const { db, call } = await api(() => undefined); // attachment lookup finds nothing
    const res = await call('POST', '/diesel', { ...paymentRequest, qrAttachmentId: UUID });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found for this site/);
    expect(db.sql('insert into diesel_request')).toHaveLength(0);
  });
});

describe('diesel decisions', () => {
  it('approval routes a delivery request onto its own track', async () => {
    const { db, call } = await api((text, values) => {
      if (text.includes('for update')) return { rows: [dieselRow({ request_id: 'DZHPL1001', procurement_type: 'Delivery Only' })] };
      if (text.startsWith('update diesel_request')) return { rows: [dieselRow({ status: values[1] })] };
    }, 'admin@zomato.com');
    const res = await call('POST', '/diesel/DZHPL1001/approve', { notes: 'ok' });
    expect(res.status).toBe(200);
    expect(db.sql('update diesel_request')[0].values).toEqual(['DZHPL1001', 'Ready for Delivery', 'ok']);
  });

  it('refuses to decide a request twice', async () => {
    const { call } = await api((text) => (text.includes('for update') ? { rows: [dieselRow({ status: 'Rejected' })] } : undefined));
    const res = await call('POST', '/diesel/PZHPL1001/approve', {});
    expect(res).toEqual({ status: 409, body: expect.objectContaining({ error: 'NOT_PENDING' }) });
  });

  it('requires a reason to reject, before touching the database', async () => {
    const { db, call } = await api(() => undefined);
    expect((await call('POST', '/diesel/PZHPL1001/reject', { reason: '  ' })).status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('passes the database’s own refusal through as a 403 a person can read', async () => {
    const { call } = await api((text) => {
      if (text.includes('for update')) return { rows: [dieselRow()] };
      if (text.startsWith('update diesel_request')) {
        throw Object.assign(new Error('Only an admin may approve or reject a diesel request'), {
          code: '42501',
          where: 'PL/pgSQL function fn_diesel_guard() line 30 at RAISE',
        });
      }
    });
    const res = await call('POST', '/diesel/PZHPL1001/approve', {});
    expect(res).toEqual({ status: 403, body: { error: 'FORBIDDEN', message: 'Only an admin may approve or reject a diesel request' } });
  });

  it('derives the delivery outcome and caps over-delivery at the order', async () => {
    const { db, call } = await api((text, values) => {
      if (text.includes('for update')) {
        return {
          rows: [dieselRow({ request_id: 'DZHPL1001', procurement_type: 'Delivery Only', status: 'Ready for Delivery', order_quantity_litres: 500 })],
        };
      }
      if (text.includes('from attachment')) return { rows: [{}] };
      if (text.startsWith('update diesel_request')) return { rows: [dieselRow({ status: values[1] })] };
    });
    const res = await call('POST', '/diesel/DZHPL1001/validate', { deliveredQuantityLitres: 650, podAttachmentId: UUID });
    expect(res.status).toBe(200);
    expect(db.sql('update diesel_request')[0].values).toEqual(['DZHPL1001', 'Delivery Completed', 'Delivered', 500, UUID, null]);
  });
});

describe('POST /api/attachments', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)]);
  const saved = (values: unknown[]) => ({
    rows: [{ attachment_id: UUID, kind: values.includes('link') ? 'link' : 'upload', mime: 'image/png', size_bytes: PNG.length }],
  });

  it('accepts a Google Drive link and refuses any other link', async () => {
    const { db, call } = await api((text, values) => (text.includes('insert into attachment') ? saved(values) : undefined));
    const bad = await call('POST', '/attachments', { serviceCode: 'DIESEL', siteCode: 'ZHPL-HR-03', link: 'https://example.com/pod.jpg' });
    expect(bad.status).toBe(400);
    expect(db.calls).toHaveLength(0);

    const good = await call('POST', '/attachments', { serviceCode: 'DIESEL', siteCode: 'ZHPL-HR-03', link: 'https://drive.google.com/file/d/x/view' });
    expect(good.status).toBe(201);
    expect(good.body.url).toBe(`/api/attachments/${UUID}`);
  });

  it('stores an upload by what its bytes are, not what it claims', async () => {
    const { db, call } = await api((text, values) => (text.includes('insert into attachment') ? saved(values) : undefined));
    const res = await call('POST', '/attachments?service=DIESEL&site=ZHPL-HR-03&name=../../pod.png', PNG, { 'content-type': 'image/jpeg' });
    expect(res.status).toBe(201);
    const values = db.sql('insert into attachment')[0].values;
    expect(values[2]).toBe('image/png'); // sniffed, despite the jpeg claim
    expect(values[4]).toBe(PNG.length);
    expect(values[5]).toMatch(/^[0-9a-f]{64}$/);
    expect(values[6]).toBe('pod.png'); // path stripped
  });

  it('refuses a file that is not an image or PDF', async () => {
    const { db, call } = await api(() => undefined);
    const res = await call('POST', '/attachments?service=DIESEL&site=ZHPL-HR-03', new TextEncoder().encode('<script>alert(1)</script>'), {
      'content-type': 'image/png',
    });
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('refuses a file over 2 MB', async () => {
    const { db, call } = await api(() => undefined);
    const big = new Uint8Array(2 * 1024 * 1024 + 10);
    big.set([0xff, 0xd8, 0xff]);
    const res = await call('POST', '/attachments?service=DIESEL&site=ZHPL-HR-03', big, { 'content-type': 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(db.calls).toHaveLength(0);
  });
});

describe('POST /api/daily-site', () => {
  it('scores the report itself and ignores a status sent by the client', async () => {
    const { db, call } = await api((text) => {
      if (text.includes('insert into daily_site_log')) return { rows: [{ log_id: 7 }] };
      if (text.includes('from daily_site_log l')) {
        return { rows: [{ log_id: 7, site_code: 'ZHPL-HR-03', log_date: '2026-09-14', worst_status: 'critical', deviations_count: 1, activities: [] }] };
      }
    });
    const res = await call('POST', '/daily-site', {
      site: 'ZHPL-HR-03',
      date: '2026-09-14',
      values: { coldRoom: 50, junk: 'dropped' },
      worstStatus: 'clear',
      activities: [{ work: 'Fix dock light', status: 'Open' }, { work: '   ' }],
    });

    expect(res.status).toBe(201);
    const insert = db.sql('insert into daily_site_log')[0].values;
    expect(JSON.parse(insert[3] as string)).toEqual({ coldRoom: 50 });
    expect(insert[9]).toBe('critical');
    expect(db.sql('insert into daily_site_activity')).toHaveLength(1);
  });

  it('refuses an impossible reading', async () => {
    const { db, call } = await api(() => undefined);
    const res = await call('POST', '/daily-site', { site: 'ZHPL-HR-03', date: '2026-09-14', values: { ups: 150 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('UPS must be a percentage from 0 to 100.');
    expect(db.calls).toHaveLength(0);
  });
});

describe('generic services', () => {
  const housekeepingForm = (text: string) =>
    text.includes('from service_registry s')
      ? { rows: [{ needs_approval: false, is_active: true, fields: [{ key: 'agency', label: 'Agency', type: 'select', required: true, options: ['SMS'] }] }] }
      : undefined;

  it('validates an entry against the service’s own form', async () => {
    const { db, call } = await api(housekeepingForm);
    const res = await call('POST', '/services/HOUSEKEEPING/submissions', { siteCode: 'ZHPL-HR-03', date: '2026-09-14', data: {} });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION', details: [{ field: 'agency', message: 'Agency is required.' }] });
    expect(db.sql('insert into service_submission')).toHaveLength(0);
  });

  it('files a valid entry', async () => {
    const { db, call } = await api((text, values) =>
      housekeepingForm(text) ??
      (text.includes('insert into service_submission')
        ? { rows: [{ submission_id: 3, service_code: values[0], site_code: values[1], entry_date: values[2], status: values[4], data: {} }] }
        : undefined),
    );
    const res = await call('POST', '/services/housekeeping/submissions', { siteCode: 'ZHPL-HR-03', date: '2026-09-14', data: { agency: 'SMS' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: '3', serviceCode: 'HOUSEKEEPING', status: 'Submitted' });
  });

  it('sends services with their own tables to their own endpoints', async () => {
    const { call } = await api(() => undefined);
    const res = await call('POST', '/services/DIESEL/submissions', { siteCode: 'X', date: '2026-09-14', data: {} });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch('/api/diesel');
  });

  it('needs a note to flag or reject', async () => {
    const { db, call } = await api(() => undefined);
    expect((await call('POST', '/services/HOUSEKEEPING/submissions/3/review', { status: 'Rejected' })).status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('refuses a malformed form definition', async () => {
    const { call } = await api(() => undefined);
    const res = await call('PUT', '/services/HOUSEKEEPING/form', { fields: [{ key: 'a', label: 'A', type: 'select' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/needs options/);
  });
});

describe('master data', () => {
  it('refuses anyone who is not a Super Admin', async () => {
    const { db, call } = await api((text) => (text.includes('is_super_admin()') ? { rows: [{ ok: false }] } : undefined));
    const res = await call('POST', '/master/sites', { Site_Code: 'ZHPL-DL-05' });
    expect(res.status).toBe(403);
    expect(db.sql('insert into site_master')).toHaveLength(0);
  });

  it('runs the Master Data screen’s own validation', async () => {
    const { db, call } = await api((text) => (text.includes('is_super_admin()') ? { rows: [{ ok: true }] } : undefined));
    const res = await call('POST', '/master/sites', { Site_Code: 'delhi-5' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
    expect(res.body.details.map((d: { field: string }) => d.field)).toContain('Site_Code');
    expect(db.sql('insert into site_master')).toHaveLength(0);
  });

  it('never lets an edit change a POC’s key', async () => {
    const { db, call } = await api(() => undefined);
    const res = await call('PATCH', '/master/pocs/AC-0001', { Access_ID: 'AC-0002' });
    expect(res.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });
});

describe('the rest', () => {
  it('refuses a compliance check for an event-driven service', async () => {
    const { call } = await api((text) => (text.includes('select cadence') ? { rows: [{ cadence: 'EVENT_DRIVEN' }] } : undefined));
    const res = await call('GET', '/compliance?service=DIESEL');
    expect(res.status).toBe(400);
  });

  it('answers unknown API paths with JSON, not the app shell', async () => {
    const { call } = await api(() => undefined);
    expect(await call('GET', '/nope')).toEqual({ status: 404, body: expect.objectContaining({ error: 'NOT_FOUND' }) });
  });
});
