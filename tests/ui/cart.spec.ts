import { Account, expect, money, test } from '@fixtures';

test.describe('Cart', { tag: '@FEAT-CART' }, () => {
  test.use({ account: Account.NEW_CUSTOMER });

  test(
    'adding from the product page updates the cart count and the cart',
    { tag: '@smoke' },
    async ({ seed, productPage, header, cartPage }) => {
      const product = await test.step('Given a $15.00 product', () => seed.product({ priceCents: 1500 }));

      await test.step('When the customer adds 2 from its page', async () => {
        await productPage.goto(product.id);
        await productPage.addToCart(2);
      });

      await test.step('Then a toast confirms it and the header counts 2', async () => {
        await expect(productPage.toast, 'confirmation toast after adding').toHaveText(
          `Added 2 × ${product.name} to the cart`,
        );
        await expect(header.cartCount, 'cart badge in the header counts both units').toHaveText('2');
      });

      await test.step('And the cart shows the line at $30.00', async () => {
        await cartPage.goto();
        await expect(cartPage.row(product.name), 'cart line prices 2 × $15.00').toContainText('$30.00');
        await expect(cartPage.totals.subtotal, 'cart subtotal: $30.00').toHaveText('$30.00');
      });
    },
  );

  test('changing a quantity reprices the cart', async ({ seed, customer, cartPage }) => {
    const product = await test.step('Given a $12.00 product in the cart', async () => {
      const p = await seed.product({ priceCents: 1200 });
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    await test.step('When the quantity is set to 3 on the cart page', async () => {
      await cartPage.goto();
      await cartPage.setQuantity(product.name, 3);
    });

    await test.step('Then the subtotal is 3 × $12.00', async () => {
      await expect(cartPage.totals.subtotal, 'subtotal after setting the quantity to 3 × $12.00').toHaveText(
        money(3600),
      );
    });
  });

  test('more than 10 units shows the limit', { tag: '@BR-CART-01' }, async ({ seed, customer, cartPage }) => {
    const product = await test.step('Given a product in the cart', async () => {
      const p = await seed.product();
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    await test.step('When the quantity is set to 11', async () => {
      await cartPage.goto();
      await cartPage.setQuantity(product.name, 11);
    });

    await test.step('Then the limit is spelled out', async () => {
      await expect(cartPage.alert, 'quantity-limit error').toHaveText('Quantity must be between 1 and 10');
    });
  });

  test('removing the last line empties the cart', async ({ seed, customer, cartPage }) => {
    const product = await test.step('Given one product in the cart', async () => {
      const p = await seed.product();
      await seed.cart(customer, [{ product: p }]);
      return p;
    });

    await test.step('When it is removed', async () => {
      await cartPage.goto();
      await cartPage.remove(product.name);
    });

    await test.step('Then the cart says it is empty', async () => {
      await expect(cartPage.emptyMessage, '"Your cart is empty." is shown once the last line is gone').toBeVisible();
    });
  });

  test('a coupon shows its discount in the totals', { tag: '@FEAT-COUPON' }, async ({ seed, customer, cartPage }) => {
    await test.step('Given a $40.00 cart', async () => {
      await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
    });

    await test.step('When WELCOME10 is applied', async () => {
      await cartPage.goto();
      await cartPage.applyCoupon('WELCOME10');
    });

    await test.step('Then the coupon, the discount and the new total show', async () => {
      await expect(cartPage.appliedCoupon, 'applied-coupon label').toHaveText('Coupon WELCOME10 applied');
      await expect(cartPage.totals.discount, 'discount: 10% of $40.00').toHaveText('-$4.00');
      await expect(cartPage.totals.total, 'total: $40.00 − $4.00 + $4.99 shipping').toHaveText(money(4000 - 400 + 499));
    });
  });

  test(
    'an expired coupon is refused',
    { tag: ['@FEAT-COUPON', '@BR-COUP-03'] },
    async ({ seed, customer, cartPage }) => {
      await test.step('Given a $40.00 cart', async () => {
        await seed.cart(customer, [{ product: await seed.product({ priceCents: 4000 }) }]);
      });

      await test.step('When the expired SUMMER20 is applied', async () => {
        await cartPage.goto();
        await cartPage.applyCoupon('SUMMER20');
      });

      await test.step('Then it is refused and nothing is discounted', async () => {
        await expect(cartPage.alert, 'expired-coupon error').toHaveText('This coupon has expired');
        await expect(cartPage.totals.discount, 'no discount after the refusal').toHaveText('-$0.00');
      });
    },
  );
});
