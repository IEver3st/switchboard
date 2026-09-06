import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { AppWindow, ChevronDown, FolderOpen, Gamepad2, ImageOff, Monitor, RefreshCw, Settings2, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { estimateClipSize } from '../../../../shared/capture-presets';
import type { CaptureConfig, CaptureSource, SystemSnapshot } from '../../../../shared/contracts';
import { CaptureAudioDeviceSelect } from './capture-audio-device-select';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Kbd } from '@/components/ui/kbd';
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
  const setupProblem = captureSetupProblem(snapshot);
  const clipCount = controls.hasFilters
    ? `${controls.clips.length} of ${controls.totalClipCount} clips`
    : `${controls.totalClipCount} ${controls.totalClipCount === 1 ? 'clip' : 'clips'}`;
  const changeSource = (value: string) => {
    if (value === 'automatic-game') void setCaptureConfig({ source: 'automatic-game', sourceId: null });
    else if (value.startsWith('display:')) void setCaptureConfig({ source: 'display', sourceId: value, displayIndex: Number(value.split(':')[1] ?? 0) });
    else void setCaptureConfig({ source: 'window', sourceId: value });
  };

  return (
    <section aria-label="Clips commands" className="capture-command-header capture-toolbar sticky top-0 z-20">
      <div className="capture-command-header__capture-rail">
        <div className="capture-command-header__identity">
          <h2 id="clips-heading">Clips</h2>
          <p aria-live="polite">{clipCount}</p>
        </div>
        <ReplayConfiguration
          snapshot={snapshot}
          sourceOptions={sourceOptions}
          selectedSourceValue={selectedSourceValue}
          supportedFps={supportedFps}
          estimatedBytes={estimatedBytes}
          setupProblem={setupProblem}
          status={status}
          onSourceChange={changeSource}
        />
      </div>
      <div className="capture-command-header__library-row">
        <ClipLibraryToolbar controls={controls} />
      </div>
      {notice ? <div className={cn('capture-toolbar__notice text-[11px]', notice.tone === 'danger' ? 'text-destructive' : 'text-warning')} role={notice.tone === 'danger' ? 'alert' : 'status'}>{notice.message}</div> : null}
    </section>
  );
}

function ReplayConfiguration({
  snapshot,
  sourceOptions,
  selectedSourceValue,
  supportedFps,
  estimatedBytes,
  setupProblem,
  status,
  onSourceChange,
}: {
  snapshot: SystemSnapshot;
  sourceOptions: CaptureSourceOption[];
  selectedSourceValue: string;
  supportedFps: Array<CaptureConfig['fps']>;
  estimatedBytes: number;
  setupProblem: string | null;
  status: ReturnType<typeof captureStatus>;
  onSourceChange: (value: string) => void;
}) {
  const [replayOpen, setReplayOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const replayTriggerRef = useRef<HTMLButtonElement>(null);
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
  const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const [refreshPending, setRefreshPending] = useState(false);
  const [replayPending, setReplayPending] = useState(false);
  const config = snapshot.capture.config;
  const codecOptions = [...new Set(['auto' as const, ...snapshot.capture.capabilities.codecs, config.codec])].map((value) => ({ value, label: value === 'auto' ? 'Automatic' : value === 'h264' ? 'H.264' : value === 'hevc' ? 'HEVC' : 'AV1' }));
  const encoderOptions = encoderChoices(snapshot);

  return (
    <div className="capture-recorder-rail" role="group" aria-label="Replay capture controls">
      <div className="capture-recorder-sentence">
        <div id="replay-status" className="capture-recorder-status" data-tone={status.tone} title={status.description}>
          <span className="capture-recorder-status__dot" aria-hidden="true" />
          <span>{status.label}</span>
        </div>

        <div className="capture-recorder-source">
          <CaptureSourcePicker value={selectedSourceValue} options={sourceOptions} active={config.enabled} compact onChange={onSourceChange} />
        </div>
      </div>

      <label className="capture-recorder-toggle">
        <span>Replay</span>
        <Switch checked={config.enabled} aria-label="Instant Replay" aria-describedby="replay-status" aria-busy={replayPending} disabled={replayPending} onCheckedChange={async (enabled) => {
          setReplayPending(true);
          try { await setCaptureConfig({ enabled }); }
          finally { setReplayPending(false); }
        }} />
      </label>

      <Popover open={replayOpen} onOpenChange={setReplayOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={replayTriggerRef}
            type="button"
            variant="ghost"
            size="sm"
            className="capture-recorder-settings-trigger"
            data-tone={status.tone}
            aria-label={`Open replay settings. Replay ${status.label}. ${status.description}`}
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            <span className="capture-recorder-length" title={`Replay length ${formatReplayLength(config.replaySeconds)}`}>{formatReplayLength(config.replaySeconds)}</span>
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={7}
          className="capture-replay-popover p-0"
          aria-label="Replay configuration"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            replayTriggerRef.current?.focus();
            window.requestAnimationFrame(() => replayTriggerRef.current?.focus());
          }}
        >
          <div className="capture-replay-popover__header">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3>Replay Capture</h3>
                <CaptureStatus status={status} />
              </div>
              <p>Changes apply to the recorder immediately.</p>
            </div>
          </div>

          {setupProblem ? (
            <div className="capture-replay-popover__warning" role="status">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              <span><strong>Setup required.</strong> {setupProblem}</span>
            </div>
          ) : null}

          <FieldGroup className="capture-replay-fields">
            <ReplayField label="Source">
              <CaptureSourcePicker value={selectedSourceValue} options={sourceOptions} active={config.enabled} onChange={onSourceChange} />
            </ReplayField>
            <ReplayField label="Replay length"><CompactSelect value={String(config.replaySeconds)} onChange={(value) => void setCaptureConfig({ replaySeconds: Number(value) })} ariaLabel="Replay length" options={durationOptions.map((seconds) => ({ value: String(seconds), label: formatReplayLength(seconds) }))} /></ReplayField>
            <ReplayField label="Resolution"><CompactSelect value={config.resolution} onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })} ariaLabel="Capture resolution" options={['720p', '1080p', '1440p', '2160p', 'native'].map((value) => ({ value, label: value === 'native' ? 'Native' : value }))} /></ReplayField>
            <ReplayField label="Frame rate"><CompactSelect value={String(config.fps)} onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })} ariaLabel="Capture frame rate" options={supportedFps.map((fps) => ({ value: String(fps), label: `${fps} FPS` }))} /></ReplayField>
            <ReplayField label="Quality"><CompactSelect value={String(config.quality)} onChange={(value) => void setCaptureConfig({ quality: Number(value) })} ariaLabel="Capture quality" options={[1, 2, 3, 4, 5].map((quality) => ({ value: String(quality), label: qualityLabels[quality]! }))} /></ReplayField>
            <ReplayField label="Encoder"><CompactSelect value={config.encoder} onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })} ariaLabel="Encoder" options={encoderOptions} /></ReplayField>
          </FieldGroup>

          <Separator />
          <dl className="capture-replay-storage">
            <div><dt>Estimated replay size</dt><dd>~{formatBytes(estimatedBytes)}</dd></div>
            <div><dt>Available disk</dt><dd>{snapshot.capture.storage.availableBytes > 0 ? formatBytes(snapshot.capture.storage.availableBytes) : 'Calculating…'}</dd></div>
          </dl>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="capture-replay-advanced">
            <CollapsibleTrigger asChild>
              <button type="button" className="capture-replay-advanced__trigger" aria-expanded={advancedOpen}>
                <span><SlidersHorizontal className="size-3.5" aria-hidden="true" /> Advanced settings</span>
                <ChevronDown className="capture-replay-advanced__chevron size-3.5" aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="capture-replay-advanced__content">
              <FieldGroup>
                <ReplayField label="Codec"><CompactSelect value={config.codec} onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })} ariaLabel="Codec" options={codecOptions} /></ReplayField>
                <Field orientation="horizontal" className="capture-replay-field">
                  <FieldContent><FieldLabel>Save shortcut</FieldLabel><FieldDescription>Save the current replay buffer.</FieldDescription></FieldContent>
                  <div className="flex items-center gap-2"><Kbd>{config.hotkey}</Kbd><ShortcutRecorderButton value={config.hotkey} label="Save replay shortcut" className="h-8 px-2.5 text-[11px]" onValueChange={(hotkey) => void setCaptureConfig({ hotkey })} /></div>
                </Field>
                <CaptureAudioInputs snapshot={snapshot} />
                <CaptureToggle label="Capture cursor" checked={config.includeCursor} disabled={false} onChange={(checked) => void setCaptureConfig({ includeCursor: checked })} />
              </FieldGroup>

              <div className="capture-replay-folder">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-foreground">Clip folder</div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground" title={snapshot.capture.storage.clipsDirectory}>{snapshot.capture.storage.clipsDirectory || 'Windows Videos\\Switchboard\\Clips'}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void openClipsDirectory()}><FolderOpen className="size-3.5" /> Open</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void chooseClipDirectory()}>Change</Button>
                </div>
              </div>

              <Button type="button" variant="ghost" size="sm" className="capture-replay-refresh" disabled={refreshPending} onClick={() => { setRefreshPending(true); void refreshCaptureSources().finally(() => setRefreshPending(false)); }}>
                <RefreshCw className={cn('size-3.5', refreshPending && 'animate-spin motion-reduce:animate-none')} />
                {refreshPending ? 'Refreshing sources…' : 'Refresh capture sources'}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReplayField({ label, children }: { label: string; children: React.ReactNode }) {
  return <Field orientation="horizontal" className="capture-replay-field"><FieldLabel>{label}</FieldLabel><div className="capture-replay-field__control">{children}</div></Field>;
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
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={ariaLabel} className="h-8 min-w-32 text-[11px]"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

type CaptureSourceOption = Pick<CaptureSource, 'type' | 'available'> & {
  value: string;
  label: string;
};

function CaptureSourcePicker({
  value,
  options,
  active,
  compact = false,
  onChange,
}: {
  value: string;
  options: CaptureSourceOption[];
  active: boolean;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn('capture-source-trigger', compact && 'capture-source-trigger--compact')}
          data-active={active ? 'true' : 'false'}
          aria-label={`Capture source: ${currentLabel}`}
        >
          <SourceIcon type={currentType} />
          <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="capture-source-popover p-0"
        aria-label="Choose capture source"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
          window.requestAnimationFrame(() => triggerRef.current?.focus());
        }}
      >
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
    <label className="capture-replay-toggle" style={color ? { '--control-accent': color } as CSSProperties : undefined}>
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

function CaptureAudioInputs({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const config = snapshot.capture.config;
  const capabilities = snapshot.capture.capabilities;
  const devices = snapshot.audio.devices;
  const systemAvailable = capabilities.systemAudio;
  const micAvailable = capabilities.microphoneAudio;
  const outputDevices = devices.filter((device) => device.direction === 'output' && device.available && !device.isSwitchboard);
  const inputDevices = devices.filter((device) => device.direction === 'input' && device.available && !device.isSwitchboard);
  const explicitMicUnavailable = Boolean(config.microphoneDeviceId) && !inputDevices.some((device) => device.id === config.microphoneDeviceId);
  const chatWithoutDevice = config.includeChatAudio && !config.chatAudioDeviceId;
  const gameAndChatSame = config.includeSystemAudio && config.includeChatAudio
    && (config.systemAudioDeviceId ?? 'auto') === (config.chatAudioDeviceId ?? 'auto');

  return (
    <div className="capture-replay-audio" role="group" aria-label="Replay audio inputs">
      <div className="text-[11px] font-medium text-foreground">Audio inputs</div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        Each input is saved as its own track. Mute the microphone in the clip editor without losing game or chat audio.
        Sonar users can assign Sonar Game, Sonar Chat, and the microphone to separate inputs.
      </p>
      <div className="mt-2 grid gap-2">
        <div className="capture-replay-audio__row">
          <CaptureToggle
            label="Game audio"
            color="var(--channel-game)"
            checked={systemAvailable && config.includeSystemAudio}
            disabled={!systemAvailable}
            unavailableReason={!systemAvailable ? 'Unavailable for this capture setup' : undefined}
            onChange={(checked) => void setCaptureConfig({ includeSystemAudio: checked })}
          />
          <CaptureAudioDeviceSelect
            label="Game audio device"
            value={config.systemAudioDeviceId}
            devices={outputDevices}
            automaticLabel={snapshot.audio.host?.running ? 'Automatic (Switchboard clip mix)' : 'Automatic (default system audio)'}
            disabled={!systemAvailable || !config.includeSystemAudio}
            onChange={(systemAudioDeviceId) => void setCaptureConfig({ systemAudioDeviceId })}
          />
        </div>
        <div className="capture-replay-audio__row">
          <CaptureToggle
            label="Chat audio"
            color="var(--channel-chat)"
            checked={systemAvailable && config.includeChatAudio}
            disabled={!systemAvailable}
            unavailableReason={!systemAvailable ? 'Unavailable for this capture setup' : undefined}
            onChange={(checked) => void setCaptureConfig({ includeChatAudio: checked })}
          />
          <CaptureAudioDeviceSelect
            label="Chat audio device"
            value={config.chatAudioDeviceId}
            devices={outputDevices}
            automaticLabel="Automatic (default system audio)"
            disabled={!systemAvailable || !config.includeChatAudio}
            onChange={(chatAudioDeviceId) => void setCaptureConfig({ chatAudioDeviceId })}
          />
        </div>
        <div className="capture-replay-audio__row">
          <CaptureToggle
            label="Microphone"
            color="var(--channel-microphone)"
            checked={micAvailable && config.includeMic}
            disabled={!micAvailable}
            unavailableReason={!micAvailable ? 'Unavailable for this capture setup' : undefined}
            onChange={(checked) => void setCaptureConfig({ includeMic: checked })}
          />
          <CaptureAudioDeviceSelect
            label="Microphone device"
            value={config.microphoneDeviceId}
            devices={inputDevices}
            automaticLabel={snapshot.audio.microphoneDevice ? `Automatic (${snapshot.audio.microphoneDevice})` : 'Automatic (follow Audio settings)'}
            disabled={!micAvailable || !config.includeMic}
            onChange={(microphoneDeviceId) => void setCaptureConfig({ microphoneDeviceId })}
          />
        </div>
      </div>
      {explicitMicUnavailable && config.includeMic ? (
        <p className="mt-2 text-[10px] leading-4 text-warning" role="status">
          The selected microphone is not currently available. Reconnect it or choose another input before saving clips.
        </p>
      ) : null}
      {chatWithoutDevice ? (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground" role="status">
          Chat is using the default system output. For separate Discord audio with Sonar, choose Sonar Chat here and Sonar Game above.
        </p>
      ) : null}
      {gameAndChatSame ? (
        <p className="mt-2 text-[10px] leading-4 text-warning" role="status">
          Game and chat are using the same output, so their tracks will contain the same sound. Choose different devices to keep them separate.
        </p>
      ) : null}
    </div>
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
  const choices: CaptureSourceOption[] = [
    { value: 'automatic-game', label: 'Automatic game', type: 'automatic-game', available: true },
  ];
  const knownIds = new Set(choices.map((choice) => choice.value));
  for (const source of sources) {
    if (knownIds.has(source.id)) continue;
    choices.push({ value: source.id, label: source.name, type: source.type, available: source.available });
    knownIds.add(source.id);
  }
  if (config.source === 'display') {
    const selectedDisplay = `display:${config.displayIndex}`;
    if (!knownIds.has(selectedDisplay)) {
      choices.push({ value: selectedDisplay, label: `Display ${config.displayIndex + 1}`, type: 'display', available: false });
    }
  }
  if (config.source === 'window' && config.sourceId && !knownIds.has(config.sourceId)) {
    choices.push({ value: config.sourceId, label: 'Selected window', type: 'window', available: false });
  }
  return choices;
}

function sourceTypeLabel(type: CaptureSourceOption['type']): string {
  if (type === 'automatic-game') return 'Automatic';
  return type === 'display' ? 'Display' : 'Window';
}

function captureSetupProblem(snapshot: SystemSnapshot): string | null {
  const { capabilities, config } = snapshot.capture;
  if (!config.enabled) return null;
  if (capabilities.backend === 'unavailable') return 'Windows capture is not available for this setup.';
  if (capabilities.encoders.length === 0) return 'No compatible encoder is currently available, so Replay cannot start.';
  if (config.encoder === 'auto') return null;

  const available = capabilities.encoders.join(' ').toLocaleLowerCase();
  const encoderMatch: Record<Exclude<CaptureConfig['encoder'], 'auto'>, string> = {
    nvenc: 'nvenc',
    amf: 'amf',
    qsv: 'qsv',
    software: 'libx',
  };
  return available.includes(encoderMatch[config.encoder])
    ? null
    : 'The selected encoder is not available. Choose Automatic or another installed encoder.';
}

function captureNotice(snapshot: SystemSnapshot): { message: string; tone: 'danger' | 'warning' } | null {
  if (snapshot.capture.storage.criticalSpace) return { message: 'Storage is too low to save replays. Choose another clip folder.', tone: 'danger' };
  if (snapshot.capture.storage.lowSpace) return { message: 'Storage is running low. Choose another clip folder soon.', tone: 'warning' };
  if (!snapshot.capture.config.enabled) return null;
  if (snapshot.capture.runtime.error) return { message: "Instant Replay couldn't start. Open replay settings, then turn Replay off and on to retry.", tone: 'danger' };
  if (snapshot.capture.runtime.warning) return { message: 'Instant Replay is recovering. If this continues, turn Replay off and on to retry.', tone: 'warning' };
  return null;
}

function captureStatus(snapshot: SystemSnapshot): { label: string; description: string; tone: 'ready' | 'warning' | 'danger' | 'neutral' } {
  if (!snapshot.capture.config.enabled) {
    return { label: 'Off', description: 'Turn on Replay to start the capture engine.', tone: 'neutral' };
  }
  if (snapshot.capture.capabilities.backend === 'unavailable') {
    return { label: 'Unavailable', description: 'Windows capture is not available for this setup.', tone: 'warning' };
  }
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
