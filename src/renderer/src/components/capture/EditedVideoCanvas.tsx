import { useEffect, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { canvasRatios, framingAt, framingGeometry, videoTextSize, titleOverlay, type VideoEdits, type VideoOverlay } from '../../../../shared/video-edits';
import type { EditTool } from './AdvancedVideoControls';

export function EditedVideoCanvas({ videoRef, edits, canvasSize, sourceMs, startMs, tool, selectedOverlayId, onChange, onPause }: {
  videoRef: RefObject<HTMLVideoElement | null>; edits?: VideoEdits; canvasSize: string; sourceMs: number; startMs: number;
  tool: EditTool; selectedOverlayId: string | null; onChange: (edits: VideoEdits, key?: string) => void; onPause: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; edits: VideoEdits; sourceMs: number; resize: boolean } | null>(null);
  const sourceRef = useRef(sourceMs); sourceRef.current = sourceMs;
  const paintRef = useRef<(() => void) | null>(null);
  const overlay = edits?.overlays?.find(item => item.id === selectedOverlayId && sourceMs >= item.startMs && sourceMs < item.endMs);
  useEffect(() => {
    const video = videoRef.current, canvas = canvasRef.current, frame = frameRef.current;
    if (!video || !canvas || !frame) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    const scratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d');
    let callback: number | null = null;
    const paint = () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const ratio = canvasRatios[canvasSize as keyof typeof canvasRatios] ?? video.videoWidth / video.videoHeight;
      const area = frame.parentElement!.getBoundingClientRect();
      const width = Math.min(area.width, area.height * ratio), height = width / ratio;
      frame.style.width = `${width}px`; frame.style.height = `${height}px`;
      // Limit the preview backing surface to its displayed size. Export uses source resolution.
      const w = Math.max(2, Math.round(width)), h = Math.max(2, Math.round(height));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      context.filter = 'none'; context.fillStyle = '#000'; context.fillRect(0, 0, w, h);
      const time = video.paused ? sourceRef.current : video.currentTime * 1000;
      const key = framingAt(time, edits);
      const geometry = framingGeometry(video.videoWidth, video.videoHeight, w, h, key, edits?.framing?.mode ?? (canvasSize === 'original' ? 'fit' : 'fill'));
      const filter = `brightness(${1 + (edits?.brightness ?? 0)}) contrast(${edits?.contrast ?? 1}) saturate(${edits?.saturation ?? 1})`;
      if (edits?.framing?.background === 'blur') {
        const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
        context.save(); context.filter = `${filter} blur(${Math.max(3, h * 0.02)}px)`;
        context.translate(-geometry.cropX * geometry.zoom, -geometry.cropY * geometry.zoom); context.scale(geometry.zoom, geometry.zoom);
        if (edits?.flipHorizontal) { context.translate(w, 0); context.scale(-1, 1); }
        context.drawImage(video, (w - video.videoWidth * scale) / 2, (h - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale); context.restore();
      }
      context.save(); context.filter = filter;
      if (edits?.flipHorizontal) { context.translate(geometry.x + geometry.width, geometry.y); context.scale(-1, 1); context.drawImage(video, 0, 0, geometry.width, geometry.height); }
      else context.drawImage(video, geometry.x, geometry.y, geometry.width, geometry.height);
      context.restore();
      const overlays = [...(edits?.overlays ?? [])];
      if (edits?.text?.content) {
        overlays.unshift(titleOverlay(edits.text, w, h));
      }
      for (const item of overlays) {
        if (time < item.startMs || time >= item.endMs) continue;
        const x = item.x * w, y = item.y * h, ow = item.width * w, oh = item.height * h;
        if (item.kind === 'text') { drawText(context, item, w, h); continue; }
        if (!scratchContext) continue;
        const sw = item.kind === 'pixelate' ? Math.max(2, Math.round(ow / Math.max(6, h / 60))) : Math.ceil(ow);
        const sh = item.kind === 'pixelate' ? Math.max(2, Math.round(oh / Math.max(6, h / 60))) : Math.ceil(oh);
        if (scratch.width !== sw) scratch.width = sw;
        if (scratch.height !== sh) scratch.height = sh;
        scratchContext.clearRect(0, 0, sw, sh);
        scratchContext.filter = item.kind === 'blur' ? `blur(${Math.max(3, h * 0.02)}px)` : 'none';
        scratchContext.drawImage(canvas, x, y, ow, oh, 0, 0, sw, sh);
        context.save(); context.imageSmoothingEnabled = item.kind !== 'pixelate'; context.drawImage(scratch, x, y, ow, oh); context.restore();
      }
    };
    const tick = () => { callback = null; paint(); if (!video.paused) callback = video.requestVideoFrameCallback(tick); };
    const start = () => { if (callback === null) callback = video.requestVideoFrameCallback(tick); };
    const stop = () => { if (callback !== null) video.cancelVideoFrameCallback(callback); callback = null; paint(); };
    const observer = new ResizeObserver(paint); observer.observe(frame.parentElement!);
    for (const event of ['seeked', 'loadeddata', 'loadedmetadata']) video.addEventListener(event, paint);
    video.addEventListener('play', start); video.addEventListener('pause', stop);
    paintRef.current = paint; paint(); if (!video.paused) start();
    return () => { paintRef.current = null; if (callback !== null) video.cancelVideoFrameCallback(callback); observer.disconnect(); for (const event of ['seeked', 'loadeddata', 'loadedmetadata']) video.removeEventListener(event, paint); video.removeEventListener('play', start); video.removeEventListener('pause', stop); };
  }, [videoRef, edits, canvasSize]);
  useEffect(() => { if (videoRef.current?.paused) paintRef.current?.(); }, [sourceMs, videoRef]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (tool !== 'framing' && !(tool === 'overlays' && overlay))) return;
    event.preventDefault(); onPause(); event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, edits: edits ?? {}, sourceMs: Math.max(startMs, Math.round(sourceMs)), resize: (event.target as HTMLElement).dataset.resize === 'true' };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current, frame = frameRef.current, video = videoRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frame || !video) return;
    const bounds = frame.getBoundingClientRect();
    if (tool === 'overlays' && selectedOverlayId) {
      const item = drag.edits.overlays?.find(candidate => candidate.id === selectedOverlayId); if (!item) return;
      const dx = (event.clientX - drag.x) / bounds.width, dy = (event.clientY - drag.y) / bounds.height;
      const patch = drag.resize ? { width: clamp(item.width + dx, 0.02, 1 - item.x), height: clamp(item.height + dy, 0.02, 1 - item.y) } : { x: clamp(item.x + dx, 0, 1 - item.width), y: clamp(item.y + dy, 0, 1 - item.height) };
      onChange({ ...drag.edits, overlays: drag.edits.overlays?.map(candidate => candidate.id === item.id ? { ...item, ...patch } : candidate) }, `overlay:${item.id}`);
      return;
    }
    const key = framingAt(drag.sourceMs, drag.edits);
    const geometry = framingGeometry(video.videoWidth, video.videoHeight, bounds.width, bounds.height, key, drag.edits.framing?.mode ?? 'fill');
    const next = { ...key, timeMs: drag.sourceMs, x: clamp(key.x - (event.clientX - drag.x) / Math.max(1, geometry.width - bounds.width), 0, 1), y: clamp(key.y - (event.clientY - drag.y) / Math.max(1, geometry.height - bounds.height), 0, 1) };
    const points = [...(drag.edits.framing?.keyframes ?? [])].filter(point => point.timeMs !== next.timeMs);
    if (points.length >= 128) return;
    if (!points.length && next.timeMs > startMs) points.push({ ...framingAt(startMs, drag.edits), timeMs: startMs });
    onChange({ ...drag.edits, framing: { mode: drag.edits.framing?.mode ?? 'fill', background: drag.edits.framing?.background ?? 'black', keyframes: [...points, next].sort((a, b) => a.timeMs - b.timeMs) } }, `frame:${next.timeMs}`);
  };
  return <div className="edited-video-stage"><div ref={frameRef} className="edited-video-frame" data-tool={tool} onPointerDown={startDrag} onPointerMove={move} onPointerUp={event => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragRef.current = null; }}>
    <canvas ref={canvasRef} aria-label="Edited video preview" />
    {tool === 'overlays' && overlay ? <div className="edited-overlay-selection" style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: `${overlay.width * 100}%`, height: `${overlay.height * 100}%` }}><span data-resize="true" /></div> : null}
    {tool === 'framing' ? <div className="edited-framing-outline" aria-hidden="true" /> : null}
  </div></div>;
}

function drawText(context: CanvasRenderingContext2D, item: VideoOverlay, width: number, height: number) {
  const lines = (item.content ?? '').split('\n'), longest = Math.max(1, ...lines.map(line => [...line].length));
  const size = Math.max(1, Math.min(height * videoTextSize[item.size ?? 'medium'], item.width * width / (longest * 0.65), item.height * height / (Math.max(1, lines.length) * 1.2)));
  context.save(); context.font = `bold ${size}px Arial`; context.textAlign = 'center'; context.textBaseline = 'top';
  const x = (item.x + item.width / 2) * width, y = item.y * height;
  const textWidth = Math.max(0, ...lines.map(line => context.measureText(line).width));
  context.fillStyle = 'rgba(0,0,0,0.55)'; context.fillRect(x - textWidth / 2 - 6, y - 4, textWidth + 12, lines.length * size * 1.2 + 8);
  context.fillStyle = '#fff'; lines.forEach((line, index) => context.fillText(line, x, y + index * size * 1.2)); context.restore();
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
