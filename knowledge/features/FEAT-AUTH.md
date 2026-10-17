---
id: FEAT-AUTH
type: feature
title: Accounts and sign-in
criticality: 4
code: [app/domain/auth.ts, app/routes/auth.ts, app/http.ts]
endpoints: [POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me]
pages: ['#/register', '#/login']
rules: [BR-AUTH-01, BR-AUTH-02]
depends_on: []
---

# Accounts and sign-in

Customers register with name, email and password, then sign in to get a
bearer token (valid 8 hours). Every cart and order endpoint needs it.

## Behaviour

- Register: `201 { user, token }`; the customer is signed in straight away.
  Emails are stored lower-case, so `A@x.test` and `a@x.test` are the same account.
  Passwords follow [[BR-AUTH-01]].
- Sign in: `200 { user, token }`. A wrong password and an unknown email answer the
  same `401 INVALID_CREDENTIALS` with the same message, so there is no account enumeration.
  Repeated failures lock the account ([[BR-AUTH-02]]).
- Sign out deletes the token; it answers 401 afterwards.
- UI: after signing in, the app returns to the page that asked for it (`?next=`),
  the header shows the customer's name, and Orders / Sign out appear.

## Risks

- Lockout is per account, so an attacker can lock out a known customer (accepted risk).
- A token is the only credential, so losing it to XSS is a full account takeover;
  every rendered string is escaped.
