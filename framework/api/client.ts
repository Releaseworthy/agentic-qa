import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';
import { ErrorBody } from '@api/schemas';
import { env } from '@config/env';
import { inStep } from '@utils/step';

export type Schema<T> = z.ZodType<T>;

/** The API refused the call with `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly code: string,
    readonly reason: string,
  ) {
    super(`${method} ${path} -> ${status} ${code}: ${reason}`);
  }
}

/** An unparsed response, for negative tests that send malformed input on purpose. */
export type RawResponse = { status: number; body: unknown };

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * JSON calls against the ShopLite API. Each call is a `METHOD /path` step in
 * the report and returns its validated data, or throws `ApiError` on a refusal
 * and `Error` on a response that breaks its schema.
 */
export class HttpClient {
  constructor(
    protected readonly request: APIRequestContext,
    protected readonly token?: string,
  ) {}

  /** Raw call without schema validation. Doesn't throw; returns the status and body as the server sent them. */
  raw(method: Method, path: string, data?: unknown, headers: Record<string, string> = {}): Promise<RawResponse> {
    return inStep(`${method} ${path} (raw)`, async () => {
      const response = await this.send(method, path, data, headers);
      const text = await response.text();
      return { status: response.status(), body: text ? (JSON.parse(text) as unknown) : null };
    });
  }

  protected call<T>(method: Method, path: string, schema: Schema<T>, data?: unknown): Promise<T> {
    return inStep(`${method} ${path}`, async () => {
      const response = await this.send(method, path, data);
      const text = await response.text();
      const body: unknown = text ? JSON.parse(text) : null;
      if (!response.ok()) {
        const error = ErrorBody.safeParse(body);
        if (error.success)
          throw new ApiError(method, path, response.status(), error.data.error.code, error.data.error.message);
        throw new Error(`${method} ${path} -> ${response.status()}: ${text.slice(0, 200)}`);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success)
        throw new Error(
          `${method} ${path}: response breaks its contract:\n${z.prettifyError(parsed.error)}\n${text.slice(0, 300)}`,
        );
      return parsed.data;
    });
  }

  private send(
    method: Method,
    path: string,
    data: unknown,
    headers: Record<string, string> = {},
  ): Promise<APIResponse> {
    const auth: Record<string, string> = this.token ? { authorization: `Bearer ${this.token}` } : {};
    return this.request.fetch(new URL(path, env.baseUrl).toString(), {
      method,
      data,
      headers: { ...auth, ...headers },
    });
  }
}
