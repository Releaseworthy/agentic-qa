import { Account, expect, test } from '@fixtures';

test.describe('Order history', { tag: '@FEAT-ORDERS' }, () => {
  test.describe('new customer', () => {
    test.use({ account: Account.NEW_CUSTOMER });

    test('a new customer has no orders', async ({ ordersPage }) => {
      await test.step('When a new customer opens their order history', () => ordersPage.goto());

      await test.step('Then it says there are no orders', async () => {
        await expect(ordersPage.emptyMessage, '"You have no orders yet." is shown').toBeVisible();
      });
    });

    test('placed orders are listed with their status and total', async ({ seed, customer, ordersPage }) => {
      const order = await test.step('Given one placed $60.00 order', async () =>
        seed.order(customer, [{ product: await seed.product({ priceCents: 6000 }) }]));

      await test.step('When the customer opens their order history', () => ordersPage.goto());

      await test.step('Then the order is listed with its id, status and total', async () => {
        await expect(ordersPage.rows, 'one row for the one order').toHaveCount(1);
        await expect(ordersPage.rows.first(), 'row shows the order id').toContainText(order.id);
        await expect(ordersPage.rows.first(), 'row shows the status "placed"').toContainText('placed');
        await expect(ordersPage.rows.first(), 'row shows the total $60.00').toContainText('$60.00');
      });
    });

    test(
      'a placed order can be cancelled from its page',
      { tag: '@BR-ORD-01' },
      async ({ seed, customer, orderPage }) => {
        const order = await test.step('Given a placed order', () => seed.order(customer));

        await test.step('When the customer cancels it from its page', async () => {
          await orderPage.goto(order.id);
          await orderPage.cancel();
        });

        await test.step('Then it reads cancelled and can no longer be cancelled', async () => {
          await expect(orderPage.status, 'status after cancelling').toHaveText('cancelled');
          await expect(orderPage.cancelButton, '"Cancel order" is gone once cancelled').toBeHidden();
        });
      },
    );

    test('a shipped order offers no cancel button', { tag: '@BR-ORD-01' }, async ({ seed, customer, orderPage }) => {
      const order = await test.step('Given an order the admin shipped', async () =>
        seed.shipped(await seed.order(customer)));

      await test.step('When the customer opens it', () => orderPage.goto(order.id));

      await test.step('Then it reads shipped with no way to cancel', async () => {
        await expect(orderPage.status, 'status after the admin shipped it').toHaveText('shipped');
        await expect(orderPage.cancelButton, '"Cancel order" is not offered for a shipped order').toBeHidden();
      });
    });

    test("someone else's order is not shown", { tag: '@BR-ORD-03' }, async ({ seed, orderPage }) => {
      const theirs = await test.step("Given another customer's order", async () => seed.order(await seed.customer()));

      await test.step('When this customer opens its address', () => orderPage.goto(theirs.id));

      await test.step('Then it reads as not found', async () => {
        await expect(orderPage.alert, "another customer's order reads as not found").toHaveText('Order not found');
      });
    });
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test(
      'past orders are listed from the saved session',
      { tag: ['@smoke', '@readonly'] },
      async ({ api, user, ordersPage }) => {
        const history = await test.step('Given the order history the API holds for the saved account', async () => {
          const orders = await api.as(user).orders.list();
          expect(orders.length, 'the returning customer has order history to show').toBeGreaterThan(0);
          return orders;
        });

        await test.step('When the returning customer opens their order history', () => ordersPage.goto());

        await test.step('Then every order is listed', async () => {
          await expect(ordersPage.rows, 'one row per order in the API history').toHaveCount(history.length);
          await expect(ordersPage.emptyMessage, '"You have no orders yet." is not shown').toBeHidden();
        });
      },
    );
  });
});
