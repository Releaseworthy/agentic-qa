import { expect, expectRefused, test } from '@fixtures';

test.describe('GET /api/products', { tag: '@FEAT-CATALOG' }, () => {
  test('lists the catalog sorted by name', { tag: ['@smoke', '@readonly'] }, async ({ api }) => {
    const { items, count } = await api.products.list();
    expect(count, 'count matches the items returned').toBe(items.length);
    expect(count, 'at least the 12 seeded products').toBeGreaterThanOrEqual(12);
    const names = items.map((p) => p.name);
    expect(names, 'names in alphabetical order').toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('filters by category', { tag: '@readonly' }, async ({ api }) => {
    const { items } = await api.products.list({ category: 'books' });
    expect(items.length, 'some books are listed').toBeGreaterThan(0);
    expect(
      items.map((p) => p.category),
      'every product listed is a book',
    ).toEqual(items.map(() => 'books'));
  });

  test('searches name and description, case-insensitively', { tag: '@readonly' }, async ({ api }) => {
    const byName = await api.products.list({ q: 'KEYBOARD' });
    expect(
      byName.items.map((p) => p.sku),
      '"KEYBOARD" matches the keyboard by name',
    ).toEqual(['EL-003']);
    const byDescription = await api.products.list({ q: 'dishwasher' });
    expect(
      byDescription.items.map((p) => p.name),
      '"dishwasher" matches the mug by description',
    ).toEqual(['Ceramic Mug']);
  });

  test('answers an empty list when nothing matches', { tag: '@readonly' }, async ({ api }) => {
    expect(await api.products.list({ q: 'zzz-no-such-thing' }), 'no items, count 0').toEqual({ items: [], count: 0 });
  });

  for (const sort of ['price_asc', 'price_desc'] as const)
    test(`sorts by ${sort}`, { tag: '@readonly' }, async ({ api }) => {
      const prices = (await api.products.list({ category: 'electronics', sort })).items.map((p) => p.priceCents);
      const sorted = [...prices].sort((a, b) => (sort === 'price_asc' ? a - b : b - a));
      expect(prices, `prices in ${sort} order`).toEqual(sorted);
    });

  test('refuses an unknown category', { tag: '@readonly' }, async ({ api }) => {
    const { status, body } = await api.raw('GET', '/api/products?category=weapons');
    expect(status, 'HTTP status for an unknown category').toBe(400);
    expect(body, 'error code').toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

test.describe('GET /api/products/:id', { tag: '@FEAT-CATALOG' }, () => {
  test('returns one product', async ({ api, seed }) => {
    const product = await seed.product({ priceCents: 1234, stock: 7 });
    expect(await api.products.get(product.id), 'the product as created').toEqual(product);
  });

  test('answers 404 for an unknown id', { tag: '@readonly' }, async ({ api }) => {
    await expectRefused(api.products.get('p_nope'), 404, 'NOT_FOUND');
  });
});
