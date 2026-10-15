/**
 * ShopLite — the system under test. A small shop with a REST API (/api/*) and
 * a single-page UI (/). In-memory, so every start is a clean seed.
 *
 *   bun run app                     http://localhost:3100
 *   SHOPLITE_DEFECTS=all bun run app   with the seeded defects on (see defects.ts)
 */

import { join } from 'node:path';
import { enabledDefects } from './defects';
import { compile, errorResponse, HttpError, json, type Handler, type Route } from './http';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { cartRoutes } from './routes/cart';
import { orderRoutes } from './routes/orders';
import { productRoutes } from './routes/products';
import { testHookRoutes } from './routes/test-hooks';

const PORT = Number(process.env.PORT ?? 3100);
const WEB = join(import.meta.dir, 'web');

const routes: Route[] = [
  ...authRoutes,
  ...productRoutes,
  ...cartRoutes,
  ...orderRoutes,
  ...adminRoutes,
  ...(process.env.SHOPLITE_TEST_HOOKS === '0' ? [] : testHookRoutes),
];
const table = routes.map((r) => ({ ...r, match: compile(r.pattern) }));

async function handleApi(req: Request, path: string): Promise<Response> {
  let methodMismatch = false;
  for (const route of table) {
    const params = route.match(path);
    if (!params) continue;
    if (route.method !== req.method) {
      methodMismatch = true;
      continue;
    }
    return (route.handler satisfies Handler)(req, params);
  }
  if (methodMismatch) throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not allowed here`);
  throw new HttpError(404, 'NOT_FOUND', 'No such endpoint');
}

const STATIC: Record<string, string> = {
  '/app.js': 'app.js',
  '/styles.css': 'styles.css',
};

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/health') return json({ ok: true, defects: enabledDefects() });
    if (path.startsWith('/api/')) {
      try {
        return await handleApi(req, path);
      } catch (err) {
        if (err instanceof HttpError) return errorResponse(err);
        console.error(err);
        return errorResponse(new HttpError(500, 'INTERNAL', 'Something went wrong'));
      }
    }
    const file = STATIC[path];
    return new Response(Bun.file(join(WEB, file ?? 'index.html')));
  },
});

const defects = enabledDefects();
console.log(
  `ShopLite on http://localhost:${server.port}${defects.length ? ` — seeded defects ON: ${defects.join(', ')}` : ''}`,
);
