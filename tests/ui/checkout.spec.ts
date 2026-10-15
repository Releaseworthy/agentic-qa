import { Cards, expect, newAddress, test } from '@fixtures';

test.describe('Checkout', { tag: '@FEAT-CHECKOUT' }, () => {
  test.use({ signedIn: true });

  test(
    'placing an order shows the confirmation and empties the cart',
    { tag: '@smoke' },
    async ({ seed, customer, checkoutPage, orderPage, header }) => {
      const product = await seed.product({ priceCents: 2600 });
      await seed.cart(customer, [{ product, quantity: 2 }]);
      await checkoutPage.goto();
      await expect(checkoutPage.totals.shipping).toHaveText('Free');
      await checkoutPage.fill(newAddress(), Cards.VALID);
      await checkoutPage.placeOrder();

      await expect(orderPage.placedBanner).toBeVisible();
      await expect(orderPage.status).toHaveText('placed');
      await expect(orderPage.lines).toHaveCount(1);
      await expect(orderPage.totals.total).toHaveText('$52.00');
      await expect(header.cartCount).toHaveText('0');
    },
  );

  test(
    'a declined card keeps the customer on checkout with the reason',
    { tag: '@BR-PAY-01' },
    async ({ page, seed, customer, checkoutPage }) => {
      await seed.cart(customer, [{ product: await seed.product() }]);
      await checkoutPage.goto();
      await checkoutPage.fill(newAddress(), Cards.DECLINED);
      await checkoutPage.placeOrder();
      await expect(checkoutPage.alert).toHaveText('The card was declined');
      await expect(page).toHaveURL(/#\/checkout$/);
      await expect(checkoutPage.placeOrderButton).toBeEnabled();
    },
  );

  test('a cart under $50 is charged shipping', { tag: '@BR-SHIP-01' }, async ({ seed, customer, checkoutPage }) => {
    await seed.cart(customer, [{ product: await seed.product({ priceCents: 4999 }) }]);
    await checkoutPage.goto();
    await expect(checkoutPage.totals.shipping).toHaveText('$4.99');
    await expect(checkoutPage.totals.total).toHaveText('$54.98');
  });
});
