# Ad hoc: cart and order totals (--defects practice run)

Charter: quantity limits on cart line edits, capped coupon discounts, the free-shipping threshold, and stock after cancelling an order. A bug is any total, limit or stock value that differs from the vault rules.
Build: seeded defects `all`. These findings are planted on purpose: notes only, no DEF documents. The app was reset with `--defects none` at the end.

## Expectations (vault)
- BR-CART-01: a line holds 1-10 units; otherwise 422 QTY_LIMIT "Quantity must be between 1 and 10". PATCH 0 removes the line.
- BR-CART-02: quantity above stock → 409 OUT_OF_STOCK.
- FEAT-COUPON / BR-COUP-02 / BR-COUP-04:
  - WELCOME10: 10%, minimum $20.
  - SAVE5: $5, minimum $30.
  - BIGSPENDER: 15%, minimum $100, cap 3000.
  - SUMMER20: expired.
  - The minimum is re-checked on every cart change.
- BR-SHIP-01: shipping 499 when subtotal − discount < 5000; free when it is ≥ 5000.
- BR-ORD-01 / BR-ORD-02: only placed orders can be cancelled; a cancel restocks every line.

## Start states

> Recorded before `seed:session` was replaced by framework recipes. Today the same states are
> `bun run qa:arrange cart --name explorer-totals priceCents=1000 stock=50 quantity=1` and
> `bun run qa:arrange order --name explorer-cancel priceCents=1500 stock=10 quantity=3`.

- explorer-totals: `seed:session --name explorer-totals --product 1000:50 --cart 1`
- explorer-totals-3: `--product 4999:50`
- explorer-totals-4: `--product 1999:50`
- explorer-totals-2: a 4000 product, plus catalog products.
- explorer-cancel: `--product 1500:10 --cart 3 --order` → order o_67d99fa, product p_5e1d20e.

## Findings (all confirmed by `bun run out/adhoc/cart-order-totals-repro.ts`)
1. **PATCH accepts quantity 11**: BR-CART-01, high.
   - Repro: `PATCH /api/cart/items/:id {"quantity":11}`.
   - Expected: 422 QTY_LIMIT.
   - Actual: 200, quantity 11, lineTotal 11000.
   - The UI path behaves the same (type 11, then Tab): `out/evidence/explorer-totals-ui-qty11.png`.
   - Same symptom as regression DEF-002.
2. **BIGSPENDER cap ignored**: BR-COUP-04, high.
   - Subtotal 30000: discount 4500, total 25500 (expected discount 3000, total 27000).
   - Subtotal 31000: discount 4650 (expected 3000).
   - Subtotal 47500: discount 7125 (expected 3000).
3. **Free-shipping threshold uses `>` instead of `>=`**: BR-SHIP-01, medium.
   - Subtotal 5000, no coupon: shipping 499, total 5499 (expected 0 and 5000).
   - SAVE5 on 5500 (net 5000): shipping 499.
   - The UI shows the same: "$4.99" shipping, total $54.99.
4. **Cancelling does not restock**: BR-ORD-02, high.
   - Cancelling 3 units from stock 10 returns 200 cancelled; stock stays at 7 (expected 10).
   - Evidence: `out/evidence/explorer-cancel-02-cancelled.png`.

## Passed
- Quantity limits on POST:
  - quantity 0 and 11 → 422; quantity 10 → 200.
  - 6 + 5 → 422 and the line stays at 6.
  - PATCH 0 removes the line.
- Stock limit: POST above stock → 409 "Only 3 of "Kite" left in stock".
- Coupon minimums:
  - Every minimum is enforced at its boundary (1999 refused, 2000 accepted, and so on).
  - The coupon is removed when the cart drops below its minimum.
- Coupon codes:
  - Codes are case-insensitive.
  - SUMMER20 → 410.
  - Unknown code → 404 "This coupon code does not exist".
- WELCOME10 rounds half-up: 3499 → 350, 4999 → 500.
- Shipping:
  - 4999 → 499.
  - 5000 with WELCOME10 (net 4500) → 499.
  - An empty cart has shipping 0.
- Cart totals equal the placed order's totals: WELCOME10 on 5498 → total 5447 on both.
- Stock goes down by the ordered quantity at checkout.
- "Cancel order" is shown only while the order is placed.

## Not covered
- explorer-cancel lost its Bash permission partway through, so these were not run:
  - a second cancel (expect 409);
  - cancelling a shipped order;
  - stock for quantities 1 and 10, and for orders with two products;
  - another customer's order (expect 404, BR-ORD-03).
- Orders that use a coupon were not cancelled.

## Questions
- Which check comes first? On stock 6, PATCH 11 → 409 OUT_OF_STOCK, not 422 QTY_LIMIT. The vault doesn't say.
- The vault doesn't state the percent rounding mode. Half-up was observed.
- Right after `goto #/cart`, the header badge showed "Cart 0" with items in the cart; it was correct after a reload. Possible hydration race, unconfirmed.
- Console errors (2-10) appeared on app pages. Not inspected.
- DEF-002 is documented as fixed. Is it still a seeded defect?

## Automation ideas
- Endpoint spec, PATCH /api/cart/items/:id: quantities 10, 11 and 0 (BR-CART-01). The regression spec may already cover this; check DEF-002's spec.
- Endpoint spec, POST /api/cart/coupon: BIGSPENDER at 20000, 30000 and 47500; the discount is always ≤ 3000 (BR-COUP-04).
- Endpoint spec, GET /api/cart: shipping at net 4999 and net 5000, with and without a coupon (BR-SHIP-01).
- API journey: order → cancel → stock back to its start value, and a second cancel → 409 (BR-ORD-01, BR-ORD-02).
