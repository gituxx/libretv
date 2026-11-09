import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client-api';
import type { SourceConfig } from './types';

afterEach(() => vi.unstubAllGlobals());

describe('service errors', () => {
  it('503 保留实际服务错误，不触发登录或撤销访问状态', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '源站暂时不可用' }), { status: 503 })));

    await expect(api.detail('1', { key: 'a', name: '源A', url: 'https://example.com/api' })).rejects.toMatchObject({
      status: 503,
      message: '源站暂时不可用',
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('流式搜索遇到 503 时可以回退 JSON，不会弹出密码提示', async () => {
    const dispatchEvent = vi.fn();
    const onSource = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const fetchMock = vi.fn(async (url: string) => url.includes('stream=1')
      ? new Response('Service unavailable', { status: 503 })
      : new Response(JSON.stringify({ list: [{ sourceKey: 'a', vodId: '1' }], failures: [] })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.search('测试剧', [{ key: 'a', name: '源A', url: 'https://example.com/api' }], true, { onSource });
    expect(result.list).toHaveLength(1);
    expect(onSource).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'a', ok: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

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

  it('一批服务返回 503 不影响其它批次的搜索结果', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const { sources } = JSON.parse(init.body as string) as { sources: SourceConfig[] };
      if (sources[0].key === 'source-0') return new Response('Service unavailable', { status: 503 });
      return new Response(JSON.stringify({ list: [{ sourceKey: sources[0].key, vodId: '1' }], failures: [] }));
    }));
    const sources = Array.from({ length: 7 }, (_, i) => ({
      key: `source-${i}`, name: `源${i}`, url: `https://example${i}.com/api`,
    }));

    const result = await api.search('测试剧', sources, true);
    expect(result.list).toEqual([expect.objectContaining({ sourceKey: 'source-6' })]);
    expect(result.failures).toHaveLength(6);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
