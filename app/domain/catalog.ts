import { HttpError } from '@app/http';
import { store, type Product } from '@app/store';

export const CATEGORIES = ['books', 'electronics', 'home', 'toys'] as const;
export const SORTS = ['name', 'price_asc', 'price_desc'] as const;
export type Sort = (typeof SORTS)[number];

export type ProductQuery = { q?: string; category?: string; sort?: string };

export function listProducts({ q, category, sort = 'name' }: ProductQuery): Product[] {
  if (category && !(CATEGORIES as readonly string[]).includes(category))
    throw new HttpError(400, 'VALIDATION', `Unknown category "${category}"`);
  if (!(SORTS as readonly string[]).includes(sort)) throw new HttpError(400, 'VALIDATION', `Unknown sort "${sort}"`);
  const needle = q?.trim().toLowerCase() ?? '';
  const items = [...store.products.values()].filter(
    (p) =>
      (!category || p.category === category) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)),
  );
  const by: Record<Sort, (a: Product, b: Product) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    price_asc: (a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name),
    price_desc: (a, b) => b.priceCents - a.priceCents || a.name.localeCompare(b.name),
  };
  return items.sort(by[sort as Sort]);
}

export function getProduct(id: string): Product {
  const product = store.products.get(id);
  if (!product) throw new HttpError(404, 'NOT_FOUND', 'Product not found');
  return product;
}

export function createProduct(input: Omit<Product, 'id'>): Product {
  if (!(CATEGORIES as readonly string[]).includes(input.category))
    throw new HttpError(400, 'VALIDATION', `Unknown category "${input.category}"`);
  if (input.priceCents <= 0) throw new HttpError(400, 'VALIDATION', 'Price must be positive');
  if (input.stock < 0) throw new HttpError(400, 'VALIDATION', 'Stock cannot be negative');
  const product: Product = { ...input, id: store.nextId('p') };
  store.products.set(product.id, product);
  return product;
}
