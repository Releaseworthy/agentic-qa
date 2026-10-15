---
id: LRN-TEST-DATA
type: learning
title: Test data is created per test, never shared
source: PR review
applies_to: [framework/setup/seed.ts, tests/**]
---

# Test data is created per test, never shared

- **Create the product a test changes.** Seeded products are shared by every
  parallel worker; buying one changes its stock under another test. Use
  `seed.product({ stock, priceCents })` — the price also makes totals exact.
- **A fresh customer per test** (`customer` fixture). One cart per user means a
  shared account makes parallel tests fight over one cart.
- **Unique coupon codes** (`seed.coupon(...)`) when a test needs a coupon shape
  the seeded ones don't have.
- Reading seeded data is fine (catalog search, `WELCOME10`, `SUMMER20`).

Learned when a reviewer rejected a generated cart test that bought the seeded
Kite (stock 3): it passed alone and failed under `--workers=4`.
