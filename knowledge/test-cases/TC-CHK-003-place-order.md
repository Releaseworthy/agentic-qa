---
id: TC-CHK-003
type: test-case
title: Placing an order shows the confirmation and empties the cart
feature: FEAT-CHECKOUT
covers: [BR-PAY-01]
priority: critical
status: ready
automated_by: tests/ui/checkout.spec.ts › Checkout › placing an order shows the confirmation and empties the cart
setup: { recipe: cart, priceCents: 2600, stock: 10, quantity: 2 }
---

# TC-CHK-003 — Placing an order shows the confirmation and empties the cart

## Preconditions

- A signed-in customer with a $26.00 product (stock 10) × 2 in the cart: `bun run qa:arrange --case TC-CHK-003 --name <session>`.

## Test data

Card `testData.cards.VALID` (`4242424242424242`; expiry and CVC from the arrange output), address `testData.address`.

## Steps

| # | Action                                        | Expected result                                                |
| - | --------------------------------------------- | -------------------------------------------------------------- |
| 1 | Open **Checkout**                             | Subtotal $52.00, Shipping Free, Total $52.00                   |
| 2 | Fill the address and the card, **Place order** | The order page: "Thank you! Your order has been placed."; Status placed |
| 3 | Look at the order page                        | One line, quantity 2; Total $52.00; "Paid with card ending 4242" |
| 4 | Look at the header                            | Cart count 0                                                   |
| 5 | Open the product page                         | "8 in stock"                                                   |

## Expected overall result

The card is charged, stock is taken, the cart is emptied ([[FEAT-CHECKOUT]], [[BR-PAY-01]]).
