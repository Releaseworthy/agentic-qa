---
id: FEAT-CART
type: feature
title: Shopping cart
criticality: 4
code: [app/domain/cart.ts, app/routes/cart.ts, app/domain/pricing.ts]
endpoints: [GET /api/cart, POST /api/cart/items, PATCH /api/cart/items/:productId, DELETE /api/cart/items/:productId]
pages: ['#/cart', '#/product/:id']
rules: [BR-CART-01, BR-CART-02, BR-SHIP-01]
depends_on: [FEAT-AUTH, FEAT-CATALOG]
---

# Shopping cart

Each signed-in customer has exactly one server-side cart. Guests are sent to
sign in when they add to the cart.

## Behaviour

- Add (`POST /api/cart/items { productId, quantity }`): adding a product already
  in the cart adds to that line instead of creating a second one.
- Update (`PATCH …/:productId { quantity }`): sets the quantity; `0` removes the line.
- Remove (`DELETE …/:productId`): `404 NOT_IN_CART` when the product is not there.
- Every answer is the whole priced cart: `items`, `couponCode`, `subtotalCents`,
  `discountCents`, `shippingCents`, `totalCents`.
- Limits: [[BR-CART-01]] (1–10 per line) and [[BR-CART-02]] (never more than stock).
  Stock is **not** reserved by the cart; it is checked again at checkout ([[FEAT-CHECKOUT]]).
- Changing the cart re-checks the coupon minimum ([[BR-COUP-02]]).
- UI: the header cart count is the sum of quantities; quantity inputs re-price on
  change; errors show in an alert above the coupon form.

## Risks

- Two customers can hold the last units in their carts at the same time; only the
  first to check out gets them (covered by the "last units in stock" journey).
- Quantity changes go through PATCH, a separate code path from add — limits must
  be enforced on both.
