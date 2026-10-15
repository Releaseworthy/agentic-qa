import { Cards, expect, expectRefused, newAddress, test } from '@fixtures';

test.describe(
  'Journey: coupon minimums',
  { tag: ['@journey', '@FEAT-CART', '@FEAT-COUPON', '@FEAT-CHECKOUT', '@BR-COUP-02'] },
  () => {
    test('a coupon is refused, earned by adding more, lost by removing, and charged right at checkout', async ({
      api,
      seed,
      customer,
    }) => {
      const [cheap, extra] = [await seed.product({ priceCents: 1800 }), await seed.product({ priceCents: 1500 })];
      const me = api.as(customer);

      await me.cart.add(cheap.id, 1);
      await expectRefused(me.cart.applyCoupon('SAVE5'), 422, 'COUPON_MIN_NOT_MET');

      await me.cart.add(extra.id, 1); // $33.00 ≥ $30.00
      expect(await me.cart.applyCoupon('SAVE5')).toMatchObject({ discountCents: 500, totalCents: 3300 - 500 + 499 });

      const dropped = await me.cart.remove(extra.id);
      expect(dropped).toMatchObject({ couponCode: null, discountCents: 0 });

      await me.cart.add(extra.id, 2); // $48.00
      await me.cart.applyCoupon('SAVE5');
      const order = await me.orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
      expect(order).toMatchObject({ subtotalCents: 4800, discountCents: 500, shippingCents: 499, totalCents: 4799 });
    });
  },
);
