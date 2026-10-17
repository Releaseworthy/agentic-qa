---
id: TC-CART-002
type: test-case
title: Adding a product already in the cart adds to its line
feature: FEAT-CART
covers: []
priority: medium
status: ready
automated_by: none
setup: { recipe: product, priceCents: 1000, stock: 50 }
---

# TC-CART-002: Adding a product already in the cart adds to its line

## Preconditions

- A signed-in customer and a $10.00 product (stock 50), cart empty: `bun run qa:arrange --case TC-CART-002 --name <session>`.

## Steps

| # | Action                                              | Expected result                                       |
| - | --------------------------------------------------- | ----------------------------------------------------- |
| 1 | Open the product page, Quantity `2`, **Add to cart** | Toast "Added 2 × <name> to the cart"; header cart count 2 |
| 2 | Quantity `3`, **Add to cart** again                 | Toast "Added 3 × <name> to the cart"; header cart count 5 |
| 3 | Open **Cart**                                       | One line for the product, quantity 5, line total $50.00 |

## Expected overall result

One line per product; a second add increases its quantity ([[FEAT-CART]]).
