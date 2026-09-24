import { describe, expect, it } from 'vitest';
import { ApiEbDgRepository, ebDgRepositoryFor, apiEbDgRepository, localEbDgRepository } from './repository';
import { createApiClient } from '../api/client';
import { EBDG_COLUMN_ORDER } from './columns';
import type { EbDgRow } from '../../types/ebdg';

/**
 * EB-DG against the database, the way Diesel already is: the form's reads
 * and its submit go through /api/ebdg, and "already filed" comes back as a
 * decision to make (Amend), not an error.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function recording(respond: (url: string) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url);
  }) as unknown as typeof fetch;
  return { calls, repo: new ApiEbDgRepository(createApiClient({ fetch: fetchImpl })) };
}

const row = (over: Partial<EbDgRow> = {}): EbDgRow => {
  const full = Object.fromEntries(EBDG_COLUMN_ORDER.map((c) => [c, ''])) as unknown as EbDgRow;
  return { ...full, Record_ID: 'EBDG-ZHPL-DL-01-20260903', Site_Code: 'ZHPL-DL-01', Date: '2026-09-03', ...over };
};

describe('ApiEbDgRepository', () => {
  it('asks the server for the carry-forward row by site and date', async () => {
    const { calls, repo } = recording(() => json(200, row({ Date: '2026-09-02' })));
    const prev = await repo.getPreviousRow('ZHPL-DL-01', '2026-09-03', 'EB_DG_B2B');
    expect(calls[0].url).toBe('/api/ebdg/previous?site=ZHPL-DL-01&date=2026-09-03');
    expect(prev?.Date).toBe('2026-09-02');
  });

  it('treats a first-ever entry (null) as no previous row', async () => {
    const { repo } = recording(() => json(200, null));
    expect(await repo.getPreviousRow('ZHPL-DL-01', '2026-09-03', 'EB_DG_B2B')).toBeNull();
  });

  it('reads the back-dated flag', async () => {
    const { calls, repo } = recording(() => json(200, { later: true }));
    expect(await repo.hasLaterRows('ZHPL-DL-01', '2026-09-03', 'EB_DG_B2B')).toBe(true);
    expect(calls[0].url).toBe('/api/ebdg/later?site=ZHPL-DL-01&date=2026-09-03');
  });

  it('posts the row with extras and amend, and reports a new entry', async () => {
    const { calls, repo } = recording(() => json(201, row()));
    const res = await repo.submit(row({ DG3_Run_Hrs: 2 }), 'EB_DG_B2B', { room_clean: 'Yes' });
    expect(res).toMatchObject({ success: true, mode: 'created' });
    expect(calls[0].url).toBe('/api/ebdg/submit');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ Record_ID: 'EBDG-ZHPL-DL-01-20260903', DG3_Run_Hrs: 2, extras: { room_clean: 'Yes' }, amend: false });
  });

  it('turns the server’s DUPLICATE into "already filed", naming who and when', async () => {
    const { repo } = recording(() =>
      json(409, {
        error: 'DUPLICATE',
        message: 'An EB-DG entry for this site and date already exists.',
        details: { submittedBy: 'ramesh.k@zomato.com', submittedAt: '2026-09-03T09:10:00Z' },
      }),
    );
    const res = await repo.submit(row(), 'EB_DG_B2B');
    expect(res.success).toBe(false);
    expect(res.alreadyFiled).toEqual({ by: 'ramesh.k@zomato.com', at: '2026-09-03T09:10:00Z' });
  });

  it('reports any other failure as not saved', async () => {
    const { repo } = recording(() => json(500, { error: 'INTERNAL', message: 'Database unavailable.' }));
    const res = await repo.submit(row(), 'EB_DG_B2B', undefined, true);
    expect(res).toEqual({ success: false, message: 'Database unavailable.' });
  });
});

describe('ebDgRepositoryFor', () => {
  it('uses the database in API mode and this device otherwise', () => {
    expect(ebDgRepositoryFor('api')).toBe(apiEbDgRepository);
    expect(ebDgRepositoryFor('demo')).toBe(localEbDgRepository);
  });
});
