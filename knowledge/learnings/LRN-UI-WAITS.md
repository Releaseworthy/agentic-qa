---
id: LRN-UI-WAITS
type: learning
title: Wait for the request behind a UI action, never for time
status: active
confidence: established
support: 1
applies_to: [framework/pages/**]
sources: [PR review]
evidence: ['review: PR review']
created: 2026-10-15
updated: 2026-10-15
---

# Wait for the request behind a UI action, never for time

- Every page-object action that calls the API waits for **that response**
  (`page.waitForResponse(...)` set up before the click), so the next assertion
  sees the server's answer — e.g. `CartPage.setQuantity`, `CheckoutPage.placeOrder`.
- Navigation waits for the SPA's own signal, `body[data-ready="<route>"]`
  (`BasePage.open`), not for `networkidle`.
- Never fix a flaky step by raising a timeout or adding `waitForTimeout`: it
  hides the missing wait. Find the request the user would wait for.
- Prefer role/label locators (`getByRole`, `getByLabel`) — the UI is built
  accessible on purpose. `exact: true` when one label contains another
  ("Address" vs "Shipping address").
