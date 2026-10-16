---
id: TC-ORD-002
type: test-case
title: A shipped order cannot be cancelled
feature: FEAT-ORDERS
covers: [BR-ORD-01]
priority: high
status: ready
automated_by: tests/ui/orders.spec.ts › Order history › new customer › a shipped order offers no cancel button
setup: { recipe: order, status: shipped }
---

# TC-ORD-002 — A shipped order cannot be cancelled

## Preconditions

- A signed-in customer with an order the admin shipped: `bun run qa:arrange --case TC-ORD-002 --name <session>`.

## Steps

| # | Action                            | Expected result                        |
| - | --------------------------------- | -------------------------------------- |
| 1 | Open the order (`#/orders/<id>`)  | Status shipped                         |
| 2 | Look for **Cancel order**         | Not shown                              |

## Expected overall result

Shipped orders are not cancellable from the UI ([[BR-ORD-01]]).
