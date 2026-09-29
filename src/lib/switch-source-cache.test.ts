import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSwitchSourceResults, saveSwitchSourceResults } from './switch-source-cache';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});

describe('switch-source result handoff', () => {
  it('preserves every source in the selected title group across navigation', () => {
    const items = Array.from({ length: 58 }, (_, i) => ({
      sourceKey: `source-${i}`, sourceName: `源${i}`, vodId: String(i), name: '兰香如故',
    }));
    saveSwitchSourceResults('兰香如故', items);
    expect(readSwitchSourceResults('兰香如故')).toHaveLength(58);
    expect(readSwitchSourceResults('另一部剧')).toEqual([]);
  });

  it('ignores an expired snapshot', () => {
    saveSwitchSourceResults('兰香如故', [{ sourceKey: 'one', sourceName: '源', vodId: '1', name: '兰香如故' }]);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    expect(readSwitchSourceResults('兰香如故')).toEqual([]);
    vi.restoreAllMocks();
  });
});
