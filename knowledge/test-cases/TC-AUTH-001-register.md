---
id: TC-AUTH-001
type: test-case
title: Registering signs the new customer in
feature: FEAT-AUTH
covers: []
priority: high
status: ready
automated_by: tests/ui/auth.spec.ts › Sign up and sign in › registering signs the new customer in
setup: { recipe: guest }
---

# TC-AUTH-001: Registering signs the new customer in

## Preconditions

- Signed out, nothing created: `bun run qa:arrange --case TC-AUTH-001 --name <session>` (open without `state-load`).

## Test data

Name, email and password from `testData.registration` in the arrange output: a unique email and a password valid under BR-AUTH-01.

## Steps

| # | Action                                        | Expected result                                                  |
| - | --------------------------------------------- | ---------------------------------------------------------------- |
| 1 | Open **Register** in the header               | "Create an account" with Name, Email and Password fields         |
| 2 | Fill the test data, click **Create account**  | The catalog opens; the header shows the registered name                 |
| 3 | Look at the header                            | Orders and Sign out are shown; Sign in and Register are hidden   |
| 4 | Reload the page                               | Still signed in under the registered name                                  |

## Expected overall result

Registration signs the customer in straight away ([[FEAT-AUTH]]).
