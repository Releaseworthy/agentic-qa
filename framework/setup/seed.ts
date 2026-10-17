import type { APIRequestContext } from '@playwright/test';
import { Api, ApiError, type Cart, type Coupon, type Order, type Product } from '@api';
import type { NewCoupon, NewProduct } from '@api/admin-api';
import { Account } from '@auth/accounts';
import { newCustomer, session, type Customer } from '@auth/session';
import { env } from '@config/env';
import { Cards, type Card } from '@data/cards';
import { newAddress, uniqueCouponCode, uniqueSku } from '@data/people';
import { step } from '@utils/step';

type Line = { product: Product; quantity?: number };

/** `priceCents=1500, stock=4`: the fields a seed step was asked for. */
function fields(input: object): string {
  const set = Object.entries(input).filter(([, value]) => value !== undefined);
  return set.length ? set.map(([key, value]) => `${key}=${String(value)}`).join(', ') : 'defaults';
}

/**
 * Test-data setup over the API, acting as Account.ADMIN where it must. Every
 * helper creates data of its own (a fresh customer, a product with its own
 * stock, a unique coupon), so tests never share mutable state and run fully
 * parallel. Refused on a read-only environment.
 */
export class Seed {
  private readonly api: Api;

  constructor(private readonly request: APIRequestContext) {
    if (env.readOnly)
      throw new Error(`TEST_ENV=${env.name} is read-only: a test that seeds data cannot be tagged @readonly`);
    this.api = new Api(request);
  }

  private async admin(): Promise<Api> {
    return this.api.as(await session(Account.ADMIN));
  }

  @step('Seed: register a new customer')
  customer(): Promise<Customer> {
    return newCustomer(this.request);
  }

  /** A product no other test touches, so this test is free to change its stock. */
  @step((overrides: Partial<NewProduct> = {}) => `Seed: product (${fields(overrides)})`)
  async product(overrides: Partial<NewProduct> = {}): Promise<Product> {
    const sku = uniqueSku();
    return (await this.admin()).admin.createProduct({
      sku,
      name: `QA Item ${sku}`,
      category: 'home',
      description: 'Created by the test-data seed.',
      priceCents: 1000,
      stock: 50,
      ...overrides,
    });
  }

  @step((input: Omit<NewCoupon, 'code'> & { code?: string }) => `Seed: coupon (${fields(input)})`)
  async coupon(input: Omit<NewCoupon, 'code'> & { code?: string }): Promise<Coupon> {
    return (await this.admin()).admin.createCoupon({ code: uniqueCouponCode(), ...input });
  }

  /** Puts `lines` in `customer`'s cart and returns it. */
  @step(
    (customer: Customer, lines: Line[], couponCode?: string) =>
      `Seed: ${lines.map((l) => `${l.quantity ?? 1} × ${l.product.name}`).join(', ')} in ${customer.name}'s cart` +
      (couponCode ? ` with ${couponCode}` : ''),
  )
  async cart(customer: Customer, lines: Line[], couponCode?: string): Promise<Cart> {
    const api = this.api.as(customer);
    let cart = await api.cart.get();
    for (const { product, quantity = 1 } of lines) cart = await api.cart.add(product.id, quantity);
    if (couponCode) cart = await api.cart.applyCoupon(couponCode);
    return cart;
  }

  /** A placed order for `customer` with `lines` (a fresh product when omitted). */
  @step((customer: Customer) => `Seed: placed order for ${customer.name}`)
  async order(customer: Customer, lines?: Line[], card: Card = Cards.VALID): Promise<Order> {
    await this.cart(customer, lines ?? [{ product: await this.product() }]);
    return this.api.as(customer).orders.place({ shippingAddress: newAddress(), payment: card });
  }

  @step((order: Order) => `Seed: ship order ${order.id}`)
  async shipped(order: Order): Promise<Order> {
    return (await this.admin()).admin.shipOrder(order.id);
  }

  @step((customer: Customer, order: Order) => `Seed: ${customer.name} cancels order ${order.id}`)
  cancelled(customer: Customer, order: Order): Promise<Order> {
    return this.api.as(customer).orders.cancel(order.id);
  }

  /** BR-AUTH-02: five wrong passwords in a row. Verified by signing in with the right one and getting ACCOUNT_LOCKED. */
  @step((customer: Customer) => `Seed: lock ${customer.name}'s account with 5 failed sign-ins`)
  async lockedOut(customer: Customer): Promise<Customer> {
    const attempt = (password: string) =>
      this.api.auth.login({ email: customer.email, password }).then(
        () => undefined,
        (error: unknown) => (error instanceof ApiError ? error.code : String(error)),
      );
    for (let n = 1; n <= 5; n++) {
      const refused = await attempt(`${customer.password}-wrong`);
      if (refused !== 'INVALID_CREDENTIALS') throw new Error(`failed sign-in ${n} was not refused: ${refused}`);
    }
    const locked = await attempt(customer.password);
    if (locked !== 'ACCOUNT_LOCKED') throw new Error(`5 failed sign-ins did not lock the account: ${locked}`);
    return customer;
  }
}
