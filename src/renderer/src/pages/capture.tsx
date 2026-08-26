import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock3,
  FolderOpen,
  Grid2X2,
  Keyboard,
  List,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { estimateClipSize } from '../../../shared/capture-presets';
import type { CaptureConfig, CaptureSource, Clip, ReplayState, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration, formatRelativeTime } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const durationOptions = [30, 45, 60, 120, 180, 300];
type ClipLayout = 'grid' | 'list';
type ClipSort = 'newest' | 'oldest' | 'largest' | 'smallest' | 'longest';

export function CapturePage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const saveReplay = useSystemStore((state) => state.saveReplay);
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const revealClip = useSystemStore((state) => state.revealClip);
  const deleteClip = useSystemStore((state) => state.deleteClip);
  const renameClip = useSystemStore((state) => state.renameClip);
  const actionPending = useSystemStore((state) => state.actionPending);
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const [sort, setSort] = useState<ClipSort>('newest');
  const [layout, setLayout] = useState<ClipLayout>('grid');
  const [playerClip, setPlayerClip] = useState<Clip | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [renameTarget, setRenameTarget] = useState<Clip | null>(null);
  const [hotkeyDraft, setHotkeyDraft] = useState(snapshot.capture.config.hotkey);
  const [toast, setToast] = useState<string | null>(null);
  const previousSavedClipId = useRef(snapshot.clips[0]?.id);
  const config = snapshot.capture.config;
  const runtime = snapshot.capture.runtime;
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'capture');
  const configPending = actionPending === 'capture:config';
  const savePending = actionPending === 'capture:save' || runtime.saveQueueDepth > 0;

  useEffect(() => setHotkeyDraft(config.hotkey), [config.hotkey]);
  useEffect(() => {
    const latest = snapshot.clips[0];
    if (!latest || latest.id === previousSavedClipId.current) return;
    previousSavedClipId.current = latest.id;
    if (!runtime.lastSavedAt || Math.abs(latest.createdAt - new Date(runtime.lastSavedAt).getTime()) > 5_000) return;
    setToast(`Replay saved · ${latest.game ?? 'Desktop'} · ${formatDuration(latest.durationMs / 1_000)} · ${formatBytes(latest.fileSize)}`);
    const timeout = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [runtime.lastSavedAt, snapshot.clips]);

  const games = useMemo(() => [...new Set(snapshot.clips.map((clip) => clip.game).filter((game): game is string => Boolean(game)))]
    .sort((left, right) => left.localeCompare(right)), [snapshot.clips]);
  const clips = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return snapshot.clips
      .filter((clip) => {
        const matchesGame = gameFilter === 'all' || clip.game === gameFilter;
        const matchesQuery = normalizedQuery.length === 0
          || clip.name.toLocaleLowerCase().includes(normalizedQuery)
          || (clip.game ?? '').toLocaleLowerCase().includes(normalizedQuery);
        return matchesGame && matchesQuery;
      })
      .sort((left, right) => {
        if (sort === 'oldest') return left.createdAt - right.createdAt;
        if (sort === 'largest') return right.fileSize - left.fileSize;
        if (sort === 'smallest') return left.fileSize - right.fileSize;
        if (sort === 'longest') return right.durationMs - left.durationMs;
        return right.createdAt - left.createdAt;
      });
  }, [gameFilter, query, snapshot.clips, sort]);

  const estimate = estimateClipSize(config, runtime.observedBitrateBps || undefined);
  const sourceOptions = sourceChoices(config.source, snapshot.capture.sources);
  const selectedSourceValue = config.source === 'automatic-game'
    ? 'automatic-game'
    : config.source === 'display'
      ? `display:${config.displayIndex}`
      : config.sourceId ?? 'window:none';
  const hasActiveFilters = query.trim().length > 0 || gameFilter !== 'all';
  const canSave = config.enabled && runtime.segmentCount > 0 && runtime.state !== 'error';
  const supportedFps = runtime.state === 'stopped'
    ? [30, 60]
    : snapshot.capture.capabilities.maximumFps >= 120 ? [30, 60, 120] : [30, 60];
  if (!supportedFps.includes(config.fps)) supportedFps.push(config.fps);

  const changeSource = (value: string) => {
    if (value === 'automatic-game') void setCaptureConfig({ source: 'automatic-game', sourceId: null });
    else if (value.startsWith('display:')) {
      void setCaptureConfig({ source: 'display', sourceId: value, displayIndex: Number(value.split(':')[1] ?? 0) });
    } else void setCaptureConfig({ source: 'window', sourceId: value });
  };

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <section aria-labelledby="capture-heading" className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id="capture-heading" className="m-0 text-[13px] font-semibold text-foreground">Instant Replay</h2>
              <ReplayStatus state={runtime.state} source={config.source} />
            </div>
            <p className="mt-0.5 truncate text-[10px] tabular-nums text-muted-foreground">{captureStatusDetail(snapshot)}</p>
          </div>
          {runtime.state === 'buffering' || runtime.state === 'saving' ? (
            <div className="hidden w-32 shrink-0 lg:block" role="progressbar" aria-label="Replay buffer" aria-valuemin={0} aria-valuemax={config.replaySeconds} aria-valuenow={Math.floor(runtime.bufferedSeconds)}>
              <div className="h-[3px] overflow-hidden rounded-full bg-input">
                <span className="block h-full rounded-full bg-success transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${Math.min(100, runtime.bufferedSeconds / config.replaySeconds * 100)}%` }} />
              </div>
            </div>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              Replay
              <Switch checked={config.enabled} disabled={configPending} aria-label="Instant Replay" onCheckedChange={(checked) => void setCaptureConfig({ enabled: checked })} />
            </label>
            <Button variant="primary" size="sm" disabled={!canSave || savePending} onClick={() => void saveReplay()}>
              {savePending ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Save className="size-3.5" />}
              {savePending ? `Saving${runtime.saveQueueDepth > 1 ? ` (${runtime.saveQueueDepth})` : ''}…` : 'Save replay'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-6">
          <ConfigCell label="Source">
            <SelectField value={selectedSourceValue} onChange={changeSource} ariaLabel="Capture source" disabled={configPending} options={sourceOptions} />
          </ConfigCell>
          <ConfigCell label="Length">
            <SelectField value={String(config.replaySeconds)} onChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })} ariaLabel="Replay length" disabled={configPending} options={durationOptions.map((seconds) => ({ value: String(seconds), label: formatDuration(seconds) }))} />
          </ConfigCell>
          <ConfigCell label="Quality">
            <SelectField value={String(config.quality)} onChange={(value) => void setCaptureConfig({ quality: Number(value) })} ariaLabel="Capture quality" disabled={configPending} options={[1, 2, 3, 4, 5].map((quality) => ({ value: String(quality), label: `${quality} / 5` }))} />
          </ConfigCell>
          <ConfigCell label="Resolution">
            <SelectField value={config.resolution} onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })} ariaLabel="Capture resolution" disabled={configPending} options={['720p', '1080p', '1440p', '2160p', 'native'].map((value) => ({ value, label: value === 'native' ? 'Native' : value }))} />
          </ConfigCell>
          <ConfigCell label="Frame rate">
            <SelectField value={String(config.fps)} onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })} ariaLabel="Capture frame rate" disabled={configPending} options={supportedFps.sort((left, right) => left - right).map((fps) => ({ value: String(fps), label: `${fps} FPS` }))} />
          </ConfigCell>
          <div className="flex min-h-[52px] items-center border-b border-r border-border px-3 py-2">
            <Button type="button" variant="ghost" size="sm" className="w-full justify-between px-2" aria-expanded={showMore} aria-controls="capture-more" onClick={() => setShowMore((visible) => !visible)}>
              <span className="flex items-center gap-2"><SlidersHorizontal className="size-3.5" /> More</span>
              <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', showMore && 'rotate-180')} />
            </Button>
          </div>
        </div>

        <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-1.5 text-[10px] tabular-nums text-muted-foreground">
          <span>Estimated clip {formatEstimate(estimate.lowerBoundBytes, estimate.upperBoundBytes)}</span>
          <span aria-hidden="true">·</span>
          <span>Replay buffer {formatEstimate(estimate.lowerBoundBytes, estimate.upperBoundBytes)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatBytes(snapshot.capture.storage.availableBytes)} available</span>
          {estimate.source === 'observed' ? <span className="text-foreground">Based on current capture</span> : null}
        </div>

        {showMore ? (
          <div id="capture-more" className="grid gap-x-7 gap-y-4 border-t border-border px-5 py-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(440px,1.2fr)]">
            <div className="grid grid-cols-2 gap-4">
              <ConfigField label="Codec"><SelectField value={config.codec} onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })} ariaLabel="Codec" disabled={configPending} options={[{ value: 'h264', label: 'H.264' }, { value: 'hevc', label: 'HEVC' }, { value: 'av1', label: 'AV1' }]} /></ConfigField>
              <ConfigField label="Encoder"><SelectField value={config.encoder} onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })} ariaLabel="Encoder" disabled={configPending} options={[{ value: 'auto', label: 'Automatic' }, { value: 'nvenc', label: 'NVIDIA NVENC' }, { value: 'amf', label: 'AMD AMF' }, { value: 'qsv', label: 'Intel Quick Sync' }, { value: 'software', label: 'Software' }]} /></ConfigField>
              <ConfigField label="Save shortcut">
                <div className="relative">
                  <Keyboard className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input value={hotkeyDraft} onChange={(event) => setHotkeyDraft(event.target.value)} onBlur={() => { const next = hotkeyDraft.trim(); if (next && next !== config.hotkey) void setCaptureConfig({ hotkey: next }); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label="Save replay shortcut" className="h-8 w-full rounded-md border border-input bg-secondary pl-8 pr-2.5 text-xs tabular-nums text-foreground" />
                </div>
              </ConfigField>
              <div className="flex items-end">
                <Button type="button" variant="secondary" size="sm" disabled={actionPending === 'capture:sources'} onClick={() => void refreshCaptureSources()}>
                  <RefreshCw className={cn('size-3.5', actionPending === 'capture:sources' && 'animate-spin motion-reduce:animate-none')} /> Refresh sources
                </Button>
              </div>
              <p className="col-span-2 m-0 text-[10px] leading-4 text-muted-foreground">Window and automatic capture use Windows Graphics Capture. Exclusive-fullscreen graphics hooks are not implemented.</p>
            </div>
            <div>
              <div className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <CompactToggle label="System audio" checked={config.includeSystemAudio} disabled={configPending} onCheckedChange={(checked) => void setCaptureConfig({ includeSystemAudio: checked })} />
                <CompactToggle label="Microphone track" checked={config.includeMic} disabled={configPending} onCheckedChange={(checked) => void setCaptureConfig({ includeMic: checked })} />
                <CompactToggle label="Capture cursor" checked={config.includeCursor} disabled={configPending} onCheckedChange={(checked) => void setCaptureConfig({ includeCursor: checked })} />
              </div>
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-border pt-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-foreground">Clip storage</div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground" title={snapshot.capture.storage.clipsDirectory}>{snapshot.capture.storage.clipsDirectory || 'Resolving Videos folder…'}</div>
                  <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">{formatBytes(snapshot.capture.storage.clipsBytes)} in clips · {formatBytes(snapshot.capture.storage.availableBytes)} available</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void openClipsDirectory()}><FolderOpen className="size-3.5" /> Open</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void chooseClipDirectory()}>Change</Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {runtime.error || snapshot.capture.storage.warning ? (
          <div className="border-t border-border px-5 py-2 text-[11px] text-destructive" role="alert">{runtime.error ?? snapshot.capture.storage.warning}</div>
        ) : runtime.warning ? (
          <div className="border-t border-border px-5 py-2 text-[11px] text-warning" role="status">{runtime.warning}</div>
        ) : null}
      </section>

      <section aria-labelledby="clips-heading" className="flex-1 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="min-w-36">
            <div className="flex items-baseline gap-2"><h2 id="clips-heading" className="m-0 text-[13px] font-semibold text-foreground">Clips</h2><span className="text-[10px] tabular-nums text-muted-foreground" aria-live="polite">{hasActiveFilters ? `${clips.length} of ${snapshot.clips.length}` : snapshot.clips.length}</span></div>
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{formatBytes(clips.reduce((total, clip) => total + clip.fileSize, 0))} shown</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-end">
            <label className="relative min-w-[220px] flex-1 xl:max-w-sm"><span className="sr-only">Search clips</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clips" className="h-8 w-full rounded-md border border-input bg-secondary pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground" /></label>
            <SelectField value={gameFilter} onChange={setGameFilter} ariaLabel="Filter clips by game" className="min-w-32" options={[{ value: 'all', label: 'All games' }, ...games.map((game) => ({ value: game, label: game }))]} />
            <SelectField value={sort} onChange={(value) => setSort(value as ClipSort)} ariaLabel="Sort clips" className="min-w-28" options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'largest', label: 'Largest' }, { value: 'smallest', label: 'Smallest' }, { value: 'longest', label: 'Longest' }]} />
            <div className="flex h-8 overflow-hidden rounded-md border border-input bg-secondary" role="group" aria-label="Clip layout">
              <button type="button" className={cn('grid w-8 place-items-center text-muted-foreground hover:text-foreground', layout === 'grid' && 'bg-accent text-foreground')} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 className="size-3.5" /></button>
              <button type="button" className={cn('grid w-8 place-items-center border-l border-input text-muted-foreground hover:text-foreground', layout === 'list' && 'bg-accent text-foreground')} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List className="size-3.5" /></button>
            </div>
          </div>
        </div>

        {clips.length > 0 ? (
          <ul className={cn('m-0 mt-4 list-none p-0', layout === 'grid' ? 'grid grid-cols-2 gap-3 min-[1320px]:grid-cols-3 min-[1720px]:grid-cols-4' : 'divide-y divide-border border-y border-border')}>
            {clips.map((clip) => <ClipItem key={clip.id} clip={clip} layout={layout} onPlay={() => setPlayerClip(clip)} onReveal={() => void revealClip(clip.id)} onRename={() => setRenameTarget(clip)} onDelete={() => setDeleteTarget(clip)} />)}
          </ul>
        ) : (
          <div className="mt-4 grid min-h-52 place-items-center border-y border-border py-10 text-center"><div><Video className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} /><h3 className="mt-3 text-[13px] font-semibold text-foreground">{snapshot.clips.length === 0 ? 'No clips saved' : 'No matching clips'}</h3><p className="mt-1 text-[11px] text-muted-foreground">{snapshot.clips.length === 0 ? 'Buffer a replay, then save it to start the library.' : 'Adjust the search or game filter.'}</p>{hasActiveFilters ? <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => { setQuery(''); setGameFilter('all'); }}>Clear filters</Button> : null}</div></div>
        )}
      </section>

      {toast ? <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-border bg-popover px-4 py-3 text-[11px] text-foreground shadow-lg" role="status" aria-live="polite">{toast}</div> : null}
      {playerClip ? <ClipPlayer clip={playerClip} onClose={() => setPlayerClip(null)} onReveal={() => void revealClip(playerClip.id)} onDelete={() => { setPlayerClip(null); setDeleteTarget(playerClip); }} /> : null}
      {deleteTarget ? <DeleteDialog clip={deleteTarget} pending={actionPending === `clip:${deleteTarget.id}:delete`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void deleteClip(deleteTarget.id).then(() => setDeleteTarget(null))} /> : null}
      {renameTarget ? <RenameDialog clip={renameTarget} pending={actionPending === `clip:${renameTarget.id}:rename`} onCancel={() => setRenameTarget(null)} onConfirm={(name) => void renameClip({ id: renameTarget.id, name }).then(() => setRenameTarget(null))} /> : null}
    </div>
  );
}

function SelectField({ value, options, onChange, ariaLabel, disabled, className }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string; disabled?: boolean; className?: string }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={ariaLabel} className={cn('h-6 w-full min-w-0 border-0 bg-transparent px-0 text-[11px]', className)}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function ConfigCell({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 border-b border-r border-border px-3 py-2"><div className="text-[9px] font-medium text-muted-foreground">{label}</div><div className="mt-0.5 min-w-0">{children}</div></div>; }
function ConfigField({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0"><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{label}</span>{children}</div>; }
function CompactToggle({ label, checked, disabled, onCheckedChange }: { label: string; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void }) { return <label className="flex min-h-11 items-center justify-between gap-3 px-3 text-[11px] font-medium text-foreground">{label}<Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} /></label>; }

function ReplayStatus({ state, source }: { state: ReplayState; source: CaptureConfig['source'] }) {
  const labels: Record<ReplayState, string> = { stopped: 'Off', starting: 'Starting', waiting: source === 'automatic-game' ? 'Waiting for a game' : 'Waiting for source', buffering: 'Buffering', saving: 'Saving replay', recovering: 'Recovering', error: 'Needs attention' };
  return <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground" role="status"><span className={cn('size-1.5 rounded-full border border-current', state === 'buffering' || state === 'saving' ? 'bg-success text-success' : state === 'starting' || state === 'recovering' ? 'bg-warning text-warning' : state === 'error' ? 'bg-destructive text-destructive' : 'text-muted-foreground')} aria-hidden="true" />{labels[state]}</span>;
}

function ClipItem({ clip, layout, onPlay, onReveal, onRename, onDelete }: { clip: Clip; layout: ClipLayout; onPlay: () => void; onReveal: () => void; onRename: () => void; onDelete: () => void }) {
  const thumbnail = `switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`;
  if (layout === 'list') return <li className="group flex min-w-0 items-center gap-3 py-2"><button type="button" onClick={onPlay} className="relative grid aspect-video h-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-[#090b0e]" aria-label={`Play ${clip.name}`}>{clip.thumbnailPath ? <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover" /> : <Video className="size-4 text-muted-foreground" />}<span className="absolute bottom-1 right-1 rounded-sm border border-border bg-background/95 px-1 text-[9px] tabular-nums">{formatDuration(clip.durationMs / 1_000)}</span></button><button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{clip.name}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{clip.game ?? 'Desktop'} · {formatRelativeTime(clip.createdAt)} · {formatBytes(clip.fileSize)}</span></button><ClipMenu clip={clip} onPlay={onPlay} onReveal={onReveal} onRename={onRename} onDelete={onDelete} /></li>;
  return <li className="min-w-0"><article className="group overflow-hidden rounded-lg border border-border bg-card hover:border-[#39414c]"><button type="button" onClick={onPlay} onDoubleClick={onPlay} className="relative grid aspect-video w-full place-items-center overflow-hidden border-b border-border bg-[#090b0e]" aria-label={`Play ${clip.name}`}>{clip.thumbnailPath ? <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover transition-transform duration-150 group-hover:scale-[1.015] motion-reduce:transition-none" /> : <span className="grid justify-items-center gap-2 text-[10px] text-muted-foreground"><Video className="size-5" />Thumbnail pending</span>}<span className="absolute bottom-2 right-2 rounded-sm border border-border bg-background/95 px-1.5 py-0.5 text-[9px] tabular-nums">{formatDuration(clip.durationMs / 1_000)}</span></button><div className="flex min-w-0 items-start gap-2 p-2.5"><button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{clip.name}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{clip.game ?? 'Desktop'}</span><span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">{formatRelativeTime(clip.createdAt)} · {formatBytes(clip.fileSize)}</span></button><ClipMenu clip={clip} onPlay={onPlay} onReveal={onReveal} onRename={onRename} onDelete={onDelete} /></div></article></li>;
}

function ClipMenu({ clip, onPlay, onReveal, onRename, onDelete }: { clip: Clip; onPlay: () => void; onReveal: () => void; onRename: () => void; onDelete: () => void }) {
  return <details className="relative shrink-0"><summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none" aria-label={`Actions for ${clip.name}`}><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-border bg-popover p-1 shadow-lg"><MenuButton icon={Play} label="Play" onClick={onPlay} /><MenuButton icon={Pencil} label="Rename" onClick={onRename} /><MenuButton icon={FolderOpen} label="Show in folder" onClick={onReveal} /><MenuButton icon={Trash2} label="Delete" danger onClick={onDelete} /></div></details>;
}

function MenuButton({ icon: Icon, label, onClick, danger }: { icon: typeof Play; label: string; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={(event) => { onClick(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] hover:bg-accent', danger ? 'text-destructive' : 'text-foreground')}><Icon className="size-3.5" />{label}</button>; }

function ClipPlayer({ clip, onClose, onReveal, onDelete }: { clip: Clip; onClose: () => void; onReveal: () => void; onDelete: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-labelledby="clip-player-title"><div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-lg"><div className="flex min-h-11 items-center gap-3 border-b border-border px-3"><div className="min-w-0 flex-1"><h3 id="clip-player-title" className="truncate text-xs font-semibold">{clip.name}</h3><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{clip.game ?? 'Desktop'} · {formatDuration(clip.durationMs / 1_000)} · {clip.width}×{clip.height} · {Math.round(clip.fps)} FPS</p></div><Button type="button" variant="ghost" size="icon" aria-label="Show clip in folder" onClick={onReveal}><FolderOpen className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Delete clip" onClick={onDelete}><Trash2 className="size-4" /></Button><Button ref={closeRef} type="button" variant="ghost" size="icon" aria-label="Close player" onClick={onClose}><X className="size-4" /></Button></div><video src={`switchboard-media://clip/${encodeURIComponent(clip.id)}`} controls autoPlay className="min-h-0 w-full bg-black" /></div></div>;
}

function DeleteDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-labelledby="delete-clip-title"><div className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-lg"><h3 id="delete-clip-title" className="m-0 text-[13px] font-semibold">Delete clip?</h3><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{clip.name} will be moved to the Recycle Bin.</p><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>{pending ? 'Deleting…' : 'Delete clip'}</Button></div></div></div>; }

function RenameDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: (name: string) => void }) { const [name, setName] = useState(clip.name); return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-labelledby="rename-clip-title"><form className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-lg" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}><h3 id="rename-clip-title" className="m-0 text-[13px] font-semibold">Rename clip</h3><label className="mt-3 block text-[10px] text-muted-foreground">Name<input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-input bg-secondary px-2.5 text-xs text-foreground" /></label><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" size="sm" disabled={pending || !name.trim()}>{pending ? 'Renaming…' : 'Rename'}</Button></div></form></div>; }

function sourceChoices(type: CaptureConfig['source'], sources: CaptureSource[]): Array<{ value: string; label: string }> {
  const automatic = [{ value: 'automatic-game', label: 'Automatic game' }];
  const relevant = sources.filter((source) => source.type !== 'automatic-game').map((source) => ({ value: source.id, label: source.name }));
  if (type === 'window' && !relevant.some((source) => source.value.startsWith('window:'))) relevant.push({ value: 'window:none', label: 'Select a window' });
  return [...automatic, ...relevant];
}

function formatEstimate(lower: number, upper: number): string { return `~${formatBytes(lower)} to ${formatBytes(upper)}`; }

function captureStatusDetail(snapshot: SystemSnapshot): string {
  const { config, runtime } = snapshot.capture;
  if (runtime.state === 'buffering' || runtime.state === 'saving') return `${Math.floor(runtime.bufferedSeconds)} / ${config.replaySeconds} sec · ${formatBytes(runtime.replayCacheBytes)} · ${runtime.encoderLabel}`;
  if (runtime.state === 'waiting') return config.source === 'automatic-game'
    ? 'Automatic capture stays off until a game is detected'
    : 'Replay will resume when the selected source becomes available';
  if (runtime.state === 'recovering') return 'Capture.Host is recovering after an encoder or source interruption';
  if (runtime.state === 'starting') return 'Starting Capture.Host and probing available encoders';
  if (runtime.state === 'error') return runtime.error ?? 'Capture needs attention';
  return snapshot.engines.find((engine) => engine.kind === 'capture')?.state === 'starting' ? 'Starting isolated Capture.Host' : 'No capture process is running';
}
