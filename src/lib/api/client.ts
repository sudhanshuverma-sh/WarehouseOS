/**
 * The browser's one way to reach the API.
 *
 * Same origin, always: in production one server serves the app and /api;
 * in development Vite proxies /api to it (vite.config.ts). So there is no
 * base URL to configure and nothing that could point a build at the wrong
 * database.
 *
 * Every failure becomes an ApiError carrying the server's own sentence
 * ("You cannot approve your own request."), so a screen can show what
 * went wrong instead of "Request failed".
 */

export type DataMode = 'loading' | 'api' | 'demo';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field → message, from a VALIDATION response, for marking form inputs. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details) {
        if (d && typeof d.field === 'string' && typeof d.message === 'string' && !out[d.field]) out[d.field] = d.message;
      }
    }
    return out;
  }
}

type Fetch = typeof fetch;

export interface ApiClientOptions {
  base?: string;
  fetch?: Fetch;
}

/** `?a=1&b=x`, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function createApiClient({ base = '/api', fetch: fetchImpl }: ApiClientOptions = {}) {
  // Resolved per call, not captured at import, so tests and polyfills that
  // replace fetch later are honoured.
  const doFetch: Fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    raw?: { body: Blob | ArrayBuffer | Uint8Array; contentType: string },
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (raw) {
      payload = raw.body as BodyInit;
      headers['content-type'] = raw.contentType;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }

    let res: Response;
    try {
      res = await doFetch(base + path, { method, headers, body: payload, credentials: 'same-origin' });
    } catch {
      throw new ApiError(0, 'OFFLINE', 'Cannot reach the server. Check your connection and try again — nothing was saved.');
    }

    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null; // an HTML error page from a proxy, say
      }
    }

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data?.error ?? (res.status === 401 ? 'UNAUTHENTICATED' : `HTTP_${res.status}`),
        data?.message ?? `The server answered ${res.status}. Please try again.`,
        data?.details,
      );
    }
    return data as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    /** Sends a file as the raw request body — never base64 inside JSON. */
    upload: <T>(path: string, file: Blob | ArrayBuffer | Uint8Array, contentType: string) =>
      request<T>('POST', path, undefined, { body: file, contentType }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient();

/**
 * Where this page's data lives.
 *
 * A production build always uses the API — it must never fall back to
 * browser storage, where a POC's submission would silently stay on their
 * phone. Only `npm run dev` with no API server running gets demo mode.
 */
export async function detectDataMode(
  opts: { fetch?: Fetch; isProduction?: boolean } = {},
): Promise<'api' | 'demo'> {
  const isProduction = opts.isProduction ?? Boolean(import.meta.env?.PROD);
  if (isProduction) return 'api';
  try {
    const res = await (opts.fetch ?? fetch)('/api/health', { headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => null);
    // Our health endpoint answers { ok, database } — even with the database
    // down (503). Anything else is Vite's own fallback: there is no API.
    return data && typeof data.ok === 'boolean' ? 'api' : 'demo';
  } catch {
    return 'demo';
  }
}
