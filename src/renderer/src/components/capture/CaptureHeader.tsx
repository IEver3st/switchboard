import { useMemo, useState, type CSSProperties } from 'react';
import { AppWindow, ChevronDown, FolderOpen, Gamepad2, ImageOff, Monitor, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { estimateClipSize } from '../../../../shared/capture-presets';
import type { CaptureConfig, CaptureSource, SystemSnapshot } from '../../../../shared/contracts';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { formatBytes, formatReplayLength } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';
import { ClipLibraryToolbar } from './ClipLibraryToolbar';
import type { ClipLibraryControls } from './clip-library-model';

const durationOptions = [30, 45, 60, 120, 180, 300];
const qualityLabels: Record<number, string> = { 1: 'Economy', 2: 'Balanced', 3: 'Good', 4: 'High', 5: 'Ultra' };

export function CaptureHeader({ snapshot, controls }: { snapshot: SystemSnapshot; controls: ClipLibraryControls }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const config = snapshot.capture.config;
  const runtime = snapshot.capture.runtime;
  const sourceOptions = sourceChoices(config, snapshot.capture.sources);
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
  const status = captureStatus(snapshot);
  const changeSource = (value: string) => {
    if (value === 'automatic-game') void setCaptureConfig({ source: 'automatic-game', sourceId: null });
    else if (value.startsWith('display:')) void setCaptureConfig({ source: 'display', sourceId: value, displayIndex: Number(value.split(':')[1] ?? 0) });
    else void setCaptureConfig({ source: 'window', sourceId: value });
  };

  return (
    <section aria-label="Capture controls" className="capture-toolbar sticky top-0 z-20 border-b border-border">
      <div className="capture-config-grid">
        <CaptureControl label="Source" status={<CaptureStatus status={status} />}>
          <CaptureSourcePicker
            value={selectedSourceValue}
            options={sourceOptions}
            active={config.enabled}
            onChange={changeSource}
          />
        </CaptureControl>
        <CaptureControl label="Length">
          <CompactSelect value={String(config.replaySeconds)} onChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })} ariaLabel="Replay length" options={durationOptions.map((seconds) => ({ value: String(seconds), label: formatReplayLength(seconds) }))} />
        </CaptureControl>
        <CaptureControl label="Quality">
          <CompactSelect value={String(config.quality)} onChange={(value) => void setCaptureConfig({ quality: Number(value) })} ariaLabel="Capture quality" options={[1, 2, 3, 4, 5].map((quality) => ({ value: String(quality), label: qualityLabels[quality]! }))} />
        </CaptureControl>
        <CaptureControl label="Resolution">
          <CompactSelect value={config.resolution} onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })} ariaLabel="Capture resolution" options={['720p', '1080p', '1440p', '2160p', 'native'].map((value) => ({ value, label: value === 'native' ? 'Native' : value }))} />
        </CaptureControl>
        <CaptureControl label="Frame rate">
          <CompactSelect value={String(config.fps)} onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })} ariaLabel="Capture frame rate" options={supportedFps.map((fps) => ({ value: String(fps), label: `${fps} FPS` }))} />
        </CaptureControl>
        <CaptureMore snapshot={snapshot} />
      </div>
      <Separator className="capture-toolbar__separator" />
      <div className="capture-toolbar__meta text-[10px] tabular-nums text-muted-foreground">
        <span>~{formatBytes(estimatedBytes)} per replay</span>
        <span aria-hidden="true">·</span>
        <span>{formatBytes(snapshot.capture.storage.availableBytes)} available</span>
        <span className="ml-auto hidden text-text-description min-[940px]:inline">Encoder · {runtime.encoderLabel || 'Pending'}</span>
      </div>
      <ClipLibraryToolbar controls={controls} />
      {notice ? <div className={cn('capture-toolbar__notice border-t border-border py-2 text-[11px]', notice.tone === 'danger' ? 'text-destructive' : 'text-warning')} role={notice.tone === 'danger' ? 'alert' : 'status'}>{notice.message}</div> : null}
    </section>
  );
}

function CaptureMore({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const [refreshPending, setRefreshPending] = useState(false);
  const config = snapshot.capture.config;
  const codecOptions = (snapshot.capture.capabilities.codecs.length > 0 ? snapshot.capture.capabilities.codecs : [config.codec]).map((value) => ({ value, label: value === 'h264' ? 'H.264' : value === 'hevc' ? 'HEVC' : 'AV1' }));
  const encoderOptions = encoderChoices(snapshot);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title="Encoder, audio, shortcut, and storage" className="capture-more-trigger mt-[18px] h-9 justify-between px-2.5"><span className="flex items-center gap-1.5"><SlidersHorizontal className="size-3.5" /> More</span><ChevronDown className="size-3.5" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[520px] max-w-[calc(100vw-110px)] p-4">
        <div className="grid grid-cols-2 gap-3">
          <CaptureControl label="Encoder"><CompactSelect value={config.encoder} onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })} ariaLabel="Encoder" options={encoderOptions} /></CaptureControl>
          <CaptureControl label="Codec"><CompactSelect value={config.codec} onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })} ariaLabel="Codec" options={codecOptions} /></CaptureControl>
          <CaptureControl label="Save shortcut"><ShortcutRecorderButton value={config.hotkey} label="Save replay shortcut" className="h-9 px-2.5 text-[12px]" onValueChange={(hotkey) => void setCaptureConfig({ hotkey })} /></CaptureControl>
          <div className="flex items-end"><Button type="button" variant="secondary" size="sm" className="h-9" disabled={refreshPending} onClick={() => { setRefreshPending(true); void refreshCaptureSources().finally(() => setRefreshPending(false)); }}><RefreshCw className={cn('size-3.5', refreshPending && 'animate-spin motion-reduce:animate-none')} /> Refresh sources</Button></div>
        </div>

        <div className="mt-4 border-y border-border">
          <CaptureToggle
            label="Game audio"
            color="var(--channel-game)"
            checked={snapshot.capture.capabilities.systemAudio && config.includeSystemAudio}
            disabled={!snapshot.capture.capabilities.systemAudio}
            unavailableReason={!snapshot.capture.capabilities.systemAudio ? 'Unavailable for this capture setup' : undefined}
            onChange={(checked) => void setCaptureConfig({ includeSystemAudio: checked })}
          />
          <CaptureToggle
            label="Microphone"
            color="var(--channel-microphone)"
            checked={snapshot.capture.capabilities.microphoneAudio && config.includeMic}
            disabled={!snapshot.capture.capabilities.microphoneAudio}
            unavailableReason={!snapshot.capture.capabilities.microphoneAudio ? 'Unavailable for this capture setup' : undefined}
            onChange={(checked) => void setCaptureConfig({ includeMic: checked })}
          />
          <CaptureToggle label="Capture cursor" checked={config.includeCursor} disabled={false} onChange={(checked) => void setCaptureConfig({ includeCursor: checked })} />
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0"><div className="text-[11px] font-medium text-foreground">Clip folder</div><div className="mt-1 truncate text-[10px] text-muted-foreground" title={snapshot.capture.storage.clipsDirectory}>{snapshot.capture.storage.clipsDirectory || 'Windows Videos\\Switchboard\\Clips'}</div></div>
          <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => void openClipsDirectory()}><FolderOpen className="size-3.5" /> Open</Button><Button type="button" variant="secondary" size="sm" onClick={() => void chooseClipDirectory()}>Change</Button></div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CaptureControl({ label, status, children }: { label: string; status?: React.ReactNode; children: React.ReactNode }) {
  return <div className="min-w-0"><span className="capture-control-label mb-1 flex min-h-3.5 items-center justify-between gap-2 text-[10px] font-medium text-muted-foreground"><span>{label}</span>{status}</span>{children}</div>;
}

function CaptureStatus({ status }: { status: ReturnType<typeof captureStatus> }) {
  return (
    <span className="capture-runtime-status" data-tone={status.tone} title={status.description}>
      <span className="capture-runtime-status__dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}

function CompactSelect({ value, options, onChange, ariaLabel, disabled }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={ariaLabel} className="h-9 text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

type CaptureSourceOption = Pick<CaptureSource, 'type' | 'available'> & {
  value: string;
  label: string;
};

function CaptureSourcePicker({
  value,
  options,
  active,
  onChange,
}: {
  value: string;
  options: CaptureSourceOption[];
  active: boolean;
  onChange: (value: string) => void;
}) {
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const [open, setOpen] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [refreshPending, setRefreshPending] = useState(false);
  const selected = options.find((option) => option.value === value);
  const currentType: CaptureSourceOption['type'] = selected?.type ?? (value === 'automatic-game' ? 'automatic-game' : 'display');
  const currentLabel = selected?.label ?? (value === 'automatic-game' ? 'Automatic game' : 'Choose a display');
  const discoveredCount = options.length;
  const selectSource = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };
  const refresh = async () => {
    setRefreshPending(true);
    try {
      await refreshCaptureSources();
      setPreviewRevision((revision) => revision + 1);
    } finally {
      setRefreshPending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="capture-source-trigger"
          data-active={active ? 'true' : 'false'}
          aria-label={`Capture source: ${currentLabel}`}
        >
          <SourceIcon type={currentType} />
          <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="capture-source-popover p-0" aria-label="Choose capture source">
        <div className="capture-source-popover__header">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-foreground">Capture source</div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Choose what Instant Replay records. Preview images stay on this PC.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={refreshPending} onClick={() => void refresh()}>
            <RefreshCw className={cn('size-3.5', refreshPending && 'animate-spin motion-reduce:animate-none')} />
            {refreshPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        <div className="capture-source-grid" role="group" aria-label="Available capture sources">
          {options.map((option) => (
            <CaptureSourceOptionButton
              key={`${option.value}:${previewRevision}`}
              option={option}
              selected={option.value === value}
              previewRevision={previewRevision}
              onSelect={selectSource}
            />
          ))}
        </div>
        {discoveredCount === 0 ? (
          <div className="capture-source-empty" role="status">No displays or windows are loaded. Refresh to scan available sources.</div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function CaptureSourceOptionButton({
  option,
  selected,
  previewRevision,
  onSelect,
}: {
  option: CaptureSourceOption;
  selected: boolean;
  previewRevision: number;
  onSelect: (value: string) => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const automatic = option.type === 'automatic-game';
  const previewUrl = automatic
    ? null
    : `switchboard-media://capture-source/${encodeURIComponent(option.value)}?v=${previewRevision}`;

  return (
    <button
      type="button"
      aria-pressed={selected}
      className="capture-source-option"
      data-selected={selected ? 'true' : 'false'}
      disabled={!option.available}
      onClick={() => onSelect(option.value)}
    >
      <span className="capture-source-option__preview" aria-hidden="true">
        {automatic ? (
          <span className="capture-source-option__automatic"><Gamepad2 className="size-7" /><span>Detect active game</span></span>
        ) : previewFailed ? (
          <span className="capture-source-option__fallback"><ImageOff className="size-5" /><span>Preview unavailable</span></span>
        ) : (
          <img src={previewUrl ?? undefined} alt="" draggable={false} onError={() => setPreviewFailed(true)} />
        )}
        {!option.available ? <span className="capture-source-option__unavailable">Unavailable</span> : null}
      </span>
      <span className="capture-source-option__copy">
        <span className="capture-source-option__name" title={option.label}>{option.label}</span>
        <span className="capture-source-option__type">{sourceTypeLabel(option.type)}{selected ? ' · Selected' : ''}</span>
      </span>
    </button>
  );
}

function SourceIcon({ type }: { type: CaptureSourceOption['type'] }) {
  const Icon = type === 'display' ? Monitor : type === 'window' ? AppWindow : Gamepad2;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function CaptureToggle({ label, color, checked, disabled, unavailableReason, onChange }: { label: string; color?: string; checked: boolean; disabled: boolean; unavailableReason?: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-1 py-1.5 last:border-b-0" style={color ? { '--control-accent': color } as CSSProperties : undefined}>
      <span className="flex min-w-0 items-center gap-2">
        {color ? <span className="h-4 w-[3px] shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" /> : null}
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-foreground">{label}</span>
          {unavailableReason ? <span className="mt-0.5 block text-[10px] text-muted-foreground">{unavailableReason}</span> : null}
        </span>
      </span>
      <Switch checked={checked} disabled={disabled} aria-label={label} onCheckedChange={onChange} />
    </label>
  );
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

function sourceChoices(config: CaptureConfig, sources: CaptureSource[]): CaptureSourceOption[] {
  const choices: CaptureSourceOption[] = [];
  const knownIds = new Set(choices.map((choice) => choice.value));
  for (const source of sources) {
    if (source.type !== 'display' || knownIds.has(source.id)) continue;
    choices.push({ value: source.id, label: source.name, type: source.type, available: source.available });
    knownIds.add(source.id);
  }
  if (config.source === 'display') {
    const selectedDisplay = `display:${config.displayIndex}`;
    if (!knownIds.has(selectedDisplay)) {
      choices.push({ value: selectedDisplay, label: `Display ${config.displayIndex + 1}`, type: 'display', available: false });
    }
  }
  return choices;
}

function sourceTypeLabel(type: CaptureSourceOption['type']): string {
  if (type === 'automatic-game') return 'Automatic';
  return type === 'display' ? 'Display' : 'Window';
}

function captureNotice(snapshot: SystemSnapshot): { message: string; tone: 'danger' | 'warning' } | null {
  if (snapshot.capture.storage.criticalSpace) return { message: 'Storage is too low to save replays. Choose another clip folder.', tone: 'danger' };
  if (snapshot.capture.runtime.error) return { message: "Instant Replay couldn't start. Restart it in Capture Settings, or check Diagnostics.", tone: 'danger' };
  if (snapshot.capture.storage.lowSpace) return { message: 'Storage is running low. Choose another clip folder soon.', tone: 'warning' };
  if (snapshot.capture.runtime.warning) return { message: 'Instant Replay is recovering. Check Diagnostics if this continues.', tone: 'warning' };
  return null;
}

function captureStatus(snapshot: SystemSnapshot): { label: string; description: string; tone: 'ready' | 'warning' | 'danger' | 'neutral' } {
  if (!snapshot.capture.config.enabled || snapshot.capture.runtime.state === 'stopped') {
    return { label: 'Off', description: 'Instant Replay is turned off in Capture Settings.', tone: 'neutral' };
  }
  if (snapshot.capture.runtime.error || snapshot.capture.runtime.state === 'error') {
    return { label: 'Error', description: 'Instant Replay could not start.', tone: 'danger' };
  }
  if (snapshot.capture.runtime.warning || snapshot.capture.runtime.state === 'recovering' || snapshot.capture.runtime.state === 'starting') {
    return { label: 'Recovering', description: 'Instant Replay is preparing the capture source.', tone: 'warning' };
  }
  if (snapshot.capture.runtime.state === 'waiting') {
    return { label: 'Waiting', description: 'Instant Replay is waiting for an eligible source.', tone: 'warning' };
  }
  if (snapshot.capture.runtime.state === 'saving') {
    return { label: 'Saving', description: 'Instant Replay is saving a clip.', tone: 'ready' };
  }
  return { label: 'Ready', description: 'Instant Replay is buffering this source.', tone: 'ready' };
}
