import { Cards, expect, expectRefused, newAddress, test } from '@fixtures';

test.describe(
  'Journey: change of mind',
  { tag: ['@journey', '@FEAT-CHECKOUT', '@FEAT-ORDERS', '@BR-ORD-01', '@BR-ORD-02'] },
  () => {
    test('a customer cancels, the stock comes back and another customer buys it', async ({ api, seed }) => {
      const product = await seed.product({ stock: 2, priceCents: 2500 });
      const [first, second] = [await seed.customer(), await seed.customer()];

      const order = await test.step('the first customer buys both units', async () => {
        await seed.cart(first, [{ product, quantity: 2 }]);
        return api.as(first).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
      });

      await expectRefused(api.as(second).cart.add(product.id, 1), 409, 'OUT_OF_STOCK');

      await test.step('they cancel; the order says so and cannot be cancelled again', async () => {
        expect((await api.as(first).orders.cancel(order.id)).status).toBe('cancelled');
        expect((await api.as(first).orders.get(order.id)).status).toBe('cancelled');
        await expectRefused(api.as(first).orders.cancel(order.id), 409, 'NOT_CANCELLABLE');
      });

      await test.step('the second customer can now buy the restocked units', async () => {
        await api.as(second).cart.add(product.id, 2);
        const theirs = await api.as(second).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
        expect(theirs.lines).toEqual([expect.objectContaining({ productId: product.id, quantity: 2 })]);
      });
    });

    test('once shipped, the order can no longer be cancelled', async ({ api, seed, customer }) => {
      const order = await seed.order(customer);
      await seed.shipped(order);
      expect((await api.as(customer).orders.get(order.id)).status).toBe('shipped');
      await expectRefused(api.as(customer).orders.cancel(order.id), 409, 'NOT_CANCELLABLE');
    });
  },
);
