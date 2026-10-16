import { Account, Cards, expect, newAddress, test } from '@fixtures';

test.describe('Checkout', { tag: '@FEAT-CHECKOUT' }, () => {
  test.use({ account: Account.NEW_CUSTOMER });

  test(
    'placing an order shows the confirmation and empties the cart',
    { tag: '@smoke' },
    async ({ seed, customer, checkoutPage, orderPage, header }) => {
      await test.step('Given 2 × $26.00 in the cart', async () => {
        await seed.cart(customer, [{ product: await seed.product({ priceCents: 2600 }), quantity: 2 }]);
      });

      await test.step('And checkout shows free shipping at $52.00', async () => {
        await checkoutPage.goto();
        await expect(checkoutPage.totals.shipping, 'shipping is free at $52.00 (≥ $50)').toHaveText('Free');
      });

      await test.step('When the customer pays with a valid card', async () => {
        await checkoutPage.fill(newAddress(), Cards.VALID);
        await checkoutPage.placeOrder();
      });

      await test.step('Then the order page confirms the placed order', async () => {
        await expect(orderPage.placedBanner, '"Your order has been placed" banner is shown').toBeVisible();
        await expect(orderPage.status, 'new order status').toHaveText('placed');
        await expect(orderPage.lines, 'one order line: the product × 2').toHaveCount(1);
        await expect(orderPage.totals.total, 'order total: 2 × $26.00').toHaveText('$52.00');
      });

      await test.step('And the cart is empty', async () => {
        await expect(header.cartCount, 'cart badge back to 0 after checkout').toHaveText('0');
      });
    },
  );

  test(
    'a declined card keeps the customer on checkout with the reason',
    { tag: '@BR-PAY-01' },
    async ({ page, seed, customer, checkoutPage }) => {
      await test.step('Given a product in the cart', async () => {
        await seed.cart(customer, [{ product: await seed.product() }]);
      });

      await test.step('When the customer pays with the declined test card', async () => {
        await checkoutPage.goto();
        await checkoutPage.fill(newAddress(), Cards.DECLINED);
        await checkoutPage.placeOrder();
      });

      await test.step('Then the reason is shown and they can retry on checkout', async () => {
        await expect(checkoutPage.alert, 'payment error').toHaveText('The card was declined');
        await expect(page, 'still on checkout').toHaveURL(/#\/checkout$/);
        await expect(checkoutPage.placeOrderButton, '"Place order" is enabled again for a retry').toBeEnabled();
      });
    },
  );

  test('a cart under $50 is charged shipping', { tag: '@BR-SHIP-01' }, async ({ seed, customer, checkoutPage }) => {
    await test.step('Given a $49.99 cart, 1 cent under free shipping', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4999 }) }]);
    });

    await test.step('When checkout opens', () => checkoutPage.goto());

    await test.step('Then $4.99 shipping is added to the total', async () => {
      await expect(checkoutPage.totals.shipping, 'flat shipping below $50.00').toHaveText('$4.99');
      await expect(checkoutPage.totals.total, 'total: $49.99 + $4.99').toHaveText('$54.98');
    });
  });
});
