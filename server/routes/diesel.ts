/**
 * Diesel procurement: request → approve/reject → (delivery) validate.
 *
 * The rules about what a sensible request is run here, from the same
 * module the form uses (src/lib/diesel/rules.ts). The rules that must
 * never break — who may decide, no self-approval, POD before validation,
 * one track per type — are enforced by db/services.sql, so they hold even
 * for a request that never passes through this file.
 *
 * Amounts, request IDs, approvers and timestamps are never taken from the
 * body. They are computed or stamped.
 */

import { Router } from 'express';
import type { Queryable } from '../db';
import { handle, HttpError } from '../http';
import {
  approvedStatusFor,
  deliveryOutcome,
  deliveryValidationError,
  dieselFinalAmount,
  dieselRequestError,
  vendorFor,
  type ProcurementType,
} from '../../src/lib/diesel/rules';
import {
  extrasFor,
  iso,
  isPlainObject,
  limitFrom,
  num,
  optionalDate,
  optionalText,
  queryText,
  queueSheetCopy,
  requireAttachment,
  requiredText,
  runAs,
  type RouteDeps,
} from './common';

type Row = Record<string, any>;

const attachmentUrl = (id: unknown) => (id ? `/api/attachments/${id}` : undefined);

/** A database row in the shape of the app's DieselLog. */
export function toDieselLog(r: Row) {
  const hasPod = Boolean(r.pod_attachment_id);
  return {
    // Extra questions first: the request's own fields below win any clash.
    ...((r.extras ?? {}) as Row),
    id: r.request_id,
    uniqueId: r.request_id,
    timestamp: iso(r.requested_at),
    emailAddress: r.requester_email,
    entity: r.entity ?? undefined,
    whNameB2B: r.wh_name_b2b ?? undefined,
    whNameB2C: r.wh_name_b2c ?? undefined,
    costCenter: r.cost_center ?? undefined,
    zone: r.zone ?? undefined,
    warehouseId: r.site_code,
    siteCode: r.site_code,
    submittedById: r.requester_email,
    submittedByName: r.requester_name ?? r.requester_email,
    fuel: r.fuel,
    type: r.procurement_type,
    vendorNamePayment: r.procurement_type === 'Payment Only' ? r.vendor_name : undefined,
    vendorNameDelivery: r.procurement_type === 'Delivery Only' ? r.vendor_name : undefined,
    quantity: num(r.quantity),
    orderQuantityLitres: num(r.order_quantity_litres),
    deliveredQuantityLitres: num(r.delivered_quantity_litres),
    ratePerLitre: num(r.rate_per_litre),
    finalAmount: num(r.final_amount),
    qrAttachmentId: r.qr_attachment_id ?? undefined,
    qrCodeImageUrl: attachmentUrl(r.qr_attachment_id),
    podAttachmentId: r.pod_attachment_id ?? undefined,
    podUrl: attachmentUrl(r.pod_attachment_id),
    podTimestamp: hasPod ? iso(r.validated_at) : undefined,
    podUploadedByName: hasPod ? r.validated_by ?? undefined : undefined,
    status: r.status,
    validation: r.validation ?? undefined,
    notes: r.notes ?? undefined,
    rejectionReason: r.rejection_reason ?? undefined,
    adminApprovalNotes: r.approval_notes ?? r.rejection_reason ?? undefined,
    adminApprovedBy: r.approved_by ?? undefined,
    adminApprovedAt: iso(r.approved_at),
    validatedByName: r.validated_by ?? undefined,
    validatedAt: iso(r.validated_at),
  };
}

async function loadForUpdate(c: Queryable, id: string): Promise<Row> {
  // `for update` holds the row, so two admins deciding at the same moment
  // queue behind each other instead of both reading "pending".
  const { rows } = await c.query('select * from diesel_request where request_id = $1 for update', [id]);
  if (!rows[0]) throw new HttpError(404, `Request ${id} was not found.`, 'NOT_FOUND');
  return rows[0];
}

export function dieselRoutes(deps: RouteDeps): Router {
  const router = Router();
  const run = runAs(deps);

  router.get(
    '/diesel',
    handle(async (req, res) => {
      const from = optionalDate(req.query.from, 'from');
      const to = optionalDate(req.query.to, 'to');
      const rows = await run(req, async (c) =>
        (
          await c.query(
            `select * from diesel_request
              where ($1::text is null or site_code = $1)
                and ($2::text is null or status = $2)
                and ($3::date is null or (requested_at at time zone 'Asia/Kolkata')::date >= $3::date)
                and ($4::date is null or (requested_at at time zone 'Asia/Kolkata')::date <= $4::date)
              order by requested_at desc
              limit $5`,
            [queryText(req.query.site), queryText(req.query.status), from, to, limitFrom(req.query.limit)],
          )
        ).rows,
      );
      res.json(rows.map(toDieselLog));
    }),
  );

  router.get(
    '/diesel/:id/events',
    handle(async (req, res) => {
      const rows = await run(req, async (c) =>
        (
          await c.query(
            'select event_id, action, actor_email, at, details from diesel_event where request_id = $1 order by event_id',
            [req.params.id],
          )
        ).rows,
      );
      res.json(
        rows.map((e) => ({
          id: String(e.event_id),
          logId: req.params.id,
          uniqueId: req.params.id,
          action: e.action,
          performedByEmail: e.actor_email,
          performedByName: e.actor_email,
          timestamp: iso(e.at),
          details: e.details ?? undefined,
        })),
      );
    }),
  );

  router.post(
    '/diesel',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      const problem = dieselRequestError(b);
      if (problem) throw new HttpError(400, problem);
      const siteCode = requiredText(b.siteCode, 'Choose the site this request is for.');
      const type = b.type as ProcurementType;
      const isDelivery = type === 'Delivery Only';

      const saved = await run(req, async (c) => {
        const qr = await requireAttachment(c, b.qrAttachmentId, 'DIESEL', siteCode, 'The QR code / invoice image');
        const { rows } = await c.query(
          `insert into diesel_request
             (site_code, requester_name, entity, wh_name_b2b, wh_name_b2c, cost_center, zone,
              fuel, procurement_type, vendor_name, quantity, order_quantity_litres, rate_per_litre,
              final_amount, qr_attachment_id, notes, validation, extras)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
           returning *`,
          [
            siteCode,
            optionalText(b.requesterName),
            optionalText(b.entity),
            optionalText(b.whNameB2B),
            optionalText(b.whNameB2C),
            optionalText(b.costCenter),
            optionalText(b.zone),
            optionalText(b.fuel) ?? 'Diesel',
            type,
            vendorFor(b),
            Number(b.quantity),
            isDelivery ? Number(b.orderQuantityLitres) : null,
            Number(b.ratePerLitre),
            dieselFinalAmount(b.quantity, b.ratePerLitre),
            qr,
            optionalText(b.notes),
            isDelivery ? 'Pending Validation' : null,
            await extrasFor(c, 'DIESEL', b.extras, siteCode),
          ],
        );
        await queueSheetCopy(c, 'DIESEL', { event: 'CREATED', record: toDieselLog(rows[0]) });
        return rows[0];
      });

      res.status(201).json(toDieselLog(saved));
    }),
  );

  router.post(
    '/diesel/:id/approve',
    handle(async (req, res) => {
      const notes = optionalText(isPlainObject(req.body) ? req.body.notes : undefined);
      const saved = await run(req, async (c) => {
        const current = await loadForUpdate(c, req.params.id);
        if (current.status !== 'Pending Admin Approval') {
          throw new HttpError(409, `[${current.request_id}] is already ${current.status}.`, 'NOT_PENDING');
        }
        const { rows } = await c.query(
          'update diesel_request set status = $2, approval_notes = $3 where request_id = $1 returning *',
          [current.request_id, approvedStatusFor(current.procurement_type), notes],
        );
        await queueSheetCopy(c, 'DIESEL', { event: 'APPROVED', record: toDieselLog(rows[0]) });
        return rows[0];
      });
      res.json(toDieselLog(saved));
    }),
  );

  router.post(
    '/diesel/:id/reject',
    handle(async (req, res) => {
      const reason = optionalText(isPlainObject(req.body) ? req.body.reason : undefined);
      if (!reason) throw new HttpError(400, 'Please enter a rejection reason.');
      const saved = await run(req, async (c) => {
        const current = await loadForUpdate(c, req.params.id);
        if (current.status !== 'Pending Admin Approval') {
          throw new HttpError(409, `[${current.request_id}] is already ${current.status}.`, 'NOT_PENDING');
        }
        const { rows } = await c.query(
          `update diesel_request set status = 'Rejected', rejection_reason = $2 where request_id = $1 returning *`,
          [current.request_id, reason],
        );
        await queueSheetCopy(c, 'DIESEL', { event: 'REJECTED', record: toDieselLog(rows[0]) });
        return rows[0];
      });
      res.json(toDieselLog(saved));
    }),
  );

  router.post(
    '/diesel/:id/validate',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      const saved = await run(req, async (c) => {
        const current = await loadForUpdate(c, req.params.id);
        const problem = deliveryValidationError(
          { type: current.procurement_type, status: current.status },
          { deliveredQuantityLitres: b.deliveredQuantityLitres, hasPod: Boolean(b.podAttachmentId) },
        );
        if (problem) throw new HttpError(400, problem);

        const pod = await requireAttachment(c, b.podAttachmentId, 'DIESEL', current.site_code, 'The POD');
        const outcome = deliveryOutcome(Number(current.order_quantity_litres), Number(b.deliveredQuantityLitres));
        const { rows } = await c.query(
          `update diesel_request
              set status = $2, validation = $3, delivered_quantity_litres = $4,
                  pod_attachment_id = $5, notes = coalesce($6, notes)
            where request_id = $1
           returning *`,
          [current.request_id, outcome.status, outcome.validation, outcome.deliveredLitres, pod, optionalText(b.notes)],
        );
        await queueSheetCopy(c, 'DIESEL', { event: 'VALIDATED', record: toDieselLog(rows[0]) });
        return rows[0];
      });
      res.json(toDieselLog(saved));
    }),
  );

  // --------------------------------------------------------------- vendors
  const toVendor = (r: Row) => ({
    id: String(r.vendor_id),
    name: r.name,
    vendorType: r.vendor_type,
    email: r.email ?? undefined,
    isActive: r.is_active,
  });

  const VENDOR_TYPES = ['Payment', 'Delivery', 'Both'];

  router.get(
    '/vendors',
    handle(async (req, res) => {
      const rows = await run(req, async (c) => (await c.query('select * from vendor order by name')).rows);
      res.json(rows.map(toVendor));
    }),
  );

  router.post(
    '/vendors',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      const name = requiredText(b.name, 'Vendor name is required.');
      if (!VENDOR_TYPES.includes(String(b.vendorType))) throw new HttpError(400, 'Vendor type must be Payment, Delivery or Both.');
      const saved = await run(req, async (c) =>
        (
          await c.query('insert into vendor (name, vendor_type, email) values ($1, $2, $3) returning *', [
            name,
            b.vendorType,
            optionalText(b.email),
          ])
        ).rows[0],
      );
      res.status(201).json(toVendor(saved));
    }),
  );

  router.patch(
    '/vendors/:id',
    handle(async (req, res) => {
      const b = isPlainObject(req.body) ? req.body : {};
      if (b.vendorType !== undefined && !VENDOR_TYPES.includes(String(b.vendorType))) {
        throw new HttpError(400, 'Vendor type must be Payment, Delivery or Both.');
      }
      if (b.isActive !== undefined && typeof b.isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false.');
      const saved = await run(req, async (c) => {
        const { rows } = await c.query(
          `update vendor set name = coalesce($2, name), vendor_type = coalesce($3, vendor_type),
                             email = coalesce($4, email), is_active = coalesce($5, is_active)
            where vendor_id = $1 returning *`,
          [req.params.id, optionalText(b.name), b.vendorType ?? null, optionalText(b.email), b.isActive ?? null],
        );
        if (!rows[0]) throw new HttpError(404, 'Vendor not found.', 'NOT_FOUND');
        return rows[0];
      });
      res.json(toVendor(saved));
    }),
  );

  return router;
}
