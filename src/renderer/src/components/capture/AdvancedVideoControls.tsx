import { Crop, Timer, Type, SlidersHorizontal } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { framingAt, speedAt, type VideoEdits, type VideoOverlay, type AudioAutomation, type FramingKeyframe } from '../../../../shared/video-edits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PreciseTimeField, VideoEditControls } from './VideoEditControls';
import './advanced-video-editor.css';

export type EditTool = 'framing' | 'timing' | 'overlays' | 'audio' | 'picture';
export function NumberControl({ label, value, min = 0, max = 100, step = 1, disabled, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange: (value: number) => void;
}) {
  return <label className="advanced-number"><span>{label}</span><Input aria-label={label} disabled={disabled} type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} onChange={event => {
    if (!event.target.value.trim()) return;
    const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
  }} /></label>;
}

export function AdvancedVideoControls({ edits = {}, clip, startMs, endMs, currentMs, onChange, onSeek, tool, onToolChange, selectedOverlayId, onSelectOverlay }: {
  edits?: VideoEdits; clip: Clip; startMs: number; endMs: number; currentMs: number;
  onChange: (edits: VideoEdits, key?: string) => void; onSeek: (sourceMs: number) => void;
  tool: EditTool; onToolChange: (tool: EditTool) => void; selectedOverlayId: string | null; onSelectOverlay: (id: string | null) => void;
}) {
  const now = Math.max(startMs, Math.min(endMs - 1, Math.round(currentMs)));
  const frame = framingAt(now, edits);
  const keys = edits.framing?.keyframes ?? [];
  const activeKey = keys.find(key => Math.abs(key.timeMs - now) < 25);
  const framingFull = keys.length >= 128 && !activeKey;
  const changeFrame = (patch: Partial<FramingKeyframe>) => {
    if (framingFull) return;
    const next = { ...frame, timeMs: activeKey?.timeMs ?? now, ...patch };
    const points = keys.filter(key => key.timeMs !== (activeKey?.timeMs ?? now));
    if (!points.length && next.timeMs > startMs) points.push({ ...framingAt(startMs, edits), timeMs: startMs });
    onChange({ ...edits, framing: { mode: edits.framing?.mode ?? 'fill', background: edits.framing?.background ?? 'black', keyframes: [...points.filter(key => key.timeMs !== next.timeMs), next].sort((a, b) => a.timeMs - b.timeMs) } }, `frame:${next.timeMs}`);
  };
  const overlay = edits.overlays?.find(item => item.id === selectedOverlayId);
  const changeOverlay = (patch: Partial<VideoOverlay>) => {
    if (!overlay) return;
    const next = { ...overlay, ...patch };
    next.x = Math.min(next.x, 1 - next.width); next.y = Math.min(next.y, 1 - next.height);
    onChange({ ...edits, overlays: edits.overlays?.map(item => item.id === overlay.id ? next : item) }, `overlay:${overlay.id}`);
  };
  return <div className="advanced-video-controls">
    <div className="inspector-tool-grid" role="group" aria-label="Edit tool">
      {([{ id: 'framing', label: 'Framing', icon: Crop }, { id: 'timing', label: 'Speed & freezes', icon: Timer }, { id: 'overlays', label: 'Text & privacy', icon: Type }, { id: 'picture', label: 'Picture & title', icon: SlidersHorizontal }] as const).map(({ id, label, icon: Icon }) =>
        <Button key={id} type="button" size="sm" variant="ghost" aria-pressed={tool === id} onClick={() => onToolChange(id)}><Icon aria-hidden="true" />{label}</Button>)}
    </div>
    {tool === 'framing' ? <>
      <div className="editor-field-pair"><label>Scale<Select value={edits.framing?.mode ?? 'fill'} onValueChange={mode => onChange({ ...edits, framing: { keyframes: keys, background: edits.framing?.background ?? 'black', mode: mode as 'fill' | 'fit' } })}><SelectTrigger aria-label="Frame scale"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fill">Fill frame</SelectItem><SelectItem value="fit">Fit whole frame</SelectItem></SelectContent></Select></label>
      <label>Background<Select value={edits.framing?.background ?? 'black'} onValueChange={background => onChange({ ...edits, framing: { keyframes: keys, mode: edits.framing?.mode ?? 'fill', background: background as 'black' | 'blur' } })}><SelectTrigger aria-label="Frame background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="black">Black</SelectItem><SelectItem value="blur">Blurred video</SelectItem></SelectContent></Select></label></div>
      <p>Drag the preview to frame the action. Changes add a point at the playhead.</p>
      <div className="editor-field-pair"><NumberControl label="Horizontal position" value={frame.x * 100} onChange={x => changeFrame({ x: x / 100 })} /><NumberControl label="Vertical position" value={frame.y * 100} onChange={y => changeFrame({ y: y / 100 })} /></div>
      <div className="editor-field-pair">
      <NumberControl label="Zoom %" value={frame.zoom * 100} min={100} max={800} step={5} onChange={zoom => changeFrame({ zoom: zoom / 100 })} />
      <label>Move to next point<Select value={frame.transition} onValueChange={transition => changeFrame({ transition: transition as FramingKeyframe['transition'] })}><SelectTrigger aria-label="Framing interpolation"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="smooth">Smooth</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="hold">Hold, then cut</SelectItem></SelectContent></Select></label>
      </div>
      <Button size="sm" variant="secondary" disabled={framingFull} onClick={() => changeFrame({})}>Add framing point</Button>
      {framingFull ? <p>128 framing points reached. Select a point to adjust it or remove one.</p> : null}
      <KeyframeLane label="Framing points" points={keys.filter(key => key.timeMs >= startMs && key.timeMs < endMs).map(key => ({ timeMs: key.timeMs, label: `${Math.round(key.zoom * 100)}%` }))} currentMs={now} startMs={startMs} endMs={endMs} onSeek={onSeek} onRemove={timeMs => onChange({ ...edits, framing: { ...edits.framing!, keyframes: keys.filter(key => key.timeMs !== timeMs) } })} />
      {activeKey ? <PreciseTimeField label="Framing point time" valueMs={activeKey.timeMs} minimumMs={startMs} maximumMs={endMs - 1} onChange={timeMs => { changeFrame({ timeMs }); onSeek(timeMs); }} /> : null}
    </> : null}
    {tool === 'timing' ? <>
      <p>Speed points use source time. Linear ramps ease into the next speed; holds switch at the next point.</p>
      <NumberControl label="Speed at playhead" disabled={(edits.speedPoints?.length ?? 0) >= 64 && !edits.speedPoints?.some(point => point.timeMs === now)} value={speedAt(now, edits)} min={0.25} max={4} step={0.05} onChange={speed => {
        const points = [...(edits.speedPoints ?? [])];
        if (!points.length && now > startMs) points.push({ timeMs: startMs, speed: edits.speed ?? 1, transition: 'linear' });
        onChange({ ...edits, speedPoints: [...points.filter(point => point.timeMs !== now), { timeMs: now, speed, transition: 'linear' as const }].sort((a, b) => a.timeMs - b.timeMs) }, `speed-point:${now}`);
      }} />
      <Button size="sm" variant="secondary" disabled={(edits.speedPoints?.length ?? 0) >= 64 && !edits.speedPoints?.some(point => point.timeMs === now)} onClick={() => onChange({ ...edits, speedPoints: [...(edits.speedPoints ?? []).filter(point => point.timeMs !== now), { timeMs: now, speed: speedAt(now, edits), transition: 'linear' as const }].sort((a, b) => a.timeMs - b.timeMs) })}>Add speed point</Button>
      <KeyframeLane label="Speed points" points={(edits.speedPoints ?? []).filter(point => point.timeMs >= startMs && point.timeMs < endMs).map(point => ({ timeMs: point.timeMs, label: `${point.speed}×` }))} currentMs={now} startMs={startMs} endMs={endMs} onSeek={onSeek} onRemove={timeMs => onChange({ ...edits, speedPoints: edits.speedPoints?.filter(point => point.timeMs !== timeMs) })} />
      {(edits.speedPoints ?? []).filter(point => Math.abs(point.timeMs - now) < 25).map(point => <label key={point.timeMs}>Speed transition<Select value={point.transition} onValueChange={transition => onChange({ ...edits, speedPoints: edits.speedPoints?.map(item => item === point ? { ...point, transition: transition as 'linear' | 'hold' } : item) })}><SelectTrigger aria-label="Speed transition"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="linear">Ramp to next speed</SelectItem><SelectItem value="hold">Hold speed</SelectItem></SelectContent></Select></label>)}
      <Button size="sm" variant="secondary" disabled={(edits.freezes?.length ?? 0) >= 32 && !edits.freezes?.some(hold => hold.timeMs === now)} onClick={() => onChange({ ...edits, freezes: [...(edits.freezes ?? []).filter(hold => hold.timeMs !== now), { timeMs: now, durationMs: 1000 }].sort((a, b) => a.timeMs - b.timeMs) })}>Freeze frame at playhead</Button>
      {(edits.freezes ?? []).filter(hold => hold.timeMs >= startMs && hold.timeMs < endMs).map(hold => <div key={hold.timeMs} className="advanced-point-row"><button onClick={() => onSeek(hold.timeMs)} aria-label={`Seek freeze at ${(hold.timeMs / 1000).toFixed(2)} seconds`}>{(hold.timeMs / 1000).toFixed(2)} s</button><PreciseTimeField label={`Freeze duration at ${(hold.timeMs / 1000).toFixed(2)}`} valueMs={hold.durationMs} minimumMs={100} maximumMs={30000} onChange={durationMs => onChange({ ...edits, freezes: edits.freezes?.map(item => item === hold ? { ...hold, durationMs } : item) }, `freeze:${hold.timeMs}`)} /><button aria-label={`Remove freeze at ${hold.timeMs}`} onClick={() => onChange({ ...edits, freezes: edits.freezes?.filter(item => item !== hold) })}>Remove</button></div>)}
      <p>Clip audio pauses during a freeze. Added music continues.</p>
    </> : null}
    {tool === 'overlays' ? <>
      <div className="advanced-add-tools">{(['text', 'blur', 'pixelate'] as const).map(kind => <Button key={kind} size="sm" variant="secondary" disabled={(edits.overlays?.length ?? 0) >= 32} onClick={() => {
        const item: VideoOverlay = { id: crypto.randomUUID(), kind, startMs: now, endMs, x: 0.1, y: kind === 'text' ? 0.75 : 0.1, width: kind === 'text' ? 0.8 : 0.3, height: 0.18, ...(kind === 'text' ? { content: 'Your caption', size: 'medium' as const } : {}) };
        onChange({ ...edits, overlays: [...(edits.overlays ?? []), item] }); onSelectOverlay(item.id);
      }}>Add {kind === 'text' ? 'text' : kind === 'blur' ? 'blur' : 'pixelation'}</Button>)}</div>
      {(edits.overlays ?? []).map(item => <button className="advanced-overlay-item" key={item.id} aria-pressed={item.id === selectedOverlayId} onClick={() => { onSelectOverlay(item.id); onSeek(Math.max(startMs, item.startMs)); }}>{item.kind === 'text' ? item.content || 'Empty text' : item.kind === 'blur' ? 'Blur region' : 'Pixelated region'}<small>{(item.startMs / 1000).toFixed(2)}–{(item.endMs / 1000).toFixed(2)} s</small></button>)}
      {overlay ? <>
        {overlay.kind === 'text' ? <><label>Caption<textarea aria-label="Overlay text" rows={3} maxLength={500} value={overlay.content ?? ''} onChange={event => changeOverlay({ content: event.target.value })} /></label><Select value={overlay.size ?? 'medium'} onValueChange={size => changeOverlay({ size: size as VideoOverlay['size'] })}><SelectTrigger aria-label="Overlay text size"><SelectValue /></SelectTrigger><SelectContent>{['small', 'medium', 'large'].map(size => <SelectItem key={size} value={size}>{size}</SelectItem>)}</SelectContent></Select></> : <p>Drag the selected region. Use its corner handle to resize.</p>}
        <div className="editor-field-pair"><PreciseTimeField label="Overlay in" valueMs={overlay.startMs} maximumMs={overlay.endMs - 1} onChange={startMs => changeOverlay({ startMs })} /><PreciseTimeField label="Overlay out" valueMs={overlay.endMs} minimumMs={overlay.startMs + 1} maximumMs={clip.durationMs} onChange={endMs => changeOverlay({ endMs })} /></div>
        <div className="editor-field-pair"><NumberControl label="Overlay X %" value={overlay.x * 100} max={(1 - overlay.width) * 100} onChange={x => changeOverlay({ x: x / 100 })} /><NumberControl label="Overlay Y %" value={overlay.y * 100} max={(1 - overlay.height) * 100} onChange={y => changeOverlay({ y: y / 100 })} /></div>
        <div className="editor-field-pair"><NumberControl label="Overlay width %" value={overlay.width * 100} min={2} max={100} onChange={width => changeOverlay({ width: width / 100 })} /><NumberControl label="Overlay height %" value={overlay.height * 100} min={2} max={100} onChange={height => changeOverlay({ height: height / 100 })} /></div>
        <Button size="sm" variant="ghost" onClick={() => { onChange({ ...edits, overlays: edits.overlays?.filter(item => item.id !== overlay.id) }); onSelectOverlay(null); }}>Remove overlay</Button>
      </> : <p>Add text or a privacy region, then select it to adjust its timing and position.</p>}
    </> : null}
    {tool === 'picture' ? <VideoEditControls edits={edits} showSpeed={false} expandPicture startMs={startMs} endMs={endMs} durationMs={clip.durationMs} onChange={onChange} /> : null}
  </div>;
}

export function AudioAutomationControls({ automation, currentMs, startMs, endMs, onChange, onSeek }: {
  automation: Pick<AudioAutomation, 'points' | 'mutes'>; currentMs: number; startMs: number; endMs: number;
  onChange: (value: Pick<AudioAutomation, 'points' | 'mutes'>, key?: string) => void; onSeek: (timeMs: number) => void;
}) {
  const now = Math.round(Math.max(startMs, Math.min(endMs - 1, currentMs)));
  return <div className="advanced-audio-tools">
    <div className="inspector-automation-actions">
    <Button size="sm" variant="secondary" disabled={automation.points.length >= 128 && !automation.points.some(point => point.timeMs === now)} onClick={() => onChange({ ...automation, points: [...automation.points.filter(point => point.timeMs !== now), { timeMs: now, gain: 1 }].sort((a, b) => a.timeMs - b.timeMs) })}>Add volume point</Button>
    <Button size="sm" variant="secondary" disabled={automation.mutes.length >= 64} onClick={() => onChange({ ...automation, mutes: [...automation.mutes, { startMs: now, endMs: Math.min(endMs, now + 1000) }] })} aria-label="Mute interval at playhead" title="Mute interval at playhead">Mute interval</Button>
    </div>
    {automation.points.map(point => <div className="advanced-point-row" key={point.timeMs}><button onClick={() => onSeek(point.timeMs)}>{(point.timeMs / 1000).toFixed(2)} s</button><NumberControl label={`Volume at ${(point.timeMs / 1000).toFixed(2)} seconds`} value={point.gain * 100} onChange={gain => onChange({ ...automation, points: automation.points.map(item => item === point ? { ...point, gain: gain / 100 } : item) }, `gain:${point.timeMs}`)} /><button aria-label={`Remove volume point at ${point.timeMs}`} onClick={() => onChange({ ...automation, points: automation.points.filter(item => item !== point) })}>Remove</button></div>)}

    {automation.mutes.map((range, index) => <div className="advanced-mute-range" key={index}><div className="editor-field-pair"><PreciseTimeField label={`Mute ${index + 1} in`} valueMs={range.startMs} maximumMs={range.endMs - 1} onChange={startMs => onChange({ ...automation, mutes: automation.mutes.map((item, i) => i === index ? { ...range, startMs } : item) })} /><PreciseTimeField label={`Mute ${index + 1} out`} valueMs={range.endMs} minimumMs={range.startMs + 1} maximumMs={endMs} onChange={endMs => onChange({ ...automation, mutes: automation.mutes.map((item, i) => i === index ? { ...range, endMs } : item) })} /></div><button onClick={() => onChange({ ...automation, mutes: automation.mutes.filter((_item, i) => i !== index) })}>Remove mute interval</button></div>)}
  </div>;
}

export function KeyframeLane({ label, points, currentMs, startMs, endMs, onSeek, onRemove }: {
  label: string; points: { timeMs: number; label: string }[]; currentMs: number; startMs: number; endMs: number;
  onSeek: (timeMs: number) => void; onRemove: (timeMs: number) => void;
}) {
  if (points.length === 0) return null;
  return <div className="advanced-keyframe-lane" aria-label={label}>
    <div className="advanced-keyframe-ruler">{points.map(point => <button key={point.timeMs} style={{ left: `${(point.timeMs - startMs) / (endMs - startMs) * 100}%` }} aria-pressed={Math.abs(currentMs - point.timeMs) < 25} aria-label={`${label}: ${point.label} at ${(point.timeMs / 1000).toFixed(2)} seconds`} title={`${point.label} · ${(point.timeMs / 1000).toFixed(2)} s`} onClick={() => onSeek(point.timeMs)} onKeyDown={event => { if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onRemove(point.timeMs); } }} />)}</div>
    {points.map(point => <div className="advanced-point-row" key={point.timeMs}><button onClick={() => onSeek(point.timeMs)}>{(point.timeMs / 1000).toFixed(2)} s · {point.label}</button><button aria-label={`Remove ${label.toLowerCase()} at ${point.timeMs}`} onClick={() => onRemove(point.timeMs)}>Remove</button></div>)}
  </div>;
}
