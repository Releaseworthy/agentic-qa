import { HttpClient } from '@api/client';
import { Coupon, Order, Product } from '@api/schemas';

export type NewProduct = Omit<Product, 'id'>;
export type NewCoupon = Pick<Coupon, 'code' | 'kind' | 'value'> & Partial<Omit<Coupon, 'code' | 'kind' | 'value'>>;

/** /api/admin/* — needs an admin token. Used for test-data setup. */
export class AdminApi extends HttpClient {
  createProduct(input: NewProduct): Promise<Product> {
    return this.call('POST', '/api/admin/products', Product, input);
  }

  createCoupon(input: NewCoupon): Promise<Coupon> {
    return this.call('POST', '/api/admin/coupons', Coupon, input);
  }

  shipOrder(id: string): Promise<Order> {
    return this.call('POST', `/api/admin/orders/${encodeURIComponent(id)}/ship`, Order);
  }
}
