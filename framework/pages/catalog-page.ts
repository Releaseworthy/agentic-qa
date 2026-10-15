import type { Locator, Page } from '@playwright/test';
import type { Category } from '@api/schemas';
import { BasePage } from '@pages/base-page';

export type SortOption = 'Name' | 'Price: low to high' | 'Price: high to low';

export class CatalogPage extends BasePage {
  readonly search: Locator;
  readonly category: Locator;
  readonly sort: Locator;
  readonly apply: Locator;
  readonly resultCount: Locator;
  readonly products: Locator;
  readonly productTitles: Locator;

  constructor(page: Page) {
    super(page);
    this.search = page.getByRole('searchbox', { name: 'Search' });
    this.category = page.getByLabel('Category');
    this.sort = page.getByLabel('Sort');
    this.apply = page.getByRole('button', { name: 'Apply' });
    this.resultCount = page.locator('#result-count');
    this.products = page.getByRole('region', { name: 'Products' }).getByRole('article');
    this.productTitles = this.products.getByRole('heading');
  }

  goto(): Promise<void> {
    return this.open('/');
  }

  /** Sets any of the filters and applies them. */
  async filter({ q, category, sort }: { q?: string; category?: Category | 'All'; sort?: SortOption }): Promise<void> {
    if (q !== undefined) await this.search.fill(q);
    if (category !== undefined) await this.category.selectOption({ label: category === 'All' ? 'All' : cap(category) });
    if (sort !== undefined) await this.sort.selectOption({ label: sort });
    await this.apply.click();
    await this.ready('/');
  }

  product(name: string): Locator {
    return this.products.filter({ has: this.page.getByRole('heading', { name, exact: true }) });
  }

  async openProduct(name: string): Promise<void> {
    await this.product(name).getByRole('link', { name }).click();
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
