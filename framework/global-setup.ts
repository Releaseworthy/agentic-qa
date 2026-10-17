/**
 * Runs once before all workers:
 *
 *   1. The base URL must answer as TEST_ENV, so a staging config can't run against live.
 *   2. With test hooks, pin the app's seeded defects to exactly SHOPLITE_DEFECTS
 *      (default none), so a reused local server left in a defect mode by an
 *      exploratory session can't change this run's results.
 *   3. Each account in PRELOGIN_ACCOUNTS gets a verified storage state, so
 *      workers only ever read .auth/ and never race to sign in.
 */

import { request } from '@playwright/test';
import { Api } from '@api';
import { isSavedAccount } from '@auth/accounts';
import { session } from '@auth/session';
import { env } from '@config/env';
import { DateFormat, formatDate } from '@utils/date';

export default async function globalSetup(): Promise<void> {
  const context = await request.newContext();
  try {
    const api = new Api(context);
    const health = await api.health();
    if (health.env !== env.name)
      throw new Error(`${env.baseUrl} answers as the "${health.env}" environment, not TEST_ENV=${env.name}`);

    if (env.testHooks) {
      const list = process.env.SHOPLITE_DEFECTS ?? '';
      const { status, body } = await api.raw('PUT', '/api/test/defects', {
        enabled: list.trim() === '' ? 'none' : list,
      });
      if (status !== 200) throw new Error(`could not set seeded defects: ${status} ${JSON.stringify(body)}`);
    }
  } finally {
    await context.dispose();
  }

  for (const name of env.preloginAccounts) {
    if (!isSavedAccount(name)) throw new Error(`PRELOGIN_ACCOUNTS: "${name}" is not a saved account`);
    const { expiresAt } = await session(name, { verify: true });
    console.log(`[global-setup] ${env.name}: ${name} signed in until ${formatDate(expiresAt, DateFormat.LOG)}`);
  }
}
