import { expect, expectRefused, test } from '@fixtures';

test.describe('POST /api/cart/coupon', { tag: '@FEAT-COUPON' }, () => {
  test('a percent coupon takes its share off the subtotal', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 4000 });
    await seed.cart(customer, [{ product }]);
    const cart = await api.as(customer).cart.applyCoupon('WELCOME10');
    expect(cart).toMatchObject({ couponCode: 'WELCOME10', subtotalCents: 4000, discountCents: 400 });
  });

  test('a fixed coupon takes its amount off', async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 3000 });
    await seed.cart(customer, [{ product }]);
    expect((await api.as(customer).cart.applyCoupon('SAVE5')).discountCents).toBe(500);
  });

  test('codes are case-insensitive', async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 4000 });
    await seed.cart(customer, [{ product }]);
    expect((await api.as(customer).cart.applyCoupon('welcome10')).couponCode).toBe('WELCOME10');
  });

  test('refuses an unknown code', async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product() }]);
    await expectRefused(api.as(customer).cart.applyCoupon('NOPE123'), 404, 'COUPON_NOT_FOUND');
  });

  test('refuses an expired coupon', { tag: '@BR-COUP-03' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 5000 }) }]);
    await expectRefused(api.as(customer).cart.applyCoupon('SUMMER20'), 410, 'COUPON_EXPIRED');
  });

  test('refuses a coupon below its minimum subtotal', { tag: '@BR-COUP-02' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 1999 }) }]);
    await expectRefused(api.as(customer).cart.applyCoupon('WELCOME10'), 422, 'COUPON_MIN_NOT_MET');
  });

  test('accepts a subtotal exactly at the minimum', { tag: '@BR-COUP-02' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 2000 }) }]);
    expect((await api.as(customer).cart.applyCoupon('WELCOME10')).discountCents).toBe(200);
  });

  test('a second coupon replaces the first', { tag: '@BR-COUP-01' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
    const me = api.as(customer).cart;
    await me.applyCoupon('WELCOME10');
    const cart = await me.applyCoupon('SAVE5');
    expect(cart).toMatchObject({ couponCode: 'SAVE5', discountCents: 500 });
  });

  test('a percent coupon never exceeds its cap', { tag: '@BR-COUP-04' }, async ({ api, seed, customer }) => {
    const coupon = await seed.coupon({ kind: 'percent', value: 50, maxDiscountCents: 1000 });
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 6000 }) }]);
    expect((await api.as(customer).cart.applyCoupon(coupon.code)).discountCents).toBe(1000);
  });

  test('BIGSPENDER is capped at $30', { tag: '@BR-COUP-04' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 10000 }), quantity: 3 }]);
    expect((await api.as(customer).cart.applyCoupon('BIGSPENDER')).discountCents).toBe(3000);
  });

  test(
    'a fixed coupon never takes the subtotal below zero',
    { tag: '@BR-COUP-04' },
    async ({ api, seed, customer }) => {
      const coupon = await seed.coupon({ kind: 'fixed', value: 5000 });
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 1200 }) }]);
      const cart = await api.as(customer).cart.applyCoupon(coupon.code);
      expect(cart).toMatchObject({ discountCents: 1200, subtotalCents: 1200 });
    },
  );
});

test.describe('Coupon upkeep', { tag: '@FEAT-COUPON' }, () => {
  test(
    'falls off when the subtotal drops below its minimum',
    { tag: '@BR-COUP-02' },
    async ({ api, seed, customer }) => {
      const product = await seed.product({ priceCents: 1500 });
      await seed.cart(customer, [{ product, quantity: 2 }], 'WELCOME10');
      const cart = await api.as(customer).cart.update(product.id, 1);
      expect(cart).toMatchObject({ couponCode: null, discountCents: 0 });
    },
  );

  test('DELETE /api/cart/coupon removes it', async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }], 'WELCOME10');
    expect(await api.as(customer).cart.removeCoupon()).toMatchObject({ couponCode: null, discountCents: 0 });
  });
});
