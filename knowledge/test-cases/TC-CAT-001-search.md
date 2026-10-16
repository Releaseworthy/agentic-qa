---
id: TC-CAT-001
type: test-case
title: Search narrows the catalog to matching products
feature: FEAT-CATALOG
covers: []
priority: medium
status: ready
automated_by: tests/ui/catalog.spec.ts › Catalog › search narrows the list to matching products
setup: { recipe: guest }
---

# TC-CAT-001 — Search narrows the catalog to matching products

## Preconditions

- Signed out, nothing created — the catalog is public and this case changes nothing (runs on live too): `bun run qa:arrange --case TC-CAT-001 --name <session>`.

## Steps

| # | Action                                         | Expected result                                   |
| - | ---------------------------------------------- | ------------------------------------------------- |
| 1 | Open the **Catalog**                           | "N products" with one card per product, sorted by name |
| 2 | Type `KITE` in **Search**, click **Apply**     | Only products whose name or description has "kite" (any case) |
| 3 | Search `zzzz-no-match`, click **Apply**        | "0 products" and "No products match your search." |

## Expected overall result

Search is case-insensitive over name and description ([[FEAT-CATALOG]]).
