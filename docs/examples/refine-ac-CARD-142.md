# CARD-142: Gift wrapping at checkout (refined AC)

Feature: FEAT-CHECKOUT · Related: FEAT-CART, FEAT-ORDERS, FEAT-CATALOG, BR-SHIP-01, BR-COUP-04, BR-CART-01, BR-PAY-01, BR-ORD-01, BR-ORD-02
Status of card: ready-for-refinement. Card not edited; Product to paste the refined AC.

Grounding (vault): pricing today is `total = subtotal − discount + shipping` (PRODUCT); shipping free when subtotal − discount ≥ 5000 cents, else 499 (BR-SHIP-01); discount never exceeds subtotal (BR-COUP-04); product `category` ∈ `books|electronics|home|toys` (FEAT-CATALOG); error shape `{ error: { code, message } }`, 400 validation / 422 business limit (PRODUCT); checkout check order EMPTY_CART → VALIDATION → OUT_OF_STOCK → coupon minimum → payment (FEAT-CHECKOUT); no refund flow yet (CARD-157).

## Questions for Product / Engineering

| # | Question | Why it matters | Proposed default |
| --- | --- | --- | --- |
| Q1 | Per order or per item? Description says "per item if the customer wants", AC1 says "this order". | Per item needs a per-line flag; cart merges same-product lines (FEAT-CART), so wrapping 1 of 3 units needs line splitting. Changes API, UI and pricing. | **Per order only** in this card; per-item wrap is a follow-up card. |
| Q2 | Is $3 per order or per wrapped item/unit? | Total and charge amount. | **300 cents flat per order.** |
| Q3 | Does the wrap fee count toward the $50 free-shipping threshold? | Conflicts with BR-SHIP-01 ("subtotal − discount"). | **No.** Threshold stays subtotal − discount; fee excluded. |
| Q4 | Can a coupon discount the wrap fee? | BR-COUP-04 caps discount at subtotal. | **No.** Coupons apply to merchandise subtotal only; fee is never discounted. |
| Q5 | "Electronics cannot be gift-wrapped": with per-order wrap, what happens when the cart mixes electronics and other items? | Refuse the whole option, or wrap only the non-electronics items? | **Option unavailable** if any cart line has `category = electronics`; API refuses `422 GIFT_WRAP_NOT_ALLOWED`. |
| Q6 | Gift message limits: required? max length? allowed characters/newlines? | Card printing, validation, boundaries. | **Optional**; trimmed; 1-200 characters; newlines allowed; empty/whitespace-only = no message; >200 → `400 VALIDATION`. |
| Q7 | API shape of `giftWrap`. | Contract for clients and tests. | Request: `giftWrap?: boolean` (default `false`), `giftMessage?: string`. Response (order): `giftWrap`, `giftMessage` (or `null`), `giftWrapCents` (0 or 300) in totals; `totalCents` includes it. |
| Q8 | Where in the checkout check order are the new refusals? | Which error wins when several apply. | `giftMessage` validation together with address `VALIDATION` (400); `GIFT_WRAP_NOT_ALLOWED` (422) after VALIDATION and before stock re-check. |
| Q9 | Cancellation / refund of the fee? | BR-ORD-02 restocks on cancel; refunds are CARD-157. | Cancel behaves as today; CARD-157 must refund `giftWrapCents` with the order. Flag to CARD-157 owner. |
| Q10 | Where is wrap shown after placing the order? | AC4 "confirmation shows" is not testable as written. | Checkout success message unchanged; order detail `#/orders/<id>` shows "Gift wrapped" and the message; orders list shows nothing new. |
| Q11 | Is the fee taxed? | Vault has no tax rule. | **No tax** (consistent with today). |
| Q12 | Message `giftMessage` sent with `giftWrap: false`? | Contradictory request. | Non-blank `giftMessage` → `400 VALIDATION` "Gift message requires gift wrap"; empty/whitespace-only → treated as absent (`201`, `giftMessage: null`). |
| Q13 | Exact UI copy and error messages. | Tests assert labels verbatim. | Proposed: "Gift wrap this order ($3.00)", "Electronics can't be gift-wrapped", "Gift message", "Gift wrapped", "Gift message must be at most 200 characters", "Gift message requires gift wrap". |

## Refined acceptance criteria

All money in cents (API) / `$x.yy` (UI). `[D:Qn]` = relies on proposed default Qn.

**AC1: Option offered** `[D:Q1, Q13]`
- Given a signed-in customer with a cart containing no electronics, When they open `#/checkout`, Then a checkbox labelled "Gift wrap this order ($3.00)" is shown unticked under the Payment fieldset and no gift-message textarea is visible.
- Negative: Given the cart contains ≥ 1 line with `category = electronics` `[D:Q5]`, Then the checkbox is disabled and the text "Electronics can't be gift-wrapped" is shown and linked to it (`aria-describedby`).

**AC2: Fee in totals** `[D:Q2, Q3, Q4]`
- Given subtotal 4000, no coupon, When the customer ticks gift wrap, Then the totals show "Gift wrap $3.00", shipping $4.99, total $47.99 (4000 + 499 + 300). Unticking removes the line and total returns to $44.99.
- Boundary (BR-SHIP-01 unchanged): subtotal 4999 + wrap → shipping 499, total 5798; subtotal 5000 + wrap → shipping 0, total 5300.
- With coupon: subtotal 6000 and a 20 % percent coupon created with `seed.coupon` (discount 1200) → subtotal − discount 4800 → shipping 499; total 4800 + 499 + 300 = 5599. The discount never touches the 300.
- Flat fee: one line of 10 units (the BR-CART-01 maximum) at 500 cents + wrap → subtotal 5000, wrap 300, shipping 0, total 5300 (the fee is not multiplied by quantity).
- The fee is a checkout-only line: `GET /api/cart` totals never include it. The `#/checkout` total with wrap ticked is a client-side preview (cart `totalCents` + 300); the order answer is authoritative.

**AC3: Order placed with wrap** `[D:Q7]`
- Given a wrappable cart, When `POST /api/orders` with valid address, payment and `giftWrap: true`, Then `201`; the order has `giftWrap: true`, `giftWrapCents: 300`, `totalCents` = subtotal − discount + shipping + 300.
- Negative: without `giftWrap` (or `false`) → `201` with `giftWrap: false`, `giftWrapCents: 0`, totals as today (backwards compatible).
- Negative: `giftWrap` not a boolean (e.g. `"yes"`) → `400 VALIDATION`; no order, no stock change, cart unchanged.

**AC4: Gift message** `[D:Q6, Q12, Q13]`
- Given gift wrap ticked, Then a textarea labelled "Gift message" appears with a counter "0/200"; unticking hides it and the message is not sent.
- When placing with `giftMessage` of 1 or 200 characters (after trim) → `201`, order stores the trimmed message.
- Boundary: a raw message of 201 characters whose trimmed length is 200 → `201`. The UI counter counts raw characters.
- Negative (API): `giftMessage` of 201 characters after trim → `400 VALIDATION` "Gift message must be at most 200 characters"; no order, no stock change. Negative (UI): the textarea has `maxlength` 200; typing a 201st character leaves 200 and the counter shows "200/200".
- Negative: empty or whitespace-only with `giftWrap: true` → `201`, `giftMessage: null`.
- Negative: a non-blank `giftMessage` with `giftWrap` absent/false → `400 VALIDATION` "Gift message requires gift wrap"; an empty/whitespace-only `giftMessage` with `giftWrap: false` → `201`, `giftMessage: null`.

**AC5: Electronics refused by the API** `[D:Q5, Q8, Q13]`
- Given a cart with an electronics line, When `POST /api/orders` with `giftWrap: true`, Then `422 GIFT_WRAP_NOT_ALLOWED` "Electronics can't be gift-wrapped"; no order, no stock change, cart unchanged.
- Negative: same cart with `giftWrap: false` → `201` as today.
- Order of checks: empty cart → `400 EMPTY_CART` wins; invalid address + electronics → `400 VALIDATION` wins; electronics + out-of-stock → `422 GIFT_WRAP_NOT_ALLOWED` wins.

**AC6: Shown on the order** `[D:Q10, Q13]`
- Given an order placed with wrap and message "Happy birthday!", When the customer opens `#/orders/<id>` (and `GET /api/orders/<id>`), Then it shows "Gift wrapped", the message verbatim, and "Gift wrap $3.00" in the totals.
- Negative: an order without wrap shows none of these.

**AC7: Refusals leave nothing behind**
- Given `giftWrap: true` and card `4000000000000002` → `402 PAYMENT_DECLINED` (BR-PAY-01); no order, stock unchanged, cart unchanged, and `GET /api/cart` totals don't include the fee.

**AC8: Cancellation** `[D:Q9]`
- Given a `placed` order with wrap, When the customer cancels, Then status `cancelled` and every line is restocked (BR-ORD-01/02); wrap fields remain on the order record. Refund of 300 is out of scope (CARD-157).
- Negative: Given a `shipped` order with wrap, When the customer cancels, Then `409 NOT_CANCELLABLE` "An order that is shipped cannot be cancelled"; status, stock and wrap fields unchanged (BR-ORD-01).

## Impact on existing rules and tests

- **Conflicts found:**
  1. Per-item vs per-order (card description vs AC1), and per-item clashes with FEAT-CART line merging. (Q1)
  2. BR-SHIP-01 threshold "subtotal − discount": fee inclusion unspecified. (Q3)
  3. BR-COUP-04 "discount never exceeds subtotal": fee discountability unspecified. (Q4)
  4. "Electronics" vs per-order wrap on mixed carts. (Q5)
  5. FEAT-CHECKOUT check order and PRODUCT pricing formula (`total = subtotal − discount + shipping`) both change. (Q8)
- **Docs to update:** FEAT-CHECKOUT (request/response fields, check order, UI), PRODUCT pricing formula, FEAT-ORDERS (order detail fields), CARD-157 (refund includes wrap fee).
- **Proposed new rules:** `BR-GIFT-01` fee 300 cents per order, not discountable, outside shipping threshold, in total; `BR-GIFT-02` not allowed when any line is electronics (`422 GIFT_WRAP_NOT_ALLOWED`); `BR-GIFT-03` message optional, trimmed, ≤ 200 chars, requires wrap. Tags `@BR-GIFT-01..03` are used only once these rules are upserted to the vault.
- **Existing tests at risk:** checkout endpoint specs (`tests/api/endpoints/orders.spec.ts`) and checkout journeys asserting exact response shape/totals; checkout UI page object (new control under Payment may need `exact: true` label locators); BR-SHIP-01 / BR-COUP-04 tests should stay green unchanged; that is the regression signal.

## Test ideas

**P1: API endpoint `POST /api/orders`**
- wrap true → 201, `giftWrapCents` 300, total includes it (@BR-GIFT-01)
- no wrap field → totals unchanged (backwards compat)
- shipping boundary 4999/5000 with wrap (@BR-SHIP-01 @BR-GIFT-01)
- coupon + wrap: fee not discounted (@BR-COUP-04 @BR-GIFT-01)
- electronics + wrap → 422 GIFT_WRAP_NOT_ALLOWED (@BR-GIFT-02)
- message 1/200 chars ok, 201 → 400, whitespace → null, message without wrap → 400 (@BR-GIFT-03)
- non-boolean `giftWrap` via `api.raw` → 400
- error precedence: EMPTY_CART, VALIDATION before GIFT_WRAP_NOT_ALLOWED before OUT_OF_STOCK; electronics + 201-char message → 400 VALIDATION wins
- flat fee with a 10-unit line (@BR-CART-01 @BR-GIFT-01)

**P1: API journey**
- add items → coupon → checkout with wrap + message → GET order shows wrap/message/totals → stock decremented (@journey)
- declined card with wrap → no order, stock and cart unchanged (@BR-PAY-01)

**P2: UI (`#/checkout`, `#/orders/<id>`)**
- tick wrap → fee line and total update; untick reverts
- textarea appears/hides; counter; 200-char limit
- electronics cart → checkbox disabled with explanation (accessible description)
- order detail shows "Gift wrapped" and message (@smoke candidate)

**P3**
- cancel wrapped order → restock, wrap fields kept
- keyboard-only: tick checkbox, type message, place order
