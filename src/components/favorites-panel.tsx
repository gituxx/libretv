'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Drawer } from './drawer';
import { EmptyState, LoadingState } from './states';
import { Icon } from './icon';
import { SmartImage } from './smart-image';
import { db, removeFavorite, type FavoriteEntry } from '@/lib/db';
import { buildWatchUrl } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

export function FavoritesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const favorites = useLiveQuery(
    () => open ? db.favorites.orderBy('timestamp').reverse().toArray() : Promise.resolve([] as FavoriteEntry[]),
    [open],
  );
  return (
    <Drawer open={open} onClose={onClose} title="我的收藏" width="max-w-lg">
      {!favorites ? <LoadingState /> : favorites.length === 0 ? (
        <EmptyState variant="plain" title="暂无收藏" description="播放影片时点击收藏即可保存到这里" />
      ) : (
        <ul className="space-y-2">
          {favorites.map(item => <FavoriteItem key={item.id} item={item} onClose={onClose} />)}
        </ul>
      )}
    </Drawer>
  );
}

function FavoriteItem({ item, onClose }: { item: FavoriteEntry; onClose: () => void }) {
  const imageProxyMode = useAppStore(s => s.imageProxyMode);
  const customImageProxy = useAppStore(s => s.customImageProxy);
  const href = buildWatchUrl({
    sourceKey: item.sourceKey,
    vodId: item.vodId,
    title: item.title,
    sourceUrl: item.sourceUrl,
  });
  return (
    <li className="group relative">
      <Link href={href} onClick={onClose} className="flex items-center gap-3 rounded-lg bg-card p-3 pr-12 transition-colors hover:bg-hover">
        {item.pic ? <SmartImage url={item.pic} mode={imageProxyMode} customProxy={customImageProxy} alt="" className="h-14 w-10 shrink-0 rounded bg-chip object-cover" /> : (
          <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-chip text-faint"><Icon name="alert" className="h-4 w-4" /></div>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">{item.title}</span>
      </Link>
      <button type="button" onClick={() => void removeFavorite(item.id)} aria-label={`取消收藏 ${item.title}`} title="取消收藏" className="absolute right-2 top-2 rounded-full p-2 text-faint transition-colors hover:bg-hover hover:text-danger">
        <Icon name="close" className="h-4 w-4" />
      </button>
    </li>
  );
}
