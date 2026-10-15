---
id: PRODUCT
type: overview
title: ShopLite product overview
---

# ShopLite

ShopLite is a small online shop: customers browse a catalog, fill a cart,
apply a coupon and pay by card; admins add products and coupons and ship
orders. It is the system under test of this repository.

## Personas

- **Guest** — browses the catalog ([[FEAT-CATALOG]]); must sign in to use the cart.
- **Customer** — registers and signs in ([[FEAT-AUTH]]), keeps one cart ([[FEAT-CART]]),
  applies coupons ([[FEAT-COUPON]]), checks out ([[FEAT-CHECKOUT]]), sees and cancels
  orders ([[FEAT-ORDERS]]).
- **Admin** — creates products and coupons, ships orders. Admin endpoints are
  also how the test framework sets up its data.

## Money

All amounts are integer cents in the API (`priceCents`, `totalCents`) and
dollars with two decimals in the UI (`$12.34`). Order of computation:

1. subtotal = Σ unit price × quantity
2. discount = coupon on the subtotal ([[BR-COUP-04]])
3. shipping = free from $50.00 after discount, else $4.99 ([[BR-SHIP-01]])
4. total = subtotal − discount + shipping

## Error contract

Every refusal is `{ "error": { "code": "…", "message": "…" } }` with an HTTP
status that matches the kind of problem: 400 validation, 401 not signed in,
402 payment declined, 403 not allowed, 404 not found (also for other
customers' orders, [[BR-ORD-03]]), 409 conflict (stock, state), 410 expired,
422 business limit, 423 account locked.

## Glossary

- **Line** — one product in the cart with its quantity.
- **Placed / shipped / cancelled** — the order states ([[BR-ORD-01]]).
- **Seeded defect** — a known bug that can be switched on with `SHOPLITE_DEFECTS`
  to prove the tests catch it.
