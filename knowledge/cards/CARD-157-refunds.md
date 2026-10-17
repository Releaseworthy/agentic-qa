---
id: CARD-157
type: card
title: Refund on cancellation
status: in-development
feature: FEAT-ORDERS
related: [BR-ORD-01, BR-ORD-02, BR-PAY-01]
---

# CARD-157: Refund on cancellation

**As a** customer who cancels an order, **I want** my money back on the card I
paid with, **so that** I am not charged for something I will not receive.

## Acceptance criteria (draft)

1. Cancelling a placed order refunds the full total to the original card.
2. The order page shows "Refunded" with the refund amount and date.
3. A shipped order cannot be refunded from the customer side.
4. If the refund fails at the gateway, the order stays placed and the customer
   sees an error.

## Notes

- Gateway: new `refund(cardLast4, amountCents)` on the mock payments module.
- Open question from Engineering: partial refunds when one line is out of stock?
