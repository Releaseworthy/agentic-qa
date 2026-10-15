import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/base-page';
import { step } from '@utils/step';

export class ProductPage extends BasePage {
  readonly title: Locator;
  readonly price: Locator;
  readonly stock: Locator;
  readonly quantity: Locator;
  readonly addToCartButton: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByRole('heading', { level: 1 });
    this.price = page.getByLabel('Price');
    this.stock = page.locator('#stock');
    this.quantity = page.getByLabel('Quantity');
    this.addToCartButton = page.getByRole('button', { name: 'Add to cart' });
  }

  @step((productId: string) => `Open product ${productId}`)
  goto(productId: string): Promise<void> {
    return this.open(`/product/${productId}`);
  }

  /** Adds `quantity` and waits for the API's answer (the toast, or an error alert). */
  @step((quantity?: number) => `Add ${quantity ?? 1} to the cart`)
  async addToCart(quantity = 1): Promise<void> {
    await this.quantity.fill(String(quantity));
    const answered = this.page.waitForResponse((r) => r.url().endsWith('/api/cart/items'));
    await this.addToCartButton.click();
    await answered;
  }
}
