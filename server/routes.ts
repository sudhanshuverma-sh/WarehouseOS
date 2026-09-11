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
 */

import { Router } from 'express';
import type { Db } from './db';
import type { IdentityResolver } from './identity';
import { NoIdentityError } from './identity';
import { buildUpsert, rowFromDb, selectList } from './ebdgColumns';

export interface RouteDeps {
  db: Db;
  identity: IdentityResolver;
}

/** Anything a handler throws with a numeric `status` is a client error. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createRoutes({ db, identity }: RouteDeps): Router {
  const router = Router();

  /** Resolves the caller, or throws a 401. */
  const actor = async (req: Parameters<IdentityResolver['resolve']>[0]) => {
    const { email } = await identity.resolve(req);
    return email;
  };

  // Wraps an async handler so a rejected promise becomes a response rather
  // than an unhandled rejection. Express 4 does not do this itself.
  const handle =
    (fn: (req: any, res: any) => Promise<unknown>) =>
    (req: any, res: any, next: any) =>
      fn(req, res).catch(next);

  // -------------------------------------------------------------------
  // Health. No identity required — the platform probes this before any
  // user exists, and a health check that needs auth cannot report that
  // auth is broken.
  // -------------------------------------------------------------------
  router.get(
    '/health',
    handle(async (_req, res) => {
      const ok = await db.healthy();
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
      const email = await actor(req);
      const grants = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select access_id, poc_name, role, site_code, service_codes
             from v_effective_access
            where poc_email = $1
            order by site_code`,
          [email],
        );
        return rows;
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
  // Master data. RLS already limits what comes back and who may write.
  // -------------------------------------------------------------------
  router.get(
    '/sites',
    handle(async (req, res) => {
      const email = await actor(req);
      const rows = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select site_code, wh_code, facility_name, zone, state, city, channel,
                  entity, business_type, services_enabled, is_active
             from site_master
            where site_code <> 'ALL'
            order by site_code`,
        );
        return rows;
      });
      res.json(rows);
    }),
  );

  router.get(
    '/services',
    handle(async (req, res) => {
      const email = await actor(req);
      const rows = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select service_code, service_name, cadence, submission_window,
                  needs_approval, requires_evidence, is_active
             from service_registry
            order by service_code`,
        );
        return rows;
      });
      res.json(rows);
    }),
  );

  /** The sites this caller may actually see — drives the site picker. */
  router.get(
    '/my-sites',
    handle(async (req, res) => {
      const email = await actor(req);
      const rows = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select s.site_code, s.wh_code, s.facility_name, s.channel
             from site_master s
            where s.site_code in (select fn_visible_sites())
              and s.site_code <> 'ALL'
            order by s.site_code`,
        );
        return rows;
      });
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
      const email = await actor(req);
      const row = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select site_code, dg_count, has_def, has_solar,
                  b_check_interval_hrs, b_check_interval_days
             from site_dg_config where site_code = $1`,
          [req.params.siteCode],
        );
        return rows[0];
      });
      if (!row) throw new HttpError(404, `No DG config visible for ${req.params.siteCode}`);
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
      const email = await actor(req);
      const { site, date } = req.query as { site?: string; date?: string };
      if (!site || !date) throw new HttpError(400, 'site and date are both required');

      const row = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select ${selectList()} from ebdg_daily
            where site_code = $1 and "date" < $2
            order by "date" desc limit 1`,
          [site, date],
        );
        return rows[0];
      });

      // No previous row is a normal state — the site's first ever entry —
      // so it is null, not a 404.
      res.json(row ? rowFromDb(row) : null);
    }),
  );

  /** Today's row for this site, if one exists (the duplicate-entry case). */
  router.get(
    '/ebdg/row',
    handle(async (req, res) => {
      const email = await actor(req);
      const { site, date } = req.query as { site?: string; date?: string };
      if (!site || !date) throw new HttpError(400, 'site and date are both required');

      const row = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select ${selectList()} from ebdg_daily where site_code = $1 and "date" = $2`,
          [site, date],
        );
        return rows[0];
      });
      res.json(row ? rowFromDb(row) : null);
    }),
  );

  router.get(
    '/ebdg/rows',
    handle(async (req, res) => {
      const email = await actor(req);
      const { site, from, to, limit } = req.query as Record<string, string | undefined>;

      const rows = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select ${selectList()} from ebdg_daily
            where ($1::text is null or site_code = $1)
              and ($2::date is null or "date" >= $2)
              and ($3::date is null or "date" <= $3)
            order by "date" desc, site_code
            limit $4`,
          [site ?? null, from ?? null, to ?? null, Math.min(Number(limit) || 500, 5000)],
        );
        return rows;
      });
      res.json(rows.map(rowFromDb));
    }),
  );

  /**
   * File (or correct) a day's entry.
   *
   * The app has already run calculate() and is sending all 109 values as
   * literal numbers — no formula reaches the database (I6). The write is
   * an upsert on Record_ID, so re-filing the same day corrects that row
   * instead of creating a second one.
   */
  router.post(
    '/ebdg/submit',
    handle(async (req, res) => {
      const email = await actor(req);
      const row = req.body;
      if (!row || typeof row !== 'object') throw new HttpError(400, 'Expected a row object');

      const saved = await db.withActor(email, async (c) => {
        const plan = buildUpsert(row);
        const { rows } = await c.query(plan.text, plan.values);
        return rows[0];
      });

      res.status(201).json(rowFromDb(saved));
    }),
  );

  /**
   * Who has not filed today. The one view worth having on day one —
   * finding this out currently means scrolling a spreadsheet of 120 sites.
   */
  router.get(
    '/ebdg/compliance',
    handle(async (req, res) => {
      const email = await actor(req);
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

      const rows = await db.withActor(email, async (c) => {
        const { rows } = await c.query(
          `select s.site_code, s.wh_code, s.channel,
                  (e.record_id is not null) as filed,
                  e.submitted_by, e."timestamp" as filed_at
             from site_master s
             left join ebdg_daily e
               on e.site_code = s.site_code and e."date" = $1
            where s.is_active
              and s.site_code <> 'ALL'
              and s.site_code in (select fn_visible_sites())
            order by filed, s.site_code`,
          [date],
        );
        return rows;
      });

      res.json({
        date,
        total: rows.length,
        filed: rows.filter((r) => r.filed).length,
        missing: rows.filter((r) => !r.filed).length,
        sites: rows,
      });
    }),
  );

  // -------------------------------------------------------------------
  // Error handling. One place, so no handler leaks a stack trace.
  // -------------------------------------------------------------------
  router.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof NoIdentityError) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: err.message });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: 'BAD_REQUEST', message: err.message });
    }

    // A Postgres RLS refusal arrives as a permission error. Reporting it as
    // 403 rather than 500 is the difference between "you may not do that"
    // and "the server is broken" — only one of which the user can act on.
    if (err?.code === '42501') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Your role does not permit that change.' });
    }
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE', message: 'That row already exists.' });
    }
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'UNKNOWN_REFERENCE', message: 'That site or service does not exist.' });
    }

    // Everything else is ours. Log it in full, tell the caller nothing —
    // internal messages name tables and columns.
    console.error('[api]', err);
    res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong. It has been logged.' });
  });

  return router;
}
