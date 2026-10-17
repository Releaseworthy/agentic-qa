---
id: FEAT-COUPON
type: feature
title: Coupons
criticality: 3
code: [app/domain/coupons.ts, app/domain/cart.ts, app/domain/pricing.ts, app/routes/cart.ts]
endpoints: [POST /api/cart/coupon, DELETE /api/cart/coupon, POST /api/admin/coupons]
pages: ['#/cart']
rules: [BR-COUP-01, BR-COUP-02, BR-COUP-03, BR-COUP-04]
depends_on: [FEAT-CART]
---

# Coupons

A customer types a code in the cart; the discount shows in the totals and is
charged at checkout.

## Seeded coupons

| Code         | Kind    | Value | Minimum subtotal | Cap  | Expiry          |
| ------------ | ------- | ----- | ---------------- | ---- | --------------- |
| `WELCOME10`  | percent | 10 %  | $20.00           | none | none            |
| `SAVE5`      | fixed   | $5.00 | $30.00           | none | none            |
| `BIGSPENDER` | percent | 15 %  | $100.00          | $30  | none            |
| `SUMMER20`   | percent | 20 %  | none             | none | expired         |

Admins create more with `POST /api/admin/coupons`; tests make their own with
unique codes.

## Behaviour

- Codes are case-insensitive (`welcome10` works) and stored upper-case.
- Unknown code → `404 COUPON_NOT_FOUND`; expired → `410 COUPON_EXPIRED` ([[BR-COUP-03]]);
  below minimum → `422 COUPON_MIN_NOT_MET` ([[BR-COUP-02]]).
- One coupon per cart ([[BR-COUP-01]]); the discount is capped ([[BR-COUP-04]]).
- Discount applies before shipping, so a coupon can make an order lose free
  shipping ([[BR-SHIP-01]]).
