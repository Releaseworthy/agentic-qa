import { Account, Cards, expect, expectRefused, newAddress, test } from '@fixtures';

test.describe('POST /api/orders', { tag: '@FEAT-CHECKOUT' }, () => {
  test('places an order, takes the stock and empties the cart', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 2000, stock: 10 });
    await seed.cart(customer, [{ product, quantity: 3 }]);
    const me = api.as(customer);
    const order = await me.orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
    expect(order, 'placed order: 3 × $20.00, free shipping, paid with the 4242 card').toMatchObject({
      status: 'placed',
      userId: customer.id,
      subtotalCents: 6000,
      shippingCents: 0,
      totalCents: 6000,
      cardLast4: '4242',
    });
    expect((await api.products.get(product.id)).stock, 'stock after selling 3 of 10').toBe(7);
    expect((await me.cart.get()).items, 'cart emptied by checkout').toEqual([]);
  });

  test('refuses an empty cart', async ({ api, customer }) => {
    await expectRefused(
      api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }),
      400,
      'EMPTY_CART',
    );
  });

  for (const [card, why, status, code] of [
    ['INVALID_NUMBER', 'fails the Luhn check', 400, 'INVALID_CARD'],
    ['EXPIRED', 'has expired', 400, 'CARD_EXPIRED'],
    ['DECLINED', 'is declined', 402, 'PAYMENT_DECLINED'],
  ] as const)
    test(`refuses a card that ${why} and keeps the cart`, { tag: '@BR-PAY-01' }, async ({ api, seed, customer }) => {
      const product = await seed.product({ stock: 5 });
      await seed.cart(customer, [{ product, quantity: 2 }]);
      const me = api.as(customer);
      await expectRefused(me.orders.place({ shippingAddress: newAddress(), payment: Cards[card] }), status, code);
      expect((await me.cart.get()).items, 'the cart keeps its line').toHaveLength(1);
      expect((await api.products.get(product.id)).stock, 'no stock taken').toBe(5);
    });

  test('refuses a 2-digit CVC', { tag: '@BR-PAY-01' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product() }]);
    await expectRefused(
      api.as(customer).orders.place({ shippingAddress: newAddress(), payment: { ...Cards.VALID, cvc: '12' } }),
      400,
      'INVALID_CARD',
    );
  });

  test('refuses a country that is not a 2-letter code', async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product() }]);
    await expectRefused(
      api.as(customer).orders.place({ shippingAddress: { ...newAddress(), country: 'USA' }, payment: Cards.VALID }),
      400,
      'VALIDATION',
    );
  });

  test('DEF-001 accepts a lower-case country code', { tag: '@DEF-001' }, async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product() }]);
    test.fail(true, 'DEF-001: lower-case country codes are refused');
    const order = await api
      .as(customer)
      .orders.place({ shippingAddress: { ...newAddress(), country: 'us' }, payment: Cards.VALID });
    expect(order.shippingAddress.country, 'country normalised to upper case').toBe('US');
  });

  test('refuses a missing shipping address', async ({ api, seed, customer }) => {
    await seed.cart(customer, [{ product: await seed.product() }]);
    const { status } = await api.as(customer).raw('POST', '/api/orders', { payment: Cards.VALID });
    expect(status, 'HTTP status for an order without shippingAddress').toBe(400);
  });
});

test.describe('Shipping fee', { tag: ['@FEAT-CHECKOUT', '@BR-SHIP-01'] }, () => {
  for (const [subtotal, shipping] of [
    [4999, 499],
    [5000, 0],
    [5001, 0],
  ] as const)
    test(`a $${(subtotal / 100).toFixed(2)} order ships for ${shipping} cents`, async ({ api, seed, customer }) => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: subtotal }) }]);
      const order = await api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
      expect({ shipping: order.shippingCents, total: order.totalCents }, 'shipping and total in cents').toEqual({
        shipping,
        total: subtotal + shipping,
      });
    });

  test('is decided after the discount', async ({ api, seed, customer }) => {
    // $52.00 - 10% = $46.80: below the free-shipping threshold again.
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 5200 }) }], 'WELCOME10');
    const order = await api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID });
    expect(order, '$46.80 after the discount pays $4.99 shipping').toMatchObject({
      discountCents: 520,
      shippingCents: 499,
      totalCents: 5179,
    });
  });
});

test.describe('GET /api/orders', { tag: '@FEAT-ORDERS' }, () => {
  test('lists only my own orders, newest first', async ({ api, seed, customer }) => {
    const first = await seed.order(customer);
    const second = await seed.order(customer);
    await seed.order(await seed.customer());
    expect(
      (await api.as(customer).orders.list()).map((o) => o.id),
      'my two orders, newest first, none of the other customer',
    ).toEqual([second.id, first.id]);
  });

  test("answers 404 for someone else's order", { tag: '@BR-ORD-03' }, async ({ api, seed, customer }) => {
    const theirs = await seed.order(await seed.customer());
    await expectRefused(api.as(customer).orders.get(theirs.id), 404, 'NOT_FOUND');
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test('lists the order history of a saved account', { tag: '@readonly' }, async ({ api, user }) => {
      const me = api.as(user);
      const [{ id }, orders] = [await me.auth.me(), await me.orders.list()];
      expect(orders.length, 'the returning customer has order history').toBeGreaterThan(0);
      expect(
        orders.map((o) => o.userId),
        'every order belongs to the returning customer',
      ).toEqual(orders.map(() => id));
    });
  });
});

test.describe('POST /api/orders/:id/cancel', { tag: '@FEAT-ORDERS' }, () => {
  test(
    'cancels a placed order and restocks its items',
    { tag: ['@BR-ORD-01', '@BR-ORD-02'] },
    async ({ api, seed, customer }) => {
      const product = await seed.product({ stock: 10 });
      const order = await seed.order(customer, [{ product, quantity: 4 }]);
      expect((await api.products.get(product.id)).stock, 'stock after the order took 4 of 10').toBe(6);
      const cancelled = await api.as(customer).orders.cancel(order.id);
      expect(cancelled.status, 'status after cancelling').toBe('cancelled');
      expect((await api.products.get(product.id)).stock, 'the 4 units are back in stock').toBe(10);
    },
  );

  test('refuses to cancel a shipped order', { tag: '@BR-ORD-01' }, async ({ api, seed, customer }) => {
    const order = await seed.shipped(await seed.order(customer));
    await expectRefused(api.as(customer).orders.cancel(order.id), 409, 'NOT_CANCELLABLE');
  });

  test('refuses to cancel twice', { tag: '@BR-ORD-01' }, async ({ api, seed, customer }) => {
    const order = await seed.order(customer);
    const me = api.as(customer).orders;
    await me.cancel(order.id);
    await expectRefused(me.cancel(order.id), 409, 'NOT_CANCELLABLE');
  });

  test("cannot cancel someone else's order", { tag: '@BR-ORD-03' }, async ({ api, seed, customer }) => {
    const theirs = await seed.order(await seed.customer());
    await expectRefused(api.as(customer).orders.cancel(theirs.id), 404, 'NOT_FOUND');
  });
});
