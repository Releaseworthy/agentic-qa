import { expect, test } from '@fixtures';

test.describe('Order history', { tag: '@FEAT-ORDERS' }, () => {
  test.use({ signedIn: true });

  test('a new customer has no orders', async ({ ordersPage }) => {
    await ordersPage.goto();
    await expect(ordersPage.emptyMessage).toBeVisible();
  });

  test('placed orders are listed with their status and total', async ({ seed, customer, ordersPage }) => {
    const order = await seed.order(customer, [{ product: await seed.product({ priceCents: 6000 }) }]);
    await ordersPage.goto();
    await expect(ordersPage.rows).toHaveCount(1);
    await expect(ordersPage.rows.first()).toContainText(order.id);
    await expect(ordersPage.rows.first()).toContainText('placed');
    await expect(ordersPage.rows.first()).toContainText('$60.00');
  });

  test(
    'a placed order can be cancelled from its page',
    { tag: '@BR-ORD-01' },
    async ({ seed, customer, orderPage }) => {
      const order = await seed.order(customer);
      await orderPage.goto(order.id);
      await orderPage.cancel();
      await expect(orderPage.status).toHaveText('cancelled');
      await expect(orderPage.cancelButton).toBeHidden();
    },
  );

  test('a shipped order offers no cancel button', { tag: '@BR-ORD-01' }, async ({ seed, customer, orderPage }) => {
    const order = await seed.shipped(await seed.order(customer));
    await orderPage.goto(order.id);
    await expect(orderPage.status).toHaveText('shipped');
    await expect(orderPage.cancelButton).toBeHidden();
  });

  test("someone else's order is not shown", { tag: '@BR-ORD-03' }, async ({ seed, orderPage }) => {
    const theirs = await seed.order(await seed.customer());
    await orderPage.goto(theirs.id);
    await expect(orderPage.alert).toHaveText('Order not found');
  });
});
