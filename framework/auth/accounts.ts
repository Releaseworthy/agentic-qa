import type { Credentials } from '@api/auth-api';
import { required } from '@config/env';
import { decrypt, isEncrypted } from '@utils/crypto';

/**
 * Who a browser context or API call acts as.
 *
 *   GUEST               no session
 *   NEW_CUSTOMER        a customer registered for this test only. Use it for anything
 *                       that changes per-user state (cart, orders); never shared
 *   RETURNING_CUSTOMER  saved account with order history; read-only use, so
 *                       tests can share it in parallel, on every environment
 *   ADMIN               saved account the seed acts as (products, coupons, shipping)
 *
 * Saved accounts: credentials in env/.env.<TEST_ENV> as enc1.… tokens
 * (<NAME>_EMAIL / <NAME>_PASSWORD), session cached in .auth/<env>/<name>.json.
 */
export const Account = {
  GUEST: 'guest',
  NEW_CUSTOMER: 'new-customer',
  RETURNING_CUSTOMER: 'returning-customer',
  ADMIN: 'admin',
} as const;
export type Account = (typeof Account)[keyof typeof Account];

export type SavedAccount = typeof Account.RETURNING_CUSTOMER | typeof Account.ADMIN;

const SAVED: readonly string[] = [Account.RETURNING_CUSTOMER, Account.ADMIN] satisfies SavedAccount[];

export function isSavedAccount(value: string): value is SavedAccount {
  return SAVED.includes(value);
}

/** Decrypted credentials of a saved account. */
export function credentials(account: SavedAccount): Credentials {
  const prefix = account.toUpperCase().replaceAll('-', '_');
  return { email: secret(`${prefix}_EMAIL`), password: secret(`${prefix}_PASSWORD`) };
}

function secret(key: string): string {
  const value = required(key);
  if (!isEncrypted(value)) throw new Error(`${key} must be an enc1.… token (bun run crypto encrypt), not plaintext`);
  return decrypt(value);
}
