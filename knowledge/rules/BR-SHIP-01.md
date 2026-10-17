---
id: BR-SHIP-01
type: rule
title: "Free shipping from $50"
feature: FEAT-CHECKOUT
severity: high
---

# BR-SHIP-01: Free shipping from $50

Shipping is **free when subtotal − discount is $50.00 or more**, otherwise
**$4.99**. An empty cart has no shipping.

| Subtotal − discount | Shipping |
| ------------------- | -------- |
| $49.99              | $4.99    |
| **$50.00**          | free     |
| $50.01              | free     |

The threshold is after the discount: $52.00 with `WELCOME10` is $46.80 and pays
shipping. Applies to the cart totals and to the order. The UI shows "Free".

Part of [[FEAT-CHECKOUT]].
