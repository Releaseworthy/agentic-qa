---
id: TC-AUTH-003
type: test-case
title: Five failed sign-ins lock the account
feature: FEAT-AUTH
covers: [BR-AUTH-02]
priority: high
status: ready
automated_by: none
setup: { recipe: customer, signedIn: false }
---

# TC-AUTH-003: Five failed sign-ins lock the account

## Preconditions

- A registered customer, signed out in the browser: `bun run qa:arrange --case TC-AUTH-003 --name <session>`; its `user.email` and `user.password` are in the output.

## Test data

Wrong password `wrong-pass1`; the right password is `user.password` from the arrange output.

## Steps

| # | Action                                                   | Expected result                                             |
| - | -------------------------------------------------------- | ----------------------------------------------------------- |
| 1 | Open **Sign in**, enter the email and `wrong-pass1`, click **Sign in** | Alert "Email or password is incorrect"         |
| 2 | Repeat step 1 four more times (5 failures in total)      | The same alert each time                                    |
| 3 | Enter the **right** password, click **Sign in**          | Alert "Too many failed attempts. Try again in 15 minutes"; still signed out |
| 4 | Look at the header                                       | Sign in is still shown                                      |

## Expected overall result

After five failures in a row even the right password is refused for 15 minutes ([[BR-AUTH-02]]).
