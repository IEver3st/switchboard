import {
  Clock3,
  Disc3,
  FolderOpen,
  Gauge,
  HardDrive,
  Keyboard,
  Mic2,
  Monitor,
  MousePointer2,
  Save,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { CaptureConfig, SystemSnapshot } from '../../../shared/contracts';
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
    <div className="space-y-4 p-6">
      <Surface className="flex items-center justify-between gap-8 p-5">
        <div className="flex items-center gap-4">
          <div className={cn('grid size-11 place-items-center rounded-[9px] border', enabled ? 'border-[#5c3743] bg-[#24171c] text-[var(--accent)]' : 'border-[var(--border)] bg-[#171a20] text-[#69727e]')}>
            <Disc3 className={cn('size-5', enabled && 'animate-pulse-soft')} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#646d78]"><StatusDot active={engine?.state === 'running'} /> {engine?.state === 'running' ? 'Replay buffer active' : 'Capture host stopped'}</div>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[#eef0f2]">Instant Replay</h2>
            <p className="mt-1 text-[11px] text-[#6f7884]">Compressed segments live on disk. Saving a clip does not re-encode.</p>
          </div>
        </div>
        <div className="flex items-center gap-7">
          <RuntimeMetric label="Buffered" value={`${Math.floor(snapshot.capture.runtime.bufferedSeconds)}s`} />
          <RuntimeMetric label="Disk ring" value={formatMb(snapshot.capture.runtime.estimatedDiskMb)} />
          <RuntimeMetric label="Encoder" value={snapshot.capture.runtime.encoderLabel.replace('NVIDIA ', '')} />
          <div className="h-9 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-[#89919c]">Replay</span>
            <Switch checked={enabled} disabled={actionPending === 'capture:config'} onCheckedChange={(checked) => void setCaptureConfig({ enabled: checked })} />
          </div>
          <Button variant="primary" disabled={!enabled || actionPending === 'capture:save'} onClick={() => void saveReplay()}>
            <Save className="size-3.5" /> Save replay
          </Button>
        </div>
      </Surface>

      <div className="grid grid-cols-12 gap-4">
        <Surface className="col-span-7 p-5">
          <SectionHeading eyebrow="Capture" title="Quality and source" description="The prototype models the FFmpeg-backed engine contract and isolated process lifecycle." />
          <div className="mt-5 grid grid-cols-2 gap-x-7 gap-y-5">
            <ConfigField icon={Monitor} label="Source" detail="Automatic game window">
              <SelectField value={snapshot.capture.config.source} onChange={(value) => void setCaptureConfig({ source: value as CaptureConfig['source'] })}>
                <option value="game">Automatic game</option>
                <option value="display">Display</option>
                <option value="window">Window</option>
              </SelectField>
            </ConfigField>
            <ConfigField icon={Video} label="Resolution" detail="Output canvas">
              <SelectField value={snapshot.capture.config.resolution} onChange={(value) => void setCaptureConfig({ resolution: value as CaptureConfig['resolution'] })}>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
                <option value="native">Native</option>
              </SelectField>
            </ConfigField>
            <ConfigField icon={Gauge} label="Frame rate" detail="Stable output target">
              <SelectField value={snapshot.capture.config.fps} onChange={(value) => void setCaptureConfig({ fps: Number(value) as CaptureConfig['fps'] })}>
                <option value="30">30 FPS</option>
                <option value="60">60 FPS</option>
                <option value="120">120 FPS</option>
              </SelectField>
            </ConfigField>
            <ConfigField icon={HardDrive} label="Codec" detail="Hardware encoder preferred">
              <div className="flex gap-2">
                <SelectField value={snapshot.capture.config.codec} onChange={(value) => void setCaptureConfig({ codec: value as CaptureConfig['codec'] })}>
                  <option value="h264">H.264</option>
                  <option value="hevc">HEVC</option>
                  <option value="av1">AV1</option>
                </SelectField>
                <SelectField value={snapshot.capture.config.encoder} onChange={(value) => void setCaptureConfig({ encoder: value as CaptureConfig['encoder'] })}>
                  <option value="auto">Auto</option>
                  <option value="nvenc">NVENC</option>
                  <option value="amf">AMF</option>
                  <option value="qsv">Quick Sync</option>
                </SelectField>
              </div>
            </ConfigField>
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <div className="flex items-end justify-between">
              <div><div className="text-[11px] font-medium text-[#89919c]">Replay duration</div><div className="mt-1 text-[10px] text-[#616a75]">Disk usage scales with encoded bitrate, not raw frames.</div></div>
              <div className="text-[25px] font-semibold tabular-nums tracking-[-0.04em] text-[#edf0f2]">{snapshot.capture.config.replaySeconds}<span className="ml-1 text-[10px] font-normal text-[#626b76]">seconds</span></div>
            </div>
            <Slider className="mt-4" min={15} max={300} step={15} value={[snapshot.capture.config.replaySeconds]} onValueChange={([value]) => typeof value === 'number' && void setCaptureConfig({ replaySeconds: value })} />
            <div className="mt-2 flex justify-between text-[9px] text-[#4f5762]"><span>15s</span><span>5m</span></div>
          </div>
        </Surface>

        <Surface className="col-span-5 p-5">
          <SectionHeading eyebrow="Rolling buffer" title="Segment ring" description="Two-second segments are overwritten in place." />
          <div className="mt-5 rounded-[8px] border border-[var(--border)] bg-[#14171b] p-4">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#68717c]">{snapshot.capture.runtime.segmentCount} segments</span>
              <span className="font-medium tabular-nums text-[#bec3c9]">{Math.round(progress * 100)}% ready</span>
            </div>
            <div className="mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
              {Array.from({ length: 30 }, (_, index) => {
                const filled = index < Math.ceil(progress * 30);
                return <span key={index} className={cn('h-9 rounded-[3px] border', filled ? 'border-[#633546] bg-[#3a202a]' : 'border-[#262b32] bg-[#1a1d22]')} />;
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[9px] text-[#505964]"><span>oldest</span><span>write head</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <BufferMetric icon={Clock3} label="Target" value={`${snapshot.capture.config.replaySeconds}s`} />
            <BufferMetric icon={HardDrive} label="Estimated" value={formatMb(snapshot.capture.runtime.estimatedDiskMb)} />
            <BufferMetric icon={Gauge} label="Dropped" value={`${snapshot.capture.runtime.droppedFrames}`} />
            <BufferMetric icon={Keyboard} label="Hotkey" value={snapshot.capture.config.hotkey} compact />
          </div>
        </Surface>

        <Surface className="col-span-5 p-5">
          <SectionHeading eyebrow="Tracks" title="Audio and pointer" description="The audio engine can provide a dedicated clip mix." />
          <div className="mt-2 divide-y divide-[var(--border)]">
            <ToggleRow label="Microphone track" description="Processed mic on its own track." checked={snapshot.capture.config.includeMic} onCheckedChange={(checked) => void setCaptureConfig({ includeMic: checked })} trailing={<Mic2 className="size-3.5 text-[#68717c]" />} />
            <ToggleRow label="Chat track" description="Keep voice chat separate from game audio." checked={snapshot.capture.config.includeChat} onCheckedChange={(checked) => void setCaptureConfig({ includeChat: checked })} trailing={<Volume2 className="size-3.5 text-[#68717c]" />} />
            <ToggleRow label="Capture cursor" description="Include the hardware pointer in clips." checked={snapshot.capture.config.includeCursor} onCheckedChange={(checked) => void setCaptureConfig({ includeCursor: checked })} trailing={<MousePointer2 className="size-3.5 text-[#68717c]" />} />
          </div>
        </Surface>

        <Surface className="col-span-7 p-5">
          <SectionHeading eyebrow="Recent" title="Clips" description="Prototype saves write a metadata artifact until the native/FFmpeg host is enabled." action={<Button size="sm" variant="ghost"><FolderOpen className="size-3.5" /> Open folder</Button>} />
          <div className="mt-3 divide-y divide-[var(--border)]">
            {snapshot.clips.slice(0, 4).map((clip) => (
              <button key={clip.id} type="button" onClick={() => void revealClip(clip.path)} className="flex w-full items-center gap-3 py-2.5 text-left first:pt-1">
                <div className="grid size-9 place-items-center rounded-[7px] border border-[var(--border)] bg-[#171a20] text-[#6f7883]"><Video className="size-4" /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium text-[#d8dce0]">{clip.name}</div><div className="mt-0.5 text-[9px] text-[#606975]">{clip.game} · {formatRelativeTime(clip.createdAt)}</div></div>
                {clip.prototype ? <span className="rounded-[4px] border border-[#4f3941] bg-[#21171b] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#b77a8c]">Prototype</span> : null}
                <span className="w-11 text-right text-[10px] tabular-nums text-[#747d88]">{formatDuration(clip.durationSeconds)}</span>
                <span className="w-14 text-right text-[10px] tabular-nums text-[#59626d]">{formatMb(clip.sizeMb)}</span>
              </button>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return <div className="text-right"><div className="text-[9px] uppercase tracking-[0.12em] text-[#59626d]">{label}</div><div className="mt-1 max-w-32 truncate text-[12px] font-semibold tabular-nums text-[#d9dce0]">{value}</div></div>;
}

function ConfigField({ icon: Icon, label, detail, children }: { icon: LucideIcon; label: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-8 place-items-center rounded-[7px] border border-[var(--border)] bg-[#171a20] text-[#6c7580]"><Icon className="size-[15px]" /></div>
      <div className="min-w-0 flex-1"><div className="text-[11px] font-medium text-[#d2d6db]">{label}</div><div className="mt-0.5 text-[9px] text-[#5e6772]">{detail}</div></div>
      {children}
    </div>
  );
}

function BufferMetric({ icon: Icon, label, value, compact = false }: { icon: LucideIcon; label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[7px] border border-[var(--border)] bg-[#15181d] p-3">
      <Icon className="size-3.5 text-[#66707c]" />
      <div className="min-w-0"><div className="text-[9px] uppercase tracking-[0.1em] text-[#59626d]">{label}</div><div className={cn('mt-1 truncate font-semibold tabular-nums text-[#cfd3d8]', compact ? 'text-[9px]' : 'text-[11px]')}>{value}</div></div>
    </div>
  );
}
