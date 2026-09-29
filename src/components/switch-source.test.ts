import { describe, expect, it } from 'vitest';
import { sortSwitchCandidates, type SwitchCandidate } from '@/lib/switch-source-rank';

const candidate = (key: string, ms?: number, ok?: boolean): SwitchCandidate => ({
  source: { key, name: key, url: `https://${key}.example.com/api` },
  result: { sourceKey: key, sourceName: key, vodId: key, name: '兰香如故' },
  ms,
  ok,
  episodes: ok ? 37 : undefined,
});

describe('background switch-source ranking', () => {
  it('ranks every source by tested latency, then pending and failed sources', () => {
    const list = [candidate('slow', 500, true), candidate('failed', 50, false),
      candidate('current', 300, true), candidate('pending'), candidate('fast', 40, true)];
    expect(sortSwitchCandidates(list).map((item) => item.source.key))
      .toEqual(['fast', 'current', 'slow', 'pending', 'failed']);
  });

  it('moves a source into latency order once its background test completes', () => {
    const list = [candidate('slow', 500, true), candidate('new')];
    expect(sortSwitchCandidates(list).map((item) => item.source.key)).toEqual(['slow', 'new']);
    list[1] = candidate('new', 30, true);
    expect(sortSwitchCandidates(list).map((item) => item.source.key)).toEqual(['new', 'slow']);
  });
});
