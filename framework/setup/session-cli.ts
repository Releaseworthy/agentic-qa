/**
 * Seeds a start state over the API for exploratory testing, and saves a signed-in
 * browser state that `playwright-cli state-load` restores. Starts ShopLite as
 * TEST_ENV when it is not running (in the background; `SHOPLITE_DEFECTS` passes through).
 *
 *   bun run seed:session --name s1
 *   bun run seed:session --name s1 --product 4999:3 --cart 2 --coupon WELCOME10
 *   bun run seed:session --name s1 --order --shipped
 *   bun run seed:session --name s1 --account returning-customer     (read-only; works on live)
 *
 *   bunx playwright-cli -s=s1 open http://localhost:3100
 *   bunx playwright-cli -s=s1 state-load out/sessions/s1.json
 *   bunx playwright-cli -s=s1 goto http://localhost:3100/#/cart
 *
 * --account <name>                sign in as a saved account instead of a new customer; seeds nothing
 * --product <priceCents>:<stock>  a fresh product (default 1000:50)
 * --cart <qty>                    put it in the customer's cart
 * --coupon <code>                 apply a coupon to that cart
 * --order                         place an order for it (cart emptied)
 * --shipped                       ship that order (admin)
 * --defects <ids|all|none>        switch the app's seeded defects (app/defects.ts) — practice targets
 * Prints the customer (with password), product, cart/order ids as JSON.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { request } from '@playwright/test';
import { Api, type Cart, type Order } from '@api';
import { isSavedAccount } from '@auth/accounts';
import { session, storageState, type Customer, type Session } from '@auth/session';
import { env } from '@config/env';
import { ROOT } from '@config/paths';
import { Seed } from '@setup/seed';
import { toMs } from '@utils/date';

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${env.baseUrl}/health`)).ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<boolean> {
  if (await healthy()) return false;
  if (!env.startApp)
    throw new Error(`${env.baseUrl} is not answering, and TEST_ENV=${env.name} does not start the app`);
  const child = spawn(process.execPath, ['run', 'framework/setup/app-server.ts'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  for (let i = 0; i < 50 && !(await healthy()); i++) await Bun.sleep(toMs({ seconds: 0.2 }));
  if (!(await healthy())) throw new Error(`ShopLite did not start at ${env.baseUrl}`);
  return true;
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    name: { type: 'string', default: 'explore' },
    account: { type: 'string' },
    product: { type: 'string' },
    cart: { type: 'string' },
    coupon: { type: 'string' },
    order: { type: 'boolean' },
    shipped: { type: 'boolean' },
    defects: { type: 'string' },
  },
});
if (values.account !== undefined && !isSavedAccount(values.account))
  throw new Error(`--account: "${values.account}" is not a saved account`);

const started = await ensureServer();
if (values.defects !== undefined) {
  const res = await fetch(`${env.baseUrl}/api/test/defects`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: values.defects || 'none' }),
  });
  if (!res.ok) throw new Error(`could not set defects: ${await res.text()}`);
}
const ctx = await request.newContext({ baseURL: env.baseUrl });
try {
  let user: Session | Customer;
  let product;
  let cart: Cart | undefined;
  let order: Order | undefined;
  if (values.account !== undefined && isSavedAccount(values.account)) {
    user = await session(values.account, { verify: true });
  } else {
    const seed = new Seed(ctx);
    const customer = await seed.customer();
    user = customer;
    const [priceCents = 1000, stock = 50] = (values.product ?? '').split(':').filter(Boolean).map(Number);
    product = values.product || values.cart || values.order ? await seed.product({ priceCents, stock }) : undefined;
    if (product && (values.cart || values.coupon))
      cart = await seed.cart(customer, [{ product, quantity: Number(values.cart ?? 1) }], values.coupon);
    if (product && values.order) {
      if (cart) await new Api(ctx, customer.token).cart.remove(product.id);
      order = await seed.order(customer, [{ product, quantity: Number(values.cart ?? 1) }]);
      if (values.shipped) order = await seed.shipped(order);
    }
  }

  const dir = join(ROOT, 'out', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${values.name}.json`), JSON.stringify(storageState(user), null, 2));

  console.log(
    JSON.stringify(
      {
        env: env.name,
        app: env.baseUrl,
        startedApp: started,
        stateFile: `out/sessions/${values.name}.json`,
        user: { ...user, token: undefined },
        product,
        cart,
        order,
        next: [
          `bunx playwright-cli -s=${values.name} open ${env.baseUrl}`,
          `bunx playwright-cli -s=${values.name} state-load out/sessions/${values.name}.json`,
          `bunx playwright-cli -s=${values.name} goto ${env.baseUrl}/#/${order ? `orders/${order.id}` : cart ? 'cart' : ''}`,
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await ctx.dispose();
}
