---
id: TC-AUTH-004
type: test-case
title: Signing in returns to the page that asked for it
feature: FEAT-AUTH
covers: []
priority: medium
status: ready
automated_by: tests/ui/auth.spec.ts › Sign up and sign in › signing in returns to the page that asked for it
setup: { recipe: customer, signedIn: false }
---

# TC-AUTH-004: Signing in returns to the page that asked for it

## Preconditions

- A registered customer, signed out in the browser: `bun run qa:arrange --case TC-AUTH-004 --name <session>`; its `user.email` and `user.password` are in the output.

## Steps

| # | Action                                   | Expected result                                          |
| - | ---------------------------------------- | -------------------------------------------------------- |
| 1 | Open `#/cart` directly                   | The Sign in page opens; the address is `#/login?next=%2Fcart` |
| 2 | Sign in with the customer's credentials  | The cart opens ("Your cart"); the header shows the customer's name |

## Expected overall result

Sign-in sends the customer back where they were going ([[FEAT-AUTH]]).
