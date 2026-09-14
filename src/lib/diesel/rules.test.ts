import { describe, expect, it } from 'vitest';
import {
  approvedStatusFor,
  deliveryOutcome,
  deliveryValidationError,
  dieselFinalAmount,
  dieselRequestError,
  vendorFor,
} from './rules';

const payment = { type: 'Payment Only', vendorNamePayment: 'IOCL', quantity: 200, ratePerLitre: 89.5 };
const delivery = { type: 'Delivery Only', vendorNameDelivery: 'Fuel Buddy', quantity: 500, orderQuantityLitres: 500, ratePerLitre: 90 };

describe('dieselRequestError', () => {
  it('accepts complete requests of both types', () => {
    expect(dieselRequestError(payment)).toBeNull();
    expect(dieselRequestError(delivery)).toBeNull();
  });

  it('reports the first missing piece, in the form’s order', () => {
    expect(dieselRequestError({})).toBe('Please select procurement type.');
    expect(dieselRequestError({ ...payment, vendorNamePayment: ' ' })).toBe('Please select a payment vendor.');
    expect(dieselRequestError({ ...delivery, vendorNameDelivery: undefined })).toBe('Please select a delivery vendor.');
    expect(dieselRequestError({ ...delivery, orderQuantityLitres: 0 })).toBe('Please enter the order quantity.');
    expect(dieselRequestError({ ...payment, ratePerLitre: 'abc' })).toBe('Please enter a valid quantity/rate.');
  });

  it('refuses unknown types and fuels', () => {
    expect(dieselRequestError({ ...payment, type: 'Both' })).toMatch(/Delivery Only or Payment Only/);
    expect(dieselRequestError({ ...payment, fuel: 'Petrol' })).toBe('Fuel must be Diesel or DEF.');
  });
});

describe('amounts and tracks', () => {
  it('calculates to the paisa', () => {
    expect(dieselFinalAmount(200, 89.5)).toBe(17900);
    expect(dieselFinalAmount('3', '33.333')).toBe(100);
  });

  it('picks the vendor for the type', () => {
    expect(vendorFor(payment)).toBe('IOCL');
    expect(vendorFor({ ...delivery, vendorNamePayment: 'wrong one' })).toBe('Fuel Buddy');
  });

  it('routes approval onto the type’s own track', () => {
    expect(approvedStatusFor('Delivery Only')).toBe('Ready for Delivery');
    expect(approvedStatusFor('Payment Only')).toBe('Payment Processing');
  });
});

describe('deliveryOutcome', () => {
  it('derives validation and status from the quantity', () => {
    expect(deliveryOutcome(500, 500)).toEqual({ deliveredLitres: 500, validation: 'Delivered', status: 'Delivery Completed' });
    expect(deliveryOutcome(500, 320)).toEqual({ deliveredLitres: 320, validation: 'Partial Delivered', status: 'Partial Delivery' });
    expect(deliveryOutcome(500, 0)).toEqual({ deliveredLitres: 0, validation: 'Not Delivered', status: 'Not Delivered' });
  });

  it('caps over-delivery at the order and floors negatives at zero', () => {
    expect(deliveryOutcome(500, 650).deliveredLitres).toBe(500);
    expect(deliveryOutcome(500, -5).validation).toBe('Not Delivered');
  });
});

describe('deliveryValidationError', () => {
  const ready = { type: 'Delivery Only', status: 'Ready for Delivery' };

  it('allows an approved delivery with a POD', () => {
    expect(deliveryValidationError(ready, { deliveredQuantityLitres: 400, hasPod: true })).toBeNull();
  });

  it('refuses payment requests, unapproved requests, a missing quantity and a missing POD', () => {
    expect(deliveryValidationError({ ...ready, type: 'Payment Only' }, { deliveredQuantityLitres: 1, hasPod: true })).toMatch(
      /Only Delivery Only/,
    );
    expect(
      deliveryValidationError({ ...ready, status: 'Pending Admin Approval' }, { deliveredQuantityLitres: 1, hasPod: true }),
    ).toMatch(/Pending Admin Approval/);
    expect(deliveryValidationError(ready, { hasPod: true })).toBe('Please enter the delivered quantity.');
    expect(deliveryValidationError(ready, { deliveredQuantityLitres: 10, hasPod: false })).toMatch(/upload POD/);
  });
});
