import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client-api';
import type { SourceConfig } from './types';

afterEach(() => vi.unstubAllGlobals());

describe('search batching', () => {
  it('splits more than 50 potential subrequests across Worker invocations', async () => {
    const sizes: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { sources: SourceConfig[] };
      sizes.push(body.sources.length);
      return new Response(JSON.stringify({
        list: body.sources.map((s) => ({ sourceKey: s.key, vodId: s.key, name: '兰香如故' })),
        failures: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const sources = Array.from({ length: 14 }, (_, i) => ({
      key: `source-${i}`, name: `源${i}`, url: `https://example${i}.com/api`,
    }));
    const result = await api.search('兰香如故', sources, true);
    expect(sizes).toEqual([6, 6, 2]);
    expect(result.list).toHaveLength(14);
    expect(result.failures).toHaveLength(0);
  });
});
