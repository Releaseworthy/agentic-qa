---
id: TC-ORD-001
type: test-case
title: Cancelling a placed order puts its items back in stock
feature: FEAT-ORDERS
covers: [BR-ORD-01, BR-ORD-02]
priority: high
status: ready
automated_by: none
---

# TC-ORD-001 — Cancelling a placed order puts its items back in stock

## Preconditions

- A signed-in customer with a placed order of 1 unit of a product with stock 5 (4 left after the order):
  `bun run seed:session --name <session> --product 1000:5 --order`.

## Steps

| # | Action                                           | Expected result                                       |
| - | ------------------------------------------------ | ----------------------------------------------------- |
| 1 | Open the product page                            | "4 in stock"                                          |
| 2 | Open the order (`#/orders/<id>`)                 | Status placed; **Cancel order** is shown              |
| 3 | Click **Cancel order**, accept "Cancel this order?" | Toast "Order cancelled"; Status cancelled; no Cancel order button |
| 4 | Open the product page again                      | "5 in stock"                                          |

## Expected overall result

Only a placed order can be cancelled, and its units return to stock ([[BR-ORD-01]], [[BR-ORD-02]]).
