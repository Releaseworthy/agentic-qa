import { expect, expectRefused, test } from '@fixtures';

test.describe('GET /api/products', { tag: '@FEAT-CATALOG' }, () => {
  test('lists the catalog sorted by name', { tag: ['@smoke', '@readonly'] }, async ({ api }) => {
    const { items, count } = await test.step('When the catalog is listed without filters', () => api.products.list());

    await test.step('Then every product is there with a matching count', () => {
      expect(count, 'count matches the items returned').toBe(items.length);
      expect(count, 'at least the 12 seeded products').toBeGreaterThanOrEqual(12);
    });

    await test.step('And the products are sorted by name', () => {
      const names = items.map((p) => p.name);
      expect(names, 'names in alphabetical order').toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  test('filters by category', { tag: '@readonly' }, async ({ api }) => {
    const { items } = await test.step('When the catalog is filtered to books', () =>
      api.products.list({ category: 'books' }));

    await test.step('Then only books are listed', () => {
      expect(items.length, 'some books are listed').toBeGreaterThan(0);
      expect(
        items.map((p) => p.category),
        'every product listed is a book',
      ).toEqual(items.map(() => 'books'));
    });
  });

  test('searches name and description, case-insensitively', { tag: '@readonly' }, async ({ api }) => {
    await test.step('Searching "KEYBOARD" finds the keyboard by its name', async () => {
      const byName = await api.products.list({ q: 'KEYBOARD' });
      expect(
        byName.items.map((p) => p.sku),
        '"KEYBOARD" matches the keyboard by name',
      ).toEqual(['EL-003']);
    });

    await test.step('Searching "dishwasher" finds the mug by its description', async () => {
      const byDescription = await api.products.list({ q: 'dishwasher' });
      expect(
        byDescription.items.map((p) => p.name),
        '"dishwasher" matches the mug by description',
      ).toEqual(['Ceramic Mug']);
    });
  });

  test('answers an empty list when nothing matches', { tag: '@readonly' }, async ({ api }) => {
    const result = await test.step('When the catalog is searched for "zzz-no-such-thing"', () =>
      api.products.list({ q: 'zzz-no-such-thing' }));

    await test.step('Then the list is empty', () => {
      expect(result, 'no items, count 0').toEqual({ items: [], count: 0 });
    });
  });

  for (const sort of ['price_asc', 'price_desc'] as const)
    test(`sorts by ${sort}`, { tag: '@readonly' }, async ({ api }) => {
      const prices = await test.step(`When electronics are listed by ${sort}`, async () =>
        (await api.products.list({ category: 'electronics', sort })).items.map((p) => p.priceCents));

      await test.step(`Then the prices are in ${sort} order`, () => {
        const sorted = [...prices].sort((a, b) => (sort === 'price_asc' ? a - b : b - a));
        expect(prices, `prices in ${sort} order`).toEqual(sorted);
      });
    });

  test('refuses an unknown category', { tag: '@readonly' }, async ({ api }) => {
    const { status, body } = await test.step('When the catalog is filtered to category "weapons"', () =>
      api.raw('GET', '/api/products?category=weapons'));

    await test.step('Then it is refused as a validation error', () => {
      expect(status, 'HTTP status for an unknown category').toBe(400);
      expect(body, 'error code for an unknown category').toMatchObject({ error: { code: 'VALIDATION' } });
    });
  });
});

test.describe('GET /api/products/:id', { tag: '@FEAT-CATALOG' }, () => {
  test('returns one product', async ({ api, seed }) => {
    const product = await test.step('Given a $12.34 product with 7 in stock', () =>
      seed.product({ priceCents: 1234, stock: 7 }));

    const fetched = await test.step('When it is fetched by id', () => api.products.get(product.id));

    await test.step('Then it is the product as created', () => {
      expect(fetched, 'the product as created').toEqual(product);
    });
  });

  test('answers 404 for an unknown id', { tag: '@readonly' }, async ({ api }) => {
    await test.step('Fetching an id that does not exist is refused: 404 NOT_FOUND', () =>
      expectRefused(api.products.get('p_nope'), 404, 'NOT_FOUND'));
  });
});
