import { expect, test } from '@fixtures';

test.describe('Catalog', { tag: '@FEAT-CATALOG' }, () => {
  test('search narrows the list to matching products', { tag: ['@smoke', '@readonly'] }, async ({ catalogPage }) => {
    await catalogPage.goto();
    await catalogPage.filter({ q: 'mug' });
    await expect(catalogPage.productTitles, 'only the matching product is listed').toHaveText(['Ceramic Mug']);
    await expect(catalogPage.resultCount, 'result count matches the list').toHaveText('1 product');
  });

  test('a search with no match says so', { tag: '@readonly' }, async ({ catalogPage }) => {
    await catalogPage.goto();
    await catalogPage.filter({ q: 'zzz-nothing' });
    await expect(catalogPage.noResults, '"No products match your search." is shown').toBeVisible();
  });

  test('category and price sort combine', { tag: '@readonly' }, async ({ catalogPage, api }) => {
    const expected = (await api.products.list({ category: 'toys', sort: 'price_asc' })).items.map((p) => p.name);
    await catalogPage.goto();
    await catalogPage.filter({ category: 'toys', sort: 'Price: low to high' });
    await expect(catalogPage.productTitles, 'toys only, cheapest first — the same order as the API').toHaveText(
      expected,
    );
  });

  test('a product page shows its price and stock', async ({ seed, productPage }) => {
    const product = await seed.product({ priceCents: 1999, stock: 4 });
    await productPage.goto(product.id);
    await expect(productPage.title, 'product name as the heading').toHaveText(product.name);
    await expect(productPage.price, 'price in dollars').toHaveText('$19.99');
    await expect(productPage.stock, 'units in stock').toHaveText('4 in stock');
  });

  test('an out-of-stock product cannot be added', { tag: '@BR-CART-02' }, async ({ seed, productPage }) => {
    const product = await seed.product({ stock: 0 });
    await productPage.goto(product.id);
    await expect(productPage.stock, 'stock line says the product is out of stock').toHaveText('Out of stock');
    await expect(productPage.addToCartButton, '"Add to cart" is disabled with no stock').toBeDisabled();
  });
});
