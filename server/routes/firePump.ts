/**
 * Fire Pump Healthiness — one daily check per site.
 *
 * The overall status (OK / CRITICAL) and the issue count are computed here
 * from the answers, never taken from the body, and a failed check is refused
 * unless it carries a remark. A photo is optional, but one that is sent must
 * be filed for this service at this site. The rules are
 * src/lib/firePump/checks.ts, the same module the form uses, so the browser
 * and the API cannot disagree about what is complete.
 */

import { Router } from 'express';
import { handle, HttpError } from '../http';
import {
  FIRE_PUMP_CHECKS,
  firePumpErrors,
  scoreFirePump,
  visibleChecks,
  type FirePumpAnswers,
  type FirePumpKey,
} from '../../src/lib/firePump/checks';
import {
  extrasFor,
  iso,
  isPlainObject,
  limitFrom,
  num,
  optionalDate,
  optionalText,
  queryText,
  requireAttachment,
  requiredDate,
  requiredText,
  runAs,
  type RouteDeps,
} from './common';

type Row = Record<string, any>;

const SERVICE = 'FIRE';

/** Only the checks the form defines, and only as text. */
function pickText(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(raw)) return out;
  for (const { key } of FIRE_PUMP_CHECKS) {
    const v = optionalText(raw[key]);
    if (v) out[key] = v;
  }
  return out;
}

/** A database row in the shape the app keeps it. */
export function toFirePumpLog(r: Row) {
  return {
    // Questions added to this service later, first so the check's own
    // fields below always win if a key ever collides.
    ...((r.extras ?? {}) as Row),
    id: String(r.log_id),
    logId: String(r.log_id),
    siteCode: r.site_code,
    date: r.log_date,
    submittedAt: iso(r.submitted_at),
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by_name ?? r.submitted_by,
    answers: r.answers ?? {},
    remarks: r.remarks ?? {},
    photos: r.photos ?? {},
    hydrantPressureBar: num(r.hydrant_pressure_bar) ?? null,
    overallStatus: r.overall_status,
    issuesCount: r.issues_count,
  };
}

export function firePumpRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  router.get(
    '/fire-pump',
    handle(async (req, res) => {
      const from = optionalDate(req.query.from, 'from');
      const to = optionalDate(req.query.to, 'to');
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select * from fire_pump_log
              where ($1::text is null or site_code = $1)
                and ($2::date is null or log_date >= $2)
                and ($3::date is null or log_date <= $3)
              order by log_date desc, site_code
              limit $4`,
            [queryText(req.query.site), from, to, limitFrom(req.query.limit)],
          )
        ).rows,
      );
      res.json(rows.map(toFirePumpLog));
    }),
  );

  /**
   * File (or, with `amend`, correct) the day's check.
   *
   * Several POCs share a site, so replacing a filed check has to be asked
   * for: without `amend` a day that already has one is a 409 naming who
   * filed it and when, exactly as EB-DG does. The audit trigger keeps what
   * the check said before it was amended.
   */
  router.post(
    '/fire-pump',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      const siteCode = requiredText(b.site ?? b.siteCode, 'Choose the site.');
      const date = requiredDate(b.date, 'Choose the date.');
      const amend = b.amend === true;

      const answers = pickText(b.answers) as FirePumpAnswers;
      // Checks that are not asked (no sprinkler system → no sprinkler line)
      // are stored as absent, not as an answer.
      const asked = new Set(visibleChecks(answers).map((c) => c.key));
      for (const key of Object.keys(answers) as FirePumpKey[]) if (!asked.has(key)) delete answers[key];

      const score = scoreFirePump(answers);
      const failed = new Set<string>(score.issues);
      // A remark or photo only belongs to a check that failed.
      const remarks = Object.fromEntries(Object.entries(pickText(b.remarks)).filter(([k]) => failed.has(k)));
      const photoIds = Object.fromEntries(Object.entries(pickText(b.photos)).filter(([k]) => failed.has(k)));
      const pressure = b.pressure === undefined || b.pressure === null || b.pressure === '' ? null : Number(b.pressure);

      const errors = firePumpErrors({ answers, remarks, photos: photoIds, pressure });
      if (errors.length) throw new HttpError(400, errors[0], 'VALIDATION', errors);

      const saved = await run(req, async (c) => {
        for (const [key, id] of Object.entries(photoIds)) {
          const check = FIRE_PUMP_CHECKS.find((x) => x.key === key)!;
          await requireAttachment(c, id, SERVICE, siteCode, `The photo for "${check.short}"`);
        }

        const existing = (
          await c.query('select submitted_by, submitted_at from fire_pump_log where site_code = $1 and log_date = $2', [
            siteCode,
            date,
          ])
        ).rows[0];
        if (existing && !amend) {
          throw new HttpError(409, 'The fire pump check for this site and date has already been filed.', 'DUPLICATE', {
            submittedBy: existing.submitted_by ?? '',
            submittedAt: iso(existing.submitted_at) ?? '',
          });
        }

        const values = [
          siteCode,
          date,
          optionalText(b.submittedByName),
          JSON.stringify(answers),
          JSON.stringify(remarks),
          JSON.stringify(photoIds),
          pressure,
          score.overall,
          score.issues.length,
          await extrasFor(c, SERVICE, b.extras, siteCode),
        ];

        const { rows } = existing
          ? await c.query(
              `update fire_pump_log
                  set submitted_by_name = $3, answers = $4::jsonb, remarks = $5::jsonb, photos = $6::jsonb,
                      hydrant_pressure_bar = $7, overall_status = $8, issues_count = $9, extras = $10::jsonb
                where site_code = $1 and log_date = $2
                returning *`,
              values,
            )
          : await c.query(
              `insert into fire_pump_log
                 (site_code, log_date, submitted_by_name, answers, remarks, photos,
                  hydrant_pressure_bar, overall_status, issues_count, extras)
               values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10::jsonb)
               returning *`,
              values,
            );
        return { row: rows[0], created: !existing };
      });

      res.status(saved.created ? 201 : 200).json(toFirePumpLog(saved.row));
    }),
  );

  return router;
}
