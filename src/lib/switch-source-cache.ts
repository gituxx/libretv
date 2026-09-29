import type { SearchResultItem } from './types';

const KEY = 'libretv:switch-source-results:v1';
const MAX_AGE_MS = 30 * 60_000;

/** Keep the search results that led to playback so the source list is complete immediately. */
export function saveSwitchSourceResults(title: string, items: SearchResultItem[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ title, items, savedAt: Date.now() }));
  } catch {
    // Storage can be unavailable; background search remains the fallback.
  }
}

export function readSwitchSourceResults(title: string): SearchResultItem[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return [];
    const snapshot = value as { title?: unknown; items?: unknown; savedAt?: unknown };
    if (snapshot.title !== title || typeof snapshot.savedAt !== 'number'
      || Date.now() - snapshot.savedAt > MAX_AGE_MS || !Array.isArray(snapshot.items)) return [];
    return snapshot.items.filter((item): item is SearchResultItem =>
      item && typeof item.sourceKey === 'string' && typeof item.vodId === 'string'
      && typeof item.name === 'string');
  } catch {
    return [];
  }
}
