'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import { buildWatchUrl, cn } from '@/lib/utils';
import { sortSwitchCandidates, type SwitchCandidate } from '@/lib/switch-source-rank';
import { useAppStore, resolveSource } from '@/lib/store';
import { useToast } from './toast';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { useFocusTrap } from './use-focus-trap';

interface ProbeProgress {
  searched: number;
  total: number;
  tested: number;
  done: boolean;
}

const DETAIL_CONCURRENCY = 3;
const candidateKey = (c: SwitchCandidate) => `${c.source.key}\u0000${c.result.vodId}`;

/** 播放页存活期间后台搜索并测试；关闭换源面板不会重做任务。 */
export function useSwitchSourceProbe({ currentTitle, currentSource, currentVodId, currentEpisodes, currentCover, enabled }: {
  currentTitle: string;
  currentSource?: SourceConfig;
  currentVodId: string;
  currentEpisodes: number;
  currentCover?: string;
  enabled: boolean;
}) {
  const store = useAppStore();
  const sources = useMemo(() => {
    const seen = new Set<string>();
    return store.selectedKeys.map((key) => resolveSource(store, key)).filter((s): s is SourceConfig => {
      if (!s || seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    });
    // Health updates do not restart a running search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedKeys, store.customAPIs, store.envSources]);
  const [candidates, setCandidates] = useState<SwitchCandidate[]>([]);
  const [progress, setProgress] = useState<ProbeProgress>({ searched: 0, total: 0, tested: 0, done: false });

  useEffect(() => {
    if (!enabled || !currentSource || !currentVodId || !currentTitle.trim() || sources.length === 0) return;
    const controller = new AbortController();
    const sourceByKey = new Map(sources.map((source) => [source.key, source]));
    const seen = new Set<string>();
    const queue: SwitchCandidate[] = [];
    let active = 0;
    let searchedAll = false;
    let tested = 0;

    const initial: SwitchCandidate = {
      source: currentSource,
      result: { sourceKey: currentSource.key, sourceName: currentSource.name, sourceUrl: currentSource.url,
        vodId: currentVodId, name: currentTitle, pic: currentCover },
      episodes: currentEpisodes,
    };
    seen.add(candidateKey(initial));
    setCandidates([initial]);
    setProgress({ searched: 0, total: sources.length, tested: 0, done: false });

    const finish = () => {
      if (searchedAll && active === 0 && queue.length === 0 && !controller.signal.aborted) {
        setProgress((p) => ({ ...p, done: true }));
      }
    };
    const pump = () => {
      while (active < DETAIL_CONCURRENCY && queue.length > 0 && !controller.signal.aborted) {
        const candidate = queue.shift()!;
        active++;
        void api.detailSpeed(candidate.result.vodId, candidate.source, controller.signal).then((result) => {
          if (controller.signal.aborted) return;
          const episodes = result.detail?.episodes.length ?? 0;
          setCandidates((prev) => prev.map((item) => candidateKey(item) === candidateKey(candidate)
            ? { ...item, ok: result.ok && episodes > 0, ms: result.ms, episodes }
            : item));
          tested++;
          setProgress((p) => ({ ...p, tested }));
        }).finally(() => {
          active--;
          pump();
          finish();
        });
      }
    };
    queue.push(initial);
    pump();

    const addOutcome = (sourceKey: string, list: SearchResultItem[]) => {
      if (controller.signal.aborted) return;
      setProgress((p) => ({ ...p, searched: Math.min(p.searched + 1, p.total) }));
      const source = sourceByKey.get(sourceKey);
      if (!source) return;
      const title = currentTitle.trim();
      const match = list.find((item) => item.name.trim() === title)
        ?? list.find((item) => item.name.trim().startsWith(title));
      if (!match) return;
      const candidate: SwitchCandidate = { source, result: match };
      const key = candidateKey(candidate);
      if (seen.has(key)) {
        setCandidates((prev) => prev.map((item) => candidateKey(item) === key
          ? { ...item, result: { ...item.result, ...match } }
          : item));
        return;
      }
      seen.add(key);
      setCandidates((prev) => [...prev, candidate]);
      queue.push(candidate);
      pump();
    };

    void api.search(currentTitle, sources, store.yellowFilter, {
      signal: controller.signal,
      onSource: (outcome) => addOutcome(outcome.sourceKey, outcome.list),
    }).catch(() => {
      // Keep partial results if a batch or connection fails.
    }).finally(() => {
      searchedAll = true;
      finish();
    });

    return () => controller.abort();
    // currentSource may be reconstructed for a fallback URL; its identity is not a search input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentTitle, currentSource?.key, currentSource?.url, currentVodId, currentEpisodes, currentCover, sources, store.yellowFilter]);

  return { candidates, progress };
}

export function SwitchSourceModal({ currentTitle, currentSourceKey, currentVodId, currentIndex, candidates, progress, onClose }: {
  currentTitle: string;
  currentSourceKey: string;
  currentVodId: string;
  currentIndex: number;
  candidates: SwitchCandidate[];
  progress: ProbeProgress;
  onClose: () => void;
}) {
  const store = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sorted = sortSwitchCandidates(candidates);
  const current = candidates.find((c) => c.source.key === currentSourceKey && String(c.result.vodId) === String(currentVodId));
  const ready = sorted.filter((c) => c.ok && c.episodes).length;

  useFocusTrap(true, panelRef);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const switchTo = async (candidate: SwitchCandidate) => {
    if (switching) return;
    setSwitching(candidateKey(candidate));
    let episodes = candidate.episodes;
    if (candidate.ok === undefined) {
      const result = await api.detailSpeed(candidate.result.vodId, candidate.source);
      episodes = result.detail?.episodes.length ?? 0;
    }
    if (!episodes) { toast('该源无可用播放资源', 'warning'); setSwitching(null); return; }
    const targetIndex = currentIndex < episodes ? currentIndex : 0;
    onClose();
    router.push(buildWatchUrl({ sourceKey: candidate.source.key, vodId: candidate.result.vodId,
      index: targetIndex, title: candidate.result.name || currentTitle,
      sourceUrl: candidate.source.url, detail: candidate.source.detail }));
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 p-3 sm:p-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} tabIndex={-1}
        className="bg-surface-raised rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col outline-none"
        role="dialog" aria-modal="true" aria-label={`换源：${currentTitle}`}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-content truncate" title={currentTitle}>{currentTitle} · 换源</h2>
            <p className="text-xs text-faint mt-1">
              已找到 {sorted.length} 个来源 · {ready} 个可用
              {!progress.done && ` · 搜索 ${progress.searched}/${progress.total}，测速 ${progress.tested}/${sorted.length}`}
            </p>
          </div>
          <button className="p-2 rounded-lg text-muted hover:text-content hover:bg-hover" onClick={onClose} aria-label="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {current && <p className="px-4 pt-3 text-xs text-muted truncate">当前线路：{current.source.name} · 共 {current.episodes ?? '?'} 集</p>}
        <p className="px-4 pt-3 text-xs text-muted">按详情响应时间排序；该时间仅供换源参考，实际播放速度以播放器为准。</p>
        <div className="overflow-y-auto scrollbar-thin p-3 sm:p-4 space-y-2">
          {sorted.length === 0 && <p className="text-center text-sm text-faint py-8">正在查找同名资源…</p>}
          {sorted.map((candidate, index) => {
            const isCurrent = candidate.source.key === currentSourceKey && String(candidate.result.vodId) === String(currentVodId);
            const key = candidateKey(candidate);
            const failed = candidate.ok === false;
            const pending = candidate.ok === undefined;
            return (
              <button key={key} type="button" disabled={isCurrent || failed || Boolean(switching)}
                onClick={() => void switchTo(candidate)}
                className={cn('w-full flex items-center gap-3 text-left rounded-2xl border px-3 py-2.5 transition-colors',
                  isCurrent ? 'bg-accent text-on-accent border-accent' : 'bg-card border-line hover:border-accent hover:bg-hover',
                  failed && 'opacity-55 cursor-not-allowed')}>
                <div className={cn('w-11 h-14 shrink-0 overflow-hidden rounded-xl flex items-center justify-center', isCurrent ? 'bg-white/20' : 'bg-chip')}>
                  {candidate.result.pic && !imgFailed[key] ? (
                    <SmartImage url={candidate.result.pic} mode={store.imageProxyMode} customProxy={store.customImageProxy}
                      alt="" className="w-full h-full object-cover"
                      onExhausted={() => setImgFailed((prev) => ({ ...prev, [key]: true }))} />
                  ) : <Icon name="link" className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm sm:text-base truncate" title={candidate.source.name}>{candidate.source.name}</p>
                  <p className={cn('text-xs truncate mt-0.5', isCurrent ? 'text-on-accent/75' : 'text-faint')}>
                    {candidate.result.remarks || (candidate.episodes ? `共 ${candidate.episodes} 集` : '剧集待确认')}
                  </p>
                  <span className={cn('inline-block mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    isCurrent ? 'bg-white/20 text-on-accent' : failed ? 'bg-danger/15 text-danger' : pending ? 'bg-chip text-muted' : 'bg-success/15 text-success')}>
                    {failed ? '不可用' : pending ? '检测中…' : `${candidate.ms}ms`}
                  </span>
                </div>
                <span className={cn('shrink-0 text-xs', isCurrent ? 'text-on-accent/85' : 'text-muted')}>
                  {isCurrent ? '当前播放' : failed ? '失败' : switching === key ? '切换中…' : `#${index + 1} ›`}
                </span>
              </button>
            );
          })}
          {progress.done && sorted.length === 1 && <p className="text-center text-xs text-faint py-3">其他点播源未找到同名资源</p>}
        </div>
      </div>
    </div>
  );
}
