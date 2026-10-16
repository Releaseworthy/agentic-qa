---
id: TC-AUTH-001
type: test-case
title: Registering signs the new customer in
feature: FEAT-AUTH
covers: []
priority: high
status: ready
automated_by: tests/ui/auth.spec.ts › Sign up and sign in › registering signs the new customer in
---

# TC-AUTH-001 — Registering signs the new customer in

## Preconditions

- Signed out (a fresh browser session, no state loaded).

## Test data

Name `Ada Tester`, a unique email (`ada+<timestamp>@shoplite.test`), password `abcdef12`.

## Steps

| # | Action                                        | Expected result                                                  |
| - | --------------------------------------------- | ---------------------------------------------------------------- |
| 1 | Open **Register** in the header               | "Create an account" with Name, Email and Password fields         |
| 2 | Fill the test data, click **Create account**  | The catalog opens; the header shows `Ada Tester`                 |
| 3 | Look at the header                            | Orders and Sign out are shown; Sign in and Register are hidden   |
| 4 | Reload the page                               | Still signed in as `Ada Tester`                                  |

## Expected overall result

Registration signs the customer in straight away ([[FEAT-AUTH]]).
