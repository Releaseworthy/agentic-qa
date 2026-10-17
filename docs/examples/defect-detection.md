## Seeded-defect detection (api)

**4 of 4 defects caught.** Baseline without defects: 86 of 86 tests green.

| Defect | Breaks | Verdict | Caught by | Other failures |
| --- | --- | --- | --- | --- |
| free-shipping-boundary | BR-SHIP-01 | ✅ killed | tests/api/endpoints/orders.spec.ts › Shipping fee › a $50.00 order ships for 0 cents | 0 |
| cancel-restock | BR-ORD-02 | ✅ killed | tests/api/endpoints/orders.spec.ts › POST /api/orders/:id/cancel › cancels a placed order and restocks its items<br>tests/api/journeys/cancellation.spec.ts › Journey: change of mind › a customer cancels, the stock comes back and another customer buys it | 0 |
| qty-limit-update | BR-CART-01 | ✅ killed | tests/api/endpoints/cart.spec.ts › PATCH /api/cart/items/:productId › refuses a quantity above 10 | 0 |
| coupon-cap | BR-COUP-04 | ✅ killed | tests/api/endpoints/coupons.spec.ts › POST /api/cart/coupon › a percent coupon never exceeds its cap<br>tests/api/endpoints/coupons.spec.ts › POST /api/cart/coupon › BIGSPENDER is capped at $30 | 0 |