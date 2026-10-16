import { Account, expect, newRegistration, test } from '@fixtures';

test.describe('Sign up and sign in', { tag: '@FEAT-AUTH' }, () => {
  test('registering signs the new customer in', { tag: '@smoke' }, async ({ registerPage, header }) => {
    const input = newRegistration();

    await test.step('When a guest registers', async () => {
      await registerPage.goto();
      await registerPage.register(input);
    });

    await test.step('Then the header greets them, signed in', async () => {
      await expect(header.userName, 'header greets the new customer by name').toHaveText(input.name);
      await expect(header.signIn, '"Sign in" link is hidden once signed in').toBeHidden();
    });
  });

  test(
    'a weak password is refused with the rule spelled out',
    { tag: ['@BR-AUTH-01', '@readonly'] },
    async ({ registerPage }) => {
      await test.step('When a guest registers with the password "short"', async () => {
        await registerPage.goto();
        await registerPage.register({ ...newRegistration(), password: 'short' });
      });

      await test.step('Then the password rule is shown', async () => {
        await expect(registerPage.alert, 'registration error states the password rule').toHaveText(
          'Password needs 8-64 characters, with a letter and a digit',
        );
      });
    },
  );

  test('signing in returns to the page that asked for it', async ({ page, loginPage, header, customer }) => {
    await test.step('Given a signed-out visitor opens the cart: the app asks to sign in', async () => {
      await page.goto('/#/cart');
      await loginPage.ready('/login');
    });

    await test.step('When they sign in', () => loginPage.signIn(customer.email, customer.password));

    await test.step('Then they are back on the cart, signed in', async () => {
      await expect(page, 'back on the cart after signing in').toHaveURL(/#\/cart$/);
      await expect(header.userName, 'header greets the signed-in customer').toHaveText(customer.name);
    });
  });

  test('a wrong password shows an error and stays signed out', async ({ loginPage, header, customer }) => {
    await test.step('When a customer signs in with a wrong password', async () => {
      await loginPage.goto();
      await loginPage.signIn(customer.email, 'wrong-pass1');
    });

    await test.step('Then the error is shown and they stay signed out', async () => {
      await expect(loginPage.alert, 'sign-in error for a wrong password').toHaveText('Email or password is incorrect');
      await expect(header.signIn, '"Sign in" link still visible: the customer stays signed out').toBeVisible();
    });
  });

  test.describe('signed in', () => {
    test.use({ account: Account.NEW_CUSTOMER });

    test('signing out goes back to the sign-in page', async ({ page, catalogPage, header }) => {
      await test.step('Given a signed-in customer on the catalog', () => catalogPage.goto());

      await test.step('When they sign out from the header', () => header.signOut.click());

      await test.step('Then the sign-in page opens and the signed-in links are gone', async () => {
        await expect(page, 'on the sign-in page after signing out').toHaveURL(/#\/login$/);
        await expect(header.orders, '"Orders" link is hidden once signed out').toBeHidden();
      });
    });
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test(
      'a saved session opens the shop signed in',
      { tag: ['@smoke', '@readonly'] },
      async ({ catalogPage, header, user }) => {
        await test.step('When the returning customer opens the shop from the saved session', () => catalogPage.goto());

        await test.step('Then they are signed in without the login form', async () => {
          await expect(header.userName, 'header greets the returning customer from the saved session').toHaveText(
            user.name,
          );
          await expect(header.signIn, '"Sign in" link is hidden: no login form was needed').toBeHidden();
        });
      },
    );
  });
});
