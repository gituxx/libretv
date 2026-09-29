import { describe, expect, it } from 'vitest';
import { aggregateResults } from './video-card';
import type { SearchResultItem } from '@/lib/types';

const item = (sourceKey: string, year = '2026'): SearchResultItem => ({
  sourceKey,
  sourceName: sourceKey,
  sourceUrl: `https://${sourceKey}.example.com/api`,
  vodId: sourceKey,
  name: '兰香如故',
  year,
});

describe('incremental search cards', () => {
  it('keeps the same React key as more sources arrive', () => {
    const before = aggregateResults([item('a'), item('b')]);
    const after = aggregateResults([item('a'), item('b'), item('c')]);
    expect(before[0].items).toHaveLength(2);
    expect(after[0].items).toHaveLength(3);
    expect(after[0].key).toBe(before[0].key);
  });

  it('keeps different release years as separate cards', () => {
    const groups = aggregateResults([item('a', '2025'), item('b', '2026')]);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).not.toBe(groups[1].key);
  });
});
