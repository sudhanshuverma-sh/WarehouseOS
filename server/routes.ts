/**
 * The API surface.
 *
 * Every handler runs inside withActor(), so RLS is what decides which rows
 * come back — not a WHERE clause written here. That matters: a filter in
 * this file is one someone can forget to add to the next endpoint, whereas
 * a policy applies to every query against the table whether the author
 * thought about it or not.
 *
 * So these handlers deliberately do NOT filter by site. Asking for a site
 * you cannot see returns an empty list rather than an error, because the
 * database simply has no such rows for you.
 *
 *   core       health, me, site/service catalogues          (this file)
 *   ebdg       EB-DG daily entries                           (this file)
 *   master     sites, services, POCs, audit, import         routes/master.ts
 *   diesel     requests, approvals, delivery, vendors       routes/diesel.ts
 *   daily-site Daily Site Activity Report                   routes/dailySite.ts
 *   services   every other service, defined as data         routes/submissions.ts
 *   attachments photos and Drive links                      routes/attachments.ts
 *   compliance who has not filed today                      routes/compliance.ts
 *   notices    noticeboard posts and who has read them      routes/noticeboard.ts
 */

import { Router } from 'express';
import { buildUpsert, rowFromDb, selectList } from './ebdgColumns';
import { errorHandler, handle, HttpError } from './http';
import { attachmentRoutes } from './routes/attachments';
import { extrasFor, iso, runAs, todayInIndia, type RouteDeps } from './routes/common';
import { complianceRoutes } from './routes/compliance';
import { dailySiteRoutes } from './routes/dailySite';
import { firePumpRoutes } from './routes/firePump';
import { dieselRoutes } from './routes/diesel';
import { masterRoutes } from './routes/master';
import { noticeboardRoutes } from './routes/noticeboard';
import { submissionRoutes } from './routes/submissions';

export type { RouteDeps } from './routes/common';

export function createRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  // -------------------------------------------------------------------
  // Health. No identity required — the platform probes this before any
  // user exists, and a health check that needs auth cannot report that
  // auth is broken.
  // -------------------------------------------------------------------
  router.get(
    '/health',
    handle(async (_req, res) => {
      const ok = await deps.db.healthy();
      res.status(ok ? 200 : 503).json({ ok, database: ok ? 'up' : 'unreachable' });
    }),
  );

  // -------------------------------------------------------------------
  // Who am I? The app calls this on load to build its capabilities.
  // Returns every live grant, so a POC covering three warehouses gets all
  // three rather than whichever the database happened to return first.
  // -------------------------------------------------------------------
  router.get(
    '/me',
    handle(async (req, res) => {
      const { email, grants } = await run(req, async (c, email) => {
        const { rows } = await c.query(
          `select access_id, poc_name, role, site_code, service_codes
             from v_effective_access
            where poc_email = $1
            order by site_code`,
          [email],
        );
        return { email, grants: rows };
      });

      if (grants.length === 0) {
        // Signed in, but holding no access row. Saying so plainly beats an
        // empty dashboard that looks like a bug — the fix is an admin
        // adding them, and they need to know that is the fix.
        return res.status(403).json({
          email,
          error: 'NO_ACCESS',
          message: 'You are signed in, but no site or service is assigned to you. Ask a Super Admin to add you.',
        });
      }

      const roles = new Set(grants.map((g) => g.role));
      res.json({
        email,
        name: grants[0].poc_name,
        roles: [...roles],
        // The union of every grant. 'ALL' anywhere means nationwide.
        sites: grants.some((g) => g.site_code === 'ALL') ? 'ALL' : grants.map((g) => g.site_code),
        services: grants.some((g) => g.service_codes === 'ALL')
          ? 'ALL'
          : [...new Set(grants.flatMap((g) => String(g.service_codes).split(',').map((s) => s.trim())))],
        grants,
      });
    }),
  );

  // -------------------------------------------------------------------
  // Catalogues. RLS already limits what comes back.
  // -------------------------------------------------------------------
  router.get(
    '/sites',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select site_code, wh_code, facility_name, zone, state, city, channel,
                    entity, business_type, services_enabled, is_active
               from site_master
              where site_code <> 'ALL'
              order by site_code`,
          )
        ).rows,
      );
      res.json(rows);
    }),
  );

  router.get(
    '/services',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select service_code, service_name, cadence, submission_window,
                    needs_approval, needs_delivery_validation, requires_evidence, is_active
               from service_registry
              order by service_code`,
          )
        ).rows,
      );
      res.json(rows);
    }),
  );

  /** The sites this caller may actually see — drives the site picker. */
  router.get(
    '/my-sites',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select s.site_code, s.wh_code, s.facility_name, s.channel, s.entity, s.cost_center,
                    s.zone, s.state, s.city, s.address, s.sap_code, s.business_type, s.services_enabled
               from site_master s
              where s.site_code in (select fn_visible_sites())
                and s.site_code <> 'ALL'
                and s.is_active
              order by s.site_code`,
          )
        ).rows,
      );
      res.json(rows);
    }),
  );

  // -------------------------------------------------------------------
  // EB-DG
  // -------------------------------------------------------------------

  /** Per-site DG configuration — how many DG blocks the form draws. */
  router.get(
    '/ebdg/config/:siteCode',
    handle(async (req, res) => {
      const row = await run(req, async (c) =>
        (
          await c.query(
            `select site_code, dg_count, has_def, has_solar,
                    b_check_interval_hrs, b_check_interval_days
               from site_dg_config where site_code = $1`,
            [req.params.siteCode],
          )
        ).rows[0],
      );
      if (!row) throw new HttpError(404, `No DG config visible for ${req.params.siteCode}`, 'NOT_FOUND');
      res.json(row);
    }),
  );

  /**
   * The carry-forward lookup — the heart of the feature.
   *
   * "This site's most recent row strictly before this date." Strictly
   * before, and ordered by date rather than by insertion, so a back-dated
   * entry filed later cannot become the previous row for a day it does not
   * precede. A gap of several days is handled by the same query: it finds
   * the most recent earlier row, not date - 1.
   */
  router.get(
    '/ebdg/previous',
    handle(async (req, res) => {
      const { site, date } = req.query as { site?: string; date?: string };
      if (!site || !date) throw new HttpError(400, 'site and date are both required');

      const row = await run(req, async (c) =>
        (
          await c.query(
            `select ${selectList()} from ebdg_daily
              where site_code = $1 and "date" < $2
              order by "date" desc limit 1`,
            [site, date],
          )
        ).rows[0],
      );

      // No previous row is a normal state — the site's first ever entry —
      // so it is null, not a 404.
      res.json(row ? rowFromDb(row) : null);
    }),
  );

  /** Today's row for this site, if one exists (the duplicate-entry case). */
  router.get(
    '/ebdg/row',
    handle(async (req, res) => {
      const { site, date } = req.query as { site?: string; date?: string };
      if (!site || !date) throw new HttpError(400, 'site and date are both required');

      const row = await run(req, async (c) =>
        (await c.query(`select ${selectList()} from ebdg_daily where site_code = $1 and "date" = $2`, [site, date])).rows[0],
      );
      res.json(row ? rowFromDb(row) : null);
    }),
  );

  /** True when a row exists after this date — the back-dated-entry warning. */
  router.get(
    '/ebdg/later',
    handle(async (req, res) => {
      const { site, date } = req.query as { site?: string; date?: string };
      if (!site || !date) throw new HttpError(400, 'site and date are both required');
      const later = await run(req, async (c) =>
        (await c.query(`select exists (select 1 from ebdg_daily where site_code = $1 and "date" > $2) as later`, [site, date]))
          .rows[0].later,
      );
      res.json({ later });
    }),
  );

  router.get(
    '/ebdg/rows',
    handle(async (req, res) => {
      const { site, from, to, limit } = req.query as Record<string, string | undefined>;

      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select ${selectList()}, extras from ebdg_daily
              where ($1::text is null or site_code = $1)
                and ($2::date is null or "date" >= $2)
                and ($3::date is null or "date" <= $3)
              order by "date" desc, site_code
              limit $4`,
            [site ?? null, from ?? null, to ?? null, Math.min(Number(limit) || 500, 5000)],
          )
        ).rows,
      );
      res.json(rows.map((r) => ({ ...(r.extras ?? {}), ...rowFromDb(r) })));
    }),
  );

  /**
   * File (or correct) a day's entry.
   *
   * The app has already run calculate() and is sending all 109 values as
   * literal numbers — no formula reaches the database (I6). The write is
   * an upsert on Record_ID, so re-filing the same day corrects that row
   * instead of creating a second one.
   *
   * Correcting it has to be asked for. Three or four POCs share a site,
   * and an unasked-for upsert meant the second one to open the form
   * silently replaced the first one's meter readings. Without `amend` a
   * day that already has a row is a 409 naming who filed it and when;
   * with it the row is replaced, and trg_audit_ebdg_daily (db/filings.sql)
   * keeps the reading that was there before.
   */
  router.post(
    '/ebdg/submit',
    handle(async (req, res) => {
      const row = req.body;
      if (!row || typeof row !== 'object') throw new HttpError(400, 'Expected a row object');

      const body = row as Record<string, unknown>;
      const amend = body.amend === true;

      const saved = await run(req, async (c) => {
        if (!amend) {
          const { rows } = await c.query(
            'select submitted_by, timestamp from ebdg_daily where record_id = $1',
            [body.Record_ID],
          );
          if (rows[0]) {
            throw new HttpError(409, 'An EB-DG entry for this site and date already exists.', 'DUPLICATE', {
              submittedBy: rows[0].submitted_by ?? '',
              submittedAt: iso(rows[0].timestamp) ?? '',
            });
          }
        }
        const extras = await extrasFor(c, 'EB_DG', body.extras);
        const plan = buildUpsert(row, extras);
        const { rows } = await c.query(plan.text, plan.values);
        return rows[0];
      });

      res.status(amend ? 200 : 201).json({ ...(saved.extras ?? {}), ...rowFromDb(saved) });
    }),
  );

  /**
   * Who has not filed EB-DG today. Kept for existing callers; the general
   * form is GET /api/compliance?service=EB_DG.
   */
  router.get(
    '/ebdg/compliance',
    handle(async (req, res) => {
      const date = (req.query.date as string) || todayInIndia();

      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select s.site_code, s.wh_code, s.channel,
                    (e.record_id is not null) as filed,
                    e.submitted_by, e."timestamp" as filed_at
               from site_master s
               left join ebdg_daily e
                 on e.site_code = s.site_code and e."date" = $1
              where s.is_active
                and s.site_code <> 'ALL'
                and fn_can_access('EB_DG', s.site_code)
              order by filed, s.site_code`,
            [date],
          )
        ).rows,
      );

      res.json({
        date,
        total: rows.length,
        filed: rows.filter((r) => r.filed).length,
        missing: rows.filter((r) => !r.filed).length,
        sites: rows,
      });
    }),
  );

  router.use(masterRoutes(deps));
  router.use(dieselRoutes(deps));
  router.use(dailySiteRoutes(deps));
  router.use(firePumpRoutes(deps));
  router.use(submissionRoutes(deps));
  router.use(attachmentRoutes(deps));
  router.use(complianceRoutes(deps));
  router.use(noticeboardRoutes(deps));

  // Unknown /api paths are a JSON 404, not the SPA's index.html.
  router.use((_req, _res, next) => next(new HttpError(404, 'No such API endpoint.', 'NOT_FOUND')));

  // One place, so no handler leaks a stack trace.
  router.use(errorHandler);

  return router;
}
