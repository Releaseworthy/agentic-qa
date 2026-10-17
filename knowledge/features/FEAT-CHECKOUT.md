---
id: FEAT-CHECKOUT
type: feature
title: Checkout and payment
criticality: 5
code: [app/domain/orders.ts, app/domain/payments.ts, app/domain/pricing.ts, app/routes/orders.ts]
endpoints: [POST /api/orders]
pages: ['#/checkout', '#/orders/:id']
rules: [BR-PAY-01, BR-SHIP-01, BR-CART-02, BR-COUP-02]
depends_on: [FEAT-CART, FEAT-COUPON, FEAT-AUTH]
---

# Checkout and payment

Turns the cart into an order. The most critical flow: it moves money and stock.

## Behaviour

`POST /api/orders { shippingAddress, payment }`:

1. Empty cart → `400 EMPTY_CART`.
2. Address: `name`, `line1`, `city`, `postalCode`, `country` all required;
   `country` is a 2-letter upper-case ISO code (`US`); see [[DEF-001]].
3. Stock is re-checked for every line → `409 OUT_OF_STOCK` ([[BR-CART-02]]).
4. The coupon minimum is re-checked ([[BR-COUP-02]]).
5. The card is validated and charged ([[BR-PAY-01]]). Nothing changes on a refusal:
   the cart stays as it was and no stock is taken.
6. Stock is taken, the order is stored as `placed`, the cart is emptied.
   Answer: `201` with the order (lines, totals, `cardLast4`).

UI: the checkout page shows the totals, a shipping-address and a payment
fieldset, and "Place order". Success goes to the order page with "Thank you!
Your order has been placed."; a refusal shows the reason in an alert and keeps
the form filled.

## Test cards

| Number             | Result                     |
| ------------------ | -------------------------- |
| `4242424242424242` | approved                   |
| `4000000000000002` | `402 PAYMENT_DECLINED`     |
| any Luhn failure   | `400 INVALID_CARD`         |
| past expiry        | `400 CARD_EXPIRED`         |
