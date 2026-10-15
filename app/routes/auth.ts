import { login, logout, publicUser, register } from '../domain/auth';
import { authUser, body, json, str, type Route } from '../http';

export const authRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/api/auth/register',
    handler: async (req) => {
      const data = await body(req);
      return json(register(str(data, 'email'), str(data, 'password'), str(data, 'name')), 201);
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/login',
    handler: async (req) => {
      const data = await body(req);
      return json(login(str(data, 'email'), str(data, 'password')));
    },
  },
  {
    method: 'POST',
    pattern: '/api/auth/logout',
    handler: (req) => {
      authUser(req);
      logout((req.headers.get('authorization') ?? '').slice(7));
      return new Response(null, { status: 204 });
    },
  },
  { method: 'GET', pattern: '/api/auth/me', handler: (req) => json(publicUser(authUser(req))) },
];
