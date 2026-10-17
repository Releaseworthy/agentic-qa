---
id: TC-AUTH-002
type: test-case
title: A weak password is refused with the rule spelled out
feature: FEAT-AUTH
covers: [BR-AUTH-01]
priority: high
status: ready
automated_by: tests/ui/auth.spec.ts › Sign up and sign in › a weak password is refused with the rule spelled out
setup: { recipe: guest }
---

# TC-AUTH-002: A weak password is refused with the rule spelled out

## Preconditions

- Signed out, nothing created: `bun run qa:arrange --case TC-AUTH-002 --name <session>`; name and email from `testData.registration`.

## Test data

| Password      | Why                     |
| ------------- | ----------------------- |
| `abc1234`     | 7 characters            |
| `onlyletters` | no digit                |
| `12345678`    | no letter               |
| `abcdef12`    | 8 characters, accepted  |

## Steps

| # | Action                                                       | Expected result                                                            |
| - | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1 | Open **Register**, fill a unique email and password `abc1234`, click **Create account** | Alert "Password needs 8-64 characters, with a letter and a digit"; still on Register |
| 2 | Replace the password with `onlyletters`, click **Create account** | The same alert                                                       |
| 3 | Replace the password with `12345678`, click **Create account** | The same alert                                                          |
| 4 | Replace the password with `abcdef12`, click **Create account** | The catalog opens, signed in                                            |

## Expected overall result

Only a password of 8-64 characters with a letter and a digit is accepted ([[BR-AUTH-01]]).
