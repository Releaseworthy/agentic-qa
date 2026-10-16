import { expect, expectRefused, test } from '@fixtures';

test.describe('POST /api/cart/items', { tag: '@FEAT-CART' }, () => {
  test('adds a line and prices it', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a $12.50 product', () => seed.product({ priceCents: 1250 }));

    const cart = await test.step('When the customer adds 2 units', () => api.as(customer).cart.add(product.id, 2));

    await test.step('Then the cart has one line priced 2 × $12.50', () => {
      expect(cart.items, 'one line: 2 × $12.50').toEqual([
        { productId: product.id, name: product.name, unitPriceCents: 1250, quantity: 2, lineTotalCents: 2500 },
      ]);
      expect(cart.subtotalCents, 'cart subtotal is the line total, $25.00').toBe(2500);
    });
  });

  test('merges a second add of the same product into one line', async ({ api, seed, customer }) => {
    const me = api.as(customer).cart;

    const product = await test.step('Given 2 units of a product in the cart', async () => {
      const p = await seed.product();
      await me.add(p.id, 2);
      return p;
    });

    const cart = await test.step('When 3 more units of it are added', () => me.add(product.id, 3));

    await test.step('Then the cart still has one line, with 5 units', () => {
      expect(cart.items, 'still one line for the product').toHaveLength(1);
      expect(cart.items[0]?.quantity, 'quantities added up: 2 + 3').toBe(5);
    });
  });

  for (const quantity of [0, -1, 11])
    test(`refuses quantity ${quantity}`, { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
      const product = await test.step('Given a product in stock', () => seed.product());

      await test.step(`Adding ${quantity} units is refused: 422 QTY_LIMIT`, () =>
        expectRefused(api.as(customer).cart.add(product.id, quantity), 422, 'QTY_LIMIT'));
    });

  test('accepts exactly 10 units', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a product in stock', () => seed.product());

    const cart = await test.step('When the customer adds 10 units', () => api.as(customer).cart.add(product.id, 10));

    await test.step('Then the line holds all 10', () => {
      expect(cart.items[0]?.quantity, 'the line holds the 10-unit maximum').toBe(10);
    });
  });

  test('refuses adds that take a line above 10 units', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const me = api.as(customer).cart;

    const product = await test.step('Given 6 units of a product in the cart', async () => {
      const p = await seed.product();
      await me.add(p.id, 6);
      return p;
    });

    await test.step('Adding 5 more (11 in total) is refused: 422 QTY_LIMIT', () =>
      expectRefused(me.add(product.id, 5), 422, 'QTY_LIMIT'));

    await test.step('Then the line keeps its 6 units', async () => {
      expect((await me.get()).items[0]?.quantity, 'the line keeps its 6 units after the refusal').toBe(6);
    });
  });

  test('refuses more units than in stock', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a product with 3 in stock', () => seed.product({ stock: 3 }));

    const error = await test.step('Adding 4 units is refused: 409 OUT_OF_STOCK', () =>
      expectRefused(api.as(customer).cart.add(product.id, 4), 409, 'OUT_OF_STOCK'));

    await test.step('Then the refusal says how many are left', () => {
      expect(error.reason, 'the message says only 3 are left').toContain('Only 3');
    });
  });

  test('refuses an out-of-stock product', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a product with 0 in stock', () => seed.product({ stock: 0 }));

    await test.step('Adding it is refused: 409 OUT_OF_STOCK', () =>
      expectRefused(api.as(customer).cart.add(product.id, 1), 409, 'OUT_OF_STOCK'));
  });

  test('refuses an unknown product', async ({ api, customer }) => {
    await test.step('Adding a product id that does not exist is refused: 404 NOT_FOUND', () =>
      expectRefused(api.as(customer).cart.add('p_nope', 1), 404, 'NOT_FOUND'));
  });

  test('refuses a non-integer quantity', async ({ api, seed, customer }) => {
    const product = await test.step('Given a product in stock', () => seed.product());

    const { status } = await test.step('When 1.5 units are added', () =>
      api.as(customer).raw('POST', '/api/cart/items', { productId: product.id, quantity: 1.5 }));

    await test.step('Then it is refused as a validation error', () => {
      expect(status, 'HTTP status for quantity 1.5').toBe(400);
    });
  });

  test('needs a signed-in user', async ({ api, seed }) => {
    const product = await test.step('Given a product in stock', () => seed.product());

    await test.step('Adding it without a token is refused: 401 UNAUTHORIZED', () =>
      expectRefused(api.cart.add(product.id, 1), 401, 'UNAUTHORIZED'));
  });
});

test.describe('PATCH /api/cart/items/:productId', { tag: '@FEAT-CART' }, () => {
  test('changes the quantity of a line', async ({ api, seed, customer }) => {
    const product = await test.step('Given a $5.00 product in the cart', async () => {
      const p = await seed.product({ priceCents: 500 });
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    const cart = await test.step('When its quantity is set to 4', () => api.as(customer).cart.update(product.id, 4));

    await test.step('Then the line is repriced', () => {
      expect(cart.items[0], 'line repriced: 4 × $5.00').toMatchObject({ quantity: 4, lineTotalCents: 2000 });
    });
  });

  test('refuses a quantity above 10', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a product in the cart', async () => {
      const p = await seed.product();
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    await test.step('Setting the quantity to 11 is refused: 422 QTY_LIMIT', () =>
      expectRefused(api.as(customer).cart.update(product.id, 11), 422, 'QTY_LIMIT'));
  });

  test('refuses a quantity above stock', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await test.step('Given a product with 2 in stock, in the cart', async () => {
      const p = await seed.product({ stock: 2 });
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    await test.step('Setting the quantity to 3 is refused: 409 OUT_OF_STOCK', () =>
      expectRefused(api.as(customer).cart.update(product.id, 3), 409, 'OUT_OF_STOCK'));
  });

  test('quantity 0 removes the line', async ({ api, seed, customer }) => {
    const product = await test.step('Given a product in the cart', async () => {
      const p = await seed.product();
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    const cart = await test.step('When its quantity is set to 0', () => api.as(customer).cart.update(product.id, 0));

    await test.step('Then the line is gone', () => {
      expect(cart.items, 'quantity 0 removed the only line: the cart is empty').toEqual([]);
    });
  });

  test('answers 404 for a product not in the cart', async ({ api, seed, customer }) => {
    const product = await test.step('Given a product that is not in the cart', () => seed.product());

    await test.step('Updating its quantity is refused: 404 NOT_IN_CART', () =>
      expectRefused(api.as(customer).cart.update(product.id, 1), 404, 'NOT_IN_CART'));
  });
});

test.describe('DELETE /api/cart/items/:productId', { tag: '@FEAT-CART' }, () => {
  test('removes a line', async ({ api, seed, customer }) => {
    const [a, b] = await test.step('Given two products in the cart', async () => {
      const products = [await seed.product(), await seed.product()] as const;
      await seed.cart(customer, [{ product: products[0] }, { product: products[1] }]);
      return products;
    });

    const cart = await test.step('When the first one is removed', () => api.as(customer).cart.remove(a.id));

    await test.step('Then only the second one is left', () => {
      expect(
        cart.items.map((i) => i.productId),
        'only the other product is left',
      ).toEqual([b.id]);
    });
  });

  test('answers 404 for a product not in the cart', async ({ api, customer }) => {
    await test.step('Removing a product the cart does not hold is refused: 404 NOT_IN_CART', () =>
      expectRefused(api.as(customer).cart.remove('p_bk-001'), 404, 'NOT_IN_CART'));
  });
});

test.describe('GET /api/cart', { tag: '@FEAT-CART' }, () => {
  test('a new customer has an empty cart with zero totals', async ({ api, customer }) => {
    const cart = await test.step("When a new customer's cart is read", () => api.as(customer).cart.get());

    await test.step('Then it is empty with every total at 0', () => {
      expect(cart, 'empty cart, no coupon, all totals 0').toEqual({
        items: [],
        couponCode: null,
        subtotalCents: 0,
        discountCents: 0,
        shippingCents: 0,
        totalCents: 0,
      });
    });
  });

  test("one customer never sees another's cart", async ({ api, seed, customer }) => {
    await test.step('Given a customer with a product in their cart', async () => {
      await seed.cart(customer, [{ product: await seed.product() }]);
    });

    const other = await test.step('And a second customer', () => seed.customer());

    await test.step("Then the second customer's cart is empty", async () => {
      expect((await api.as(other).cart.get()).items, "the other customer's cart is still empty").toEqual([]);
    });
  });
});
