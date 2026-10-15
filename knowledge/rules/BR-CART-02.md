---
id: BR-CART-02
type: rule
title: "Never more than the stock"
feature: FEAT-CART
severity: critical
---

# BR-CART-02 — Never more than the stock

A cart line can never hold more units than the product has in stock: add or
update above stock → `409 OUT_OF_STOCK` ("Only N of "<name>" left in stock").
A product with stock 0 cannot be added at all, and its Add to cart button is
disabled.

The cart does not reserve stock. **Checkout re-checks stock** for every line
([[FEAT-CHECKOUT]]): when another customer bought the units in the meantime, the
order is refused with `409 OUT_OF_STOCK` and nothing is charged.

Part of [[FEAT-CART]].
