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

      await test.step('At $18.00, SAVE5 is refused: its minimum is $30.00', async () => {
        await me.cart.add(cheap.id, 1);
        await expectRefused(me.cart.applyCoupon('SAVE5'), 422, 'COUPON_MIN_NOT_MET');
      });

      await test.step('At $33.00, SAVE5 applies', async () => {
        await me.cart.add(extra.id, 1);
        expect(await me.cart.applyCoupon('SAVE5'), '$5.00 off, plus $4.99 shipping below $50.00').toMatchObject({
          discountCents: 500,
          totalCents: 3300 - 500 + 499,
        });
      });

      await test.step('Back to $18.00, the coupon falls off', async () => {
        expect(await me.cart.remove(extra.id), 'no coupon, no discount').toMatchObject({
          couponCode: null,
          discountCents: 0,
        });
      });

      await test.step('At $48.00 with SAVE5 again, checkout charges the discounted total', async () => {
        await me.cart.add(extra.id, 2);
        await me.cart.applyCoupon('SAVE5');
        const order = await me.orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
        expect(order, 'order: $48.00 − $5.00 + $4.99').toMatchObject({
          subtotalCents: 4800,
          discountCents: 500,
          shippingCents: 499,
          totalCents: 4799,
        });
      });
    });
  },
);
