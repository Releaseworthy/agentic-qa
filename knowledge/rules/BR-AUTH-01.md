---
id: BR-AUTH-01
type: rule
title: "Password policy"
feature: FEAT-AUTH
severity: high
---

# BR-AUTH-01: Password policy

A password has **8 to 64 characters** with **at least one letter and one digit**.

| Password           | Result                 |
| ------------------ | ---------------------- |
| `abc1234` (7)      | `400 WEAK_PASSWORD`    |
| `abcdef12` (8)     | accepted               |
| 64 characters      | accepted               |
| 65 characters      | `400 WEAK_PASSWORD`    |
| `onlyletters`      | `400 WEAK_PASSWORD`    |
| `12345678`         | `400 WEAK_PASSWORD`    |

Message: "Password needs 8-64 characters, with a letter and a digit". The UI
shows it verbatim in an alert. Applies to registration only (there is no
password change yet).

Part of [[FEAT-AUTH]].
