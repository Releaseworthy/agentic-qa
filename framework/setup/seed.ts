import type { APIRequestContext } from '@playwright/test';
import { Api, type Cart, type Coupon, type Order, type Product } from '@api';
import type { NewCoupon, NewProduct } from '@api/admin-api';
import { config } from '@config';
import { Cards, type Card } from '@data/cards';
import { newAddress, newRegistration, uniqueCouponCode, uniqueSku } from '@data/people';

export type Customer = { id: string; email: string; name: string; password: string; token: string };

/**
 * Test-data setup over the API. Every helper creates data of its own (a fresh
 * customer, a product with its own stock, a unique coupon), so tests never
 * share mutable state and run fully parallel.
 */
export class Seed {
  private adminApi: Promise<Api> | undefined;

  constructor(private readonly request: APIRequestContext) {}

  private admin(): Promise<Api> {
    this.adminApi ??= new Api(this.request).auth.login(config.admin).then(({ token }) => new Api(this.request, token));
    return this.adminApi;
  }

  async customer(): Promise<Customer> {
    const registration = newRegistration();
    const { user, token } = await new Api(this.request).auth.register(registration);
    return { id: user.id, email: user.email, name: user.name, password: registration.password, token };
  }

  /** A product no other test touches — its stock is this test's to change. */
  async product(overrides: Partial<NewProduct> = {}): Promise<Product> {
    const admin = await this.admin();
    return admin.admin.createProduct({
      sku: uniqueSku(),
      name: `QA Item ${uniqueSku()}`,
      category: 'home',
      description: 'Created by the test-data seed.',
      priceCents: 1000,
      stock: 50,
      ...overrides,
    });
  }

  async coupon(input: Omit<NewCoupon, 'code'> & { code?: string }): Promise<Coupon> {
    const admin = await this.admin();
    return admin.admin.createCoupon({ code: uniqueCouponCode(), ...input });
  }

  /** Puts `lines` in `customer`'s cart and returns it. */
  async cart(customer: Customer, lines: { product: Product; quantity?: number }[], couponCode?: string): Promise<Cart> {
    const api = new Api(this.request, customer.token);
    let cart = await api.cart.get();
    for (const { product, quantity = 1 } of lines) cart = await api.cart.add(product.id, quantity);
    if (couponCode) cart = await api.cart.applyCoupon(couponCode);
    return cart;
  }

  /** A placed order for `customer` with `lines` (a fresh product when omitted). */
  async order(
    customer: Customer,
    lines?: { product: Product; quantity?: number }[],
    card: Card = Cards.VALID,
  ): Promise<Order> {
    await this.cart(customer, lines ?? [{ product: await this.product() }]);
    return new Api(this.request, customer.token).orders.place({ shippingAddress: newAddress(), payment: card });
  }

  async shipped(order: Order): Promise<Order> {
    return (await this.admin()).admin.shipOrder(order.id);
  }
}
