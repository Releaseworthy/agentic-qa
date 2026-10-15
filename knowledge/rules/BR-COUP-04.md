---
id: BR-COUP-04
type: rule
title: "Discount caps"
feature: FEAT-COUPON
severity: high
---

# BR-COUP-04 — Discount caps

- A percent discount is rounded to the cent and **never exceeds the coupon's
  `maxDiscountCents`** cap when it has one (`BIGSPENDER`: 15 % up to $30.00).
- **No discount exceeds the subtotal**: a $50 fixed coupon on a $12 cart takes
  $12 off, never a negative total.

Part of [[FEAT-COUPON]].
