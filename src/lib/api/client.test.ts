import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, detectDataMode, qs } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function recording(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, client: createApiClient({ fetch: fetchImpl }) };
}

describe('api client', () => {
  it('sends JSON to /api and returns the parsed body', async () => {
    const { calls, client } = recording(() => json(201, { uniqueId: 'PZHPL1001' }));
    await expect(client.post('/diesel', { quantity: 5 })).resolves.toEqual({ uniqueId: 'PZHPL1001' });
    expect(calls[0].url).toBe('/api/diesel');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('{"quantity":5}');
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('turns an error response into an ApiError with the server’s sentence', async () => {
    const { client } = recording(() => json(403, { error: 'FORBIDDEN', message: 'You cannot approve your own request.' }));
    const err = await client.post('/diesel/X/approve').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'You cannot approve your own request.' });
  });

  it('exposes validation details by field', async () => {
    const { client } = recording(() =>
      json(400, {
        error: 'VALIDATION',
        message: 'Agency is required.',
        details: [{ field: 'agency', message: 'Agency is required.' }, { field: 'agency', message: 'second' }],
      }),
    );
    const err = (await client.post('/services/HOUSEKEEPING/submissions').catch((e) => e)) as ApiError;
    expect(err.fieldErrors).toEqual({ agency: 'Agency is required.' });
  });

  it('reports a network failure as OFFLINE, and says nothing was saved', async () => {
    const { client } = recording(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = (await client.get('/diesel').catch((e) => e)) as ApiError;
    expect(err.code).toBe('OFFLINE');
    expect(err.message).toMatch(/nothing was saved/);
  });

  it('copes with a non-JSON error page from a proxy', async () => {
    const { client } = recording(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
    const err = (await client.get('/me').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('uploads a file as the raw body with its own content type', async () => {
    const { calls, client } = recording(() => json(201, { id: 'x' }));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    await client.upload('/attachments?service=DIESEL', bytes, 'image/jpeg');
    expect(calls[0].init.body).toBe(bytes);
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe('image/jpeg');
  });
});

describe('qs', () => {
  it('encodes values and skips blanks', () => {
    expect(qs({ site: 'ZHPL-HR-03', from: '', to: undefined, limit: 50 })).toBe('?site=ZHPL-HR-03&limit=50');
    expect(qs({ q: 'a&b' })).toBe('?q=a%26b');
    expect(qs({})).toBe('');
  });
});

describe('detectDataMode', () => {
  const answering = (r: () => Response) => (async () => r()) as unknown as typeof fetch;

  it('always uses the API in a production build, without even asking', async () => {
    const never = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    await expect(detectDataMode({ isProduction: true, fetch: never })).resolves.toBe('api');
  });

  it('uses the API in development when our health endpoint answers — even with the database down', async () => {
    await expect(detectDataMode({ isProduction: false, fetch: answering(() => json(200, { ok: true })) })).resolves.toBe('api');
    await expect(detectDataMode({ isProduction: false, fetch: answering(() => json(503, { ok: false })) })).resolves.toBe('api');
  });

  it('falls back to demo in development when no API is running', async () => {
    await expect(
      detectDataMode({ isProduction: false, fetch: answering(() => new Response('<!doctype html>', { status: 200 })) }),
    ).resolves.toBe('demo');
    const refused = (async () => {
      throw new TypeError('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(detectDataMode({ isProduction: false, fetch: refused })).resolves.toBe('demo');
  });
});
