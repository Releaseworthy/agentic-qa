---
id: TC-COUP-002
type: test-case
title: A coupon falls off when the cart drops below its minimum
feature: FEAT-COUPON
covers: [BR-COUP-02]
priority: medium
status: ready
automated_by: none
setup: { recipe: cart, priceCents: 1200, stock: 10, quantity: 2, coupon: WELCOME10 }
---

# TC-COUP-002: A coupon falls off when the cart drops below its minimum

## Preconditions

- A signed-in customer with a $12.00 product × 2 in the cart and `WELCOME10` applied: `bun run qa:arrange --case TC-COUP-002 --name <session>`.

## Steps

| # | Action                                    | Expected result                                                   |
| - | ----------------------------------------- | ----------------------------------------------------------------- |
| 1 | Open **Cart**                             | "Coupon WELCOME10 applied"; Subtotal $24.00, Discount -$2.40      |
| 2 | Set the quantity to `1`, leave the field  | Subtotal $12.00, Discount -$0.00; no "applied" line; no error     |
| 3 | Reload the page                           | Still no coupon; the Coupon code field is empty                   |

## Expected overall result

The minimum is re-checked on every cart change and the coupon is dropped silently ([[BR-COUP-02]]).
