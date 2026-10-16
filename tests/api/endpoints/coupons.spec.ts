import { expect, expectRefused, test } from '@fixtures';

test.describe('POST /api/cart/coupon', { tag: '@FEAT-COUPON' }, () => {
  test('a percent coupon takes its share off the subtotal', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    await test.step('Given a $40.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
    });

    const cart = await test.step('When WELCOME10 is applied', () => api.as(customer).cart.applyCoupon('WELCOME10'));

    await test.step('Then 10 % is taken off the subtotal', () => {
      expect(cart, 'WELCOME10 takes 10% off $40.00').toMatchObject({
        couponCode: 'WELCOME10',
        subtotalCents: 4000,
        discountCents: 400,
      });
    });
  });

  test('a fixed coupon takes its amount off', async ({ api, seed, customer }) => {
    await test.step('Given a $30.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 3000 }) }]);
    });

    const cart = await test.step('When SAVE5 is applied', () => api.as(customer).cart.applyCoupon('SAVE5'));

    await test.step('Then $5.00 is taken off', () => {
      expect(cart.discountCents, 'SAVE5 takes $5.00 off').toBe(500);
    });
  });

  test('codes are case-insensitive', async ({ api, seed, customer }) => {
    await test.step('Given a $40.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
    });

    const cart = await test.step('When "welcome10" is applied in lower case', () =>
      api.as(customer).cart.applyCoupon('welcome10'));

    await test.step('Then the coupon applies under its upper-case code', () => {
      expect(cart.couponCode, 'applied under its canonical upper-case code').toBe('WELCOME10');
    });
  });

  test('refuses an unknown code', async ({ api, seed, customer }) => {
    await test.step('Given a cart with a product', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    await test.step('Applying NOPE123 is refused: 404 COUPON_NOT_FOUND', () =>
      expectRefused(api.as(customer).cart.applyCoupon('NOPE123'), 404, 'COUPON_NOT_FOUND'));
  });

  test('refuses an expired coupon', { tag: '@BR-COUP-03' }, async ({ api, seed, customer }) => {
    await test.step('Given a $50.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 5000 }) }]);
    });

    await test.step('Applying the expired SUMMER20 is refused: 410 COUPON_EXPIRED', () =>
      expectRefused(api.as(customer).cart.applyCoupon('SUMMER20'), 410, 'COUPON_EXPIRED'));
  });

  test('refuses a coupon below its minimum subtotal', { tag: '@BR-COUP-02' }, async ({ api, seed, customer }) => {
    await test.step('Given a $19.99 cart, 1 cent under the WELCOME10 minimum', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 1999 }) }]);
    });

    await test.step('Applying WELCOME10 is refused: 422 COUPON_MIN_NOT_MET', () =>
      expectRefused(api.as(customer).cart.applyCoupon('WELCOME10'), 422, 'COUPON_MIN_NOT_MET'));
  });

  test('accepts a subtotal exactly at the minimum', { tag: '@BR-COUP-02' }, async ({ api, seed, customer }) => {
    await test.step('Given a $20.00 cart, exactly the WELCOME10 minimum', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 2000 }) }]);
    });

    const cart = await test.step('When WELCOME10 is applied', () => api.as(customer).cart.applyCoupon('WELCOME10'));

    await test.step('Then it applies: 10 % of $20.00', () => {
      expect(cart.discountCents, 'WELCOME10 applies at its $20.00 minimum').toBe(200);
    });
  });

  test('a second coupon replaces the first', { tag: '@BR-COUP-01' }, async ({ api, seed, customer }) => {
    const me = api.as(customer).cart;

    await test.step('Given a $40.00 cart with WELCOME10 applied', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
      await me.applyCoupon('WELCOME10');
    });

    const cart = await test.step('When SAVE5 is applied as well', () => me.applyCoupon('SAVE5'));

    await test.step('Then only SAVE5 counts', () => {
      expect(cart, 'only SAVE5 counts, not both').toMatchObject({ couponCode: 'SAVE5', discountCents: 500 });
    });
  });

  test('a percent coupon never exceeds its cap', { tag: '@BR-COUP-04' }, async ({ api, seed, customer }) => {
    const coupon = await test.step('Given a 50 % coupon capped at $10.00, and a $60.00 cart', async () => {
      const c = await seed.coupon({ kind: 'percent', value: 50, maxDiscountCents: 1000 });
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 6000 }) }]);
      return c;
    });

    const cart = await test.step('When the coupon is applied', () => api.as(customer).cart.applyCoupon(coupon.code));

    await test.step('Then the discount stops at the cap', () => {
      expect(cart.discountCents, '50% of $60.00 capped at $10.00').toBe(1000);
    });
  });

  test('BIGSPENDER is capped at $30', { tag: '@BR-COUP-04' }, async ({ api, seed, customer }) => {
    await test.step('Given a $300.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 10000 }), quantity: 3 }]);
    });

    const cart = await test.step('When BIGSPENDER is applied', () => api.as(customer).cart.applyCoupon('BIGSPENDER'));

    await test.step('Then the discount stops at $30.00', () => {
      expect(cart.discountCents, '15% of $300.00 capped at $30.00').toBe(3000);
    });
  });

  test(
    'a fixed coupon never takes the subtotal below zero',
    { tag: '@BR-COUP-04' },
    async ({ api, seed, customer }) => {
      const coupon = await test.step('Given a $50.00 fixed coupon and a $12.00 cart', async () => {
        const c = await seed.coupon({ kind: 'fixed', value: 5000 });
        await seed.cart(customer, [{ product: await seed.product({ priceCents: 1200 }) }]);
        return c;
      });

      const cart = await test.step('When the coupon is applied', () => api.as(customer).cart.applyCoupon(coupon.code));

      await test.step('Then the discount is the whole subtotal, never more', () => {
        expect(cart, '$50.00 off a $12.00 cart takes only $12.00').toMatchObject({
          discountCents: 1200,
          subtotalCents: 1200,
        });
      });
    },
  );
});

test.describe('Coupon upkeep', { tag: '@FEAT-COUPON' }, () => {
  test(
    'falls off when the subtotal drops below its minimum',
    { tag: '@BR-COUP-02' },
    async ({ api, seed, customer }) => {
      const product = await test.step('Given 2 × $15.00 in the cart with WELCOME10 applied', async () => {
        const p = await seed.product({ priceCents: 1500 });
        await seed.cart(customer, [{ product: p, quantity: 2 }], 'WELCOME10');
        return p;
      });

      const cart = await test.step('When the quantity drops to 1 ($15.00)', () =>
        api.as(customer).cart.update(product.id, 1));

      await test.step('Then the coupon is removed', () => {
        expect(cart, 'coupon removed at $15.00, below its $20.00 minimum').toMatchObject({
          couponCode: null,
          discountCents: 0,
        });
      });
    },
  );

  test('DELETE /api/cart/coupon removes it', async ({ api, seed, customer }) => {
    await test.step('Given a $40.00 cart with WELCOME10 applied', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }], 'WELCOME10');
    });

    const cart = await test.step('When the coupon is removed', () => api.as(customer).cart.removeCoupon());

    await test.step('Then there is no coupon and no discount', () => {
      expect(cart, 'no coupon, no discount').toMatchObject({ couponCode: null, discountCents: 0 });
    });
  });
});
