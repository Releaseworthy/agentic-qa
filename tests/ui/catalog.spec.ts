import { expect, test } from '@fixtures';

test.describe('Catalog', { tag: '@FEAT-CATALOG' }, () => {
  test('search narrows the list to matching products', { tag: ['@smoke', '@readonly'] }, async ({ catalogPage }) => {
    await test.step('When a guest searches the catalog for "mug"', async () => {
      await catalogPage.goto();
      await catalogPage.filter({ q: 'mug' });
    });

    await test.step('Then only the mug is listed, and the count says so', async () => {
      await expect(catalogPage.productTitles, 'only the matching product is listed').toHaveText(['Ceramic Mug']);
      await expect(catalogPage.resultCount, 'result count reads "1 product"').toHaveText('1 product');
    });
  });

  test('a search with no match says so', { tag: '@readonly' }, async ({ catalogPage }) => {
    await test.step('When a guest searches for "zzz-nothing"', async () => {
      await catalogPage.goto();
      await catalogPage.filter({ q: 'zzz-nothing' });
    });

    await test.step('Then the empty-result message is shown', async () => {
      await expect(catalogPage.noResults, '"No products match your search." is shown').toBeVisible();
    });
  });

  test('category and price sort combine', { tag: '@readonly' }, async ({ catalogPage, api }) => {
    const expected = await test.step('Given the toys, cheapest first, as the API lists them', async () =>
      (await api.products.list({ category: 'toys', sort: 'price_asc' })).items.map((p) => p.name));

    await test.step('When the catalog is filtered to Toys, Price: low to high', async () => {
      await catalogPage.goto();
      await catalogPage.filter({ category: 'toys', sort: 'Price: low to high' });
    });

    await test.step('Then the page lists the same toys in the same order', async () => {
      await expect(catalogPage.productTitles, 'toys only, cheapest first — the same order as the API').toHaveText(
        expected,
      );
    });
  });

  test('a product page shows its price and stock', async ({ seed, productPage }) => {
    const product = await test.step('Given a $19.99 product with 4 in stock', () =>
      seed.product({ priceCents: 1999, stock: 4 }));

    await test.step('When its page is opened', () => productPage.goto(product.id));

    await test.step('Then the page shows its name, price and stock', async () => {
      await expect(productPage.title, 'product name as the heading').toHaveText(product.name);
      await expect(productPage.price, 'price in dollars: $19.99').toHaveText('$19.99');
      await expect(productPage.stock, 'units in stock: 4').toHaveText('4 in stock');
    });
  });

  test('an out-of-stock product cannot be added', { tag: '@BR-CART-02' }, async ({ seed, productPage }) => {
    const product = await test.step('Given a product with 0 in stock', () => seed.product({ stock: 0 }));

    await test.step('When its page is opened', () => productPage.goto(product.id));

    await test.step('Then it reads out of stock and cannot be added', async () => {
      await expect(productPage.stock, 'stock line says the product is out of stock').toHaveText('Out of stock');
      await expect(productPage.addToCartButton, '"Add to cart" is disabled with no stock').toBeDisabled();
    });
  });
});
