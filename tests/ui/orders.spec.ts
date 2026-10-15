import { Account, expect, test } from '@fixtures';

test.describe('Order history', { tag: '@FEAT-ORDERS' }, () => {
  test.describe('new customer', () => {
    test.use({ account: Account.NEW_CUSTOMER });

    test('a new customer has no orders', async ({ ordersPage }) => {
      await ordersPage.goto();
      await expect(ordersPage.emptyMessage, '"You have no orders yet." is shown').toBeVisible();
    });

    test('placed orders are listed with their status and total', async ({ seed, customer, ordersPage }) => {
      const order = await seed.order(customer, [{ product: await seed.product({ priceCents: 6000 }) }]);
      await ordersPage.goto();
      await expect(ordersPage.rows, 'one row for the one order').toHaveCount(1);
      await expect(ordersPage.rows.first(), 'row shows the order id').toContainText(order.id);
      await expect(ordersPage.rows.first(), 'row shows the status').toContainText('placed');
      await expect(ordersPage.rows.first(), 'row shows the total').toContainText('$60.00');
    });

    test(
      'a placed order can be cancelled from its page',
      { tag: '@BR-ORD-01' },
      async ({ seed, customer, orderPage }) => {
        const order = await seed.order(customer);
        await orderPage.goto(order.id);
        await orderPage.cancel();
        await expect(orderPage.status, 'status after cancelling').toHaveText('cancelled');
        await expect(orderPage.cancelButton, '"Cancel order" is gone once cancelled').toBeHidden();
      },
    );

    test('a shipped order offers no cancel button', { tag: '@BR-ORD-01' }, async ({ seed, customer, orderPage }) => {
      const order = await seed.shipped(await seed.order(customer));
      await orderPage.goto(order.id);
      await expect(orderPage.status, 'status after the admin shipped it').toHaveText('shipped');
      await expect(orderPage.cancelButton, '"Cancel order" is not offered for a shipped order').toBeHidden();
    });

    test("someone else's order is not shown", { tag: '@BR-ORD-03' }, async ({ seed, orderPage }) => {
      const theirs = await seed.order(await seed.customer());
      await orderPage.goto(theirs.id);
      await expect(orderPage.alert, "another customer's order reads as not found").toHaveText('Order not found');
    });
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test(
      'past orders are listed from the saved session',
      { tag: ['@smoke', '@readonly'] },
      async ({ api, user, ordersPage }) => {
        const history = await api.as(user).orders.list();
        expect(history.length, 'the returning customer has order history to show').toBeGreaterThan(0);
        await ordersPage.goto();
        await expect(ordersPage.rows, 'one row per order in the API history').toHaveCount(history.length);
        await expect(ordersPage.emptyMessage, '"You have no orders yet." is not shown').toBeHidden();
      },
    );
  });
});
