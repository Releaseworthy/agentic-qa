---
id: TC-CHK-001
type: test-case
title: A declined card keeps the customer on checkout
feature: FEAT-CHECKOUT
covers: [BR-PAY-01]
priority: critical
status: ready
automated_by: tests/ui/checkout.spec.ts › Checkout › a declined card keeps the customer on checkout with the reason
---

# TC-CHK-001 — A declined card keeps the customer on checkout

## Preconditions

- A signed-in customer with one product (stock 5) in the cart, set up over the API.

## Test data

Card `4000000000000002`, expiry `12/34`, CVC `123`; any valid US address.

## Steps

| # | Action                                   | Expected result                                       |
| - | ---------------------------------------- | ----------------------------------------------------- |
| 1 | Open **Checkout**                        | Totals and the address and payment fieldsets show     |
| 2 | Fill the address and the declined card   | All fields keep their values                          |
| 3 | Click **Place order**                    | Alert "The card was declined"; the page stays on checkout |
| 4 | Look at the **Place order** button       | It is enabled again                                   |
| 5 | Open **Cart**                            | The product is still in the cart                      |
| 6 | Open the product page                    | Stock still shows 5 in stock                          |

## Expected overall result

No order, no stock taken, the cart intact ([[BR-PAY-01]]).
