import { test as base, expect } from '@playwright/test';
import { Api, ApiError } from '@api';
import { Account } from '@auth/accounts';
import { newCustomer, session, storageState, type Customer, type Session } from '@auth/session';
import { LoginPage, RegisterPage } from '@pages/auth-pages';
import { CartPage } from '@pages/cart-page';
import { CatalogPage } from '@pages/catalog-page';
import { CheckoutPage } from '@pages/checkout-page';
import { Header } from '@pages/header';
import { OrderPage, OrdersPage } from '@pages/order-pages';
import { ProductPage } from '@pages/product-page';
import { arrange, type Arranged, type RecipeId, type RecipeParams } from '@setup/recipes';
import { Seed } from '@setup/seed';

type Options = {
  /**
   * Who the browser starts signed in as — straight from a storage state, never
   * through the login form (that has its own tests). Default GUEST.
   */
  account: Account;
};

type Fixtures = {
  /** Anonymous API helpers; `api.as(customer)` / `api.as(user)` to act as someone. */
  api: Api;
  /** Test-data setup over the API (fresh customers, products, coupons, orders). Refused on read-only envs. */
  seed: Seed;
  /**
   * A named start state (framework/setup/recipes.ts) — the same one a manual run arranges with
   * `bun run qa:arrange --case TC-…`. It belongs to the signed-in customer when `account` is NEW_CUSTOMER.
   */
  arrange: <K extends RecipeId>(id: K, params?: RecipeParams<K>) => Promise<Arranged>;
  /** A customer registered for this test only — the signed-in one when `account` is NEW_CUSTOMER. */
  customer: Customer;
  /** The session the browser is signed in with. Throws for GUEST. */
  user: Session;
  header: Header;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  catalogPage: CatalogPage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  orderPage: OrderPage;
  ordersPage: OrdersPage;
};

type Internal = {
  /** `account` resolved to a session once per test; shared by storageState, user and customer. */
  _session: Session | undefined;
};

function isCustomer(s: Session | undefined): s is Customer {
  return s?.account === Account.NEW_CUSTOMER;
}

export const test = base.extend<Options & Fixtures & Internal>({
  account: [Account.GUEST, { option: true }],

  _session: async ({ account, request }, use) => {
    if (account === Account.GUEST) return use(undefined);
    await use(account === Account.NEW_CUSTOMER ? await newCustomer(request) : await session(account));
  },
  storageState: async ({ _session }, use) => use(storageState(_session)),
  user: async ({ _session }, use) => {
    if (_session === undefined) throw new Error('no user: the test runs as Account.GUEST — set test.use({ account })');
    await use(_session);
  },
  customer: async ({ _session, request }, use) => use(isCustomer(_session) ? _session : await newCustomer(request)),

  api: async ({ request }, use) => use(new Api(request)),
  seed: async ({ request }, use) => use(new Seed(request)),
  arrange: async ({ request, _session }, use) =>
    use((id, params) => arrange(request, id, params, isCustomer(_session) ? _session : undefined)),

  header: async ({ page }, use) => use(new Header(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  catalogPage: async ({ page }, use) => use(new CatalogPage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  orderPage: async ({ page }, use) => use(new OrderPage(page)),
  ordersPage: async ({ page }, use) => use(new OrdersPage(page)),
});

/** Asserts that `call` is refused with `status` and error `code`. */
export async function expectRefused(call: Promise<unknown>, status: number, code: string): Promise<ApiError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected a refusal with ${status} ${code}, but the call succeeded`).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect({ status: apiError.status, code: apiError.code }, `refusal of ${apiError.method} ${apiError.path}`).toEqual({
    status,
    code,
  });
  return apiError;
}

/** "$12.34" for 1234 cents — how the UI prints money. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export { expect };
export { ApiError } from '@api';
export { Account } from '@auth/accounts';
export type { Customer, Session } from '@auth/session';
export { Cards } from '@data/cards';
export { newAddress, newRegistration, uniqueCouponCode } from '@data/people';
