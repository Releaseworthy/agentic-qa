---
id: TC-CART-001
type: test-case
title: A cart line cannot go above 10 units
feature: FEAT-CART
covers: [BR-CART-01]
priority: high
status: ready
automated_by: tests/ui/cart.spec.ts › Cart › more than 10 units shows the limit
setup: { recipe: cart, priceCents: 1000, stock: 50, quantity: 1 }
---

# TC-CART-001: A cart line cannot go above 10 units

## Preconditions

- A signed-in customer with a $10.00 product (stock 50) in the cart, quantity 1: `bun run qa:arrange --case TC-CART-001 --name <session>`.

## Steps

| # | Action                                                | Expected result                                               |
| - | ----------------------------------------------------- | ------------------------------------------------------------- |
| 1 | Open **Cart**                                         | The product's line shows quantity 1 and subtotal $10.00       |
| 2 | Change the line's quantity to **10**, leave the field | Subtotal becomes $100.00, no error                            |
| 3 | Change the quantity to **11**, leave the field        | Alert "Quantity must be between 1 and 10"; nothing else moves |
| 4 | Reload the page                                       | The line still shows quantity 10                              |

## Expected overall result

The server keeps the last valid quantity (10); 11 is refused with the limit
spelled out ([[BR-CART-01]]).
