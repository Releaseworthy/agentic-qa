### Agentic QA · `adhoc-test "Cart and order totals: quantity limits when editing cart lines, coupon discounts with caps, the free-shipping threshold, and stock after cancelling an order" --defects`

**done** · 7 turns · $0.77 · 6.0 min

Practice run on the seeded-defect build found four planted defects, each confirmed with a direct API call (out/adhoc/cart-order-totals-repro.ts): (1) BR-CART-01: PATCH accepts quantity 11 and returns 200 instead of 422 QTY_LIMIT. (2) BR-COUP-04: the BIGSPENDER cap is ignored, giving a discount of 4500 on a 30000 subtotal where 3000 was expected. (3) BR-SHIP-01: a subtotal of exactly 5000 is charged 499 shipping instead of shipping free. (4) BR-ORD-02: cancelling an order does not put its stock back (7 instead of 10). The notes are in out/adhoc/2026-10-15-cart-order-totals.md. All browser sessions are closed and the app was reset with --defects none. Not covered: second cancel, shipped-order cancel, cross-customer cancel, and stock checks for other quantities, because the cancel explorer lost its Bash permission. Open questions: whether the quantity limit (422) or the stock limit (409) is checked first, the rounding mode (half-up was observed), and whether the header badge shows 'Cart 0' before the page has loaded.

- **high** PATCH cart line accepts quantity 11 (200, expected 422 QTY_LIMIT) — planted (BR-CART-01)
- **high** BIGSPENDER cap ignored: discount 4500 on 30000 subtotal, expected 3000 — planted (BR-COUP-04)
- **high** Cancelling an order does not restock lines (stock 7, expected 10) — planted (BR-ORD-02)
- **medium** Free shipping uses > not >=: net 5000 charged 499 — planted (BR-SHIP-01)
- **info** Question: PATCH 11 on stock 6 returns 409 OUT_OF_STOCK, not 422 — which check comes first is unstated (BR-CART-01)
- **low** Unconfirmed: header badge shows 'Cart 0' on first load of #/cart

Artifacts: `out/adhoc/2026-10-15-cart-order-totals.md`, `out/adhoc/cart-order-totals-repro.ts`, `out/evidence/explorer-totals-ui-qty11.png`, `out/evidence/explorer-cancel-02-cancelled.png`

<sub>Models: claude-opus-5-5: 621928 in / 12790 out · claude-haiku-5-5: 2181225 in / 46174 out</sub>