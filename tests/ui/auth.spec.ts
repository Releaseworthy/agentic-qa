import { Account, expect, newRegistration, test } from '@fixtures';

test.describe('Sign up and sign in', { tag: '@FEAT-AUTH' }, () => {
  test('registering signs the new customer in', { tag: '@smoke' }, async ({ registerPage, header }) => {
    const input = newRegistration();
    await registerPage.goto();
    await registerPage.register(input);
    await expect(header.userName, 'header greets the new customer by name').toHaveText(input.name);
    await expect(header.signIn, '"Sign in" link is hidden once signed in').toBeHidden();
  });

  test(
    'a weak password is refused with the rule spelled out',
    { tag: ['@BR-AUTH-01', '@readonly'] },
    async ({ registerPage }) => {
      await registerPage.goto();
      await registerPage.register({ ...newRegistration(), password: 'short' });
      await expect(registerPage.alert, 'registration error states the password rule').toHaveText(
        'Password needs 8-64 characters, with a letter and a digit',
      );
    },
  );

  test('signing in returns to the page that asked for it', async ({ page, loginPage, header, customer }) => {
    await test.step('Open the cart signed out: the app asks to sign in', async () => {
      await page.goto('/#/cart');
      await loginPage.ready('/login');
    });

    await loginPage.signIn(customer.email, customer.password);
    await expect(page, 'back on the cart after signing in').toHaveURL(/#\/cart$/);
    await expect(header.userName, 'header greets the signed-in customer').toHaveText(customer.name);
  });

  test('a wrong password shows an error and stays signed out', async ({ loginPage, header, customer }) => {
    await loginPage.goto();
    await loginPage.signIn(customer.email, 'wrong-pass1');
    await expect(loginPage.alert, 'sign-in error').toHaveText('Email or password is incorrect');
    await expect(header.signIn, '"Sign in" link still visible: the customer stays signed out').toBeVisible();
  });

  test.describe('signed in', () => {
    test.use({ account: Account.NEW_CUSTOMER });

    test('signing out goes back to the sign-in page', async ({ page, catalogPage, header }) => {
      await catalogPage.goto();

      await test.step('Sign out from the header', () => header.signOut.click());

      await expect(page, 'on the sign-in page after signing out').toHaveURL(/#\/login$/);
      await expect(header.orders, '"Orders" link is hidden once signed out').toBeHidden();
    });
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test(
      'a saved session opens the shop signed in',
      { tag: ['@smoke', '@readonly'] },
      async ({ catalogPage, header, user }) => {
        await catalogPage.goto();
        await expect(header.userName, 'header greets the returning customer from the saved session').toHaveText(
          user.name,
        );
        await expect(header.signIn, '"Sign in" link is hidden: no login form was needed').toBeHidden();
      },
    );
  });
});
