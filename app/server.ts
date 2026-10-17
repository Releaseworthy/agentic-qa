/**
 * ShopLite is the system under test: a small shop with a REST API (/api/*) and
 * a single-page UI (/). In-memory, so every start is a clean seed.
 *
 * Started through framework/setup/app-server.ts, which sets it up as a TEST_ENV:
 *
 *   bun run app                          dev, http://localhost:3100
 *   TEST_ENV=staging bun run app         staging stand-in, :3200
 *   SHOPLITE_DEFECTS=all bun run app     with the seeded defects on (see defects.ts)
 */

import { join } from 'node:path';
import { enabledDefects } from '@app/defects';
import { compile, errorResponse, HttpError, json, type Handler, type Route } from '@app/http';
import { adminRoutes } from '@app/routes/admin';
import { authRoutes } from '@app/routes/auth';
import { cartRoutes } from '@app/routes/cart';
import { orderRoutes } from '@app/routes/orders';
import { productRoutes } from '@app/routes/products';
import { testHookRoutes } from '@app/routes/test-hooks';
import { ENVIRONMENT } from '@app/store';

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
    if (path === '/health') return json({ ok: true, env: ENVIRONMENT, defects: enabledDefects() });
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
  `ShopLite (${ENVIRONMENT}) on http://localhost:${server.port}${defects.length ? `, seeded defects ON: ${defects.join(', ')}` : ''}`,
);
