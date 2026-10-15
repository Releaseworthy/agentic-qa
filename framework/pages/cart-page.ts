import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/base-page';
import { step } from '@utils/step';

/** The totals block, shared by the cart, checkout and order pages. */
export class Totals {
  readonly subtotal: Locator;
  readonly discount: Locator;
  readonly shipping: Locator;
  readonly total: Locator;

  constructor(page: Page) {
    const box = page.getByLabel('Order totals');
    this.subtotal = box.locator('[data-total="subtotal"]');
    this.discount = box.locator('[data-total="discount"]');
    this.shipping = box.locator('[data-total="shipping"]');
    this.total = box.locator('[data-total="total"]');
  }
}

export class CartPage extends BasePage {
  readonly table: Locator;
  readonly rows: Locator;
  readonly emptyMessage: Locator;
  readonly couponCode: Locator;
  readonly applyCouponButton: Locator;
  readonly removeCouponButton: Locator;
  readonly appliedCoupon: Locator;
  readonly checkout: Locator;
  readonly totals: Totals;

  constructor(page: Page) {
    super(page);
    this.table = page.getByRole('table', { name: 'Cart' });
    this.rows = this.table.locator('tbody tr');
    this.emptyMessage = page.getByText('Your cart is empty.');
    this.couponCode = page.getByLabel('Coupon code');
    this.applyCouponButton = page.getByRole('button', { name: 'Apply coupon' });
    this.removeCouponButton = page.getByRole('button', { name: 'Remove coupon' });
    this.appliedCoupon = page.locator('#applied-coupon');
    this.checkout = page.getByRole('link', { name: 'Proceed to checkout' });
    this.totals = new Totals(page);
  }

  @step('Open the cart')
  goto(): Promise<void> {
    return this.open('/cart');
  }

  row(productName: string): Locator {
    return this.rows.filter({ hasText: productName });
  }

  quantityOf(productName: string): Locator {
    return this.page.getByLabel(`Quantity of ${productName}`);
  }

  /** Changes a line's quantity and waits for the cart to re-render with the server's answer. */
  @step((productName: string, quantity: number) => `Set ${productName} to ${quantity} in the cart`)
  async setQuantity(productName: string, quantity: number): Promise<void> {
    const answered = this.page.waitForResponse((r) => r.url().includes('/api/cart/items/'));
    await this.quantityOf(productName).fill(String(quantity));
    await this.quantityOf(productName).blur();
    await answered;
  }

  @step((productName: string) => `Remove ${productName} from the cart`)
  async remove(productName: string): Promise<void> {
    const answered = this.page.waitForResponse((r) => r.url().endsWith('/api/cart'));
    await this.page.getByRole('button', { name: `Remove ${productName}` }).click();
    await answered;
  }

  @step((code: string) => `Apply coupon ${code}`)
  async applyCoupon(code: string): Promise<void> {
    await this.couponCode.fill(code);
    const answered = this.page.waitForResponse((r) => r.url().endsWith('/api/cart/coupon'));
    await this.applyCouponButton.click();
    await answered;
  }
}
