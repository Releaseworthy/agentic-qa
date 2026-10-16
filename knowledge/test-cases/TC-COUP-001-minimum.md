---
id: TC-COUP-001
type: test-case
title: A coupon below its minimum subtotal is refused with the minimum
feature: FEAT-COUPON
covers: [BR-COUP-02]
priority: medium
status: ready
automated_by: none
---

# TC-COUP-001 — A coupon below its minimum subtotal is refused with the minimum

## Preconditions

- A signed-in customer with one product at $19.99 (stock 10) in the cart, quantity 1:
  `bun run seed:session --name <session> --product 1999:10 --cart 1`.

## Steps

| # | Action                                          | Expected result                                                  |
| - | ----------------------------------------------- | ---------------------------------------------------------------- |
| 1 | Open **Cart**                                   | Subtotal $19.99, Discount -$0.00                                 |
| 2 | Coupon code `WELCOME10`, **Apply coupon**       | Alert "This coupon needs a subtotal of at least $20.00"; Discount -$0.00 |
| 3 | Set the quantity to `2`, leave the field        | Subtotal $39.98                                                  |
| 4 | Coupon code `WELCOME10`, **Apply coupon**       | "Coupon WELCOME10 applied"; Discount -$4.00                      |

## Expected overall result

$19.99 is under the $20.00 minimum and refused; at $39.98 the coupon applies ([[BR-COUP-02]]).
