import { enabledDefects, setDefects } from '../defects';
import { body, HttpError, json, str, type Route } from '../http';
import { store } from '../store';

/** Test-only endpoints; mounted only when SHOPLITE_TEST_HOOKS is not "0". */
export const testHookRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/test/reset',
    handler: () => {
      store.reset();
      return new Response(null, { status: 204 });
    },
  },
  { method: 'GET', pattern: '/api/test/defects', handler: () => json({ enabled: enabledDefects() }) },
  {
    method: 'PUT',
    pattern: '/api/test/defects',
    handler: async (req) => {
      const list = str(await body(req), 'enabled', { optional: true });
      try {
        return json({ enabled: setDefects(list) });
      } catch (err) {
        throw new HttpError(400, 'VALIDATION', (err as Error).message);
      }
    },
  },
];
