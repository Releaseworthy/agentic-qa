import type { Locator, Page } from '@playwright/test';

/** The top bar on every page. */
export class Header {
  readonly nav: Locator;
  readonly cartCount: Locator;
  readonly userName: Locator;
  readonly signIn: Locator;
  readonly signOut: Locator;
  readonly orders: Locator;

  constructor(page: Page) {
    this.nav = page.getByRole('navigation', { name: 'Main' });
    this.cartCount = page.locator('#cart-count');
    this.userName = page.locator('#user-name');
    this.signIn = this.nav.getByRole('link', { name: 'Sign in' });
    this.signOut = this.nav.getByRole('button', { name: 'Sign out' });
    this.orders = this.nav.getByRole('link', { name: 'Orders' });
  }
}
