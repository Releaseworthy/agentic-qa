import { defect } from '../defects';
import { HttpError } from '../http';
import { store, type Coupon } from '../store';

export function findCoupon(code: string): Coupon {
  const coupon = store.coupons.get(code.trim().toUpperCase());
  if (!coupon) throw new HttpError(404, 'COUPON_NOT_FOUND', 'This coupon code does not exist');
  return coupon;
}

/**
 * Throws when `coupon` cannot apply to `subtotalCents`:
 * BR-COUP-03 (expired), BR-COUP-02 (minimum subtotal).
 */
export function checkCoupon(coupon: Coupon, subtotalCents: number, now = Date.now()): void {
  if (coupon.expiresAt !== null && coupon.expiresAt <= now)
    throw new HttpError(410, 'COUPON_EXPIRED', 'This coupon has expired');
  if (subtotalCents < coupon.minSubtotalCents)
    throw new HttpError(
      422,
      'COUPON_MIN_NOT_MET',
      `This coupon needs a subtotal of at least $${(coupon.minSubtotalCents / 100).toFixed(2)}`,
    );
}

/** Discount in cents. BR-COUP-04: a percent coupon never exceeds its cap; no coupon exceeds the subtotal. */
export function discountFor(coupon: Coupon, subtotalCents: number): number {
  const raw = coupon.kind === 'percent' ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
  const capped =
    coupon.maxDiscountCents !== null && !defect('coupon-cap') ? Math.min(raw, coupon.maxDiscountCents) : raw;
  return Math.min(capped, subtotalCents);
}

export function createCoupon(input: Coupon): Coupon {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new HttpError(400, 'VALIDATION', 'Code is 3-20 letters or digits');
  if (input.kind === 'percent' && (input.value < 1 || input.value > 100))
    throw new HttpError(400, 'VALIDATION', 'Percent must be 1-100');
  if (input.kind === 'fixed' && input.value <= 0) throw new HttpError(400, 'VALIDATION', 'Amount must be positive');
  if (store.coupons.has(code)) throw new HttpError(409, 'COUPON_EXISTS', 'Coupon code already exists');
  const coupon = { ...input, code };
  store.coupons.set(code, coupon);
  return coupon;
}
