/**
 * Starts ShopLite as the current TEST_ENV, as a local stand-in for that
 * environment's deployment: its port from BASE_URL, its environment name, test
 * hooks on or off, and the saved accounts it knows, decrypted here and handed
 * over the way a deployment injects its secrets. Playwright's webServer,
 * `bun run app` and `qa:arrange` all start the app through this.
 *
 *   bun run app                        dev       http://localhost:3100
 *   TEST_ENV=staging bun run app       staging   http://localhost:3200
 *   TEST_ENV=live bun run app          live      http://localhost:3300, no test hooks
 *
 * PORT and SHOPLITE_DEFECTS pass through from the caller.
 */

import { Account, credentials, type SavedAccount } from '@auth/accounts';
import { env } from '@config/env';

/** The variables app/server.ts reads, for the current TEST_ENV. */
export function appEnv(): Record<string, string> {
  const vars: Record<string, string> = {
    PORT: process.env.PORT ?? (new URL(env.baseUrl).port || '80'),
    SHOPLITE_ENV: env.name,
    SHOPLITE_TEST_HOOKS: env.testHooks ? '1' : '0',
  };
  const accounts: [SavedAccount, string][] = [
    [Account.ADMIN, 'ADMIN'],
    [Account.RETURNING_CUSTOMER, 'CUSTOMER'],
  ];
  // An environment without an account's credentials gets none: live has no admin the tests may use.
  for (const [account, name] of accounts) {
    if (!process.env[`${account.toUpperCase().replaceAll('-', '_')}_EMAIL`]) continue;
    const { email, password } = credentials(account);
    vars[`SHOPLITE_${name}_EMAIL`] = email;
    vars[`SHOPLITE_${name}_PASSWORD`] = password;
  }
  return vars;
}

if (import.meta.main) {
  Object.assign(process.env, appEnv());
  // After the variables are set: the store seeds itself from them on import.
  await import('@app/server');
}
