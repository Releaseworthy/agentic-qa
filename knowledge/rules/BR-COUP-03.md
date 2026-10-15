---
id: BR-COUP-03
type: rule
title: "Expired coupons are refused"
feature: FEAT-COUPON
severity: medium
---

# BR-COUP-03 — Expired coupons are refused

A coupon whose `expiresAt` is in the past answers `410 COUPON_EXPIRED` ("This
coupon has expired"). `SUMMER20` is seeded already expired.

Part of [[FEAT-COUPON]].
