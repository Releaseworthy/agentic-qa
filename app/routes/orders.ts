import { cancelOrder, getOrder, listOrders, placeOrder } from '@app/domain/orders';
import { authUser, body, HttpError, json, str, type Route } from '@app/http';

function object(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new HttpError(400, 'VALIDATION', `"${key}" is required`);
}

export const orderRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/orders',
    handler: async (req) => {
      const user = authUser(req);
      const data = await body(req);
      const a = object(data, 'shippingAddress');
      const c = object(data, 'payment');
      const order = placeOrder(
        user,
        {
          name: str(a, 'name'),
          line1: str(a, 'line1'),
          city: str(a, 'city'),
          postalCode: str(a, 'postalCode'),
          country: str(a, 'country'),
        },
        { cardNumber: str(c, 'cardNumber'), expiry: str(c, 'expiry'), cvc: str(c, 'cvc') },
      );
      return json(order, 201);
    },
  },
  { method: 'GET', pattern: '/api/orders', handler: (req) => json({ items: listOrders(authUser(req)) }) },
  { method: 'GET', pattern: '/api/orders/:id', handler: (req, p) => json(getOrder(authUser(req), p.id ?? '')) },
  {
    method: 'POST',
    pattern: '/api/orders/:id/cancel',
    handler: (req, p) => json(cancelOrder(authUser(req), p.id ?? '')),
  },
];
