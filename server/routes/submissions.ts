/**
 * Every other service — Housekeeping, Washing, Cold Room, RT, BOPT and
 * whatever is added next. A service is a row in service_registry, its
 * columns are service_form.fields, and its entries are service_submission
 * rows. Nothing here is specific to any one service, which is what lets a
 * new service go live without a code change.
 */

import { Router } from 'express';
import { handle, HttpError } from '../http';
import type { FieldDefinition, FieldType } from '../../src/types';
import { validateSubmissionData } from '../../src/lib/services/validateSubmission';
import {
  iso,
  isPlainObject,
  limitFrom,
  numericId,
  optionalDate,
  optionalText,
  queryText,
  queueSheetCopy,
  requireAttachment,
  requiredDate,
  requiredText,
  runAs,
  type RouteDeps,
} from './common';

type Row = Record<string, any>;

/** Services with their own tables and endpoints. */
const DEDICATED: Record<string, string> = {
  DIESEL: '/api/diesel',
  EB_DG: '/api/ebdg/submit',
  SITE_ACTIVITY: '/api/daily-site',
  FIRE: '/api/fire-pump',
};

const SHIFTS = ['MORNING', 'EVENING', 'NIGHT'];
const REVIEW_STATUSES = ['Verified', 'Flagged', 'Approved', 'Rejected'];
const FIELD_TYPES = [
  'text', 'number', 'percentage', 'boolean', 'select', 'temperature', 'textarea', 'time', 'date', 'evidence',
] as const satisfies readonly FieldType[];
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SERVICE_CODE = /^[A-Z][A-Z0-9_]*$/;

function serviceCode(raw: unknown): string {
  const code = String(raw ?? '').toUpperCase();
  if (!SERVICE_CODE.test(code)) throw new HttpError(400, 'Service code must be capitals, digits and underscores.');
  return code;
}

/** A database row in the shape of the app's SheetRowRecord. */
export const toSubmission = (r: Row) => ({
  id: String(r.submission_id),
  serviceCode: r.service_code,
  warehouseId: r.site_code,
  siteCode: r.site_code,
  date: r.entry_date,
  shift: r.shift ?? undefined,
  status: r.status,
  data: r.data ?? {},
  remarks: r.remarks ?? undefined,
  submittedBy: r.submitted_by,
  submittedByName: r.submitted_by_name ?? r.submitted_by,
  submittedAt: iso(r.submitted_at),
  reviewedBy: r.reviewed_by ?? undefined,
  reviewedAt: iso(r.reviewed_at),
  reviewNotes: r.review_notes ?? undefined,
});

/** Checks a form definition and keeps only the properties a field has. */
export function cleanFormFields(input: unknown): FieldDefinition[] {
  if (!Array.isArray(input)) throw new HttpError(400, 'fields must be a list.');
  const seen = new Set<string>();

  return input.map((f, i) => {
    const where = `Field ${i + 1}`;
    if (!isPlainObject(f)) throw new HttpError(400, `${where} must be an object.`);
    const key = String(f.key ?? '');
    if (!FIELD_KEY.test(key)) throw new HttpError(400, `${where}: key must start with a letter and use letters, digits or _.`);
    if (seen.has(key)) throw new HttpError(400, `${where}: key '${key}' is used twice.`);
    seen.add(key);
    const label = optionalText(f.label);
    if (!label) throw new HttpError(400, `${where}: label is required.`);
    if (!(FIELD_TYPES as readonly string[]).includes(String(f.type))) {
      throw new HttpError(400, `${where}: type must be one of ${FIELD_TYPES.join(', ')}.`);
    }
    const options = Array.isArray(f.options) ? f.options.map(String).filter(Boolean) : undefined;
    if (f.type === 'select' && !options?.length) throw new HttpError(400, `${where}: a select field needs options.`);
    const numberOrUndefined = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

    return {
      key,
      label,
      type: f.type as FieldType,
      required: f.required === true,
      unit: optionalText(f.unit) ?? undefined,
      options,
      helperText: optionalText(f.helperText) ?? undefined,
      min: numberOrUndefined(f.min),
      max: numberOrUndefined(f.max),
      defaultValue: f.defaultValue,
      isCritical: f.isCritical === true || undefined,
      // Which questions were added to a service that has its own screen. Drop
      // this and every extra becomes invisible after a save — and worse, the
      // service's own columns start being asked for as if they were questions.
      isExtra: f.isExtra === true || undefined,
    };
  });
}

export function submissionRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  router.get(
    '/services/:code/form',
    handle(async (req, res) => {
      const code = serviceCode(req.params.code);
      const row = await run(req, async (c) =>
        (await c.query('select fields, last_updated_at from service_form where service_code = $1', [code])).rows[0],
      );
      res.json({ serviceCode: code, fields: row?.fields ?? [], updatedAt: iso(row?.last_updated_at) });
    }),
  );

  router.put(
    '/services/:code/form',
    handle(async (req, res) => {
      const code = serviceCode(req.params.code);
      const fields = cleanFormFields(isPlainObject(req.body) ? req.body.fields : undefined);
      // RLS lets only a Super Admin write service_form; anyone else gets a 403.
      const row = await run(req, async (c) =>
        (
          await c.query(
            `insert into service_form (service_code, fields) values ($1, $2::jsonb)
             on conflict (service_code) do update set fields = excluded.fields
             returning fields, last_updated_at`,
            [code, JSON.stringify(fields)],
          )
        ).rows[0],
      );
      res.json({ serviceCode: code, fields: row.fields, updatedAt: iso(row.last_updated_at) });
    }),
  );

  router.get(
    '/services/:code/submissions',
    handle(async (req, res) => {
      const code = serviceCode(req.params.code);
      const from = optionalDate(req.query.from, 'from');
      const to = optionalDate(req.query.to, 'to');
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select * from service_submission
              where service_code = $1
                and ($2::text is null or site_code = $2)
                and ($3::date is null or entry_date >= $3)
                and ($4::date is null or entry_date <= $4)
                and ($5::text is null or status = $5)
              order by entry_date desc, submitted_at desc
              limit $6`,
            [code, queryText(req.query.site), from, to, queryText(req.query.status), limitFrom(req.query.limit)],
          )
        ).rows,
      );
      res.json(rows.map(toSubmission));
    }),
  );

  router.post(
    '/services/:code/submissions',
    handle(async (req, res) => {
      const code = serviceCode(req.params.code);
      if (DEDICATED[code]) throw new HttpError(400, `${code} has its own form — send it to ${DEDICATED[code]}.`);

      const b = isPlainObject(req.body) ? req.body : {};
      const siteCode = requiredText(b.siteCode, 'Choose the site.');
      const date = requiredDate(b.date, 'Choose the date.');
      const shift = optionalText(b.shift);
      if (shift && !SHIFTS.includes(shift)) throw new HttpError(400, `Shift must be ${SHIFTS.join(', ')}.`);
      if (!isPlainObject(b.data)) throw new HttpError(400, 'data must be an object of field values.');
      const data = b.data;

      const saved = await run(req, async (c) => {
        const { rows: found } = await c.query(
          `select s.needs_approval, s.is_active, f.fields
             from service_registry s left join service_form f on f.service_code = s.service_code
            where s.service_code = $1`,
          [code],
        );
        const service = found[0];
        if (!service) throw new HttpError(404, `There is no service ${code}.`, 'NOT_FOUND');
        if (!service.is_active) throw new HttpError(400, `${code} is switched off in the Service Registry.`);

        const fields: FieldDefinition[] = service.fields ?? [];
        const errors = validateSubmissionData(fields, data);
        if (errors.length) throw new HttpError(400, errors[0].message, 'VALIDATION', errors);

        for (const f of fields) {
          if (f.type === 'evidence') await requireAttachment(c, data[f.key], code, siteCode, f.label);
        }

        const { rows } = await c.query(
          `insert into service_submission
             (service_code, site_code, entry_date, shift, status, data, remarks, submitted_by_name)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           returning *`,
          [
            code,
            siteCode,
            date,
            shift,
            service.needs_approval ? 'Pending' : 'Submitted',
            JSON.stringify(data),
            optionalText(b.remarks),
            optionalText(b.submittedByName),
          ],
        );
        await queueSheetCopy(c, code, { event: 'CREATED', record: toSubmission(rows[0]) });
        return rows[0];
      });

      res.status(201).json(toSubmission(saved));
    }),
  );

  router.post(
    '/services/:code/submissions/:id/review',
    handle(async (req, res) => {
      const code = serviceCode(req.params.code);
      const id = numericId(req.params.id, 'Entry');
      const b = isPlainObject(req.body) ? req.body : {};
      const status = String(b.status ?? '');
      if (!REVIEW_STATUSES.includes(status)) throw new HttpError(400, `Status must be ${REVIEW_STATUSES.join(', ')}.`);
      const notes = optionalText(b.notes);
      if ((status === 'Rejected' || status === 'Flagged') && !notes) {
        throw new HttpError(400, 'Add a note saying why — it is required when flagging or rejecting.');
      }

      // The database decides who may review (admins only, never their own).
      const saved = await run(req, async (c) => {
        const { rows } = await c.query(
          `update service_submission set status = $1, review_notes = $2
            where submission_id = $3 and service_code = $4
           returning *`,
          [status, notes, id, code],
        );
        if (!rows[0]) throw new HttpError(404, 'Entry not found.', 'NOT_FOUND');
        await queueSheetCopy(c, code, { event: 'REVIEWED', record: toSubmission(rows[0]) });
        return rows[0];
      });
      res.json(toSubmission(saved));
    }),
  );

  return router;
}
