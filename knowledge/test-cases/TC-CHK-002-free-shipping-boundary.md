---
id: TC-CHK-002
type: test-case
title: Shipping is free from exactly $50.00 after the discount
feature: FEAT-CHECKOUT
covers: [BR-SHIP-01]
priority: high
status: ready
automated_by: none
setup: { recipe: cart, priceCents: 5000, stock: 10, quantity: 1 }
---

# TC-CHK-002 — Shipping is free from exactly $50.00 after the discount

## Preconditions

- A signed-in customer with one product at exactly $50.00 (stock 10) in the cart: `bun run qa:arrange --case TC-CHK-002 --name <session>`.

## Steps

| # | Action                                          | Expected result                                          |
| - | ----------------------------------------------- | -------------------------------------------------------- |
| 1 | Open **Cart**                                   | Subtotal $50.00, Shipping Free, Total $50.00             |
| 2 | Open **Checkout**                               | The same totals: Shipping Free, Total $50.00             |
| 3 | Back in **Cart**: coupon `WELCOME10`, **Apply coupon** | Discount -$5.00, Shipping $4.99, Total $49.99      |

## Expected overall result

The threshold is inclusive and applies after the discount ([[BR-SHIP-01]]).
