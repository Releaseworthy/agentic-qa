import { expect, expectRefused, test } from '@fixtures';

test.describe('GET /api/products', { tag: '@FEAT-CATALOG' }, () => {
  test('lists the catalog sorted by name', { tag: '@smoke' }, async ({ api }) => {
    const { items, count } = await api.products.list();
    expect(count).toBe(items.length);
    expect(count).toBeGreaterThanOrEqual(12);
    const names = items.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('filters by category', async ({ api }) => {
    const { items } = await api.products.list({ category: 'books' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.category === 'books')).toBe(true);
  });

  test('searches name and description, case-insensitively', async ({ api }) => {
    const byName = await api.products.list({ q: 'KEYBOARD' });
    expect(byName.items.map((p) => p.sku)).toEqual(['EL-003']);
    const byDescription = await api.products.list({ q: 'dishwasher' });
    expect(byDescription.items.map((p) => p.name)).toEqual(['Ceramic Mug']);
  });

  test('answers an empty list when nothing matches', async ({ api }) => {
    expect(await api.products.list({ q: 'zzz-no-such-thing' })).toEqual({ items: [], count: 0 });
  });

  for (const sort of ['price_asc', 'price_desc'] as const)
    test(`sorts by ${sort}`, async ({ api }) => {
      const prices = (await api.products.list({ category: 'electronics', sort })).items.map((p) => p.priceCents);
      const sorted = [...prices].sort((a, b) => (sort === 'price_asc' ? a - b : b - a));
      expect(prices).toEqual(sorted);
    });

  test('refuses an unknown category', async ({ api }) => {
    const { status, body } = await api.raw('GET', '/api/products?category=weapons');
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

test.describe('GET /api/products/:id', { tag: '@FEAT-CATALOG' }, () => {
  test('returns one product', async ({ api, seed }) => {
    const product = await seed.product({ priceCents: 1234, stock: 7 });
    expect(await api.products.get(product.id)).toEqual(product);
  });

  test('answers 404 for an unknown id', async ({ api }) => {
    await expectRefused(api.products.get('p_nope'), 404, 'NOT_FOUND');
  });
});
