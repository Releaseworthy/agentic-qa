import { HttpError } from '@app/http';
import { store, type User } from '@app/store';

/** BR-AUTH-02: five failed logins in a row lock the account for 15 minutes. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;
const SESSION_MS = 8 * 60 * 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role'>;
/** What register and login answer: the user, a bearer token and when it expires (ISO 8601). */
export type AuthResult = { user: PublicUser; token: string; expiresAt: string };

export function publicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

/** BR-AUTH-01: 8–64 characters with at least one letter and one digit. */
export function checkPassword(password: string): void {
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    throw new HttpError(400, 'WEAK_PASSWORD', 'Password needs 8-64 characters, with a letter and a digit');
}

function signIn(user: User): AuthResult {
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Date.now() + SESSION_MS;
  store.sessions.set(token, { token, userId: user.id, expiresAt });
  return { user: publicUser(user), token, expiresAt: new Date(expiresAt).toISOString() };
}

export function register(email: string, password: string, name: string): AuthResult {
  const normalized = email.toLowerCase();
  if (!EMAIL.test(normalized)) throw new HttpError(400, 'INVALID_EMAIL', 'Email address is not valid');
  if (name.length > 80) throw new HttpError(400, 'VALIDATION', 'Name is at most 80 characters');
  checkPassword(password);
  if (store.userByEmail(normalized))
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  const user: User = {
    id: store.nextId('u'),
    email: normalized,
    name,
    role: 'customer',
    passwordHash: Bun.password.hashSync(password, { algorithm: 'bcrypt', cost: 4 }),
    failedLogins: 0,
    lockedUntil: null,
  };
  store.users.set(user.id, user);
  return signIn(user);
}

export function login(email: string, password: string): AuthResult {
  const user = store.userByEmail(email);
  // Same answer for an unknown email and a wrong password: no account enumeration.
  const invalid = new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  if (!user) throw invalid;
  const now = Date.now();
  if (user.lockedUntil !== null && user.lockedUntil > now)
    throw new HttpError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes');
  if (!Bun.password.verifySync(password, user.passwordHash)) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.lockedUntil = now + LOCKOUT_MS;
      user.failedLogins = 0;
    }
    throw invalid;
  }
  user.failedLogins = 0;
  user.lockedUntil = null;
  return signIn(user);
}

export function logout(token: string): void {
  store.sessions.delete(token);
}
