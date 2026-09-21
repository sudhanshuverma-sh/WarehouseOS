import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalEbDgRepository } from './repository';
import { EBDG_COLUMN_ORDER } from './columns';
import type { EbDgRow } from '../../types/ebdg';

/**
 * Replacing a reading someone already filed.
 *
 * Three or four POCs share a site. The repository used to upsert on
 * Record_ID without being asked, so whoever opened the form second
 * silently replaced the first one's meter readings. Now that is a
 * decision: without `amend` the submit is refused and names who filed it.
 */

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
};

/** A complete row: rowToOrderedValues refuses anything missing a column. */
const row = (over: Partial<EbDgRow> = {}): EbDgRow => {
  const full = Object.fromEntries(EBDG_COLUMN_ORDER.map((c) => [c, ''])) as unknown as EbDgRow;
  return {
    ...full,
    Record_ID: 'EBDG-ZHPL-KA-01-20260921',
    Site_Code: 'ZHPL-KA-01',
    Date: '2026-09-21',
    Submitted_By: 'ramesh@zomato.com',
    Timestamp: '2026-09-21T09:14:00+05:30',
    Grid_KWH_Closing: 1200,
    ...over,
  };
};

describe('LocalEbDgRepository.submit()', () => {
  let repo: LocalEbDgRepository;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    repo = new LocalEbDgRepository();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('files a day nobody has filed', async () => {
    const res = await repo.submit(row(), 'EB_DG_B2B');
    expect(res).toMatchObject({ success: true, mode: 'created' });
  });

  it('refuses a second entry for the same site and day, and names who filed it', async () => {
    await repo.submit(row(), 'EB_DG_B2B');
    const res = await repo.submit(row({ Submitted_By: 'sunita@zomato.com', Grid_KWH_Closing: 9999 }), 'EB_DG_B2B');

    expect(res.success).toBe(false);
    expect(res.alreadyFiled).toEqual({ by: 'ramesh@zomato.com', at: '2026-09-21T09:14:00+05:30' });
  });

  it('keeps the first reading when the second is refused', async () => {
    await repo.submit(row(), 'EB_DG_B2B');
    await repo.submit(row({ Grid_KWH_Closing: 9999 }), 'EB_DG_B2B');

    const [kept] = await repo.listBySite('ZHPL-KA-01', 'EB_DG_B2B');
    expect(kept.Grid_KWH_Closing).toBe(1200);
  });

  it('replaces it once the person asks to amend', async () => {
    await repo.submit(row(), 'EB_DG_B2B');
    const res = await repo.submit(row({ Grid_KWH_Closing: 9999 }), 'EB_DG_B2B', undefined, true);

    expect(res).toMatchObject({ success: true, mode: 'updated' });
    const rows = await repo.listBySite('ZHPL-KA-01', 'EB_DG_B2B');
    expect(rows).toHaveLength(1); // still one row for the day, never two
    expect(rows[0].Grid_KWH_Closing).toBe(9999);
  });

  it('leaves another day alone', async () => {
    await repo.submit(row(), 'EB_DG_B2B');
    const res = await repo.submit(
      row({ Record_ID: 'EBDG-ZHPL-KA-01-20260922', Date: '2026-09-22' }),
      'EB_DG_B2B',
    );
    expect(res.success).toBe(true);
    expect(await repo.listBySite('ZHPL-KA-01', 'EB_DG_B2B')).toHaveLength(2);
  });
});
