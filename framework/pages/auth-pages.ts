import type { Locator, Page } from '@playwright/test';
import type { Registration } from '@api/auth-api';
import { BasePage } from '@pages/base-page';

export class LoginPage extends BasePage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    super(page);
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
  }

  goto(next?: string): Promise<void> {
    return this.open(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}

export class RegisterPage extends BasePage {
  readonly name: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    super(page);
    this.name = page.getByLabel('Name');
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Create account' });
  }

  goto(): Promise<void> {
    return this.open('/register');
  }

  async register(input: Registration): Promise<void> {
    await this.name.fill(input.name);
    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.submit.click();
  }
}
