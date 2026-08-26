import {
  Clock3,
  FolderOpen,
  Gauge,
  HardDrive,
  Keyboard,
  Mic2,
  MousePointer2,
  Save,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { CaptureConfig, SystemSnapshot } from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SelectField, ToggleRow } from '@/components/shared/controls';
import { SectionHeading, StatusDot, Surface } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { formatDuration, formatMb, formatRelativeTime } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

export function CapturePage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const saveReplay = useSystemStore((state) => state.saveReplay);
  const revealClip = useSystemStore((state) => state.revealClip);
  const actionPending = useSystemStore((state) => state.actionPending);
  const enabled = snapshot.capture.config.enabled;
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'capture');
  const progress = snapshot.capture.config.replaySeconds > 0
    ? snapshot.capture.runtime.bufferedSeconds / snapshot.capture.config.replaySeconds
    : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <Surface className="flex items-center justify-between gap-6 px-4 py-3">
        <div className="flex items-center gap-3">
          <StatusDot active={engine?.state === 'running'} />
          <span className="text-[13px] font-semibold text-foreground">Instant Replay</span>
          <span className="text-xs text-muted-foreground">
            {engine?.state === 'running'
              ? `${Math.floor(snapshot.capture.runtime.bufferedSeconds)}s buffered · ${formatMb(snapshot.capture.runtime.estimatedDiskMb)} ring · ${snapshot.capture.runtime.encoderLabel.replace('NVIDIA ', '')}`
              : 'Capture host stopped'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Replay</span>
          <Switch checked={enabled} disabled={actionPending === 'capture:config'} aria-label="Instant replay" onCheckedChange={(checked) => void setCaptureConfig({ enabled: checked })} />
          <Button variant="primary" size="sm" disabled={!enabled || actionPending === 'capture:save'} onClick={() => void saveReplay()}>
            <Save className="size-3.5" /> Save replay
          </Button>
        </div>
      </Surface>

      <div className={cn('grid grid-cols-12 gap-4 transition-opacity', !enabled && 'opacity-60')}>
        <Surface className="col-span-7 p-5">
          <SectionHeading eyebrow="Capture" title="Quality and source" description="The prototype models the FFmpeg-backed engine contract and isolated process lifecycle." />
          <div className="mt-5 grid grid-cols-2 gap-x-7 gap-y-5">
            <ConfigField label="Source" detail="Automatic game window">
              <SelectField
                value={snapshot.capture.config.source}
                onChange={(value) => void setCaptureConfig({ source: value as CaptureConfig['source'] })}
                ariaLabel="Capture source"
                options={[
                  { value: 'game', label: 'Automatic game' },
                  { value: 'display', label: 'Display' },
                  { value: 'window', label: 'Window' },
                ]}
              />
            </ConfigField>
            <ConfigField label="Resolution" detail="Output canvas">
              <SelectField
                value={snapshot.capture.config.resolution}
                onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })}
                ariaLabel="Resolution"
                options={[
                  { value: '1080p', label: '1080p' },
                  { value: '1440p', label: '1440p' },
                  { value: 'native', label: 'Native' },
                ]}
              />
            </ConfigField>
            <ConfigField label="Frame rate" detail="Stable output target">
              <SelectField
                value={String(snapshot.capture.config.fps)}
                onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })}
                ariaLabel="Frame rate"
                options={[
                  { value: '30', label: '30 FPS' },
                  { value: '60', label: '60 FPS' },
                  { value: '120', label: '120 FPS' },
                ]}
              />
            </ConfigField>
            <ConfigField label="Codec" detail="Hardware encoder preferred">
              <div className="flex gap-2">
                <SelectField
                  value={snapshot.capture.config.codec}
                  onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })}
                  ariaLabel="Codec"
                  options={[
                    { value: 'h264', label: 'H.264' },
                    { value: 'hevc', label: 'HEVC' },
                    { value: 'av1', label: 'AV1' },
                  ]}
                />
                <SelectField
                  value={snapshot.capture.config.encoder}
                  onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })}
                  ariaLabel="Encoder"
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'nvenc', label: 'NVENC' },
                    { value: 'amf', label: 'AMF' },
                    { value: 'qsv', label: 'Quick Sync' },
                  ]}
                />
              </div>
            </ConfigField>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Replay duration</div>
                <div className="mt-1 text-[10px] text-muted-foreground/70">Disk usage scales with encoded bitrate, not raw frames.</div>
              </div>
              <div className="text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
                {snapshot.capture.config.replaySeconds}
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">seconds</span>
              </div>
            </div>
            <Slider className="mt-4" min={15} max={300} step={15} value={[snapshot.capture.config.replaySeconds]} aria-label="Replay duration" onValueChange={([value]) => typeof value === 'number' && void setCaptureConfig({ replaySeconds: value })} />
            <div className="mt-2 flex justify-between text-[9px] text-muted-foreground/60"><span>15s</span><span>5m</span></div>
          </div>

          <div className="mt-6 divide-y divide-border border-t border-border">
            <ToggleRow label="Microphone track" description="Processed mic on its own track." checked={snapshot.capture.config.includeMic} onCheckedChange={(checked) => void setCaptureConfig({ includeMic: checked })} trailing={<Mic2 className="size-3.5 text-muted-foreground" />} />
            <ToggleRow label="Chat track" description="Keep voice chat separate from game audio." checked={snapshot.capture.config.includeChat} onCheckedChange={(checked) => void setCaptureConfig({ includeChat: checked })} trailing={<Volume2 className="size-3.5 text-muted-foreground" />} />
            <ToggleRow label="Capture cursor" description="Include the hardware pointer in clips." checked={snapshot.capture.config.includeCursor} onCheckedChange={(checked) => void setCaptureConfig({ includeCursor: checked })} trailing={<MousePointer2 className="size-3.5 text-muted-foreground" />} />
          </div>
        </Surface>

        <div className="col-span-5 flex flex-col gap-4">
          <Surface className="p-5">
            <SectionHeading eyebrow="Rolling buffer" title="Segment ring" description="Two-second segments are overwritten in place." />
            <div className="mt-5 rounded-md border border-border bg-muted p-4">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{snapshot.capture.runtime.segmentCount} segments</span>
                <span className="font-medium tabular-nums text-foreground">{Math.round(progress * 100)}% ready</span>
              </div>
              <div className="mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
                {Array.from({ length: 30 }, (_, index) => {
                  const filled = index < Math.ceil(progress * 30);
                  return <span key={index} className={cn('h-8 rounded-sm border', filled ? 'border-primary/40 bg-primary/15' : 'border-border bg-background/60')} />;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[9px] text-muted-foreground/70"><span>oldest</span><span>write head</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <BufferMetric icon={Clock3} label="Target" value={`${snapshot.capture.config.replaySeconds}s`} />
              <BufferMetric icon={HardDrive} label="Estimated" value={formatMb(snapshot.capture.runtime.estimatedDiskMb)} />
              <BufferMetric icon={Gauge} label="Dropped" value={`${snapshot.capture.runtime.droppedFrames}`} />
              <BufferMetric icon={Keyboard} label="Hotkey" value={snapshot.capture.config.hotkey} compact />
            </div>
          </Surface>

          <Surface className="flex-1 p-5">
            <SectionHeading eyebrow="Recent" title="Clips" description="Prototype saves write a metadata artifact until the native/FFmpeg host is enabled." action={<Button size="sm" variant="ghost"><FolderOpen className="size-3.5" /> Open folder</Button>} />
            <div className="mt-3 divide-y divide-border">
              {snapshot.clips.slice(0, 4).map((clip) => (
                <button key={clip.id} type="button" onClick={() => void revealClip(clip.path)} className="flex w-full items-center gap-3 py-2.5 text-left first:pt-1">
                  <div className="grid size-9 place-items-center rounded-md border border-border bg-muted text-muted-foreground"><Video className="size-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">{clip.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/80">{clip.game} · {formatRelativeTime(clip.createdAt)}</div>
                  </div>
                  {clip.prototype ? <Badge variant="accent">Prototype</Badge> : null}
                  <span className="w-11 text-right text-[10px] tabular-nums text-muted-foreground">{formatDuration(clip.durationSeconds)}</span>
                  <span className="w-14 text-right text-[10px] tabular-nums text-muted-foreground/70">{formatMb(clip.sizeMb)}</span>
                </button>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground/70">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function BufferMetric({ icon: Icon, label, value, compact = false }: { icon: LucideIcon; label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
      <Icon className="size-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/80">{label}</div>
        <div className={cn('mt-1 truncate font-semibold tabular-nums text-foreground', compact ? 'text-[9px]' : 'text-xs')}>{value}</div>
      </div>
    </div>
  );
}
