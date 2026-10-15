import type { APIRequestContext, APIResponse } from '@playwright/test';
import { type, type ArkErrors } from 'arktype';
import { config } from '@config';
import { ErrorBody } from '@api/schemas';

export type Schema<T> = (data: unknown) => T | ArkErrors;

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

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * JSON calls against the ShopLite API. Each call returns its validated data, or
 * throws `ApiError` on a refusal and `Error` on a response that breaks its schema.
 */
export class HttpClient {
  constructor(
    protected readonly request: APIRequestContext,
    protected readonly token?: string,
  ) {}

  /** Any call, no schema, no throw — the status and body as the server sent them. */
  async raw(method: Method, path: string, data?: unknown, headers: Record<string, string> = {}): Promise<RawResponse> {
    const response = await this.send(method, path, data, headers);
    const text = await response.text();
    return { status: response.status(), body: text ? (JSON.parse(text) as unknown) : null };
  }

  protected async call<T>(method: Method, path: string, schema: Schema<T>, data?: unknown): Promise<T> {
    const response = await this.send(method, path, data);
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!response.ok()) {
      if (ErrorBody.allows(body))
        throw new ApiError(method, path, response.status(), body.error.code, body.error.message);
      throw new Error(`${method} ${path} -> ${response.status()}: ${text.slice(0, 200)}`);
    }
    const parsed = schema(body);
    if (parsed instanceof type.errors)
      throw new Error(`${method} ${path}: response breaks its contract: ${parsed.summary}\n${text.slice(0, 300)}`);
    return parsed;
  }

  private send(
    method: Method,
    path: string,
    data: unknown,
    headers: Record<string, string> = {},
  ): Promise<APIResponse> {
    const auth: Record<string, string> = this.token ? { authorization: `Bearer ${this.token}` } : {};
    return this.request.fetch(new URL(path, config.baseUrl).toString(), {
      method,
      data,
      headers: { ...auth, ...headers },
    });
  }
}
