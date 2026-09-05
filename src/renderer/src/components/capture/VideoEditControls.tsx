import { useEffect, useState } from 'react';
import type { VideoEdits } from '../../../../shared/video-edits';
import { editedDurationMs } from '../../../../shared/video-edits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './video-edit-controls.css';

export function PreciseTimeField({ label, valueMs, minimumMs = 0, maximumMs, onChange }: {
  label: string; valueMs: number; minimumMs?: number; maximumMs: number; onChange: (ms: number) => void;
}) {
  const [draft, setDraft] = useState((valueMs / 1000).toFixed(3));
  useEffect(() => setDraft((valueMs / 1000).toFixed(3)), [valueMs]);
  const commit = () => {
    const value = Number(draft) * 1000;
    if (!draft.trim() || !Number.isFinite(value)) { setDraft((valueMs / 1000).toFixed(3)); return; }
    const next = Math.min(maximumMs, Math.max(minimumMs, Math.round(value)));
    onChange(next);
    setDraft((next / 1000).toFixed(3));
  };
  return <label className="editor-time-field"><span>{label}</span><div><Input aria-label={label} type="number" min={minimumMs / 1000} max={maximumMs / 1000} step="0.001" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.stopPropagation(); setDraft((valueMs / 1000).toFixed(3)); }
  }} /><small>s</small></div></label>;
}

export function PreciseTrimControls({ startMs, endMs, durationMs, fps, onChange, onSeek, getCurrentMs }: {
  startMs: number; endMs: number; durationMs: number; fps: number;
  onChange: (start: number, end: number) => void; onSeek: (ms: number) => void; getCurrentMs: () => number;
}) {
  const frame = 1000 / Math.max(1, fps || 30);
  const changeStart = (value: number) => { const next = Math.round(Math.max(0, Math.min(endMs - 100, value))); onChange(next, endMs); onSeek(next); };
  const changeEnd = (value: number) => { const next = Math.round(Math.max(startMs + 100, Math.min(durationMs, value))); onChange(startMs, next); onSeek(Math.max(startMs, next - frame)); };
  return <div className="editor-precise-trim">
    <div className="editor-field-pair">
      <PreciseTimeField label="Trim start" valueMs={startMs} maximumMs={endMs - 100} onChange={changeStart} />
      <PreciseTimeField label="Trim end" valueMs={endMs} minimumMs={startMs + 100} maximumMs={durationMs} onChange={changeEnd} />
    </div>
    <div className="editor-field-pair">
      <div className="editor-frame-steps"><Button variant="ghost" size="sm" aria-label="Trim start one frame earlier" onClick={() => changeStart(startMs - frame)}>−1f</Button><Button variant="ghost" size="sm" aria-label="Trim start one frame later" onClick={() => changeStart(startMs + frame)}>+1f</Button></div>
      <div className="editor-frame-steps"><Button variant="ghost" size="sm" aria-label="Trim end one frame earlier" onClick={() => changeEnd(endMs - frame)}>−1f</Button><Button variant="ghost" size="sm" aria-label="Trim end one frame later" onClick={() => changeEnd(endMs + frame)}>+1f</Button></div>
    </div>
    <div className="editor-field-pair"><Button variant="secondary" size="sm" onClick={() => changeStart(getCurrentMs())}>Set in at playhead</Button><Button variant="secondary" size="sm" onClick={() => changeEnd(getCurrentMs())}>Set out at playhead</Button></div>
  </div>;
}

export function VideoEditControls({ edits = {}, startMs, endMs, durationMs, onChange }: {
  edits?: VideoEdits; startMs: number; endMs: number; durationMs: number; onChange: (edits: VideoEdits, key: string) => void;
}) {
  const text = edits.text;
  return <div className="editor-video-tools">
    <section><h3>Playback speed <output>{(editedDurationMs(startMs, endMs, edits) / 1000).toFixed(2)} s output</output></h3>
      <Select value={String(edits.speed ?? 1)} onValueChange={(value) => onChange({ ...edits, speed: Number(value) }, 'speed')}>
        <SelectTrigger aria-label="Playback speed" className="no-drag"><SelectValue /></SelectTrigger>
        <SelectContent>{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((speed) => <SelectItem value={String(speed)} key={speed}>{speed}×{speed === 1 ? ' · Normal' : speed < 1 ? ' · Slow motion' : ''}</SelectItem>)}</SelectContent>
      </Select>
    </section>
    <details className="editor-picture"><summary>Picture</summary><section><h3>Adjust picture <button type="button" onClick={() => onChange({ ...edits, brightness: 0, contrast: 1, saturation: 1, flipHorizontal: false }, 'reset-picture')}>Reset</button></h3>
      {(['brightness', 'contrast', 'saturation'] as const).map((key) => {
        const value = edits[key] ?? (key === 'brightness' ? 0 : 1);
        return <label className="editor-adjustment" key={key}><span>{key.charAt(0).toUpperCase() + key.slice(1)}<output>{Math.round(value * 100)}{key === 'brightness' ? '' : '%'}</output></span><Slider aria-label={key.charAt(0).toUpperCase() + key.slice(1)} min={key === 'brightness' ? -30 : key === 'contrast' ? 50 : 0} max={key === 'brightness' ? 30 : key === 'contrast' ? 150 : 200} step={1} value={[Math.round(value * 100)]} onValueChange={([next]) => { if (next !== undefined) onChange({ ...edits, [key]: next / 100 }, key); }} /></label>;
      })}
      <label className="editor-switch">Flip horizontally<Switch aria-label="Flip horizontally" checked={edits.flipHorizontal ?? false} onCheckedChange={(flipHorizontal) => onChange({ ...edits, flipHorizontal }, 'flip')} /></label>
    </section></details>
    <section><h3>Text <button type="button" onClick={() => onChange({ ...edits, text: text ? undefined : { content: 'Your title', startMs, endMs, position: 'bottom', size: 'medium' } }, 'text-toggle')}>{text ? 'Remove' : 'Add title'}</button></h3>
      {text ? <>
        <label className="editor-text-content"><span>Title</span><textarea aria-label="Title text" maxLength={160} rows={2} value={text.content} onChange={(event) => onChange({ ...edits, text: { ...text, content: event.target.value } }, 'text-content')} /></label>
        <div className="editor-field-pair">
          <label>Position<Select value={text.position} onValueChange={(value) => onChange({ ...edits, text: { ...text, position: value as typeof text.position } }, 'text-position')}><SelectTrigger aria-label="Text position"><SelectValue /></SelectTrigger><SelectContent>{['top', 'center', 'bottom'].map((value) => <SelectItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></label>
          <label>Size<Select value={text.size} onValueChange={(value) => onChange({ ...edits, text: { ...text, size: value as typeof text.size } }, 'text-size')}><SelectTrigger aria-label="Text size"><SelectValue /></SelectTrigger><SelectContent>{['small', 'medium', 'large'].map((value) => <SelectItem key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></label>
        </div>
        <div className="editor-field-pair">
          <PreciseTimeField label="Text in" valueMs={text.startMs} maximumMs={text.endMs - 1} onChange={(startMs) => onChange({ ...edits, text: { ...text, startMs } }, 'text-in')} />
          <PreciseTimeField label="Text out" valueMs={text.endMs} minimumMs={text.startMs + 1} maximumMs={durationMs} onChange={(endMs) => onChange({ ...edits, text: { ...text, endMs } }, 'text-out')} />
        </div>
      </> : <p>Add a timed title to this clip.</p>}
    </section>
  </div>;
}
