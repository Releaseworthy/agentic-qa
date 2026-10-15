## Change impact

**72 of 108** tests selected (4 features, 0 specs).

| Risk | Feature | Criticality | Why | Open defects |
| --- | --- | --- | --- | --- |
| high (8.5) | FEAT-CHECKOUT — Checkout and payment | 5 | app/domain/pricing.ts is its code; app/domain/orders.ts imports app/domain/cart.ts; app/routes/orders.ts imports app/domain/orders.ts | DEF-001 |
| high (4.54) | FEAT-CART — Shopping cart | 4 | app/domain/pricing.ts is its code; app/domain/cart.ts imports app/domain/pricing.ts; app/routes/cart.ts imports app/domain/cart.ts | — |
| high (3.4) | FEAT-COUPON — Coupons | 3 | app/domain/pricing.ts is its code; app/domain/cart.ts imports app/domain/pricing.ts; app/routes/cart.ts imports app/domain/cart.ts | — |
| medium (1.81) | FEAT-ORDERS — Order history and cancellation | 4 | app/domain/orders.ts imports app/domain/cart.ts; app/routes/admin.ts imports app/domain/orders.ts; app/routes/orders.ts imports app/domain/orders.ts | — |

<details><summary>1 changed files</summary>

- `app/domain/pricing.ts` (1 lines)
</details>