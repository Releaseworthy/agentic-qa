import { test as base, expect } from '@playwright/test';
import { Api, ApiError } from '@api';
import { LoginPage, RegisterPage } from '@pages/auth-pages';
import { CartPage } from '@pages/cart-page';
import { CatalogPage } from '@pages/catalog-page';
import { CheckoutPage } from '@pages/checkout-page';
import { Header } from '@pages/header';
import { OrderPage, OrdersPage } from '@pages/order-pages';
import { ProductPage } from '@pages/product-page';
import { Seed, type Customer } from '@setup/seed';

type Options = {
  /** true: the browser starts signed in as `customer`. Default false. */
  signedIn: boolean;
};

type Fixtures = {
  /** Anonymous API helpers; `api.as(customer)` to act as someone. */
  api: Api;
  /** Test-data setup over the API (fresh customers, products, coupons, orders). */
  seed: Seed;
  /** A customer registered for this test only. */
  customer: Customer;
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

export const test = base.extend<Options & Fixtures>({
  signedIn: [false, { option: true }],

  api: async ({ request }, use) => use(new Api(request)),
  seed: async ({ request }, use) => use(new Seed(request)),
  customer: async ({ seed }, use) => use(await seed.customer()),

  // Signing in is setup, not the thing under test: the token goes straight into
  // localStorage before the app loads (the login form has its own tests).
  page: async ({ page, signedIn, customer }, use) => {
    if (signedIn)
      await page.addInitScript(
        ([token, name]) => {
          localStorage.setItem('shoplite.token', token);
          localStorage.setItem('shoplite.user', name);
        },
        [customer.token, customer.name] as const,
      );
    await use(page);
  },

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
  expect(error, `expected ${status} ${code}, but the call succeeded`).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect({ status: apiError.status, code: apiError.code }).toEqual({ status, code });
  return apiError;
}

/** "$12.34" for 1234 cents — how the UI prints money. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export { expect };
export { ApiError } from '@api';
export { Cards } from '@data/cards';
export { newAddress, newRegistration, uniqueCouponCode } from '@data/people';
export type { Customer } from '@setup/seed';
