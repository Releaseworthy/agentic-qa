---
id: TC-COUP-003
type: test-case
title: An expired coupon is refused
feature: FEAT-COUPON
covers: [BR-COUP-03]
priority: medium
status: ready
automated_by: tests/ui/cart.spec.ts › Cart › an expired coupon is refused
setup: { recipe: cart, priceCents: 4000, stock: 10, quantity: 1 }
---

# TC-COUP-003: An expired coupon is refused

## Preconditions

- A signed-in customer with a $40.00 product in the cart: `bun run qa:arrange --case TC-COUP-003 --name <session>`.

## Steps

| # | Action                                   | Expected result                                   |
| - | ---------------------------------------- | ------------------------------------------------- |
| 1 | Open **Cart**, Coupon code `SUMMER20`, **Apply coupon** | Alert "This coupon has expired"; Discount -$0.00 |

## Expected overall result

`SUMMER20` is seeded expired and never applies ([[BR-COUP-03]]).
