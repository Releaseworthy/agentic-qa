import { getProduct, listProducts } from '../domain/catalog';
import { json, type Route } from '../http';

export const productRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/api/products',
    handler: (req) => {
      const url = new URL(req.url);
      const items = listProducts({
        q: url.searchParams.get('q') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        sort: url.searchParams.get('sort') ?? undefined,
      });
      return json({ items, count: items.length });
    },
  },
  { method: 'GET', pattern: '/api/products/:id', handler: (_req, p) => json(getProduct(p.id ?? '')) },
];
