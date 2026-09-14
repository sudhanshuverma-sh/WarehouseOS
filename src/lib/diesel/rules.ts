/**
 * Diesel procurement rules — the numbered rules of the procurement spec.
 *
 * Shared by the browser (instant feedback on the form) and the API (the
 * decision). Before this, they lived only inside AppContext, so anything
 * that reached storage by another route skipped them. Postgres enforces
 * the invariants that must never break (who may approve, POD before
 * validation); these are the rules about what a sensible request is.
 */

export type ProcurementType = 'Delivery Only' | 'Payment Only';
export type DeliveryValidation = 'Delivered' | 'Partial Delivered' | 'Not Delivered';
export type DeliveryStatus = 'Delivery Completed' | 'Partial Delivery' | 'Not Delivered';

export const PROCUREMENT_TYPES: readonly ProcurementType[] = ['Delivery Only', 'Payment Only'];
export const FUELS = ['Diesel', 'DEF'] as const;

export interface DieselRequestInput {
  type?: string;
  fuel?: string;
  vendorNamePayment?: string;
  vendorNameDelivery?: string;
  quantity?: unknown;
  orderQuantityLitres?: unknown;
  ratePerLitre?: unknown;
}

const positive = (v: unknown) => Number(v) > 0 && Number.isFinite(Number(v));

/** The first problem with a new request (rules #7–#17), or null. */
export function dieselRequestError(d: DieselRequestInput): string | null {
  if (!d.type) return 'Please select procurement type.';
  if (!PROCUREMENT_TYPES.includes(d.type as ProcurementType)) return 'Procurement type must be Delivery Only or Payment Only.';
  if (d.fuel && !(FUELS as readonly string[]).includes(d.fuel)) return 'Fuel must be Diesel or DEF.';
  if (d.type === 'Payment Only' && !d.vendorNamePayment?.trim()) return 'Please select a payment vendor.';
  if (d.type === 'Delivery Only' && !d.vendorNameDelivery?.trim()) return 'Please select a delivery vendor.';
  if (d.type === 'Delivery Only' && !positive(d.orderQuantityLitres)) return 'Please enter the order quantity.';
  if (!positive(d.quantity) || !positive(d.ratePerLitre)) return 'Please enter a valid quantity/rate.';
  return null;
}

/** The vendor for this request's type. */
export const vendorFor = (d: DieselRequestInput): string =>
  (d.type === 'Payment Only' ? d.vendorNamePayment : d.vendorNameDelivery)?.trim() ?? '';

/** Quantity × rate, to the paisa. System-calculated — never taken from the form. */
export const dieselFinalAmount = (quantity: unknown, ratePerLitre: unknown): number =>
  Math.round(Number(quantity) * Number(ratePerLitre) * 100) / 100;

/**
 * Where approval sends a request. Each type has its own track, and the two
 * never mix (rule #27) — db/services.sql refuses a crossed track too.
 */
export const approvedStatusFor = (type: ProcurementType): 'Ready for Delivery' | 'Payment Processing' =>
  type === 'Delivery Only' ? 'Ready for Delivery' : 'Payment Processing';

/**
 * What a delivery amounted to (rule #18). Delivered quantity is capped at
 * what was ordered — there is no over-delivery override yet — and partial
 * delivery is a normal outcome, not an error.
 */
export function deliveryOutcome(
  orderedLitres: number,
  deliveredLitres: number,
): { deliveredLitres: number; validation: DeliveryValidation; status: DeliveryStatus } {
  const delivered = Math.min(Math.max(Number(deliveredLitres) || 0, 0), orderedLitres);
  const validation: DeliveryValidation =
    delivered === 0 ? 'Not Delivered' : delivered >= orderedLitres ? 'Delivered' : 'Partial Delivered';
  const status: DeliveryStatus =
    validation === 'Delivered' ? 'Delivery Completed' : validation === 'Partial Delivered' ? 'Partial Delivery' : 'Not Delivered';
  return { deliveredLitres: delivered, validation, status };
}

/** Why this delivery cannot be validated yet (rules #18, #30), or null. */
export function deliveryValidationError(
  request: { type: string; status: string },
  input: { deliveredQuantityLitres?: unknown; hasPod: boolean },
): string | null {
  if (request.type !== 'Delivery Only') return 'Only Delivery Only requisitions go through delivery validation.';
  if (request.status !== 'Ready for Delivery') {
    return `This request is ${request.status} — only an approved delivery waiting at the site can be validated.`;
  }
  const qty = Number(input.deliveredQuantityLitres);
  if (input.deliveredQuantityLitres === undefined || !Number.isFinite(qty) || qty < 0) {
    return 'Please enter the delivered quantity.';
  }
  if (!input.hasPod) return 'Please upload POD before completing the delivery validation.';
  return null;
}
