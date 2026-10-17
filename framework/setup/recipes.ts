/**
 * Named start states (preconditions) built from the framework: the one way manual test runs, bug repros,
 * exploration and specs get their data. Arrange with a recipe, then perform only the steps under test.
 *
 *   CLI      bun run qa:arrange cart --name s1 priceCents=5000      (framework/setup/arrange-cli.ts)
 *   script   await arrange(request, 'cart', { priceCents: 5000 })   (out/bugs/<id>/repro.ts, probes)
 *   spec     await arrange('cart', { priceCents: 5000 })           (the `arrange` fixture)
 *
 * A start state no recipe covers gets a new recipe here, reviewed like any framework code;
 * `bun run qa:arrange --catalog` then regenerates its knowledge document (knowledge/setup/SETUP-RECIPES.md).
 */

import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { Api, type Cart, type Coupon, type Order, type Product } from '@api';
import { Account } from '@auth/accounts';
import { session, type Customer, type Session } from '@auth/session';
import { Cards } from '@data/cards';
import { newAddress, newRegistration } from '@data/people';
import { Seed } from '@setup/seed';
import { now, shift } from '@utils/date';

/** What a recipe leaves behind. */
export type Arranged = {
  /** Who the browser starts signed in as; undefined = signed out. */
  signedIn: Session | undefined;
  /** Whose state it is. Also set for a signed-out customer, since the steps type in their credentials. */
  user: Session | Customer | undefined;
  /** The web-app route the steps start on. */
  route: string;
  /** Everything the recipe created. */
  data: { product?: Product; cart?: Cart; coupon?: Coupon; order?: Order };
};

type Context = {
  api: Api;
  /** Refused on a read-only environment. Only recipes with `seeds: true` call it. */
  seed: () => Seed;
  /** The customer the state belongs to: the caller's (a spec's signed-in customer), else a fresh one. */
  customer: () => Promise<Customer>;
};

export type Recipe = {
  summary: string;
  /** Rules and features the state is typical for. Shown as links in the catalog. */
  covers: string[];
  /** Creates data: refused on a read-only environment. */
  seeds: boolean;
  /** Where the steps start, with placeholders for created ids. */
  lands: string;
  example: string;
  params: z.ZodObject;
  arrange(ctx: Context, params: unknown): Promise<Arranged>;
};

function recipe<S extends z.ZodObject>(
  def: Omit<Recipe, 'params' | 'arrange'> & { params: S; run: (ctx: Context, p: z.output<S>) => Promise<Arranged> },
): Recipe & { params: S } {
  const { run, ...rest } = def;
  return { ...rest, arrange: (ctx, raw) => run(ctx, def.params.parse(raw ?? {})) };
}

const product = {
  priceCents: z.number().int().positive().default(1000).describe('unit price of a fresh product, in cents'),
  stock: z.number().int().nonnegative().default(50).describe('its stock (0 = out of stock)'),
};
const quantity = z.number().int().positive().default(1).describe('units of it in the cart');

export const RECIPES = {
  guest: recipe({
    summary: 'Signed out; creates nothing. Registration, sign-in and public pages from scratch.',
    covers: ['FEAT-AUTH', 'FEAT-CATALOG', 'BR-AUTH-01'],
    seeds: false,
    lands: '#/',
    example: '',
    params: z.strictObject({}),
    run: () => Promise.resolve({ signedIn: undefined, user: undefined, route: '#/', data: {} }),
  }),

  'returning-customer': recipe({
    summary:
      'Signed in as the saved returning customer (order history); creates nothing. This is the only signed-in state on live. Read-only use.',
    covers: ['FEAT-ORDERS'],
    seeds: false,
    lands: '#/orders',
    example: '',
    params: z.strictObject({}),
    run: async () => {
      const user = await session(Account.RETURNING_CUSTOMER, { verify: true });
      return { signedIn: user, user, route: '#/orders', data: {} };
    },
  }),

  customer: recipe({
    summary: 'A freshly registered customer with an empty cart; signed in, or signed out with its credentials to type.',
    covers: ['FEAT-AUTH', 'BR-AUTH-02'],
    seeds: true,
    lands: '#/ (signed in) · #/login (signed out)',
    example: 'signedIn=false',
    params: z.strictObject({
      signedIn: z
        .boolean()
        .default(true)
        .describe('false: the browser starts signed out; sign in with user.email / user.password'),
    }),
    run: async (ctx, p) => {
      const user = await ctx.customer();
      return { signedIn: p.signedIn ? user : undefined, user, route: p.signedIn ? '#/' : '#/login', data: {} };
    },
  }),

  'locked-out': recipe({
    summary: 'A customer locked by 5 failed sign-ins (verified: the right password is refused); signed out.',
    covers: ['BR-AUTH-02'],
    seeds: true,
    lands: '#/login',
    example: '',
    params: z.strictObject({}),
    run: async (ctx) => {
      const user = await ctx.seed().lockedOut(await ctx.customer());
      return { signedIn: undefined, user, route: '#/login', data: {} };
    },
  }),

  product: recipe({
    summary: 'A signed-in customer and a fresh product of their own (price, stock), not yet in the cart.',
    covers: ['FEAT-CATALOG', 'FEAT-CART', 'BR-CART-01', 'BR-CART-02'],
    seeds: true,
    lands: '#/product/<product.id>',
    example: 'priceCents=1500 stock=0',
    params: z.strictObject(product),
    run: async (ctx, p) => {
      const user = await ctx.customer();
      const item = await ctx.seed().product(p);
      return { signedIn: user, user, route: `#/product/${item.id}`, data: { product: item } };
    },
  }),

  cart: recipe({
    summary: 'A signed-in customer with a fresh product in the cart, optionally with an existing coupon code applied.',
    covers: ['FEAT-CART', 'FEAT-CHECKOUT', 'BR-CART-01', 'BR-SHIP-01', 'BR-PAY-01', 'BR-COUP-02'],
    seeds: true,
    lands: '#/cart',
    example: 'priceCents=5000 stock=10 quantity=1',
    params: z.strictObject({
      ...product,
      quantity,
      coupon: z
        .string()
        .optional()
        .describe('a code to apply, e.g. WELCOME10 (seeded). For a custom coupon use the `coupon` recipe'),
    }),
    run: async (ctx, p) => {
      const user = await ctx.customer();
      const seed = ctx.seed();
      const item = await seed.product({ priceCents: p.priceCents, stock: p.stock });
      const cart = await seed.cart(user, [{ product: item, quantity: p.quantity }], p.coupon);
      return { signedIn: user, user, route: '#/cart', data: { product: item, cart } };
    },
  }),

  coupon: recipe({
    summary: 'A coupon of its own shape (kind, value, minimum, cap, expired) and a cart to try it on; applied or not.',
    covers: ['FEAT-COUPON', 'BR-COUP-01', 'BR-COUP-02', 'BR-COUP-03', 'BR-COUP-04'],
    seeds: true,
    lands: '#/cart',
    example: 'kind=fixed value=500 minSubtotalCents=3000 priceCents=2000 quantity=2 applied=true',
    params: z
      .strictObject({
        ...product,
        quantity,
        kind: z.enum(['percent', 'fixed']).default('percent').describe('percent off, or a fixed amount in cents'),
        value: z.number().int().positive().default(10).describe('percent, or cents for `fixed`'),
        minSubtotalCents: z.number().int().nonnegative().default(0).describe('the minimum subtotal it needs'),
        maxDiscountCents: z.number().int().positive().optional().describe('the discount cap'),
        expired: z.boolean().default(false).describe('expired yesterday'),
        applied: z.boolean().default(false).describe('apply it to the cart (an expired one cannot be)'),
      })
      .refine((p) => !(p.expired && p.applied), {
        message:
          'an expired coupon cannot be applied (BR-COUP-03), so arrange it with applied=false and apply it as a step',
        path: ['applied'],
      }),
    run: async (ctx, p) => {
      const user = await ctx.customer();
      const seed = ctx.seed();
      const coupon = await seed.coupon({
        kind: p.kind,
        value: p.value,
        minSubtotalCents: p.minSubtotalCents,
        maxDiscountCents: p.maxDiscountCents ?? null,
        expiresAt: p.expired ? shift(now(), { days: -1 }).getTime() : null,
      });
      const item = await seed.product({ priceCents: p.priceCents, stock: p.stock });
      const cart = await seed.cart(
        user,
        [{ product: item, quantity: p.quantity }],
        p.applied ? coupon.code : undefined,
      );
      return { signedIn: user, user, route: '#/cart', data: { product: item, coupon, cart } };
    },
  }),

  order: recipe({
    summary: 'A signed-in customer with an order of a fresh product: placed, shipped (by the admin) or cancelled.',
    covers: ['FEAT-ORDERS', 'BR-ORD-01', 'BR-ORD-02', 'BR-ORD-03'],
    seeds: true,
    lands: '#/orders/<order.id>',
    example: 'stock=5 status=shipped',
    params: z.strictObject({
      ...product,
      quantity,
      status: z.enum(['placed', 'shipped', 'cancelled']).default('placed').describe('the order status to leave it in'),
    }),
    run: async (ctx, p) => {
      const user = await ctx.customer();
      const seed = ctx.seed();
      const item = await seed.product({ priceCents: p.priceCents, stock: p.stock });
      let order = await seed.order(user, [{ product: item, quantity: p.quantity }]);
      if (p.status === 'shipped') order = await seed.shipped(order);
      if (p.status === 'cancelled') order = await seed.cancelled(user, order);
      return { signedIn: user, user, route: `#/orders/${order.id}`, data: { product: item, order } };
    },
  }),
} as const satisfies Record<string, Recipe>;

export type RecipeId = keyof typeof RECIPES;
export type RecipeParams<K extends RecipeId> = z.input<(typeof RECIPES)[K]['params']>;

export function isRecipe(id: string): id is RecipeId {
  return Object.hasOwn(RECIPES, id);
}

/**
 * Arranges recipe `id`. `as` makes the state belong to an existing customer (a spec's signed-in one);
 * otherwise a recipe registers its own.
 */
export function arrange<K extends RecipeId>(
  request: APIRequestContext,
  id: K,
  params?: RecipeParams<K>,
  as?: Customer,
): Promise<Arranged> {
  let seed: Seed | undefined;
  const ctx: Context = {
    api: new Api(request),
    seed: () => (seed ??= new Seed(request)),
    customer: () => (as ? Promise.resolve(as) : ctx.seed().customer()),
  };
  return (RECIPES[id] as Recipe).arrange(ctx, params);
}

/** Test data the steps type in. It comes from the framework and is never made up (card expiries move with the calendar). */
export function testData() {
  return { cards: Cards, address: newAddress(), registration: newRegistration() };
}
