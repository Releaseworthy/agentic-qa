/**
 * ShopLite API responses as zod schemas. Each validates a response and is the
 * source of its TypeScript type.
 */

import { z } from 'zod';

const cents = z.number().int().nonnegative();
const positiveCents = z.number().int().positive();

export const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const User = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum(['customer', 'admin']),
});
export type User = z.infer<typeof User>;

export const AuthResult = z.object({ user: User, token: z.string().min(21), expiresAt: z.iso.datetime() });
export type AuthResult = z.infer<typeof AuthResult>;

export const Category = z.enum(['books', 'electronics', 'home', 'toys']);
export type Category = z.infer<typeof Category>;

export const Product = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string().min(1),
  category: Category,
  description: z.string(),
  priceCents: positiveCents,
  stock: z.number().int().nonnegative(),
});
export type Product = z.infer<typeof Product>;

export const ProductList = z.object({ items: z.array(Product), count: z.number().int().nonnegative() });
export type ProductList = z.infer<typeof ProductList>;

const Totals = z.object({
  subtotalCents: cents,
  discountCents: cents,
  shippingCents: cents,
  totalCents: cents,
});

export const Cart = Totals.extend({
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      unitPriceCents: positiveCents,
      quantity: z.number().int().positive(),
      lineTotalCents: positiveCents,
    }),
  ),
  couponCode: z.string().nullable(),
});
export type Cart = z.infer<typeof Cart>;

export const Address = z.object({
  name: z.string(),
  line1: z.string(),
  city: z.string(),
  postalCode: z.string(),
  country: z.string(),
});
export type Address = z.infer<typeof Address>;

export const OrderStatus = z.enum(['placed', 'shipped', 'cancelled']);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const Order = Totals.extend({
  id: z.string(),
  userId: z.string(),
  lines: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      unitPriceCents: positiveCents,
      quantity: z.number().int().positive(),
    }),
  ),
  couponCode: z.string().nullable(),
  status: OrderStatus,
  shippingAddress: Address,
  cardLast4: z.string().regex(/^\d{4}$/),
  createdAt: z.number().int().positive(),
});
export type Order = z.infer<typeof Order>;

export const OrderList = z.object({ items: z.array(Order) });

export const Coupon = z.object({
  code: z.string(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  minSubtotalCents: cents,
  maxDiscountCents: z.number().int().nullable(),
  expiresAt: z.number().int().nullable(),
});
export type Coupon = z.infer<typeof Coupon>;

export const Health = z.object({ ok: z.literal(true), env: z.string(), defects: z.array(z.string()) });
export type Health = z.infer<typeof Health>;

export const Empty = z.null();
