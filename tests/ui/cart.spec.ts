import { expect, money, test } from '@fixtures';

test.describe('Cart', { tag: '@FEAT-CART' }, () => {
  test.use({ signedIn: true });

  test(
    'adding from the product page updates the cart count and the cart',
    { tag: '@smoke' },
    async ({ seed, productPage, header, cartPage }) => {
      const product = await seed.product({ priceCents: 1500 });
      await productPage.goto(product.id);
      await productPage.addToCart(2);
      await expect(productPage.toast).toHaveText(`Added 2 × ${product.name} to the cart`);
      await expect(header.cartCount).toHaveText('2');

      await cartPage.goto();
      await expect(cartPage.row(product.name)).toContainText('$30.00');
      await expect(cartPage.totals.subtotal).toHaveText('$30.00');
    },
  );

  test('changing a quantity reprices the cart', async ({ seed, customer, cartPage }) => {
    const product = await seed.product({ priceCents: 1200 });
    await seed.cart(customer, [{ product }]);
    await cartPage.goto();
    await cartPage.setQuantity(product.name, 3);
    await expect(cartPage.totals.subtotal).toHaveText(money(3600));
  });

  test('more than 10 units shows the limit', { tag: '@BR-CART-01' }, async ({ seed, customer, cartPage }) => {
    const product = await seed.product();
    await seed.cart(customer, [{ product }]);
    await cartPage.goto();
    await cartPage.setQuantity(product.name, 11);
    await expect(cartPage.alert).toHaveText('Quantity must be between 1 and 10');
  });

  test('removing the last line empties the cart', async ({ seed, customer, cartPage }) => {
    const product = await seed.product();
    await seed.cart(customer, [{ product }]);
    await cartPage.goto();
    await cartPage.remove(product.name);
    await expect(cartPage.emptyMessage).toBeVisible();
  });

  test('a coupon shows its discount in the totals', { tag: '@FEAT-COUPON' }, async ({ seed, customer, cartPage }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
    await cartPage.goto();
    await cartPage.applyCoupon('WELCOME10');
    await expect(cartPage.appliedCoupon).toHaveText('Coupon WELCOME10 applied');
    await expect(cartPage.totals.discount).toHaveText('-$4.00');
    await expect(cartPage.totals.total).toHaveText(money(4000 - 400 + 499));
  });

  test(
    'an expired coupon is refused',
    { tag: ['@FEAT-COUPON', '@BR-COUP-03'] },
    async ({ seed, customer, cartPage }) => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
      await cartPage.goto();
      await cartPage.applyCoupon('SUMMER20');
      await expect(cartPage.alert).toHaveText('This coupon has expired');
      await expect(cartPage.totals.discount).toHaveText('-$0.00');
    },
  );
});
