import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_LAYOUT,
  arrange,
  dropKey,
  isCustomised,
  loadLayout,
  moveKey,
  saveLayout,
  toggleHidden,
  type ColumnLayout,
} from './columnLayout';

const columns = [{ key: 'date' }, { key: 'site' }, { key: 'reading' }, { key: 'status' }];
const keys = columns.map((c) => c.key);

describe('arrange', () => {
  it('uses the table’s own order when nothing was arranged', () => {
    expect(arrange(columns, EMPTY_LAYOUT).map((c) => c.key)).toEqual(keys);
  });

  it('applies the saved order and drops hidden columns', () => {
    const layout: ColumnLayout = { order: ['status', 'date'], hidden: ['site'] };
    expect(arrange(columns, layout).map((c) => c.key)).toEqual(['status', 'date', 'reading']);
  });

  it('keeps a column added later, and ignores one that is gone', () => {
    const layout: ColumnLayout = { order: ['status', 'gone', 'date'], hidden: ['also-gone'] };
    expect(arrange(columns, layout).map((c) => c.key)).toEqual(['status', 'date', 'site', 'reading']);
  });
});

describe('moving columns', () => {
  it('moves one step left or right', () => {
    expect(moveKey([], keys, 'site', -1)).toEqual(['site', 'date', 'reading', 'status']);
    expect(moveKey([], keys, 'site', 1)).toEqual(['date', 'reading', 'site', 'status']);
  });

  it('does nothing at either end', () => {
    expect(moveKey([], keys, 'date', -1)).toEqual(keys);
    expect(moveKey([], keys, 'status', 1)).toEqual(keys);
  });

  it('drops a dragged column where the target was', () => {
    expect(dropKey([], keys, 'status', 'date')).toEqual(['status', 'date', 'site', 'reading']);
    expect(dropKey([], keys, 'date', 'reading')).toEqual(['site', 'reading', 'date', 'status']);
    expect(dropKey([], keys, 'date', 'date')).toEqual(keys);
  });
});

describe('hiding columns', () => {
  it('hides and shows a column, keeping the table’s order', () => {
    const hidden = toggleHidden(EMPTY_LAYOUT, 'site', keys);
    expect(hidden.hidden).toEqual(['site']);
    expect(toggleHidden(hidden, 'site', keys).hidden).toEqual([]);
  });

  it('refuses to hide the last visible column', () => {
    const layout: ColumnLayout = { order: [], hidden: ['date', 'site', 'reading'] };
    expect(toggleHidden(layout, 'status', keys)).toBe(layout);
  });

  it('knows whether anything was changed', () => {
    expect(isCustomised(EMPTY_LAYOUT)).toBe(false);
    expect(isCustomised({ order: ['site'], hidden: [] })).toBe(true);
  });
});

describe('remembering a layout', () => {
  // These tests run without a browser, so storage is stood up here.
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

  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('saves, reloads, and forgets a layout that is back to default', () => {
    const layout: ColumnLayout = { order: ['status', 'date'], hidden: ['site'] };
    saveLayout('records:UPS', layout);
    expect(loadLayout('records:UPS')).toEqual(layout);

    saveLayout('records:UPS', EMPTY_LAYOUT);
    expect(loadLayout('records:UPS')).toEqual(EMPTY_LAYOUT);
  });

  it('treats a damaged value as no layout', () => {
    localStorage.setItem('warehouse_portal_columns_bad', '{not json');
    expect(loadLayout('bad')).toEqual(EMPTY_LAYOUT);

    localStorage.setItem('warehouse_portal_columns_odd', '{"order":"site","hidden":[1,"date"]}');
    expect(loadLayout('odd')).toEqual({ order: [], hidden: ['date'] });
  });

  it('carries on when storage is blocked or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadLayout('records:UPS')).toEqual(EMPTY_LAYOUT);
    expect(() => saveLayout('records:UPS', { order: ['site'], hidden: [] })).not.toThrow();

    // No storage at all, as in a server-side render.
    vi.unstubAllGlobals();
    expect(loadLayout('records:UPS')).toEqual(EMPTY_LAYOUT);
    expect(() => saveLayout('records:UPS', { order: ['site'], hidden: [] })).not.toThrow();
  });
});
