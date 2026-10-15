import { addItem, applyCoupon, removeCoupon, removeItem, updateItem, viewCart } from '@app/domain/cart';
import { authUser, body, int, json, str, type Route } from '@app/http';

export const cartRoutes: Route[] = [
  { method: 'GET', pattern: '/api/cart', handler: (req) => json(viewCart(authUser(req).id)) },
  {
    method: 'POST',
    pattern: '/api/cart/items',
    handler: async (req) => {
      const user = authUser(req);
      const data = await body(req);
      return json(addItem(user.id, str(data, 'productId'), int(data, 'quantity')));
    },
  },
  {
    method: 'PATCH',
    pattern: '/api/cart/items/:productId',
    handler: async (req, p) => {
      const user = authUser(req);
      return json(updateItem(user.id, p.productId ?? '', int(await body(req), 'quantity')));
    },
  },
  {
    method: 'DELETE',
    pattern: '/api/cart/items/:productId',
    handler: (req, p) => json(removeItem(authUser(req).id, p.productId ?? '')),
  },
  {
    method: 'POST',
    pattern: '/api/cart/coupon',
    handler: async (req) => {
      const user = authUser(req);
      return json(applyCoupon(user.id, str(await body(req), 'code')));
    },
  },
  { method: 'DELETE', pattern: '/api/cart/coupon', handler: (req) => json(removeCoupon(authUser(req).id)) },
];
