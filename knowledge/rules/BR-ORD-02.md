---
id: BR-ORD-02
type: rule
title: "Cancelling restocks the items"
feature: FEAT-ORDERS
severity: high
---

# BR-ORD-02: Cancelling restocks the items

Cancelling an order **puts every line's quantity back in stock**, so other
customers can buy it straight away. Checked by stock before order, after order,
after cancel.

Part of [[FEAT-ORDERS]].
