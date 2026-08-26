import { useMemo, type CSSProperties } from 'react';
import { ChevronDown, FolderOpen, LoaderCircle, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { estimateClipSize } from '../../../../shared/capture-presets';
import type { CaptureConfig, CaptureSource, ReplayState, SystemSnapshot } from '../../../../shared/contracts';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatBytes, formatReplayLength } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const durationOptions = [30, 45, 60, 120, 180, 300];
const qualityLabels: Record<number, string> = { 1: 'Economy', 2: 'Balanced', 3: 'Good', 4: 'High', 5: 'Ultra' };

export function CaptureHeader({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const saveReplay = useSystemStore((state) => state.saveReplay);
  const actionPending = useSystemStore((state) => state.actionPending);
  const config = snapshot.capture.config;
  const runtime = snapshot.capture.runtime;
  const configPending = actionPending === 'capture:config';
  const savePending = actionPending === 'capture:save' || runtime.saveQueueDepth > 0;
  const canSave = config.enabled && runtime.segmentCount > 0 && runtime.state !== 'error';
  const sourceOptions = sourceChoices(config.source, snapshot.capture.sources);
  const selectedSourceValue = config.source === 'automatic-game'
    ? 'automatic-game'
    : config.source === 'display'
      ? `display:${config.displayIndex}`
      : config.sourceId ?? 'window:none';
  const supportedFps = useMemo(() => {
    const values: Array<CaptureConfig['fps']> = snapshot.capture.capabilities.maximumFps >= 120 ? [30, 60, 120] : [30, 60];
    if (!values.includes(config.fps)) values.push(config.fps);
    return values.sort((left, right) => left - right);
  }, [config.fps, snapshot.capture.capabilities.maximumFps]);
  const estimate = estimateClipSize(config, runtime.observedBitrateBps || undefined);
  const estimatedBytes = Math.round((estimate.lowerBoundBytes + estimate.upperBoundBytes) / 2);
  const notice = captureNotice(snapshot);
  const changeSource = (value: string) => {
    if (value === 'automatic-game') void setCaptureConfig({ source: 'automatic-game', sourceId: null });
    else if (value.startsWith('display:')) void setCaptureConfig({ source: 'display', sourceId: value, displayIndex: Number(value.split(':')[1] ?? 0) });
    else void setCaptureConfig({ source: 'window', sourceId: value });
  };

  return (
    <section aria-label="Capture controls" className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex min-h-[66px] flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[13px] font-semibold text-foreground">Instant Replay</h2>
            <ReplayStatus enabled={config.enabled} state={runtime.state} source={config.source} ready={canSave} />
          </div>
          <p className="m-0 mt-1 truncate text-[10px] tabular-nums text-muted-foreground">{captureStatusDetail(snapshot, canSave)}</p>
        </div>
        {(runtime.state === 'buffering' || runtime.state === 'saving') && config.enabled ? (
          <div className="hidden w-32 shrink-0 lg:block" role="progressbar" aria-label="Replay buffer" aria-valuemin={0} aria-valuemax={config.replaySeconds} aria-valuenow={Math.floor(runtime.bufferedSeconds)}>
            <div className="h-[3px] overflow-hidden rounded-full bg-input"><span className="block h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${Math.min(100, runtime.bufferedSeconds / config.replaySeconds * 100)}%` }} /></div>
          </div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            {config.enabled ? 'Replay on' : 'Replay off'}
            <Switch checked={config.enabled} disabled={configPending} aria-label="Instant Replay" onCheckedChange={(enabled) => void setCaptureConfig({ enabled })} />
          </label>
          <Button type="button" variant="primary" size="sm" className="h-9 min-w-32" disabled={config.enabled ? !canSave || savePending || configPending : configPending} title={config.enabled && !canSave ? 'A replay will be available after the buffer has footage' : undefined} onClick={() => config.enabled ? void saveReplay() : void setCaptureConfig({ enabled: true })}>
            {savePending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Save className="size-4" />}
            {!config.enabled ? 'Turn on Replay' : savePending ? 'Saving…' : 'Save replay'}
          </Button>
        </div>
      </div>

      <div className="capture-config-grid px-5 py-2.5">
        <CaptureControl label="Source">
          <CompactSelect value={selectedSourceValue} onChange={changeSource} ariaLabel="Capture source" disabled={configPending} options={sourceOptions} />
        </CaptureControl>
        <CaptureControl label="Length">
          <CompactSelect value={String(config.replaySeconds)} onChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })} ariaLabel="Replay length" disabled={configPending} options={durationOptions.map((seconds) => ({ value: String(seconds), label: formatReplayLength(seconds) }))} />
        </CaptureControl>
        <CaptureControl label="Quality">
          <CompactSelect value={String(config.quality)} onChange={(value) => void setCaptureConfig({ quality: Number(value) })} ariaLabel="Capture quality" disabled={configPending} options={[1, 2, 3, 4, 5].map((quality) => ({ value: String(quality), label: qualityLabels[quality]! }))} />
        </CaptureControl>
        <CaptureControl label="Resolution">
          <CompactSelect value={config.resolution} onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })} ariaLabel="Capture resolution" disabled={configPending} options={['720p', '1080p', '1440p', '2160p', 'native'].map((value) => ({ value, label: value === 'native' ? 'Native' : value }))} />
        </CaptureControl>
        <CaptureControl label="Frame rate">
          <CompactSelect value={String(config.fps)} onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })} ariaLabel="Capture frame rate" disabled={configPending} options={supportedFps.map((fps) => ({ value: String(fps), label: `${fps} FPS` }))} />
        </CaptureControl>
        <CaptureMore snapshot={snapshot} configPending={configPending} />
      </div>
      <div className="flex min-h-8 items-center gap-2 border-t border-border px-5 py-1.5 text-[10px] tabular-nums text-muted-foreground"><span>~{formatBytes(estimatedBytes)} per replay</span><span aria-hidden="true">·</span><span>{formatBytes(snapshot.capture.storage.availableBytes)} available</span></div>
      {notice ? <div className={cn('border-t border-border px-5 py-2 text-[11px]', notice.tone === 'danger' ? 'text-destructive' : 'text-warning')} role={notice.tone === 'danger' ? 'alert' : 'status'}>{notice.message}</div> : null}
    </section>
  );
}

function CaptureMore({ snapshot, configPending }: { snapshot: SystemSnapshot; configPending: boolean }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const actionPending = useSystemStore((state) => state.actionPending);
  const config = snapshot.capture.config;
  const codecOptions = (snapshot.capture.capabilities.codecs.length > 0 ? snapshot.capture.capabilities.codecs : [config.codec]).map((value) => ({ value, label: value === 'h264' ? 'H.264' : value === 'hevc' ? 'HEVC' : 'AV1' }));
  const encoderOptions = encoderChoices(snapshot);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="mt-[18px] h-9 justify-between px-2.5"><span className="flex items-center gap-1.5"><SlidersHorizontal className="size-3.5" /> More</span><ChevronDown className="size-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[520px] max-w-[calc(100vw-110px)] p-4">
        <div className="grid grid-cols-2 gap-3">
          <CaptureControl label="Encoder"><CompactSelect value={config.encoder} onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })} ariaLabel="Encoder" disabled={configPending} options={encoderOptions} /></CaptureControl>
          <CaptureControl label="Codec"><CompactSelect value={config.codec} onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })} ariaLabel="Codec" disabled={configPending} options={codecOptions} /></CaptureControl>
          <CaptureControl label="Save shortcut"><ShortcutRecorderButton value={config.hotkey} disabled={configPending} label="Save replay shortcut" className="h-9 px-2.5 text-[12px]" onValueChange={(hotkey) => void setCaptureConfig({ hotkey })} /></CaptureControl>
          <div className="flex items-end"><Button type="button" variant="secondary" size="sm" className="h-9" disabled={actionPending === 'capture:sources'} onClick={() => void refreshCaptureSources()}><RefreshCw className={cn('size-3.5', actionPending === 'capture:sources' && 'animate-spin motion-reduce:animate-none')} /> Refresh sources</Button></div>
        </div>

        <div className="mt-4 border-y border-border">
          <CaptureToggle label="Game audio" color="var(--channel-game)" checked={config.includeSystemAudio} disabled={configPending} onChange={(checked) => void setCaptureConfig({ includeSystemAudio: checked })} />
          <CaptureToggle label="Microphone" color="var(--channel-microphone)" checked={config.includeMic} disabled={configPending} onChange={(checked) => void setCaptureConfig({ includeMic: checked })} />
          <CaptureToggle label="Capture cursor" checked={config.includeCursor} disabled={configPending} onChange={(checked) => void setCaptureConfig({ includeCursor: checked })} />
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0"><div className="text-[11px] font-medium text-foreground">Clip folder</div><div className="mt-1 truncate text-[10px] text-muted-foreground" title={snapshot.capture.storage.clipsDirectory}>{snapshot.capture.storage.clipsDirectory || 'Windows Videos\\Switchboard\\Clips'}</div></div>
          <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => void openClipsDirectory()}><FolderOpen className="size-3.5" /> Open</Button><Button type="button" variant="secondary" size="sm" onClick={() => void chooseClipDirectory()}>Change</Button></div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CaptureControl({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0"><span className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function CompactSelect({ value, options, onChange, ariaLabel, disabled }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={ariaLabel} className="h-9 text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function CaptureToggle({ label, color, checked, disabled, onChange }: { label: string; color?: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex h-11 items-center justify-between gap-3 border-b border-border px-1 last:border-b-0" style={color ? { '--control-accent': color } as CSSProperties : undefined}><span className="flex items-center gap-2 text-[11px] font-medium text-foreground">{color ? <span className="h-4 w-[3px] rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" /> : null}{label}</span><Switch checked={checked} disabled={disabled} aria-label={label} onCheckedChange={onChange} /></label>;
}

function encoderChoices(snapshot: SystemSnapshot): Array<{ value: string; label: string }> {
  const available = snapshot.capture.capabilities.encoders.join(' ').toLocaleLowerCase();
  const values: Array<{ value: CaptureConfig['encoder']; label: string; match?: string }> = [
    { value: 'auto', label: 'Automatic' },
    { value: 'nvenc', label: 'NVIDIA NVENC', match: 'nvenc' },
    { value: 'amf', label: 'AMD AMF', match: 'amf' },
    { value: 'qsv', label: 'Intel Quick Sync', match: 'qsv' },
    { value: 'software', label: 'Software', match: 'libx' },
  ];
  return values.filter((option) => !option.match || available.includes(option.match) || option.value === snapshot.capture.config.encoder).map(({ value, label }) => ({ value, label }));
}

function sourceChoices(type: CaptureConfig['source'], sources: CaptureSource[]): Array<{ value: string; label: string }> {
  const relevant = sources.filter((source) => source.type !== 'automatic-game').map((source) => ({ value: source.id, label: source.name }));
  if (type === 'window' && !relevant.some((source) => source.value.startsWith('window:'))) relevant.push({ value: 'window:none', label: 'Select a window' });
  return [{ value: 'automatic-game', label: 'Automatic game' }, ...relevant];
}

function ReplayStatus({ enabled, state, source, ready }: { enabled: boolean; state: ReplayState; source: CaptureConfig['source']; ready: boolean }) {
  const label = !enabled ? 'Replay is off' : state === 'error' ? 'Replay needs attention' : ready ? 'Ready' : state === 'waiting' ? source === 'automatic-game' ? 'Waiting for a game' : 'Waiting for source' : state === 'starting' ? 'Starting' : state === 'recovering' ? 'Recovering' : state === 'saving' ? 'Saving replay' : 'Building buffer';
  const tone = state === 'error' && enabled ? 'bg-destructive text-destructive' : ready ? 'bg-success text-success' : state === 'starting' || state === 'recovering' ? 'bg-warning text-warning' : 'text-muted-foreground';
  return <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground" role="status"><span className={cn('size-1.5 rounded-full border border-current', tone)} aria-hidden="true" />{label}</span>;
}

function captureStatusDetail(snapshot: SystemSnapshot, ready: boolean): string {
  const { config, runtime } = snapshot.capture;
  const settings = `${formatReplayLength(config.replaySeconds)} replay · ${config.resolution === 'native' ? 'Native' : config.resolution} · ${config.fps} FPS · ${qualityLabels[config.quality]}`;
  if (!config.enabled) return settings;
  if (runtime.state === 'waiting') return config.source === 'automatic-game' ? 'Instant Replay will start when a game is detected' : 'Waiting for the selected source';
  if (runtime.state === 'starting') return 'Starting Instant Replay';
  if (runtime.state === 'recovering') return 'Restoring Instant Replay';
  if (runtime.state === 'error') return settings;
  const source = runtime.activeSource?.name?.trim();
  if (ready) return source ? `${source} · Ready to save the last ${formatReplayLength(config.replaySeconds)}` : `Ready to save the last ${formatReplayLength(config.replaySeconds)}`;
  if (runtime.state === 'saving') return source ? `${source} · Saving replay` : 'Saving replay';
  return source ? `${source} · ${settings}` : settings;
}

function captureNotice(snapshot: SystemSnapshot): { message: string; tone: 'danger' | 'warning' } | null {
  if (snapshot.capture.storage.criticalSpace) return { message: 'Storage is too low to save replays. Choose another clip folder.', tone: 'danger' };
  if (snapshot.capture.runtime.error) return { message: "Instant Replay couldn't start. Turn it off and on, or check Diagnostics.", tone: 'danger' };
  if (snapshot.capture.storage.lowSpace) return { message: 'Storage is running low. Choose another clip folder soon.', tone: 'warning' };
  if (snapshot.capture.runtime.warning) return { message: 'Instant Replay is recovering. Check Diagnostics if this continues.', tone: 'warning' };
  return null;
}
