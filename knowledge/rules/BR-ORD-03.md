---
id: BR-ORD-03
type: rule
title: "Customers see only their own orders"
feature: FEAT-ORDERS
severity: critical
---

# BR-ORD-03: Customers see only their own orders

A customer can read and cancel **only their own orders**. Another customer's
order id answers `404 NOT_FOUND` (not `403`), so order ids cannot be probed.
Admins can read any order.

Part of [[FEAT-ORDERS]].
