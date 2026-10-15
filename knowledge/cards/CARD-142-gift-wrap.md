---
id: CARD-142
type: card
title: Gift wrapping at checkout
status: ready-for-refinement
feature: FEAT-CHECKOUT
related: [FEAT-CART, BR-SHIP-01, BR-COUP-04]
---

# CARD-142 — Gift wrapping at checkout

**As a** customer buying a present, **I want** to have my order gift-wrapped
with a message, **so that** it arrives ready to give.

## Description (from Product)

Add a "Gift wrap" option on the checkout page. It costs extra. The customer can
write a message that is printed on a card. Wrapping should be per item if the
customer wants. Some products can't be wrapped (electronics are too big).

## Acceptance criteria (draft)

1. Customer can tick "Gift wrap this order" on checkout.
2. Gift wrap costs $3.
3. Customer can add a gift message.
4. The order confirmation shows that the order is gift-wrapped.
5. Electronics cannot be gift-wrapped.

## Notes

- Design: one checkbox under the payment fieldset, a textarea appears when ticked.
- Backend: new optional `giftWrap` field on `POST /api/orders`.
