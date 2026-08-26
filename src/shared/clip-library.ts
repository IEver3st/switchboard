import type { Clip } from './contracts';

export type ClipSort = 'newest' | 'oldest' | 'largest' | 'smallest' | 'longest' | 'shortest';
export type ClipDateFilter = 'any' | 'today' | 'yesterday' | 'last-7-days' | 'last-30-days';

export interface ClipLibraryQuery {
  query: string;
  game: string;
  date: ClipDateFilter;
  favoritesOnly: boolean;
  sort: ClipSort;
  now?: number;
}

const generatedCaptureName = /^(.*?)[_ -]\d{4}-\d{2}-\d{2}(?:[_ -]\d{2}[-_:]\d{2}[-_:]\d{2})?(?:_\d+)?$/i;
const desktopSourceName = /^(?:display|desktop|screen)\s*\d*$/i;

export function inferClipGame(name: string): string | undefined {
  const match = generatedCaptureName.exec(name.trim());
  const rawPrefix = match?.[1]?.replace(/[_-]+/g, ' ').trim();
  if (!rawPrefix || desktopSourceName.test(rawPrefix)) return undefined;
  return rawPrefix;
}

export function clipGameLabel(clip: Pick<Clip, 'game' | 'path' | 'name'>): string {
  const explicit = clip.game?.trim();
  if (explicit) return explicit;
  const fileName = clip.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? clip.name;
  return inferClipGame(fileName) ?? 'Desktop';
}

export function createDefaultClipTitle(game?: string | null): string {
  const label = game?.trim() || 'Desktop';
  return `${label} clip`;
}

export function isGeneratedClipTitle(name: string): boolean {
  return generatedCaptureName.test(name.trim());
}

export function normalizeClipRecord<T extends Clip>(clip: T): T {
  if (clip.titleEdited || !isGeneratedClipTitle(clip.name)) return clip;
  return {
    ...clip,
    name: createDefaultClipTitle(clipGameLabel(clip)),
    titleEdited: false,
  };
}

export function filterAndSortClips(clips: readonly Clip[], query: ClipLibraryQuery): Clip[] {
  const normalizedQuery = query.query.trim().toLocaleLowerCase();
  const now = query.now ?? Date.now();
  return clips
    .filter((clip) => {
      const game = clipGameLabel(clip);
      if (query.favoritesOnly && !clip.favorite) return false;
      if (query.game !== 'all' && game !== query.game) return false;
      if (!matchesClipDate(clip.createdAt, query.date, now)) return false;
      if (!normalizedQuery) return true;
      const date = new Date(clip.createdAt);
      const searchable = [
        clip.name,
        game,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        date.toDateString(),
      ].join(' ').toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (query.sort === 'oldest') return left.createdAt - right.createdAt;
      if (query.sort === 'largest') return right.fileSize - left.fileSize;
      if (query.sort === 'smallest') return left.fileSize - right.fileSize;
      if (query.sort === 'longest') return right.durationMs - left.durationMs;
      if (query.sort === 'shortest') return left.durationMs - right.durationMs;
      return right.createdAt - left.createdAt;
    });
}

function matchesClipDate(createdAt: number, filter: ClipDateFilter, now: number): boolean {
  if (filter === 'any') return true;
  const currentStart = startOfDay(now);
  const clipStart = startOfDay(createdAt);
  const daysAgo = Math.round((currentStart - clipStart) / 86_400_000);
  if (filter === 'today') return daysAgo === 0;
  if (filter === 'yesterday') return daysAgo === 1;
  if (filter === 'last-7-days') return daysAgo >= 0 && daysAgo < 7;
  return daysAgo >= 0 && daysAgo < 30;
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
