/**
 * Who has not filed today — for any daily service, not just EB-DG.
 *
 * The denominator is every active site that has the service enabled AND
 * that the caller holds it for, so a service admin sees their service's
 * sites and a site POC sees their own. Event-driven services (Diesel) have
 * no "today", so asking for them is a 400 rather than a page of false
 * "missing" rows.
 */

import { Router } from 'express';
import { handle, HttpError } from '../http';
import { iso, optionalDate, queryText, requiredText, runAs, todayInIndia, type RouteDeps } from './common';

/** Where "filed" is looked up. Table and column names are ours, never from the request. */
const FILED: Record<string, string> = {
  EB_DG: `select e."timestamp" as filed_at, e.submitted_by from ebdg_daily e
           where e.site_code = s.site_code and e."date" = $2`,
  SITE_ACTIVITY: `select l.submitted_at as filed_at, l.submitted_by from daily_site_log l
                   where l.site_code = s.site_code and l.log_date = $2`,
};
const FILED_GENERIC = `select x.submitted_at as filed_at, x.submitted_by from service_submission x
                        where x.site_code = s.site_code and x.entry_date = $2 and x.service_code = $1`;

export function complianceRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  router.get(
    '/compliance',
    handle(async (req, res) => {
      const service = requiredText(queryText(req.query.service), 'Say which service (?service=EB_DG).').toUpperCase();
      const date = optionalDate(req.query.date, 'date') ?? todayInIndia();

      const result = await run(req, async (c) => {
        const { rows: found } = await c.query('select cadence from service_registry where service_code = $1', [service]);
        if (!found[0]) throw new HttpError(404, `There is no service ${service}.`, 'NOT_FOUND');
        if (found[0].cadence !== 'DAILY') {
          throw new HttpError(400, `${service} is ${found[0].cadence}, so there is no daily filing to check.`);
        }

        const filed = FILED[service] ?? FILED_GENERIC;
        const { rows } = await c.query(
          `select s.site_code, s.wh_code, s.facility_name, s.channel,
                  f.filed_at, f.submitted_by
             from site_master s
             left join lateral (${filed} limit 1) f on true
            where s.is_active
              and s.site_code <> 'ALL'
              and (s.services_enabled = 'ALL'
                   or $1 = any (string_to_array(replace(s.services_enabled, ' ', ''), ',')))
              and fn_can_access($1, s.site_code)
            order by (f.filed_at is not null), s.site_code`,
          [service, date],
        );
        return rows;
      });

      const sites = result.map((r) => ({
        siteCode: r.site_code,
        whCode: r.wh_code,
        facilityName: r.facility_name,
        channel: r.channel,
        filed: r.filed_at !== null && r.filed_at !== undefined,
        filedAt: iso(r.filed_at),
        submittedBy: r.submitted_by ?? undefined,
      }));

      res.json({
        service,
        date,
        total: sites.length,
        filed: sites.filter((s) => s.filed).length,
        missing: sites.filter((s) => !s.filed).length,
        sites,
      });
    }),
  );

  return router;
}
