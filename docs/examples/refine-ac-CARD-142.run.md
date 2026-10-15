### Agentic QA · `refine-ac CARD-142`

**needs_human** · 6 turns · $1.17 · 0.4 min

The refined acceptance criteria for CARD-142 are in out/ac/CARD-142.md: 8 criteria, each with a negative path and exact cent values. They passed review on round 2, and I applied its last three minor fixes. Product must first decide (Q1) whether wrap is per order or per item, (Q3) whether the $3 fee counts toward the $50 free-shipping threshold, (Q4) whether a coupon can discount the fee, and (Q5) what happens when a cart mixes electronics with other products. Engineering should confirm the API fields (Q7) and where the new errors fall in the checkout check order (Q8). The card was not edited, and Product can paste the refined criteria once these are settled.

- **high** Conflict: per-item wrap in the description vs per-order wrap in AC1; per-item also clashes with cart line merging (FEAT-CART)
- **high** Conflict: undecided whether the wrap fee counts toward the free-shipping threshold (subtotal − discount ≥ 5000) (BR-SHIP-01)
- **medium** Conflict: undecided whether a coupon can discount the wrap fee (discount capped at subtotal) (BR-COUP-04)
- **medium** Undecided: whether a cart mixing electronics and other items can be wrapped (no rule exists for it) (FEAT-CATALOG)
- **medium** Checkout check order and pricing formula change; existing orders specs asserting exact totals may break (FEAT-CHECKOUT)
- **low** Refund of the wrap fee must be covered by the refund card (CARD-157)
- **info** New rules proposed: fee, electronics exclusion, gift message limits (BR-GIFT-01..03)

Artifacts: `out/ac/CARD-142.md`

<sub>Models: claude-opus-5-5: 713862 in / 21772 out · claude-haiku-5-5: 87465 in / 4844 out</sub>