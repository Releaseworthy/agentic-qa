---
id: BR-COUP-01
type: rule
title: "One coupon per cart"
feature: FEAT-COUPON
severity: medium
---

# BR-COUP-01: One coupon per cart

A cart holds **at most one coupon**. Applying another valid coupon replaces the
first one (no stacking); `DELETE /api/cart/coupon` removes it.

Part of [[FEAT-COUPON]].
