---
id: BR-PAY-01
type: rule
title: "Card validation"
feature: FEAT-CHECKOUT
severity: critical
---

# BR-PAY-01 — Card validation

The mock payment gateway accepts a card when:

- the number has 13–19 digits (spaces and dashes ignored) and passes the **Luhn**
  check → else `400 INVALID_CARD`;
- the expiry is `MM/YY` and not before the current month → else `400 CARD_EXPIRED`
  (a card is valid through the end of its expiry month);
- the CVC has 3 or 4 digits → else `400 INVALID_CARD`.

`4000000000000002` is always declined: `402 PAYMENT_DECLINED`. On any refusal no
order is created, no stock is taken and the cart is kept.

Part of [[FEAT-CHECKOUT]].
