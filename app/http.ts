import { store, type User } from '@app/store';

/** A refused request: becomes `{ error: { code, message } }` with `status`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(err: HttpError): Response {
  return json({ error: { code: err.code, message: err.message } }, err.status);
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await req.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object');
}

export function str(data: Record<string, unknown>, key: string, { optional = false } = {}): string {
  const value = data[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (optional && value === undefined) return '';
  throw new HttpError(400, 'VALIDATION', `"${key}" is required`);
}

export function int(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new HttpError(400, 'VALIDATION', `"${key}" must be an integer`);
}

export function authUser(req: Request): User {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? store.sessions.get(token) : undefined;
  if (!session || session.expiresAt < Date.now()) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in required');
  const user = store.users.get(session.userId);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in required');
  return user;
}

export function adminUser(req: Request): User {
  const user = authUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Admin only');
  return user;
}

export type Params = Record<string, string>;
export type Handler = (req: Request, params: Params) => Response | Promise<Response>;
export type Route = { method: string; pattern: string; handler: Handler };

/** `/api/orders/:id/cancel` → a matcher returning the params, or null. */
export function compile(pattern: string): (path: string) => Params | null {
  const names: string[] = [];
  const source = pattern.replace(/:(\w+)/g, (_, name: string) => {
    names.push(name);
    return '([^/]+)';
  });
  const re = new RegExp(`^${source}$`);
  return (path) => {
    const m = re.exec(path);
    if (!m) return null;
    return Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1] ?? '')]));
  };
}
