---
id: BR-AUTH-02
type: rule
title: "Lockout after five failed sign-ins"
feature: FEAT-AUTH
severity: high
---

# BR-AUTH-02 — Lockout after five failed sign-ins

**Five failed sign-ins in a row lock the account for 15 minutes.** While locked,
even the right password answers `423 ACCOUNT_LOCKED` ("Too many failed attempts.
Try again in 15 minutes"). A successful sign-in resets the failure count, so
4 failures + 1 success + 4 failures never locks.

Unknown emails are not counted (there is no account to lock) and answer the
same `401 INVALID_CREDENTIALS` as a wrong password.

Part of [[FEAT-AUTH]].
