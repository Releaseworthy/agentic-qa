/**
 * User journeys executed entirely through API calls, mirroring the UI flows:
 * each step feeds the next, and the journey ends on the business outcome.
 */

import { Cards, expect, newAddress, newRegistration, test } from '@fixtures';

test.describe(
  'Journey: first purchase',
  { tag: ['@journey', '@FEAT-AUTH', '@FEAT-CATALOG', '@FEAT-CART', '@FEAT-COUPON', '@FEAT-CHECKOUT', '@FEAT-ORDERS'] },
  () => {
    test(
      'a new customer finds products, uses a coupon and sees the order in their history',
      { tag: '@smoke' },
      async ({ api, seed }) => {
        const [book, mug] = [
          await seed.product({ category: 'books', priceCents: 3200, stock: 20 }),
          await seed.product({ category: 'home', priceCents: 1200, stock: 20 }),
        ];

        const registration = newRegistration();

        const me = await test.step('register', async () => {
          const { token, user } = await api.auth.register(registration);
          expect(user.role).toBe('customer');
          return api.as({ token });
        });

        await test.step('find both products in the catalog', async () => {
          const books = await api.products.list({ category: 'books', q: book.name });
          expect(books.items.map((p) => p.id)).toEqual([book.id]);
          expect((await api.products.get(mug.id)).stock).toBe(20);
        });

        const cart = await test.step('fill the cart and apply WELCOME10', async () => {
          await me.cart.add(book.id, 1);
          await me.cart.add(mug.id, 2);
          return me.cart.applyCoupon('WELCOME10');
        });

        // $32.00 + 2 × $12.00 = $56.00 · 10% off = $50.40 · free shipping.
        expect(cart).toMatchObject({ subtotalCents: 5600, discountCents: 560, shippingCents: 0, totalCents: 5040 });

        const order = await test.step('check out', () =>
          me.orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }));

        expect(order).toMatchObject({ status: 'placed', totalCents: cart.totalCents, couponCode: 'WELCOME10' });

        await test.step('the order is in the history and the stock moved', async () => {
          expect((await me.orders.list()).map((o) => o.id)).toEqual([order.id]);
          expect((await api.products.get(book.id)).stock).toBe(19);
          expect((await api.products.get(mug.id)).stock).toBe(18);
          expect((await me.cart.get()).items).toEqual([]);
        });

        await test.step('the session survives a fresh login', async () => {
          const again = await api.auth.login({ email: registration.email, password: registration.password });
          expect((await api.as(again).orders.list()).map((o) => o.id)).toEqual([order.id]);
        });
      },
    );
  },
);

test.describe(
  'Journey: last units in stock',
  { tag: ['@journey', '@FEAT-CART', '@FEAT-CHECKOUT', '@BR-CART-02'] },
  () => {
    test('the second buyer is stopped at checkout when the first one takes the stock', async ({ api, seed }) => {
      const product = await seed.product({ stock: 3 });
      const [alice, bob] = [await seed.customer(), await seed.customer()];
      await seed.cart(alice, [{ product, quantity: 3 }]);
      await seed.cart(bob, [{ product, quantity: 1 }]);

      await api.as(alice).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
      const { status, body } = await api
        .as(bob)
        .raw('POST', '/api/orders', { shippingAddress: newAddress(), payment: Cards.VALID });
      expect(status).toBe(409);
      expect(body).toMatchObject({ error: { code: 'OUT_OF_STOCK' } });
      expect((await api.products.get(product.id)).stock).toBe(0);
    });
  },
);
