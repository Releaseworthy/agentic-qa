import { Account, Cards, expect, expectRefused, newAddress, test } from '@fixtures';

test.describe('POST /api/orders', { tag: '@FEAT-CHECKOUT' }, () => {
  test('places an order, takes the stock and empties the cart', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    const me = api.as(customer);

    const product = await test.step('Given 3 × $20.00 in the cart, 10 in stock', async () => {
      const p = await seed.product({ priceCents: 2000, stock: 10 });
      await seed.cart(customer, [{ product: p, quantity: 3 }]);
      return p;
    });

    const order = await test.step('When the customer checks out with a valid card', () =>
      me.orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }));

    await test.step('Then the order is placed with the right totals', () => {
      expect(order, 'placed order: 3 × $20.00, free shipping, paid with the 4242 card').toMatchObject({
        status: 'placed',
        userId: customer.id,
        subtotalCents: 6000,
        shippingCents: 0,
        totalCents: 6000,
        cardLast4: '4242',
      });
    });

    await test.step('And the stock is taken and the cart emptied', async () => {
      expect((await api.products.get(product.id)).stock, 'stock after selling 3 of 10').toBe(7);
      expect((await me.cart.get()).items, 'cart emptied by checkout').toEqual([]);
    });
  });

  test('refuses an empty cart', async ({ api, customer }) => {
    await test.step('Checking out an empty cart is refused: 400 EMPTY_CART', () =>
      expectRefused(
        api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }),
        400,
        'EMPTY_CART',
      ));
  });

  for (const [card, why, status, code] of [
    ['INVALID_NUMBER', 'fails the Luhn check', 400, 'INVALID_CARD'],
    ['EXPIRED', 'has expired', 400, 'CARD_EXPIRED'],
    ['DECLINED', 'is declined', 402, 'PAYMENT_DECLINED'],
  ] as const)
    test(`refuses a card that ${why} and keeps the cart`, { tag: '@BR-PAY-01' }, async ({ api, seed, customer }) => {
      const me = api.as(customer);

      const product = await test.step('Given 2 units in the cart, 5 in stock', async () => {
        const p = await seed.product({ stock: 5 });
        await seed.cart(customer, [{ product: p, quantity: 2 }]);
        return p;
      });

      await test.step(`Paying with a card that ${why} is refused: ${status} ${code}`, () =>
        expectRefused(me.orders.place({ shippingAddress: newAddress(), payment: Cards[card] }), status, code));

      await test.step('Then nothing changed: the cart and the stock are as before', async () => {
        expect((await me.cart.get()).items, 'the cart keeps its line').toHaveLength(1);
        expect((await api.products.get(product.id)).stock, 'no stock taken: still 5').toBe(5);
      });
    });

  test('refuses a 2-digit CVC', { tag: '@BR-PAY-01' }, async ({ api, seed, customer }) => {
    await test.step('Given a cart with a product', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    await test.step('Paying with CVC "12" is refused: 400 INVALID_CARD', () =>
      expectRefused(
        api.as(customer).orders.place({ shippingAddress: newAddress(), payment: { ...Cards.VALID, cvc: '12' } }),
        400,
        'INVALID_CARD',
      ));
  });

  test('refuses a country that is not a 2-letter code', async ({ api, seed, customer }) => {
    await test.step('Given a cart with a product', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    await test.step('Shipping to country "USA" is refused: 400 VALIDATION', () =>
      expectRefused(
        api.as(customer).orders.place({ shippingAddress: { ...newAddress(), country: 'USA' }, payment: Cards.VALID }),
        400,
        'VALIDATION',
      ));
  });

  test('DEF-001 accepts a lower-case country code', { tag: '@DEF-001' }, async ({ api, seed, customer }) => {
    await test.step('Given a cart with a product', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    test.fail(true, 'DEF-001: lower-case country codes are refused');

    const order = await test.step('When the customer ships to country "us"', () =>
      api.as(customer).orders.place({ shippingAddress: { ...newAddress(), country: 'us' }, payment: Cards.VALID }));

    await test.step('Then the order is placed with the country in upper case', () => {
      expect(order.shippingAddress.country, 'country normalised to upper case').toBe('US');
    });
  });

  test('refuses a missing shipping address', async ({ api, seed, customer }) => {
    await test.step('Given a cart with a product', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    const { status } = await test.step('When an order is sent without a shipping address', () =>
      api.as(customer).raw('POST', '/api/orders', { payment: Cards.VALID }));

    await test.step('Then it is refused as a validation error', () => {
      expect(status, 'HTTP status for an order without shippingAddress').toBe(400);
    });
  });
});

test.describe('Shipping fee', { tag: ['@FEAT-CHECKOUT', '@BR-SHIP-01'] }, () => {
  for (const [subtotal, shipping] of [
    [4999, 499],
    [5000, 0],
    [5001, 0],
  ] as const)
    test(`a $${(subtotal / 100).toFixed(2)} order ships for ${shipping} cents`, async ({ api, seed, customer }) => {
      await test.step(`Given a $${(subtotal / 100).toFixed(2)} cart`, async () => {
        await seed.cart(customer, [{ product: await seed.product({ priceCents: subtotal }) }]);
      });

      const order = await test.step('When the customer checks out', () =>
        api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }));

      await test.step(`Then shipping is ${shipping} cents and the total includes it`, () => {
        expect(
          { shipping: order.shippingCents, total: order.totalCents },
          `shipping and total in cents for a ${subtotal}-cent subtotal`,
        ).toEqual({ shipping, total: subtotal + shipping });
      });
    });

  test('is decided after the discount', async ({ api, seed, customer }) => {
    await test.step('Given a $52.00 cart with WELCOME10: $46.80 after the discount', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 5200 }) }], 'WELCOME10');
    });

    const order = await test.step('When the customer checks out', () =>
      api.as(customer).orders.place({ shippingAddress: newAddress(), payment: Cards.VALID }));

    await test.step('Then shipping is charged, because $46.80 is under $50.00', () => {
      expect(order, '$46.80 after the discount pays $4.99 shipping').toMatchObject({
        discountCents: 520,
        shippingCents: 499,
        totalCents: 5179,
      });
    });
  });
});

test.describe('GET /api/orders', { tag: '@FEAT-ORDERS' }, () => {
  test('lists only my own orders, newest first', async ({ api, seed, customer }) => {
    const [first, second] = await test.step('Given two orders of mine and one of another customer', async () => {
      const orders = [await seed.order(customer), await seed.order(customer)] as const;
      await seed.order(await seed.customer());
      return orders;
    });

    const listed = await test.step('When I list my orders', () => api.as(customer).orders.list());

    await test.step('Then I see only mine, newest first', () => {
      expect(
        listed.map((o) => o.id),
        'my two orders, newest first, none of the other customer',
      ).toEqual([second.id, first.id]);
    });
  });

  test("answers 404 for someone else's order", { tag: '@BR-ORD-03' }, async ({ api, seed, customer }) => {
    const theirs = await test.step("Given another customer's order", async () => seed.order(await seed.customer()));

    await test.step('Reading it is refused as if it did not exist: 404 NOT_FOUND', () =>
      expectRefused(api.as(customer).orders.get(theirs.id), 404, 'NOT_FOUND'));
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test('lists the order history of a saved account', { tag: '@readonly' }, async ({ api, user }) => {
      const me = api.as(user);

      const [{ id }, orders] = await test.step('When the saved account lists its orders', async () => [
        await me.auth.me(),
        await me.orders.list(),
      ]);

      await test.step('Then there is history, and all of it is theirs', () => {
        expect(orders.length, 'the returning customer has order history').toBeGreaterThan(0);
        expect(
          orders.map((o) => o.userId),
          'every order belongs to the returning customer',
        ).toEqual(orders.map(() => id));
      });
    });
  });
});

test.describe('POST /api/orders/:id/cancel', { tag: '@FEAT-ORDERS' }, () => {
  test(
    'cancels a placed order and restocks its items',
    { tag: ['@BR-ORD-01', '@BR-ORD-02'] },
    async ({ api, seed, customer }) => {
      const { product, order } = await test.step('Given a placed order of 4 units, 10 in stock before', async () => {
        const p = await seed.product({ stock: 10 });
        return { product: p, order: await seed.order(customer, [{ product: p, quantity: 4 }]) };
      });

      await test.step('And the order took the 4 units', async () => {
        expect((await api.products.get(product.id)).stock, 'stock after the order took 4 of 10').toBe(6);
      });

      const cancelled = await test.step('When the customer cancels it', () => api.as(customer).orders.cancel(order.id));

      await test.step('Then it is cancelled and the units are back in stock', async () => {
        expect(cancelled.status, 'a placed order can be cancelled (BR-ORD-01)').toBe('cancelled');
        expect((await api.products.get(product.id)).stock, 'the 4 units are back in stock').toBe(10);
      });
    },
  );

  test('refuses to cancel a shipped order', { tag: '@BR-ORD-01' }, async ({ api, seed, customer }) => {
    const order = await test.step('Given an order the admin shipped', async () =>
      seed.shipped(await seed.order(customer)));

    await test.step('Cancelling it is refused: 409 NOT_CANCELLABLE', () =>
      expectRefused(api.as(customer).orders.cancel(order.id), 409, 'NOT_CANCELLABLE'));
  });

  test('refuses to cancel twice', { tag: '@BR-ORD-01' }, async ({ api, seed, customer }) => {
    const me = api.as(customer).orders;

    const order = await test.step('Given an order that was already cancelled', async () => {
      const o = await seed.order(customer);
      await me.cancel(o.id);
      return o;
    });

    await test.step('Cancelling it again is refused: 409 NOT_CANCELLABLE', () =>
      expectRefused(me.cancel(order.id), 409, 'NOT_CANCELLABLE'));
  });

  test("cannot cancel someone else's order", { tag: '@BR-ORD-03' }, async ({ api, seed, customer }) => {
    const theirs = await test.step("Given another customer's order", async () => seed.order(await seed.customer()));

    await test.step('Cancelling it is refused as if it did not exist: 404 NOT_FOUND', () =>
      expectRefused(api.as(customer).orders.cancel(theirs.id), 404, 'NOT_FOUND'));
  });
});
