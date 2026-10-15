import type { APIRequestContext } from '@playwright/test';
import { AdminApi } from '@api/admin-api';
import { AuthApi } from '@api/auth-api';
import { CartApi } from '@api/cart-api';
import { HttpClient } from '@api/client';
import { OrdersApi } from '@api/orders-api';
import { ProductsApi } from '@api/products-api';
import { Health } from '@api/schemas';

/** Every API helper, acting as one caller (anonymous, or the owner of `token`). */
export class Api extends HttpClient {
  readonly auth: AuthApi;
  readonly products: ProductsApi;
  readonly cart: CartApi;
  readonly orders: OrdersApi;
  readonly admin: AdminApi;

  constructor(request: APIRequestContext, token?: string) {
    super(request, token);
    this.auth = new AuthApi(request, token);
    this.products = new ProductsApi(request, token);
    this.cart = new CartApi(request, token);
    this.orders = new OrdersApi(request, token);
    this.admin = new AdminApi(request, token);
  }

  /** The same helpers acting as `who`. */
  as(who: { token: string } | undefined): Api {
    return new Api(this.request, who?.token);
  }

  /** Which environment and build answer at the base URL. */
  health(): Promise<Health> {
    return this.call('GET', '/health', Health);
  }
}

export { ApiError, type RawResponse } from '@api/client';
export type * from '@api/schemas';
