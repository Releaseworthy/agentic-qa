/**
 * API sign-in → Playwright storage state in .auth/<env>/<account>.json.
 *
 * ShopLite's UI keeps its session in localStorage (token, user name, expiry),
 * so the state file holds exactly those keys for the app's origin. A saved
 * session is reused until 5 minutes before the expiry the API returned.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { request as playwright, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { Api, ApiError, type AuthResult } from '@api';
import { Account, credentials, type SavedAccount } from '@auth/accounts';
import { env } from '@config/env';
import { AUTH_DIR } from '@config/paths';
import { newRegistration } from '@data/people';
import { fromIso, isFresh, toIso } from '@utils/date';

/** A signed-in identity: what the browser and the API helpers act as. */
export interface Session {
  account: Account;
  email: string;
  name: string;
  token: string;
  expiresAt: Date;
}

/** A customer registered for one test ({@link newCustomer}), with the password it signed up with. */
export interface Customer extends Session {
  account: typeof Account.NEW_CUSTOMER;
  id: string;
  password: string;
}

/** The localStorage keys app/web/app.js reads. */
const Key = { TOKEN: 'shoplite.token', USER: 'shoplite.user', EXPIRES_AT: 'shoplite.expiresAt' } as const;
const REUSE_MARGIN = { minutes: 5 };

const StorageState = z.object({
  cookies: z.array(z.never()),
  origins: z.array(
    z.object({ origin: z.string(), localStorage: z.array(z.object({ name: z.string(), value: z.string() })) }),
  ),
});
export type StorageState = z.infer<typeof StorageState>;

const pending = new Map<SavedAccount, Promise<Session>>();

/** Where a saved account's storage state lives for the current TEST_ENV. */
export function statePath(account: SavedAccount): string {
  return join(AUTH_DIR, env.name, `${account}.json`);
}

/** The storage state of a session; none gives a signed-out state. */
export function storageState(session?: Session): StorageState {
  if (session === undefined) return { cookies: [], origins: [] };
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(env.baseUrl).origin,
        localStorage: [
          { name: Key.TOKEN, value: session.token },
          { name: Key.USER, value: session.name },
          { name: Key.EXPIRES_AT, value: toIso(session.expiresAt) },
        ],
      },
    ],
  };
}

/**
 * A live session for a saved account: from disk while still fresh, otherwise
 * from a new API sign-in (written back to disk). `verify` also asks the server
 * whether a saved token is still accepted — global setup does this once per
 * run, since an app restart drops every session. Deduplicated per process.
 */
export function session(account: SavedAccount, { verify = false } = {}): Promise<Session> {
  let current = pending.get(account);
  if (current === undefined) {
    current = resolveSession(account, verify).catch((error: unknown) => {
      pending.delete(account);
      throw error;
    });
    pending.set(account, current);
  }
  return current;
}

/**
 * Registers a customer no other test uses. Refused on a read-only environment,
 * where it would leave real accounts behind.
 */
export async function newCustomer(request?: APIRequestContext): Promise<Customer> {
  if (env.readOnly)
    throw new Error(`TEST_ENV=${env.name} is read-only: a test that registers customers cannot be tagged @readonly`);
  const registration = newRegistration();
  return withApi(request, async (api) => {
    const result = await api.auth.register(registration);
    return { ...toSession(Account.NEW_CUSTOMER, result), id: result.user.id, password: registration.password };
  });
}

async function resolveSession(account: SavedAccount, verify: boolean): Promise<Session> {
  const saved = readSession(account);
  if (saved !== undefined && isFresh(saved.expiresAt, REUSE_MARGIN)) {
    if (!verify || (await accepted(saved))) return saved;
  }
  const fresh = await withApi(undefined, async (api) => toSession(account, await api.auth.login(credentials(account))));
  writeState(statePath(account), storageState(fresh));
  return fresh;
}

async function accepted(saved: Session): Promise<boolean> {
  return withApi(undefined, async (api) => {
    try {
      await api.as(saved).auth.me();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
  });
}

function toSession<A extends Account>(account: A, { user, token, expiresAt }: AuthResult) {
  return { account, email: user.email, name: user.name, token, expiresAt: fromIso(expiresAt) };
}

function readSession(account: SavedAccount): Session | undefined {
  const path = statePath(account);
  if (!existsSync(path)) return undefined;
  try {
    const state = StorageState.parse(JSON.parse(readFileSync(path, 'utf8')));
    const origin = state.origins.find((o) => o.origin === new URL(env.baseUrl).origin);
    const value = (key: string) => origin?.localStorage.find((item) => item.name === key)?.value;
    const [token, name, expiresAt] = [value(Key.TOKEN), value(Key.USER), value(Key.EXPIRES_AT)];
    if (!token || name === undefined || !expiresAt) return undefined;
    return { account, email: credentials(account).email, name, token, expiresAt: fromIso(expiresAt) };
  } catch {
    return undefined; // corrupt or half-written: sign in again
  }
}

/** Atomic write, so a parallel reader never sees a partial file. */
function writeState(path: string, state: StorageState): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

/** Runs `fn` on the test's request context, or on a throwaway one outside a test. */
async function withApi<T>(request: APIRequestContext | undefined, fn: (api: Api) => Promise<T>): Promise<T> {
  if (request) return fn(new Api(request));
  const context = await playwright.newContext();
  try {
    return await fn(new Api(context));
  } finally {
    await context.dispose();
  }
}
