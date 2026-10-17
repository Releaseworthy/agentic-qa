---
id: BR-ORD-01
type: rule
title: "Only placed orders can be cancelled"
feature: FEAT-ORDERS
severity: high
---

# BR-ORD-01: Only placed orders can be cancelled

A customer can cancel an order **only while it is `placed`**. A `shipped` or
already `cancelled` order answers `409 NOT_CANCELLABLE` ("An order that is
shipped cannot be cancelled"). The UI shows "Cancel order" only for placed orders.

Part of [[FEAT-ORDERS]].
