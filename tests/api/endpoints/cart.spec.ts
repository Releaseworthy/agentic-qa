import { expect, expectRefused, test } from '@fixtures';

test.describe('POST /api/cart/items', { tag: '@FEAT-CART' }, () => {
  test('adds a line and prices it', { tag: '@smoke' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 1250 });
    const cart = await api.as(customer).cart.add(product.id, 2);
    expect(cart.items).toEqual([
      { productId: product.id, name: product.name, unitPriceCents: 1250, quantity: 2, lineTotalCents: 2500 },
    ]);
    expect(cart.subtotalCents).toBe(2500);
  });

  test('merges a second add of the same product into one line', async ({ api, seed, customer }) => {
    const product = await seed.product();
    const me = api.as(customer).cart;
    await me.add(product.id, 2);
    const cart = await me.add(product.id, 3);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(5);
  });

  for (const quantity of [0, -1, 11])
    test(`refuses quantity ${quantity}`, { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
      const product = await seed.product();
      await expectRefused(api.as(customer).cart.add(product.id, quantity), 422, 'QTY_LIMIT');
    });

  test('accepts exactly 10 units', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const product = await seed.product();
    expect((await api.as(customer).cart.add(product.id, 10)).items[0]?.quantity).toBe(10);
  });

  test('refuses adds that take a line above 10 units', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const product = await seed.product();
    const me = api.as(customer).cart;
    await me.add(product.id, 6);
    await expectRefused(me.add(product.id, 5), 422, 'QTY_LIMIT');
    expect((await me.get()).items[0]?.quantity).toBe(6);
  });

  test('refuses more units than in stock', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ stock: 3 });
    const error = await expectRefused(api.as(customer).cart.add(product.id, 4), 409, 'OUT_OF_STOCK');
    expect(error.reason).toContain('Only 3');
  });

  test('refuses an out-of-stock product', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ stock: 0 });
    await expectRefused(api.as(customer).cart.add(product.id, 1), 409, 'OUT_OF_STOCK');
  });

  test('refuses an unknown product', async ({ api, customer }) => {
    await expectRefused(api.as(customer).cart.add('p_nope', 1), 404, 'NOT_FOUND');
  });

  test('refuses a non-integer quantity', async ({ api, seed, customer }) => {
    const product = await seed.product();
    const { status } = await api.as(customer).raw('POST', '/api/cart/items', { productId: product.id, quantity: 1.5 });
    expect(status).toBe(400);
  });

  test('needs a signed-in user', async ({ api, seed }) => {
    const product = await seed.product();
    await expectRefused(api.cart.add(product.id, 1), 401, 'UNAUTHORIZED');
  });
});

test.describe('PATCH /api/cart/items/:productId', { tag: '@FEAT-CART' }, () => {
  test('changes the quantity of a line', async ({ api, seed, customer }) => {
    const product = await seed.product({ priceCents: 500 });
    await seed.cart(customer, [{ product }]);
    const cart = await api.as(customer).cart.update(product.id, 4);
    expect(cart.items[0]).toMatchObject({ quantity: 4, lineTotalCents: 2000 });
  });

  test('refuses a quantity above 10', { tag: '@BR-CART-01' }, async ({ api, seed, customer }) => {
    const product = await seed.product();
    await seed.cart(customer, [{ product }]);
    await expectRefused(api.as(customer).cart.update(product.id, 11), 422, 'QTY_LIMIT');
  });

  test('refuses a quantity above stock', { tag: '@BR-CART-02' }, async ({ api, seed, customer }) => {
    const product = await seed.product({ stock: 2 });
    await seed.cart(customer, [{ product }]);
    await expectRefused(api.as(customer).cart.update(product.id, 3), 409, 'OUT_OF_STOCK');
  });

  test('quantity 0 removes the line', async ({ api, seed, customer }) => {
    const product = await seed.product();
    await seed.cart(customer, [{ product }]);
    expect((await api.as(customer).cart.update(product.id, 0)).items).toEqual([]);
  });

  test('answers 404 for a product not in the cart', async ({ api, seed, customer }) => {
    const product = await seed.product();
    await expectRefused(api.as(customer).cart.update(product.id, 1), 404, 'NOT_IN_CART');
  });
});

test.describe('DELETE /api/cart/items/:productId', { tag: '@FEAT-CART' }, () => {
  test('removes a line', async ({ api, seed, customer }) => {
    const [a, b] = [await seed.product(), await seed.product()];
    await seed.cart(customer, [{ product: a }, { product: b }]);
    const cart = await api.as(customer).cart.remove(a.id);
    expect(cart.items.map((i) => i.productId)).toEqual([b.id]);
  });

  test('answers 404 for a product not in the cart', async ({ api, customer }) => {
    await expectRefused(api.as(customer).cart.remove('p_bk-001'), 404, 'NOT_IN_CART');
  });
});

test.describe('GET /api/cart', { tag: '@FEAT-CART' }, () => {
  test('a new customer has an empty cart with zero totals', async ({ api, customer }) => {
    expect(await api.as(customer).cart.get()).toEqual({
      items: [],
      couponCode: null,
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
  });

  test("one customer never sees another's cart", async ({ api, seed, customer }) => {
    const product = await seed.product();
    await seed.cart(customer, [{ product }]);
    const other = await seed.customer();
    expect((await api.as(other).cart.get()).items).toEqual([]);
  });
});
