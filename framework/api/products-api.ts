import { HttpClient } from '@api/client';
import { Product, ProductList, type Category } from '@api/schemas';

export type ProductQuery = { q?: string; category?: Category; sort?: 'name' | 'price_asc' | 'price_desc' };

/** /api/products */
export class ProductsApi extends HttpClient {
  list(query: ProductQuery = {}): Promise<ProductList> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (typeof value === 'string') params.set(key, value);
    const qs = params.toString();
    return this.call('GET', `/api/products${qs ? `?${qs}` : ''}`, ProductList);
  }

  get(id: string): Promise<Product> {
    return this.call('GET', `/api/products/${encodeURIComponent(id)}`, Product);
  }
}
