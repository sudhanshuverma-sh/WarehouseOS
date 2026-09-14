/**
 * Proves the access rules hold on a real database.
 *
 *   npm run db:migrate
 *   node scripts/smoke.mjs
 *
 * Run it once after connecting a new database. Everything happens inside
 * ONE transaction that is rolled back at the end, so it leaves no rows
 * behind and is safe against production. (Diesel ID counters are the one
 * exception: Postgres sequences do not roll back, so the next real request
 * may skip a number or two.)
 *
 * It acts as three invented people at two invented sites and checks what
 * each can and cannot do — the things a unit test cannot show, because
 * they are enforced by Postgres, not by our code.
 */

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL.');
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const c = new pg.Client({
  connectionString: url,
  ssl: isLocal || process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

const SITE_A = 'ZSMOKE-A';
const SITE_B = 'ZSMOKE-B';
const POC_A = 'smoke.poc.a@example.test';     // DIESEL + SITE_ACTIVITY at A
const POC_B = 'smoke.poc.b@example.test';     // every service at B
const ADMIN_A = 'smoke.admin.a@example.test'; // warehouse admin at A

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Runs fn as `email`, exactly as server/db.ts withActor does. */
async function as(email, fn) {
  await c.query('savepoint actor');
  try {
    await c.query('set local role wos_app');
    await c.query("select set_config('app.actor_email', $1, true)", [email]);
    const result = await fn();
    await c.query('reset role');
    await c.query('release savepoint actor');
    return result;
  } catch (err) {
    await c.query('rollback to savepoint actor');
    throw err;
  }
}

/** Expects fn to fail with the given SQLSTATE. */
async function refused(label, code, email, fn) {
  try {
    await as(email, fn);
    check(label, false, 'was allowed');
  } catch (err) {
    check(label, err.code === code, `expected ${code}, got ${err.code}: ${err.message}`);
  }
}

const q = async (text, values) => (await c.query(text, values)).rows;

const dieselRow = (site, type = 'Payment Only') => [
  `insert into diesel_request (site_code, procurement_type, vendor_name, quantity, order_quantity_litres, rate_per_litre, final_amount)
   values ($1, $2, 'Smoke Vendor', 100, $3, 90, 9000) returning *`,
  [site, type, type === 'Delivery Only' ? 100 : null],
];

try {
  await c.connect();
  await c.query('begin');

  // --- Fixtures, as the owner ----------------------------------------
  for (const site of [SITE_A, SITE_B]) {
    await q(
      `insert into site_master (site_code, wh_code, facility_name, zone, state, channel, entity, business_type)
       values ($1, $1, 'Smoke test site', 'North', 'HR', 'B2B', 'Smoke Entity', 'WHS')`,
      [site],
    );
  }
  await q(
    `insert into poc_master (access_id, poc_email, poc_name, role, site_code, service_codes) values
       ('AC-SMOKE-1', $1, 'Smoke POC A',   'SITE_POC',        $4, 'DIESEL,SITE_ACTIVITY'),
       ('AC-SMOKE-2', $2, 'Smoke POC B',   'SITE_POC',        $5, 'ALL'),
       ('AC-SMOKE-3', $3, 'Smoke Admin A', 'WAREHOUSE_ADMIN', $4, 'ALL')`,
    [POC_A, POC_B, ADMIN_A, SITE_A, SITE_B],
  );

  console.log('\nSites');
  const dg = await q('select 1 from site_dg_config where site_code = $1', [SITE_A]);
  check('a new site gets its DG config row automatically', dg.length === 1);

  // --- Diesel ----------------------------------------------------------
  console.log('\nDiesel');
  const [reqA] = await as(POC_A, () => q(...dieselRow(SITE_A)));
  check('POC files a request at their own site', !!reqA);
  check('the database assigns the ID', /^PZHPL\d+$/.test(reqA.request_id), reqA.request_id);
  check('requester is stamped from identity', reqA.requester_email === POC_A, reqA.requester_email);

  await refused('POC cannot file at a site they do not hold', '42501', POC_A, () => q(...dieselRow(SITE_B)));

  const seenByB = await as(POC_B, () => q('select request_id from diesel_request where site_code = $1', [SITE_A]));
  check("another site's POC cannot see it", seenByB.length === 0, `saw ${seenByB.length}`);

  await refused('POC cannot approve (even their own)', '42501', POC_A, () =>
    q(`update diesel_request set status = 'Approved' where request_id = $1`, [reqA.request_id]),
  );

  const [approved] = await as(ADMIN_A, () =>
    q(`update diesel_request set status = 'Approved' where request_id = $1 returning approved_by`, [reqA.request_id]),
  );
  check('site admin approves; approver is stamped', approved?.approved_by === ADMIN_A, approved?.approved_by);

  const events = await as(POC_A, () =>
    q('select action from diesel_event where request_id = $1 order by event_id', [reqA.request_id]),
  );
  check('timeline records CREATED then APPROVED', events.map((e) => e.action).join() === 'CREATED,APPROVED');

  const [ownReq] = await as(ADMIN_A, () => q(...dieselRow(SITE_A, 'Delivery Only')));
  check('delivery requests get a DZHPL ID', /^DZHPL\d+$/.test(ownReq.request_id), ownReq.request_id);
  await refused('admin cannot approve their own request', '23514', ADMIN_A, () =>
    q(`update diesel_request set status = 'Approved' where request_id = $1`, [ownReq.request_id]),
  );
  await refused('an approved request cannot be re-decided', '22023', ADMIN_A, () =>
    q(`update diesel_request set status = 'Rejected', rejection_reason = 'late' where request_id = $1`, [
      reqA.request_id,
    ]),
  );
  const [pending] = await as(POC_A, () => q(...dieselRow(SITE_A)));
  await refused('rejecting needs a reason', '23514', ADMIN_A, () =>
    q(`update diesel_request set status = 'Rejected' where request_id = $1`, [pending.request_id]),
  );
  await refused('validated delivery needs a POD', '23514', POC_A, () =>
    q(`update diesel_request set validation = 'Delivered' where request_id = $1`, [ownReq.request_id]),
  );

  // --- Attachments -----------------------------------------------------
  console.log('\nPhotos and links');
  const small = Buffer.alloc(200_000, 1);
  const [photo] = await as(POC_A, () =>
    q(
      `insert into attachment (service_code, site_code, kind, mime, bytes, size_bytes)
       values ('DIESEL', $1, 'upload', 'image/jpeg', $2, $3) returning attachment_id`,
      [SITE_A, small, small.length],
    ),
  );
  check('a 200 KB photo is stored', !!photo);

  const big = Buffer.alloc(3 * 1024 * 1024, 1);
  await refused('a 3 MB photo is refused', '23514', POC_A, () =>
    q(
      `insert into attachment (service_code, site_code, kind, mime, bytes, size_bytes)
       values ('DIESEL', $1, 'upload', 'image/jpeg', $2, $3)`,
      [SITE_A, big, big.length],
    ),
  );

  const [link] = await as(POC_A, () =>
    q(
      `insert into attachment (service_code, site_code, kind, link_url)
       values ('DIESEL', $1, 'link', 'https://drive.google.com/file/d/abc/view') returning attachment_id`,
      [SITE_A],
    ),
  );
  check('a Google Drive link is stored', !!link);
  await refused('a non-Google link is refused', '23514', POC_A, () =>
    q(
      `insert into attachment (service_code, site_code, kind, link_url)
       values ('DIESEL', $1, 'link', 'https://example.com/pod.jpg')`,
      [SITE_A],
    ),
  );

  const [validated] = await as(POC_A, () =>
    q(
      `update diesel_request set pod_attachment_id = $2, validation = 'Delivered', delivered_quantity_litres = 100
        where request_id = $1 returning validated_by`,
      [ownReq.request_id, link.attachment_id],
    ),
  );
  check('POC validates delivery with a Drive-link POD', validated?.validated_by === POC_A);

  // --- Daily site report --------------------------------------------------
  console.log('\nDaily site report');
  const report = `insert into daily_site_log (site_code, log_date, worst_status) values ($1, '2026-01-15', 'clear') returning log_id`;
  const [log] = await as(POC_A, () => q(report, [SITE_A]));
  check('POC files today’s report', !!log);
  await refused('a second report for the same site and day is refused', '23505', POC_A, () => q(report, [SITE_A]));

  const [act] = await as(POC_A, () =>
    q(`insert into daily_site_activity (log_id, sr_no, work) values ($1, 1, 'Fix dock light') returning activity_id`, [
      log.log_id,
    ]),
  );
  check('activities attach to the report', !!act);
  const actSeenByB = await as(POC_B, () => q('select 1 from daily_site_activity where log_id = $1', [log.log_id]));
  check("another site cannot see the report's activities", actSeenByB.length === 0);

  // --- Generic services -------------------------------------------------
  console.log('\nOther services');
  await refused('POC cannot file a service they do not hold', '42501', POC_A, () =>
    q(`insert into service_submission (service_code, site_code, entry_date) values ('HOUSEKEEPING', $1, '2026-01-15')`, [
      SITE_A,
    ]),
  );
  const [sub] = await as(POC_B, () =>
    q(
      `insert into service_submission (service_code, site_code, entry_date, data)
       values ('HOUSEKEEPING', $1, '2026-01-15', '{"ongroundCount": 12}') returning submission_id`,
      [SITE_B],
    ),
  );
  check('POC with ALL services files housekeeping', !!sub);
  await refused('POC cannot verify their own entry', '42501', POC_B, () =>
    q(`update service_submission set status = 'Verified' where submission_id = $1`, [sub.submission_id]),
  );
  const touched = await as(ADMIN_A, () =>
    c.query(`update service_submission set status = 'Verified' where submission_id = $1`, [sub.submission_id]),
  );
  check("site A's admin cannot review site B's entry", touched.rowCount === 0, `updated ${touched.rowCount}`);

  // --- History and invariants ---------------------------------------------
  console.log('\nHistory');
  const audit = await q(`select count(*)::int as n from record_audit where record_key = $1`, [reqA.request_id]);
  check('every diesel change is in record_audit', audit[0].n >= 2, `${audit[0].n} rows`);
  const auditSeenByPoc = await as(POC_A, () => q('select 1 from record_audit'));
  check('a POC cannot read the audit log', auditSeenByPoc.length === 0);

  try {
    await c.query('savepoint del');
    await c.query('delete from diesel_request where request_id = $1', [reqA.request_id]);
    check('filed requests cannot be deleted', false, 'delete succeeded');
  } catch (err) {
    await c.query('rollback to savepoint del');
    check('filed requests cannot be deleted', /never deleted/.test(err.message), err.message);
  }

  const [queued] = await as(POC_A, () => q(`select fn_enqueue_sheet_copy('DIESEL', '{}') as queued`));
  check('no sheet copy is queued when no sheet is linked', queued.queued === false);

  // --- The reason server/db.ts switches role ------------------------------
  console.log('\nRole switch');
  await c.query("select set_config('app.actor_email', $1, true)", [POC_B]);
  const asOwner = await q('select 1 from diesel_request where site_code = $1', [SITE_A]);
  check(
    'without `set role wos_app` the owner bypasses RLS (why withActor switches)',
    asOwner.length > 0,
    'owner saw nothing — RLS may be forced, which breaks the definer functions',
  );
} catch (err) {
  failed++;
  console.error('\nStopped on an unexpected error:', err.message);
  if (err.detail) console.error('  detail:', err.detail);
} finally {
  await c.query('rollback').catch(() => {});
  await c.end().catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed. (Rolled back — nothing was kept.)`);
process.exit(failed ? 1 : 0);
