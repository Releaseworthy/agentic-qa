---
id: TC-CAT-002
type: test-case
title: An out-of-stock product cannot be added to the cart
feature: FEAT-CATALOG
covers: [BR-CART-02]
priority: high
status: ready
automated_by: tests/ui/catalog.spec.ts › Catalog › an out-of-stock product cannot be added
setup: { recipe: product, priceCents: 1500, stock: 0 }
---

# TC-CAT-002: An out-of-stock product cannot be added to the cart

## Preconditions

- A product with stock 0: `bun run qa:arrange --case TC-CAT-002 --name <session>`; its page is `#/product/<data.product.id>`.

## Steps

| # | Action                              | Expected result                         |
| - | ----------------------------------- | --------------------------------------- |
| 1 | Open the product page (`#/product/<id>`) | Price $15.00 and "Out of stock"   |
| 2 | Look at **Add to cart**             | The button is disabled                  |

## Expected overall result

Stock 0 cannot be added at all ([[BR-CART-02]]).
