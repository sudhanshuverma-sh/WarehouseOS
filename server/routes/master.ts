/**
 * Master data: sites, services, POCs, the audit trail, and the import.
 *
 * Every write is Super Admin only — checked up front for a clear 403, and
 * enforced again by RLS whatever this file does. Rows travel in the sheet
 * shape the Master Data screen already uses; they are validated with the
 * same functions the screen runs (src/lib/masterData/validate.ts) and
 * cleaned with the same code as the import, so a hand-added site and an
 * imported one cannot differ.
 *
 * Edits merge onto the stored row, so a client that sends only the changed
 * fields does not blank the rest.
 */

import { Router } from 'express';
import type { Queryable } from '../db';
import { handle, HttpError } from '../http';
import { importMasterSnapshot, normaliseSnapshot, type MasterSnapshot, type TableRow } from '../masterImport';
import { toAudit, toPoc, toService, toSite } from '../masterShape';
import { buildInsert, buildUpdate } from '../sql';
import { validateService, validateSite, type FieldError } from '../../src/lib/masterData/validate';
import { isPlainObject, limitFrom, requireSuperAdmin, runAs, type RouteDeps } from './common';

const ROLES = ['SITE_POC', 'WAREHOUSE_ADMIN', 'SERVICE_ADMIN', 'SUPER_ADMIN'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Both shapes: /macros/s/…/exec, and the Workspace form a Zomato deployment
// ("Anyone within Zomato") gives, /a/macros/zomato.com/s/…/exec.
const APPS_SCRIPT_EXEC = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

const validationError = (errors: FieldError[]) => new HttpError(400, errors[0].message, 'VALIDATION', errors);

/** One editor row → one database row, through the import's cleaning. */
function normaliseOne(kind: keyof MasterSnapshot, body: Record<string, unknown>): TableRow {
  const row = normaliseSnapshot({ [kind]: [body] }).rows[0];
  if (!row) throw new HttpError(400, 'The row has no key.', 'VALIDATION');
  return row;
}

export function pocErrors(row: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const f of ['POC_Email', 'POC_Name', 'Role', 'Site_Code']) {
    if (!text(row[f])) errors.push({ field: f, message: `${f.replace(/_/g, ' ')} is required.` });
  }
  if (text(row.POC_Email) && !EMAIL.test(text(row.POC_Email))) {
    errors.push({ field: 'POC_Email', message: 'POC Email must be an email address.' });
  }
  if (text(row.Role) && !ROLES.includes(text(row.Role))) {
    errors.push({ field: 'Role', message: `Role must be one of ${ROLES.join(', ')}.` });
  }
  return errors;
}

function body(req: { body?: unknown }): Record<string, unknown> {
  if (!isPlainObject(req.body)) throw new HttpError(400, 'Expected a row object.');
  return req.body;
}

export function masterRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  const load = async (c: Queryable, table: string, keyCol: string, key: string) => {
    const { rows } = await c.query(`select * from ${table} where ${keyCol} = $1`, [key]);
    if (!rows[0]) throw new HttpError(404, `${key} does not exist.`, 'NOT_FOUND');
    return rows[0];
  };

  // ---------------------------------------------------------------- sites
  router.get(
    '/master/sites',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (await c.query(`select * from site_master where site_code <> 'ALL' order by site_code`)).rows,
      );
      res.json(rows.map(toSite));
    }),
  );

  const siteKeys = async (c: Queryable) =>
    (await c.query(`select site_code as "Site_Code" from site_master where site_code <> 'ALL'`)).rows;

  router.post(
    '/master/sites',
    handle(async (req, res) => {
      const row = body(req);
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const errors = validateSite(row, await siteKeys(c), 'create');
        if (errors.length) throw validationError(errors);
        const plan = buildInsert('site_master', normaliseOne('siteMaster', row).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.status(201).json(toSite(saved));
    }),
  );

  router.patch(
    '/master/sites/:code',
    handle(async (req, res) => {
      const code = req.params.code;
      const changes = body(req);
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const merged = { ...toSite(await load(c, 'site_master', 'site_code', code)), ...changes };
        const errors = validateSite(merged, await siteKeys(c), 'edit', code);
        if (errors.length) throw validationError(errors);
        const plan = buildUpdate('site_master', 'site_code', code, normaliseOne('siteMaster', merged).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.json(toSite(saved));
    }),
  );

  // ------------------------------------------------------------- services
  router.get(
    '/master/services',
    handle(async (req, res) => {
      const rows = await run(req, async (c) => (await c.query('select * from service_registry order by service_code')).rows);
      res.json(rows.map(toService));
    }),
  );

  const serviceKeys = async (c: Queryable) =>
    (await c.query(`select service_code as "Service_Code" from service_registry`)).rows;

  router.post(
    '/master/services',
    handle(async (req, res) => {
      const row = body(req);
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const errors = validateService(row, await serviceKeys(c), 'create');
        if (errors.length) throw validationError(errors);
        const plan = buildInsert('service_registry', normaliseOne('serviceRegistry', row).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.status(201).json(toService(saved));
    }),
  );

  router.patch(
    '/master/services/:code',
    handle(async (req, res) => {
      const code = req.params.code;
      const changes = body(req);
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const merged = { ...toService(await load(c, 'service_registry', 'service_code', code)), ...changes };
        const errors = validateService(merged, await serviceKeys(c), 'edit', code);
        if (errors.length) throw validationError(errors);
        const plan = buildUpdate('service_registry', 'service_code', code, normaliseOne('serviceRegistry', merged).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.json(toService(saved));
    }),
  );

  /** Links (or, with an empty url, unlinks) the Google Sheet a service's records are copied to. */
  router.put(
    '/master/services/:code/sheet-mirror',
    handle(async (req, res) => {
      const url = text(isPlainObject(req.body) ? req.body.url : '');
      if (url && !APPS_SCRIPT_EXEC.test(url)) {
        throw new HttpError(400, 'Paste the Web App URL from Apps Script → Deploy: https://script.google.com/macros/s/…/exec');
      }
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const { rows } = await c.query(
          'update service_registry set sheet_mirror_url = $1 where service_code = $2 returning *',
          [url || null, req.params.code],
        );
        if (!rows[0]) throw new HttpError(404, `${req.params.code} does not exist.`, 'NOT_FOUND');
        return rows[0];
      });
      res.json(toService(saved));
    }),
  );

  // ----------------------------------------------------------------- POCs
  router.get(
    '/master/pocs',
    handle(async (req, res) => {
      // RLS: a Super Admin gets everyone; anyone else gets their own rows.
      const rows = await run(req, async (c) => (await c.query('select * from poc_master order by access_id')).rows);
      res.json(rows.map(toPoc));
    }),
  );

  router.post(
    '/master/pocs',
    handle(async (req, res) => {
      const row = { ...body(req) };
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const errors = pocErrors(row);
        if (errors.length) throw validationError(errors);
        // Allocated in the database, under a lock, so two admins adding a
        // POC at once cannot both take the next number.
        if (!text(row.Access_ID)) row.Access_ID = (await c.query('select next_access_id() as id')).rows[0].id;
        const plan = buildInsert('poc_master', normaliseOne('pocMaster', row).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.status(201).json(toPoc(saved));
    }),
  );

  router.patch(
    '/master/pocs/:id',
    handle(async (req, res) => {
      const id = req.params.id;
      const changes = body(req);
      if (changes.Access_ID !== undefined && text(changes.Access_ID) !== id) {
        throw validationError([{ field: 'Access_ID', message: `Access ID cannot change — it is ${id}.` }]);
      }
      const saved = await run(req, async (c) => {
        await requireSuperAdmin(c);
        const merged = { ...toPoc(await load(c, 'poc_master', 'access_id', id)), ...changes };
        const errors = pocErrors(merged);
        if (errors.length) throw validationError(errors);
        const plan = buildUpdate('poc_master', 'access_id', id, normaliseOne('pocMaster', merged).values);
        return (await c.query(plan.text, plan.values)).rows[0];
      });
      res.json(toPoc(saved));
    }),
  );

  // ---------------------------------------------------------------- audit
  router.get(
    '/master/audit',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (await c.query('select * from master_audit order by ts desc, audit_id desc limit $1', [limitFrom(req.query.limit, 500)])).rows,
      );
      res.json(rows.map(toAudit));
    }),
  );

  // --------------------------------------------------------------- import
  router.post(
    '/master/import',
    handle(async (req, res) => {
      const snapshot = req.body;
      if (!isPlainObject(snapshot) || !['siteMaster', 'serviceRegistry', 'pocMaster'].some((k) => Array.isArray(snapshot[k]))) {
        throw new HttpError(400, 'Expected the Master Data JSON, with siteMaster, serviceRegistry and pocMaster lists.');
      }
      const report = await run(req, async (c) => {
        await requireSuperAdmin(c);
        return importMasterSnapshot(c, snapshot as MasterSnapshot);
      });
      res.json(report);
    }),
  );

  return router;
}
