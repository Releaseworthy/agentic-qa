import { HttpClient } from '@api/client';
import { Order, OrderList, type Address } from '@api/schemas';
import type { Card } from '@data/cards';

export type Checkout = { shippingAddress: Address; payment: Card };

/** /api/orders: the signed-in user's orders. */
export class OrdersApi extends HttpClient {
  place(input: Checkout): Promise<Order> {
    return this.call('POST', '/api/orders', Order, input);
  }

  list(): Promise<Order[]> {
    return this.call('GET', '/api/orders', OrderList).then((r) => r.items);
  }

  get(id: string): Promise<Order> {
    return this.call('GET', `/api/orders/${encodeURIComponent(id)}`, Order);
  }

  cancel(id: string): Promise<Order> {
    return this.call('POST', `/api/orders/${encodeURIComponent(id)}/cancel`, Order);
  }
}
