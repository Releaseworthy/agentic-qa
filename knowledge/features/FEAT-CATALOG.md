---
id: FEAT-CATALOG
type: feature
title: Catalog browsing and search
criticality: 3
code: [app/domain/catalog.ts, app/routes/products.ts]
endpoints: [GET /api/products, GET /api/products/:id]
pages: ['#/', '#/product/:id']
rules: []
depends_on: []
---

# Catalog browsing and search

Anyone, signed in or not, can browse the catalog.

## Behaviour

- `GET /api/products?q=&category=&sort=` returns `{ items, count }`.
  - `q` matches the name **or** the description, case-insensitively.
  - `category` is one of `books`, `electronics`, `home`, `toys`; anything else is `400 VALIDATION`.
  - `sort` is `name` (default, A→Z), `price_asc` or `price_desc` (ties broken by name).
- `GET /api/products/:id` returns one product or `404 NOT_FOUND`.
- The product page shows price, `N in stock` or `Out of stock`; with no stock the
  Add to cart button is disabled ([[BR-CART-02]]).
- The catalog page shows `1 product` / `N products` and "No products match your
  search." for an empty result.

## Data

Twelve seeded products, 3 per category. The Kite (`TY-003`) is seeded with only
3 in stock. Tests create their own products through the admin API instead of
relying on seeded stock (see [[LRN-TEST-DATA]]).
