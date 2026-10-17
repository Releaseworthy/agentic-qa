import { defect } from '@app/defects';
import { HttpError } from '@app/http';
import { store, type Cart } from '@app/store';
import { getProduct } from '@app/domain/catalog';
import { checkCoupon, findCoupon } from '@app/domain/coupons';
import { priceLines, type Totals } from '@app/domain/pricing';

/** BR-CART-01: 1-10 units per cart line. */
export const MAX_QTY_PER_LINE = 10;

export type CartView = Totals & {
  items: { productId: string; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
  couponCode: string | null;
};

function checkQuantity(quantity: number, { allowAboveLimit = false } = {}): void {
  if (quantity < 1 || (!allowAboveLimit && quantity > MAX_QTY_PER_LINE))
    throw new HttpError(422, 'QTY_LIMIT', `Quantity must be between 1 and ${MAX_QTY_PER_LINE}`);
}

/** BR-CART-02: a line never holds more than the product's stock. */
function checkStock(productId: string, quantity: number): void {
  const product = getProduct(productId);
  if (quantity > product.stock)
    throw new HttpError(409, 'OUT_OF_STOCK', `Only ${product.stock} of "${product.name}" left in stock`);
}

export function viewCart(userId: string): CartView {
  const cart = store.cartOf(userId);
  const items = cart.lines.map((l) => {
    const p = getProduct(l.productId);
    return {
      productId: p.id,
      name: p.name,
      unitPriceCents: p.priceCents,
      quantity: l.quantity,
      lineTotalCents: p.priceCents * l.quantity,
    };
  });
  const coupon = cart.couponCode ? (store.coupons.get(cart.couponCode) ?? null) : null;
  return { items, couponCode: cart.couponCode, ...priceLines(items, coupon) };
}

export function addItem(userId: string, productId: string, quantity: number): CartView {
  checkQuantity(quantity);
  const cart = store.cartOf(userId);
  const line = cart.lines.find((l) => l.productId === productId);
  const next = (line?.quantity ?? 0) + quantity;
  checkQuantity(next);
  checkStock(productId, next);
  if (line) line.quantity = next;
  else cart.lines.push({ productId, quantity });
  revalidateCoupon(cart);
  return viewCart(userId);
}

/** Quantity 0 removes the line. */
export function updateItem(userId: string, productId: string, quantity: number): CartView {
  const cart = store.cartOf(userId);
  const line = cart.lines.find((l) => l.productId === productId);
  if (!line) throw new HttpError(404, 'NOT_IN_CART', 'This product is not in the cart');
  if (quantity === 0) return removeItem(userId, productId);
  checkQuantity(quantity, { allowAboveLimit: defect('qty-limit-update') });
  checkStock(productId, quantity);
  line.quantity = quantity;
  revalidateCoupon(cart);
  return viewCart(userId);
}

export function removeItem(userId: string, productId: string): CartView {
  const cart = store.cartOf(userId);
  const before = cart.lines.length;
  cart.lines = cart.lines.filter((l) => l.productId !== productId);
  if (cart.lines.length === before) throw new HttpError(404, 'NOT_IN_CART', 'This product is not in the cart');
  revalidateCoupon(cart);
  return viewCart(userId);
}

/** BR-COUP-01: one coupon per cart; applying another replaces it. */
export function applyCoupon(userId: string, code: string): CartView {
  const coupon = findCoupon(code);
  checkCoupon(coupon, viewCart(userId).subtotalCents);
  store.cartOf(userId).couponCode = coupon.code;
  return viewCart(userId);
}

export function removeCoupon(userId: string): CartView {
  store.cartOf(userId).couponCode = null;
  return viewCart(userId);
}

/** BR-COUP-02: a coupon whose minimum is no longer met falls off the cart. */
function revalidateCoupon(cart: Cart): void {
  if (!cart.couponCode) return;
  const coupon = store.coupons.get(cart.couponCode);
  const subtotal = cart.lines.reduce((sum, l) => sum + getProduct(l.productId).priceCents * l.quantity, 0);
  if (!coupon || subtotal < coupon.minSubtotalCents) cart.couponCode = null;
}

export function clearCart(userId: string): void {
  store.carts.set(userId, { lines: [], couponCode: null });
}
