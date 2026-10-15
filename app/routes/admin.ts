import { createProduct } from '@app/domain/catalog';
import { createCoupon } from '@app/domain/coupons';
import { shipOrder } from '@app/domain/orders';
import { adminUser, body, HttpError, int, json, str, type Route } from '@app/http';
import type { Coupon, Product } from '@app/store';

function nullableInt(data: Record<string, unknown>, key: string): number | null {
  if (data[key] === undefined || data[key] === null) return null;
  return int(data, key);
}

export const adminRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/admin/products',
    handler: async (req) => {
      adminUser(req);
      const d = await body(req);
      const product = createProduct({
        sku: str(d, 'sku'),
        name: str(d, 'name'),
        category: str(d, 'category') as Product['category'],
        description: str(d, 'description', { optional: true }),
        priceCents: int(d, 'priceCents'),
        stock: int(d, 'stock'),
      });
      return json(product, 201);
    },
  },
  {
    method: 'POST',
    pattern: '/api/admin/coupons',
    handler: async (req) => {
      adminUser(req);
      const d = await body(req);
      const kind = str(d, 'kind');
      if (kind !== 'percent' && kind !== 'fixed') throw new HttpError(400, 'VALIDATION', 'kind is percent or fixed');
      const coupon: Coupon = {
        code: str(d, 'code'),
        kind,
        value: int(d, 'value'),
        minSubtotalCents: nullableInt(d, 'minSubtotalCents') ?? 0,
        maxDiscountCents: nullableInt(d, 'maxDiscountCents'),
        expiresAt: nullableInt(d, 'expiresAt'),
      };
      return json(createCoupon(coupon), 201);
    },
  },
  {
    method: 'POST',
    pattern: '/api/admin/orders/:id/ship',
    handler: (req, p) => {
      adminUser(req);
      return json(shipOrder(p.id ?? ''));
    },
  },
];
