import type { SourceConfig, SearchResultItem } from './types';

export interface SwitchCandidate {
  source: SourceConfig;
  result: SearchResultItem;
  ms?: number;
  ok?: boolean;
  episodes?: number;
}

export function sortSwitchCandidates(candidates: SwitchCandidate[]) {
  const rank = (c: SwitchCandidate) => c.ok === true && c.episodes ? 0 : c.ok === undefined ? 1 : 2;
  return [...candidates].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff) return rankDiff;
    return rank(a) === 0 ? (a.ms ?? Infinity) - (b.ms ?? Infinity) : 0;
  });
}
