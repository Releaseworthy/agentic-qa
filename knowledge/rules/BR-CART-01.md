---
id: BR-CART-01
type: rule
title: "1 to 10 units per cart line"
feature: FEAT-CART
severity: high
---

# BR-CART-01: 1 to 10 units per cart line

A cart line holds **at least 1 and at most 10 units**, whichever way it is
changed:

- `POST /api/cart/items` with `quantity` < 1 or > 10 → `422 QTY_LIMIT`.
- Adding to an existing line is checked on the **resulting** quantity: 6 in the
  cart + 5 more → `422 QTY_LIMIT`, and the line stays at 6.
- `PATCH /api/cart/items/:id` with > 10 → `422 QTY_LIMIT`; `0` removes the line.

Message: "Quantity must be between 1 and 10". Boundaries to test: 0, 1, 10, 11,
and add-to-existing crossing 10. The PATCH path is separate code from the add
path (see [[FEAT-CART]] risks).

Part of [[FEAT-CART]].
