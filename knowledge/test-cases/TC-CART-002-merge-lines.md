---
id: TC-CART-002
type: test-case
title: Adding a product already in the cart adds to its line
feature: FEAT-CART
covers: []
priority: medium
status: ready
automated_by: none
---

# TC-CART-002 — Adding a product already in the cart adds to its line

## Preconditions

- A signed-in customer and a product at $10.00 with stock 50, cart empty:
  `bun run seed:session --name <session> --product 1000:50`.

## Steps

| # | Action                                              | Expected result                                       |
| - | --------------------------------------------------- | ----------------------------------------------------- |
| 1 | Open the product page, Quantity `2`, **Add to cart** | Toast "Added 2 × <name> to the cart"; header cart count 2 |
| 2 | Quantity `3`, **Add to cart** again                 | Toast "Added 3 × <name> to the cart"; header cart count 5 |
| 3 | Open **Cart**                                       | One line for the product, quantity 5, line total $50.00 |

## Expected overall result

One line per product; a second add increases its quantity ([[FEAT-CART]]).
