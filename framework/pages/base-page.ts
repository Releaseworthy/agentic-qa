import type { Locator, Page } from '@playwright/test';

/** Shared by every page: hash navigation that waits for the view to finish rendering. */
export abstract class BasePage {
  readonly alert: Locator;
  readonly toast: Locator;

  constructor(protected readonly page: Page) {
    this.alert = page.getByRole('alert');
    this.toast = page.locator('#toast');
  }

  /** Opens `#<route>` and waits until the SPA has rendered it (body[data-ready]). */
  protected async open(route: string): Promise<void> {
    const [path = '/'] = route.split('?');
    await this.page.goto(`/#${route}`);
    await this.ready(path);
  }

  /** Waits for the SPA to finish rendering `path`. */
  async ready(path: string): Promise<void> {
    await this.page.locator(`body[data-ready="${path}"]`).waitFor();
  }
}
