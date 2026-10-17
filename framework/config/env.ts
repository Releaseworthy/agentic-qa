/**
 * Loads env/.env.<TEST_ENV> (then env/.env.<TEST_ENV>.local, if present) into
 * process.env once per process, validates it and exposes it typed. Variables
 * already set in the shell or CI win over both files.
 *
 *   TEST_ENV=staging bun run test
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { ENV_DIR } from '@config/paths';

export const Environment = z.enum(['dev', 'staging', 'live']);
export type Environment = z.infer<typeof Environment>;

/** What every env file must define; anything else in process.env is ignored here. */
const Variables = z.object({
  BASE_URL: z.url(),
  /** Start ShopLite as this environment before the run (a local stand-in for a deployment). */
  START_APP: z.stringbool().default(false),
  /** The build exposes /api/test/* (seeded defects can be pinned). Never on a real deployment. */
  TEST_HOOKS: z.stringbool().default(false),
  /** Shared real data: only `@readonly` tests run, and nothing may be seeded. */
  READ_ONLY: z.stringbool().default(false),
  /** Comma-separated saved accounts global setup signs in before the run. */
  PRELOGIN_ACCOUNTS: z.string().default(''),
});

const name = Environment.safeParse(process.env.TEST_ENV ?? 'dev');
if (!name.success) throw new Error(`TEST_ENV must be one of ${Environment.options.join(', ')}`);

const files = [`.env.${name.data}.local`, `.env.${name.data}`]
  .map((file) => join(ENV_DIR, file))
  .filter((file) => existsSync(file));
if (files.length === 0) throw new Error(`no env file for TEST_ENV=${name.data} (expected env/.env.${name.data})`);
// First file wins per key, and nothing overrides the real environment.
config({ path: files, quiet: true });

const variables = Variables.safeParse(process.env);
if (!variables.success) throw new Error(`invalid env (TEST_ENV=${name.data}):\n${z.prettifyError(variables.error)}`);

/** A required variable; throws with its name when it is missing. */
export function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') throw new Error(`${key} is not set (TEST_ENV=${env.name})`);
  return value.trim();
}

export const env = {
  name: name.data,
  baseUrl: variables.data.BASE_URL,
  startApp: variables.data.START_APP,
  testHooks: variables.data.TEST_HOOKS,
  readOnly: variables.data.READ_ONLY,
  preloginAccounts: variables.data.PRELOGIN_ACCOUNTS.split(',')
    .map((account) => account.trim())
    .filter(Boolean),
} as const;
