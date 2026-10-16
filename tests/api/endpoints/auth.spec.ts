import { Account, expect, expectRefused, newRegistration, test } from '@fixtures';

test.describe('POST /api/auth/register', { tag: '@FEAT-AUTH' }, () => {
  test('registers a customer and returns a working token', { tag: ['@smoke', '@BR-AUTH-01'] }, async ({ api }) => {
    const input = newRegistration();

    const { user, token } = await test.step('When a new customer registers', () => api.auth.register(input));

    await test.step('Then the account is a customer with the given name and email', () => {
      expect(user, 'registered user echoes the input as a customer').toMatchObject({
        email: input.email,
        name: input.name,
        role: 'customer',
      });
    });

    await test.step('And the returned token signs them in', async () => {
      expect(await api.as({ token }).auth.me(), 'GET /me with the new token returns the same user').toEqual(user);
    });
  });

  test('refuses an email that is already registered', async ({ api, customer }) => {
    await test.step('Registering the same email again is refused: 409 EMAIL_TAKEN', () =>
      expectRefused(api.auth.register({ ...newRegistration(), email: customer.email }), 409, 'EMAIL_TAKEN'));
  });

  test('treats emails case-insensitively', async ({ api, customer }) => {
    await test.step('Registering the same email in upper case is refused: 409 EMAIL_TAKEN', () =>
      expectRefused(
        api.auth.register({ ...newRegistration(), email: customer.email.toUpperCase() }),
        409,
        'EMAIL_TAKEN',
      ));
  });

  for (const [why, password] of [
    ['shorter than 8 characters', 'abc1234'],
    ['without a digit', 'onlyletters'],
    ['without a letter', '12345678'],
    ['longer than 64 characters', `a1${'x'.repeat(63)}`],
  ] as const)
    test(`refuses a password ${why}`, { tag: ['@BR-AUTH-01', '@readonly'] }, async ({ api }) => {
      await test.step(`Registering with a password ${why} is refused: 400 WEAK_PASSWORD`, () =>
        expectRefused(api.auth.register({ ...newRegistration(), password }), 400, 'WEAK_PASSWORD'));
    });

  test('accepts a password of exactly 8 characters', { tag: '@BR-AUTH-01' }, async ({ api }) => {
    const { user } = await test.step('When a customer registers with the 8-character password "abcdef12"', () =>
      api.auth.register({ ...newRegistration(), password: 'abcdef12' }));

    await test.step('Then the account is created', () => {
      expect(user.role, 'an 8-character password is the lower boundary: registered as a customer').toBe('customer');
    });
  });

  test('refuses a malformed email', { tag: '@readonly' }, async ({ api }) => {
    await test.step('Registering "not-an-email" is refused: 400 INVALID_EMAIL', () =>
      expectRefused(api.auth.register({ ...newRegistration(), email: 'not-an-email' }), 400, 'INVALID_EMAIL'));
  });

  test('refuses a body without required fields', { tag: '@readonly' }, async ({ api }) => {
    const { status, body } = await test.step('When a body with only an email is sent', () =>
      api.raw('POST', '/api/auth/register', { email: 'x@example.test' }));

    await test.step('Then it is refused as a validation error', () => {
      expect(status, 'HTTP status for a body missing name and password').toBe(400);
      expect(body, 'error code for missing fields').toMatchObject({ error: { code: 'VALIDATION' } });
    });
  });
});

test.describe('POST /api/auth/login', { tag: '@FEAT-AUTH' }, () => {
  test('signs in with the right password', { tag: '@smoke' }, async ({ api, customer }) => {
    const { user } = await test.step('When the customer signs in with the right password', () =>
      api.auth.login({ email: customer.email, password: customer.password }));

    await test.step('Then they are signed in as themselves', () => {
      expect(user.id, 'signed in as the registered customer').toBe(customer.id);
    });
  });

  test('gives the same answer for a wrong password and an unknown email', async ({ api, customer }) => {
    const wrong = await test.step('A wrong password is refused: 401 INVALID_CREDENTIALS', () =>
      expectRefused(api.auth.login({ email: customer.email, password: 'wrong-pass1' }), 401, 'INVALID_CREDENTIALS'));

    const unknown = await test.step('An unknown email is refused: 401 INVALID_CREDENTIALS', () =>
      expectRefused(
        api.auth.login({ email: 'nobody@example.test', password: 'wrong-pass1' }),
        401,
        'INVALID_CREDENTIALS',
      ));

    await test.step('Then both refusals read the same', () => {
      expect(unknown.reason, 'same message for both: no account enumeration').toBe(wrong.reason);
    });
  });

  test('locks the account after 5 failed attempts', { tag: '@BR-AUTH-02' }, async ({ api, customer }) => {
    await test.step('Given 5 failed sign-ins in a row', async () => {
      for (let i = 0; i < 5; i++)
        await expectRefused(
          api.auth.login({ email: customer.email, password: 'wrong-pass1' }),
          401,
          'INVALID_CREDENTIALS',
        );
    });

    await test.step('Then even the right password is refused: 423 ACCOUNT_LOCKED', () =>
      expectRefused(api.auth.login({ email: customer.email, password: customer.password }), 423, 'ACCOUNT_LOCKED'));
  });

  test('resets the failure count after a successful login', { tag: '@BR-AUTH-02' }, async ({ api, customer }) => {
    await test.step('Given 4 failed sign-ins, then a successful one', async () => {
      for (let i = 0; i < 4; i++)
        await expectRefused(
          api.auth.login({ email: customer.email, password: 'wrong-pass1' }),
          401,
          'INVALID_CREDENTIALS',
        );
      await api.auth.login({ email: customer.email, password: customer.password });
    });

    await test.step('Then one more failure does not lock: the count started over', async () => {
      await expectRefused(
        api.auth.login({ email: customer.email, password: 'wrong-pass1' }),
        401,
        'INVALID_CREDENTIALS',
      );
      await api.auth.login({ email: customer.email, password: customer.password });
    });
  });
});

test.describe('GET /api/auth/me, POST /api/auth/logout', { tag: '@FEAT-AUTH' }, () => {
  test('refuses a request without a token', { tag: '@readonly' }, async ({ api }) => {
    await test.step('GET /me without a token is refused: 401 UNAUTHORIZED', () =>
      expectRefused(api.auth.me(), 401, 'UNAUTHORIZED'));
  });

  test('refuses a token that was never issued', { tag: '@readonly' }, async ({ api }) => {
    await test.step('GET /me with a made-up token is refused: 401 UNAUTHORIZED', () =>
      expectRefused(api.as({ token: 'f'.repeat(64) }).auth.me(), 401, 'UNAUTHORIZED'));
  });

  test('logout invalidates the token', async ({ api, customer }) => {
    const me = api.as(customer);

    await test.step('When the customer signs out', () => me.auth.logout());

    await test.step('Then their token is refused: 401 UNAUTHORIZED', () =>
      expectRefused(me.auth.me(), 401, 'UNAUTHORIZED'));
  });

  test.describe('returning customer', () => {
    test.use({ account: Account.RETURNING_CUSTOMER });

    test('a saved session is accepted', { tag: ['@smoke', '@readonly'] }, async ({ api, user }) => {
      const me = await test.step('When GET /me is called with the saved session', () => api.as(user).auth.me());

      await test.step('Then it answers with the saved account', () => {
        expect(me, 'GET /me answers with the saved account').toMatchObject({
          email: user.email,
          name: user.name,
          role: 'customer',
        });
      });
    });
  });
});
