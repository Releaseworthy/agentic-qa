/**
 * ShopLite API responses as ArkType schemas. Each validates a response and is
 * the source of its TypeScript type.
 */

import { type } from 'arktype';

export const ErrorBody = type({ error: { code: 'string', message: 'string' } });

export const User = type({
  id: 'string',
  email: 'string.email',
  name: 'string',
  role: "'customer' | 'admin'",
});
export type User = typeof User.infer;

export const AuthResult = type({ user: User, token: 'string > 20' });
export type AuthResult = typeof AuthResult.infer;

export const Category = type("'books' | 'electronics' | 'home' | 'toys'");
export type Category = typeof Category.infer;

export const Product = type({
  id: 'string',
  sku: 'string',
  name: 'string > 0',
  category: Category,
  description: 'string',
  priceCents: 'number.integer > 0',
  stock: 'number.integer >= 0',
});
export type Product = typeof Product.infer;

export const ProductList = type({ items: Product.array(), count: 'number.integer >= 0' });
export type ProductList = typeof ProductList.infer;

const Totals = type({
  subtotalCents: 'number.integer >= 0',
  discountCents: 'number.integer >= 0',
  shippingCents: 'number.integer >= 0',
  totalCents: 'number.integer >= 0',
});

export const Cart = Totals.and({
  items: type({
    productId: 'string',
    name: 'string',
    unitPriceCents: 'number.integer > 0',
    quantity: 'number.integer > 0',
    lineTotalCents: 'number.integer > 0',
  }).array(),
  couponCode: 'string | null',
});
export type Cart = typeof Cart.infer;

export const Address = type({
  name: 'string',
  line1: 'string',
  city: 'string',
  postalCode: 'string',
  country: 'string',
});
export type Address = typeof Address.infer;

export const OrderStatus = type("'placed' | 'shipped' | 'cancelled'");
export type OrderStatus = typeof OrderStatus.infer;

export const Order = Totals.and({
  id: 'string',
  userId: 'string',
  lines: type({
    productId: 'string',
    name: 'string',
    unitPriceCents: 'number.integer > 0',
    quantity: 'number.integer > 0',
  }).array(),
  couponCode: 'string | null',
  status: OrderStatus,
  shippingAddress: Address,
  cardLast4: /^\d{4}$/,
  createdAt: 'number.integer > 0',
});
export type Order = typeof Order.infer;

export const OrderList = type({ items: Order.array() });

export const Coupon = type({
  code: 'string',
  kind: "'percent' | 'fixed'",
  value: 'number.integer > 0',
  minSubtotalCents: 'number.integer >= 0',
  maxDiscountCents: 'number.integer | null',
  expiresAt: 'number.integer | null',
});
export type Coupon = typeof Coupon.infer;

export const Empty = type('null');
