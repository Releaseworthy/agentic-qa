import { defect } from '@app/defects';
import { HttpError } from '@app/http';
import { store, type Address, type Order, type User } from '@app/store';
import { clearCart, viewCart } from '@app/domain/cart';
import { getProduct } from '@app/domain/catalog';
import { checkCoupon } from '@app/domain/coupons';
import { charge, type Card } from '@app/domain/payments';

export function checkAddress(a: Address): void {
  for (const key of ['name', 'line1', 'city', 'postalCode', 'country'] as const)
    if (!a[key]) throw new HttpError(400, 'VALIDATION', `Shipping address "${key}" is required`);
  if (!/^[A-Z]{2}$/.test(a.country)) throw new HttpError(400, 'VALIDATION', 'Country is a 2-letter ISO code');
}

export function placeOrder(user: User, address: Address, card: Card): Order {
  const cart = viewCart(user.id);
  if (cart.items.length === 0) throw new HttpError(400, 'EMPTY_CART', 'The cart is empty');
  checkAddress(address);
  // Stock and coupon are re-checked at checkout: both can change after they entered the cart.
  for (const item of cart.items) {
    const p = getProduct(item.productId);
    if (item.quantity > p.stock)
      throw new HttpError(409, 'OUT_OF_STOCK', `Only ${p.stock} of "${p.name}" left in stock`);
  }
  if (cart.couponCode) {
    const coupon = store.coupons.get(cart.couponCode);
    if (coupon) checkCoupon(coupon, cart.subtotalCents);
  }
  const last4 = charge(card, cart.totalCents);
  for (const item of cart.items) getProduct(item.productId).stock -= item.quantity;
  const order: Order = {
    id: store.nextId('o'),
    userId: user.id,
    lines: cart.items.map(({ productId, name, unitPriceCents, quantity }) => ({
      productId,
      name,
      unitPriceCents,
      quantity,
    })),
    couponCode: cart.couponCode,
    subtotalCents: cart.subtotalCents,
    discountCents: cart.discountCents,
    shippingCents: cart.shippingCents,
    totalCents: cart.totalCents,
    status: 'placed',
    shippingAddress: address,
    cardLast4: last4,
    createdAt: Date.now(),
  };
  store.orders.set(order.id, order);
  clearCart(user.id);
  return order;
}

/** BR-ORD-03: customers see only their own orders; others' answer 404, not 403. */
export function getOrder(user: User, id: string): Order {
  const order = store.orders.get(id);
  if (!order || (order.userId !== user.id && user.role !== 'admin'))
    throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  return order;
}

export function listOrders(user: User): Order[] {
  return [...store.orders.values()].filter((o) => o.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
}

/** BR-ORD-01: only a placed (not yet shipped) order can be cancelled. BR-ORD-02: its items go back in stock. */
export function cancelOrder(user: User, id: string): Order {
  const order = getOrder(user, id);
  if (order.status !== 'placed')
    throw new HttpError(409, 'NOT_CANCELLABLE', `An order that is ${order.status} cannot be cancelled`);
  order.status = 'cancelled';
  if (!defect('cancel-restock'))
    for (const line of order.lines) {
      const p = store.products.get(line.productId);
      if (p) p.stock += line.quantity;
    }
  return order;
}

export function shipOrder(id: string): Order {
  const order = store.orders.get(id);
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order not found');
  if (order.status !== 'placed')
    throw new HttpError(409, 'NOT_SHIPPABLE', `An order that is ${order.status} cannot ship`);
  order.status = 'shipped';
  return order;
}
