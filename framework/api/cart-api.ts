import { HttpClient } from '@api/client';
import { Cart } from '@api/schemas';

/** /api/cart — always the signed-in user's own cart. */
export class CartApi extends HttpClient {
  get(): Promise<Cart> {
    return this.call('GET', '/api/cart', Cart);
  }

  add(productId: string, quantity = 1): Promise<Cart> {
    return this.call('POST', '/api/cart/items', Cart, { productId, quantity });
  }

  /** Quantity 0 removes the line. */
  update(productId: string, quantity: number): Promise<Cart> {
    return this.call('PATCH', `/api/cart/items/${encodeURIComponent(productId)}`, Cart, { quantity });
  }

  remove(productId: string): Promise<Cart> {
    return this.call('DELETE', `/api/cart/items/${encodeURIComponent(productId)}`, Cart);
  }

  applyCoupon(code: string): Promise<Cart> {
    return this.call('POST', '/api/cart/coupon', Cart, { code });
  }

  removeCoupon(): Promise<Cart> {
    return this.call('DELETE', '/api/cart/coupon', Cart);
  }
}
