import { HttpClient } from '@api/client';
import { AuthResult, Empty, User } from '@api/schemas';

export type Credentials = { email: string; password: string };
export type Registration = Credentials & { name: string };

/** /api/auth/* */
export class AuthApi extends HttpClient {
  register(input: Registration): Promise<AuthResult> {
    return this.call('POST', '/api/auth/register', AuthResult, input);
  }

  login(input: Credentials): Promise<AuthResult> {
    return this.call('POST', '/api/auth/login', AuthResult, input);
  }

  me(): Promise<User> {
    return this.call('GET', '/api/auth/me', User);
  }

  logout(): Promise<null> {
    return this.call('POST', '/api/auth/logout', Empty);
  }
}
