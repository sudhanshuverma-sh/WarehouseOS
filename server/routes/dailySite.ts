/**
 * Daily Site Activity Report — one per site per day, plus its list of
 * ongoing activities.
 *
 * The health result (worst status, deviation count) is computed here from
 * the readings, never taken from the body. One report per site per day is
 * a unique constraint, so the duplicate check holds across every POC and
 * device, not just within one browser.
 */

import { Router } from 'express';
import type { Queryable } from '../db';
import { handle, HttpError } from '../http';
import {
  dailySiteValueErrors,
  MHE_KEYS,
  ROUTINE_KEYS,
  scoreDailySite,
  UTILITY_KEYS,
} from '../../src/lib/dailySite/scoring';
import {
  extrasFor,
  iso,
  isPlainObject,
  limitFrom,
  num,
  numericId,
  optionalDate,
  optionalText,
  queryText,
  queueSheetCopy,
  requiredDate,
  requiredText,
  runAs,
  type RouteDeps,
} from './common';

type Row = Record<string, any>;

const PERCENT_KEYS = [...UTILITY_KEYS, ...MHE_KEYS];
const ALL_KEYS = [...PERCENT_KEYS, ...ROUTINE_KEYS];
const ACTIVITY_STATUSES = ['Open', 'In Progress', 'Completed', 'Blocked'];

const SELECT_LOGS = `
  select l.*,
         coalesce((select json_agg(a order by a.sr_no) from daily_site_activity a where a.log_id = l.log_id),
                  '[]'::json) as activities
    from daily_site_log l`;

/** Only the readings the report defines — anything else in the body is dropped. */
function pickReadings(values: Record<string, unknown>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const { key } of PERCENT_KEYS) {
    const v = values[key];
    if (v !== undefined && v !== null && v !== '') out[key] = Number(v);
  }
  for (const { key } of ROUTINE_KEYS) {
    const v = values[key];
    if (v !== undefined && v !== null && v !== '') out[key] = String(v);
  }
  return out;
}

function pickRemarks(remarks: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPlainObject(remarks)) return out;
  for (const { key } of ALL_KEYS) {
    const v = optionalText(remarks[key]);
    if (v) out[key] = v;
  }
  return out;
}

function wholeNumber(v: unknown, label: string): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${label} must be a whole number, 0 or more.`);
  return n;
}

interface ActivityInput {
  work: string;
  owner: string | null;
  status: string;
  eta: string | null;
  barrier: string | null;
  cost: number | null;
  manhours: number | null;
}

function pickActivities(list: unknown): ActivityInput[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => isPlainObject(a) && optionalText(a.work))
    .map((a: Record<string, unknown>, i) => {
      const status = optionalText(a.status) ?? 'Open';
      if (!ACTIVITY_STATUSES.includes(status)) {
        throw new HttpError(400, `Activity ${i + 1}: status must be ${ACTIVITY_STATUSES.join(', ')}.`);
      }
      const amount = (v: unknown, label: string) => {
        if (v === undefined || v === null || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Activity ${i + 1}: ${label} must be 0 or more.`);
        return n;
      };
      return {
        work: optionalText(a.work)!,
        owner: optionalText(a.owner),
        status,
        eta: optionalDate(a.eta, `Activity ${i + 1} ETA`),
        barrier: optionalText(a.barrier),
        cost: amount(a.cost, 'cost'),
        manhours: amount(a.manhours, 'manhours'),
      };
    });
}

/** A database row in the shape of the app's DailySiteLog. */
export function toDailySiteLog(r: Row) {
  const readings: Row = r.readings ?? {};
  const remarks: Row = r.remarks ?? {};
  const log: Record<string, unknown> = {
    // Questions added to this service later, first so that the report's own
    // fields below always win if a key ever collides.
    ...((r.extras ?? {}) as Row),
    logId: String(r.log_id),
    site: r.site_code,
    siteCode: r.site_code,
    date: r.log_date,
    timestamp: iso(r.submitted_at),
    pocName: r.submitted_by_name ?? r.submitted_by,
    pocEmail: r.submitted_by,
    pmPlanned: r.pm_planned,
    pmCompleted: r.pm_completed,
    pmRemark: r.pm_remark ?? undefined,
    highlights: r.highlights ?? undefined,
    worstStatus: r.worst_status,
    deviationsCount: r.deviations_count,
  };
  for (const k of PERCENT_KEYS) {
    log[k.key] = readings[k.key] ?? 100;
    log[k.remarkKey] = remarks[k.key];
  }
  for (const k of ROUTINE_KEYS) {
    log[k.key] = readings[k.key] ?? 'Done';
    log[k.remarkKey] = remarks[k.key];
  }
  log.activities = (r.activities ?? []).map((a: Row) => ({
    rowId: String(a.activity_id),
    logId: String(a.log_id),
    srNo: a.sr_no,
    work: a.work,
    owner: a.owner ?? '',
    status: a.status,
    eta: a.eta ?? '',
    barrier: a.barrier ?? undefined,
    cost: num(a.cost) ?? 0,
    manhours: num(a.manhours) ?? 0,
    overdue: a.eta ? a.eta < r.log_date : false,
  }));
  return log;
}

async function loadLog(c: Queryable, logId: string): Promise<Row | undefined> {
  return (await c.query(`${SELECT_LOGS} where l.log_id = $1`, [logId])).rows[0];
}

export function dailySiteRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  router.get(
    '/daily-site',
    handle(async (req, res) => {
      const from = optionalDate(req.query.from, 'from');
      const to = optionalDate(req.query.to, 'to');
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `${SELECT_LOGS}
              where ($1::text is null or l.site_code = $1)
                and ($2::date is null or l.log_date >= $2)
                and ($3::date is null or l.log_date <= $3)
              order by l.log_date desc, l.site_code
              limit $4`,
            [queryText(req.query.site), from, to, limitFrom(req.query.limit)],
          )
        ).rows,
      );
      res.json(rows.map(toDailySiteLog));
    }),
  );

  router.get(
    '/daily-site/:id',
    handle(async (req, res) => {
      const id = numericId(req.params.id, 'Report');
      const row = await run(req, (c) => loadLog(c, id));
      if (!row) throw new HttpError(404, 'Report not found.', 'NOT_FOUND');
      res.json(toDailySiteLog(row));
    }),
  );

  router.post(
    '/daily-site',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      const siteCode = requiredText(b.site ?? b.siteCode, 'Choose the site.');
      const date = requiredDate(b.date, 'Choose the report date.');
      const values = isPlainObject(b.values) ? b.values : {};

      const valueErrors = dailySiteValueErrors(values);
      if (valueErrors.length) throw new HttpError(400, valueErrors[0], 'VALIDATION', valueErrors);

      const pmPlanned = wholeNumber(b.pmPlanned, 'PM planned');
      const pmCompleted = wholeNumber(b.pmCompleted, 'PM completed');
      const activities = pickActivities(b.activities);
      const score = scoreDailySite(values);

      const saved = await run(req, async (c) => {
        const { rows } = await c.query(
          `insert into daily_site_log
             (site_code, log_date, submitted_by_name, readings, remarks,
              pm_planned, pm_completed, pm_remark, highlights, worst_status, deviations_count, extras)
           values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb)
           returning log_id`,
          [
            siteCode,
            date,
            optionalText(b.pocName),
            JSON.stringify(pickReadings(values)),
            JSON.stringify(pickRemarks(b.remarks)),
            pmPlanned,
            pmCompleted,
            optionalText(b.pmRemark),
            optionalText(b.highlights),
            score.worstStatus,
            score.deviationsCount,
            // Questions added to this service later. Kept apart from
            // `readings` so they can never move the health score.
            await extrasFor(c, 'SITE_ACTIVITY', b.extras),
          ],
        );
        const logId = String(rows[0].log_id);

        for (const [i, a] of activities.entries()) {
          await c.query(
            `insert into daily_site_activity (log_id, sr_no, work, owner, status, eta, barrier, cost, manhours)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [logId, i + 1, a.work, a.owner, a.status, a.eta, a.barrier, a.cost, a.manhours],
          );
        }

        const full = await loadLog(c, logId);
        await queueSheetCopy(c, 'SITE_ACTIVITY', { event: 'CREATED', record: toDailySiteLog(full!) });
        return full!;
      });

      res.status(201).json(toDailySiteLog(saved));
    }),
  );

  return router;
}
