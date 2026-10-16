---
id: TC-AUTH-004
type: test-case
title: Signing in returns to the page that asked for it
feature: FEAT-AUTH
covers: []
priority: medium
status: ready
automated_by: tests/ui/auth.spec.ts › Sign up and sign in › signing in returns to the page that asked for it
---

# TC-AUTH-004 — Signing in returns to the page that asked for it

## Preconditions

- A registered customer (`bun run seed:session --name <session>` prints email and password); signed out in the browser.

## Steps

| # | Action                                   | Expected result                                          |
| - | ---------------------------------------- | -------------------------------------------------------- |
| 1 | Open `#/cart` directly                   | The Sign in page opens; the address is `#/login?next=%2Fcart` |
| 2 | Sign in with the customer's credentials  | The cart opens ("Your cart"); the header shows the customer's name |

## Expected overall result

Sign-in sends the customer back where they were going ([[FEAT-AUTH]]).
