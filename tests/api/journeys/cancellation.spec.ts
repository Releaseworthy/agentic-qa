import { Cards, expect, expectRefused, newAddress, test } from '@fixtures';

test.describe(
  'Journey: change of mind',
  { tag: ['@journey', '@FEAT-CHECKOUT', '@FEAT-ORDERS', '@BR-ORD-01', '@BR-ORD-02'] },
  () => {
    test('a customer cancels, the stock comes back and another customer buys it', async ({ api, seed }) => {
      const product = await seed.product({ stock: 2, priceCents: 2500 });
      const [first, second] = [await seed.customer(), await seed.customer()];

      const order = await test.step('The first customer buys both units', async () => {
        await seed.cart(first, [{ product, quantity: 2 }]);
        return api.as(first).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
      });

      await test.step('The second customer finds it sold out', () =>
        expectRefused(api.as(second).cart.add(product.id, 1), 409, 'OUT_OF_STOCK'));

      await test.step('The first customer cancels; the order says so and cannot be cancelled again', async () => {
        expect((await api.as(first).orders.cancel(order.id)).status, 'status in the cancel answer').toBe('cancelled');
        expect((await api.as(first).orders.get(order.id)).status, 'status when read back').toBe('cancelled');
        await expectRefused(api.as(first).orders.cancel(order.id), 409, 'NOT_CANCELLABLE');
      });

      await test.step('The second customer can now buy the restocked units', async () => {
        await api.as(second).cart.add(product.id, 2);
        const theirs = await api.as(second).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
        expect(theirs.lines, 'the new order holds both restocked units').toEqual([
          expect.objectContaining({ productId: product.id, quantity: 2 }),
        ]);
      });
    });

    test('once shipped, the order can no longer be cancelled', async ({ api, seed, customer }) => {
      const order = await seed.shipped(await seed.order(customer));
      expect((await api.as(customer).orders.get(order.id)).status, 'the customer sees it shipped').toBe('shipped');
      await expectRefused(api.as(customer).orders.cancel(order.id), 409, 'NOT_CANCELLABLE');
    });
  },
);
