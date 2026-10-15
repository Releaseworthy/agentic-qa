import { expect, newRegistration, test } from '@fixtures';

test.describe('Sign up and sign in', { tag: '@FEAT-AUTH' }, () => {
  test('registering signs the new customer in', { tag: '@smoke' }, async ({ registerPage, header }) => {
    const input = newRegistration();
    await registerPage.goto();
    await registerPage.register(input);
    await expect(header.userName).toHaveText(input.name);
    await expect(header.signIn).toBeHidden();
  });

  test('a weak password is refused with the rule spelled out', { tag: '@BR-AUTH-01' }, async ({ registerPage }) => {
    await registerPage.goto();
    await registerPage.register({ ...newRegistration(), password: 'short' });
    await expect(registerPage.alert).toHaveText('Password needs 8-64 characters, with a letter and a digit');
  });

  test('signing in returns to the page that asked for it', async ({ page, loginPage, header, customer }) => {
    await page.goto('/#/cart');
    await loginPage.ready('/login');
    await loginPage.signIn(customer.email, customer.password);
    await expect(page).toHaveURL(/#\/cart$/);
    await expect(header.userName).toHaveText(customer.name);
  });

  test('a wrong password shows an error and stays signed out', async ({ loginPage, header, customer }) => {
    await loginPage.goto();
    await loginPage.signIn(customer.email, 'wrong-pass1');
    await expect(loginPage.alert).toHaveText('Email or password is incorrect');
    await expect(header.signIn).toBeVisible();
  });

  test.describe('signed in', () => {
    test.use({ signedIn: true });

    test('signing out goes back to the sign-in page', async ({ page, catalogPage, header }) => {
      await catalogPage.goto();
      await header.signOut.click();
      await expect(page).toHaveURL(/#\/login$/);
      await expect(header.orders).toBeHidden();
    });
  });
});
