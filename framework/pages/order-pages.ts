import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/base-page';
import { Totals } from '@pages/cart-page';
import { step } from '@utils/step';

export class OrderPage extends BasePage {
  readonly heading: Locator;
  readonly status: Locator;
  readonly placedBanner: Locator;
  readonly cancelButton: Locator;
  readonly lines: Locator;
  readonly totals: Totals;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1 });
    this.status = page.locator('#order-status');
    this.placedBanner = page.getByRole('status').filter({ hasText: 'Your order has been placed' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel order' });
    this.lines = page.getByRole('table', { name: 'Order lines' }).locator('tbody tr');
    this.totals = new Totals(page);
  }

  @step((orderId: string) => `Open order ${orderId}`)
  goto(orderId: string): Promise<void> {
    return this.open(`/orders/${orderId}`);
  }

  /** Cancels through the confirm dialog and waits for the API's answer. */
  @step('Cancel the order (confirm the dialog)')
  async cancel(): Promise<void> {
    this.page.once('dialog', (d) => void d.accept());
    const answered = this.page.waitForResponse((r) => r.url().endsWith('/cancel'));
    await this.cancelButton.click();
    await answered;
  }
}

export class OrdersPage extends BasePage {
  readonly rows: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.getByRole('table', { name: 'Orders' }).locator('tbody tr');
    this.emptyMessage = page.getByText('You have no orders yet.');
  }

  @step('Open order history')
  goto(): Promise<void> {
    return this.open('/orders');
  }
}
