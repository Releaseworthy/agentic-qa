---
id: BR-COUP-02
type: rule
title: "Coupon minimum subtotal"
feature: FEAT-COUPON
severity: medium
---

# BR-COUP-02 — Coupon minimum subtotal

A coupon applies only when the cart subtotal (before discount) is **at least its
minimum**: exactly the minimum is accepted. Below it → `422 COUPON_MIN_NOT_MET`
("This coupon needs a subtotal of at least $X").

The minimum is re-checked on every cart change: when an update or removal takes
the subtotal below it, the coupon silently falls off (`couponCode: null`). It is
re-checked once more at checkout.

Part of [[FEAT-COUPON]].
