import { defect } from '../defects';
import type { Coupon } from '../store';
import { discountFor } from './coupons';

/** BR-SHIP-01: orders of $50.00 or more (after discount) ship free; below that, $4.99. */
export const FREE_SHIPPING_FROM_CENTS = 5000;
export const SHIPPING_FEE_CENTS = 499;

export type PricedLine = { unitPriceCents: number; quantity: number };

export type Totals = { subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number };

export function shippingFor(discountedCents: number, hasItems: boolean): number {
  if (!hasItems) return 0;
  const free = defect('free-shipping-boundary')
    ? discountedCents > FREE_SHIPPING_FROM_CENTS
    : discountedCents >= FREE_SHIPPING_FROM_CENTS;
  return free ? 0 : SHIPPING_FEE_CENTS;
}

export function priceLines(lines: PricedLine[], coupon: Coupon | null): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountCents = coupon ? discountFor(coupon, subtotalCents) : 0;
  const shippingCents = shippingFor(subtotalCents - discountCents, lines.length > 0);
  return { subtotalCents, discountCents, shippingCents, totalCents: subtotalCents - discountCents + shippingCents };
}
