import { useEffect, useState, type RefObject } from 'react';
import { FastForward, Pause, Play, Rewind, Save, SkipBack, SkipForward, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/lib/format';

const minimumTrimMs = 100;

export function ClipTimeline({
  videoRef,
  durationMs,
  startMs,
  endMs,
  dirty,
  savePending,
  onChange,
  onSave,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  durationMs: number;
  startMs: number;
  endMs: number;
  dirty: boolean;
  savePending: boolean;
  onChange: (startMs: number, endMs: number) => void;
  onSave: () => void;
}) {
  const [currentMs, setCurrentMs] = useState(startMs);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => {
      const nextMs = video.currentTime * 1_000;
      if (nextMs >= endMs) {
        video.pause();
        video.currentTime = startMs / 1_000;
        setCurrentMs(startMs);
        return;
      }
      setCurrentMs(nextMs);
    };
    const updatePlayback = () => setPlaying(!video.paused);
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('play', updatePlayback);
    video.addEventListener('pause', updatePlayback);
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('play', updatePlayback);
      video.removeEventListener('pause', updatePlayback);
    };
  }, [endMs, startMs, videoRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback(videoRef.current, startMs, endMs);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(videoRef.current, currentMs - 5_000, startMs, endMs);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(videoRef.current, currentMs + 5_000, startMs, endMs);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMs, endMs, startMs, videoRef]);

  const updateRange = ([nextStart = startMs, nextEnd = endMs]: number[]) => {
    const boundedStart = Math.min(nextStart, nextEnd - minimumTrimMs);
    const boundedEnd = Math.max(nextEnd, boundedStart + minimumTrimMs);
    onChange(boundedStart, boundedEnd);
    const video = videoRef.current;
    if (video && (video.currentTime * 1_000 < boundedStart || video.currentTime * 1_000 > boundedEnd)) {
      seek(video, boundedStart, boundedStart, boundedEnd);
    }
  };

  return (
    <section className="clip-timeline border-t border-border pt-3" aria-labelledby="trim-heading">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 id="trim-heading" className="m-0 text-[12px] font-semibold text-foreground">Trim</h3>
          <p className="m-0 mt-0.5 text-[10px] tabular-nums text-muted-foreground">
            {formatPreciseTime(startMs)} <span aria-hidden="true">–</span> {formatPreciseTime(endMs)}
            <span className="mx-1.5" aria-hidden="true">·</span>{formatDuration((endMs - startMs) / 1_000)} selected
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={startMs === 0 && endMs === durationMs} onClick={() => onChange(0, durationMs)}>
          <Undo2 className="size-3.5" /> Reset
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!dirty || savePending} onClick={onSave}>
          <Save className="size-3.5" /> {savePending ? 'Saving…' : dirty ? 'Save trim' : 'Saved'}
        </Button>
      </div>

      <div className="relative mt-2">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-6 -translate-y-1/2" aria-hidden="true">
          <span className="absolute inset-y-0 w-px bg-foreground/80" style={{ left: `${Math.min(100, Math.max(0, currentMs / durationMs * 100))}%` }} />
        </div>
        <Slider
          value={[startMs, endMs]}
          min={0}
          max={durationMs}
          step={100}
          minStepsBetweenThumbs={1}
          onValueChange={updateRange}
          thumbLabels={['Trim start', 'Trim end']}
          thumbValueText={[formatPreciseTime(startMs), formatPreciseTime(endMs)]}
          className="clip-timeline__range"
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="w-16 text-[10px] tabular-nums text-muted-foreground">{formatPreciseTime(currentMs)}</span>
        <div className="flex items-center gap-1" aria-label="Playback controls">
          <TransportButton label="Go to trim start" icon={SkipBack} onClick={() => seek(videoRef.current, startMs, startMs, endMs)} />
          <TransportButton label="Back 5 seconds" icon={Rewind} onClick={() => seek(videoRef.current, currentMs - 5_000, startMs, endMs)} />
          <TransportButton label={playing ? 'Pause' : 'Play selection'} icon={playing ? Pause : Play} primary onClick={() => togglePlayback(videoRef.current, startMs, endMs)} />
          <TransportButton label="Forward 5 seconds" icon={FastForward} onClick={() => seek(videoRef.current, currentMs + 5_000, startMs, endMs)} />
          <TransportButton label="Go to trim end" icon={SkipForward} onClick={() => seek(videoRef.current, Math.max(startMs, endMs - 50), startMs, endMs)} />
        </div>
        <span className="w-16 text-right text-[10px] tabular-nums text-muted-foreground">{formatPreciseTime(durationMs)}</span>
      </div>
    </section>
  );
}

function TransportButton({ label, icon: Icon, primary = false, onClick }: {
  label: string;
  icon: typeof Play;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={primary
        ? 'grid size-8 place-items-center rounded-md bg-primary text-primary-foreground hover:bg-accent-hover'
        : 'grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'}
    >
      <Icon className={primary ? 'size-4' : 'size-3.5'} />
    </button>
  );
}

function seek(video: HTMLVideoElement | null, nextMs: number, startMs: number, endMs: number): void {
  if (!video) return;
  video.currentTime = Math.min(endMs, Math.max(startMs, nextMs)) / 1_000;
}

function togglePlayback(video: HTMLVideoElement | null, startMs: number, endMs: number): void {
  if (!video) return;
  if (!video.paused) {
    video.pause();
    return;
  }
  const currentMs = video.currentTime * 1_000;
  if (currentMs < startMs || currentMs >= endMs) video.currentTime = startMs / 1_000;
  void video.play();
}

function formatPreciseTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, milliseconds) / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor(totalSeconds * 10) % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
