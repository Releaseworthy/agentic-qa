import type { Locator, Page } from '@playwright/test';
import type { Address } from '@api/schemas';
import type { Card } from '@data/cards';
import { BasePage } from '@pages/base-page';
import { Totals } from '@pages/cart-page';
import { step } from '@utils/step';

export class CheckoutPage extends BasePage {
  readonly placeOrderButton: Locator;
  readonly totals: Totals;

  constructor(page: Page) {
    super(page);
    this.placeOrderButton = page.getByRole('button', { name: 'Place order' });
    this.totals = new Totals(page);
  }

  @step('Open checkout')
  goto(): Promise<void> {
    return this.open('/checkout');
  }

  @step(
    (address: Address, card: Card) =>
      `Fill checkout: ship to ${address.city}, pay with card ending ${card.cardNumber.slice(-4)}`,
  )
  async fill(address: Address, card: Card): Promise<void> {
    await this.page.getByLabel('Full name', { exact: true }).fill(address.name);
    await this.page.getByLabel('Address', { exact: true }).fill(address.line1);
    await this.page.getByLabel('City', { exact: true }).fill(address.city);
    await this.page.getByLabel('Postal code', { exact: true }).fill(address.postalCode);
    await this.page.getByLabel('Country', { exact: true }).fill(address.country);
    await this.page.getByLabel('Card number', { exact: true }).fill(card.cardNumber);
    await this.page.getByLabel('Expiry (MM/YY)', { exact: true }).fill(card.expiry);
    await this.page.getByLabel('CVC', { exact: true }).fill(card.cvc);
  }

  @step('Place the order')
  async placeOrder(): Promise<void> {
    const answered = this.page.waitForResponse(
      (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
    );
    await this.placeOrderButton.click();
    await answered;
  }
}
