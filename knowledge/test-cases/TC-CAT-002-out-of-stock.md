---
id: TC-CAT-002
type: test-case
title: An out-of-stock product cannot be added to the cart
feature: FEAT-CATALOG
covers: [BR-CART-02]
priority: high
status: ready
automated_by: tests/ui/catalog.spec.ts › Catalog › an out-of-stock product cannot be added
---

# TC-CAT-002 — An out-of-stock product cannot be added to the cart

## Preconditions

- A product with stock 0, created over the API: `bun run seed:session --name <session> --product 1500:0`.

## Steps

| # | Action                              | Expected result                         |
| - | ----------------------------------- | --------------------------------------- |
| 1 | Open the product page (`#/product/<id>`) | Price $15.00 and "Out of stock"   |
| 2 | Look at **Add to cart**             | The button is disabled                  |

## Expected overall result

Stock 0 cannot be added at all ([[BR-CART-02]]).
