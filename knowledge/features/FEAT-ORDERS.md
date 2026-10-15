---
id: FEAT-ORDERS
type: feature
title: Order history and cancellation
criticality: 4
code: [app/domain/orders.ts, app/routes/orders.ts, app/routes/admin.ts]
endpoints: [GET /api/orders, GET /api/orders/:id, POST /api/orders/:id/cancel, POST /api/admin/orders/:id/ship]
pages: ['#/orders', '#/orders/:id']
rules: [BR-ORD-01, BR-ORD-02, BR-ORD-03]
depends_on: [FEAT-CHECKOUT]
---

# Order history and cancellation

## Behaviour

- `GET /api/orders` lists the customer's own orders, newest first.
- `GET /api/orders/:id` shows one order — another customer's order answers
  `404` ([[BR-ORD-03]]).
- `POST /api/orders/:id/cancel` cancels a `placed` order ([[BR-ORD-01]]) and puts
  its items back in stock ([[BR-ORD-02]]). No refund flow exists yet (see
  [[CARD-157]]).
- Admins ship an order (`POST /api/admin/orders/:id/ship`): `placed` → `shipped`.
- UI: the orders page lists id, status, total; the order page has "Cancel order"
  (with a confirm dialog) only while the order is `placed`.

## State machine

```
placed ──ship──▶ shipped
   │
   └──cancel──▶ cancelled
```

Any other transition is `409` (`NOT_CANCELLABLE`, `NOT_SHIPPABLE`).
