import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SetupPreferences, VerticalGuideLayout } from '../../../../shared/contracts';
import { verticalGuideColors } from '../../../../shared/vertical-guide';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';
import { QuickSection, QuickSelect, QuickOption, QuickRange } from './quick-controls-primitives';

type Guide = SetupPreferences['verticalGuide'];
export function VerticalFramingControls({ guide, disabled, onChange }: { guide: Guide; disabled: boolean; onChange(patch: Partial<Guide>): void }) {
  const [layout, setLayout] = useState<VerticalGuideLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void switchboardApi.getVerticalGuideLayout().then(value => { if (active) { setLayout(value); setError(null); } }).catch(failure => { if (active) setError(String(failure).replace(/^Error: /, '')); });
    return () => { active = false; };
  }, [guide]);
  const frame = guide.frame ?? layout?.frame;
  const screen = layout?.display;
  const updateFrame = (key: 'width' | 'height' | 'x' | 'y', value: number) => { if (frame) onChange({ frame: { ...frame, [key]: value } }); };
  return <QuickSection title="Frame your shot" action={<Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ frame: null, size: 100, horizontal: 50, vertical: 50 })}><RotateCcw size={13} />Reset frame</Button>}>
    <div className="quick-frame-intro">
      <div className="quick-frame-preview" aria-hidden="true" style={screen ? { width: `${Math.min(88, 64 * screen.width / screen.height)}px`, height: `${Math.min(64, 88 * screen.height / screen.width)}px` } : undefined}>
        {frame && screen ? <div style={{ width: `${frame.width / screen.width * 100}%`, height: `${frame.height / screen.height * 100}%`, left: `${frame.x / screen.width * 100}%`, top: `${frame.y / screen.height * 100}%`, borderColor: verticalGuideColors[guide.color], boxShadow: `0 0 0 200px rgb(0 0 0 / ${guide.dim / 100})` }} /> : null}
      </div>
      <div><strong className="quick-frame-dimensions">{frame ? `${frame.width} × ${frame.height}` : 'Loading frame…'}<small> screen pixels</small></strong><p className="quick-note">Everything inside stays clear.<br />Mouse clicks pass through.</p></div>
    </div>
    {error ? <p className="quick-error" role="alert">{error}</p> : null}
    <div className="quick-field-pair">
      <QuickSelect label="Display" value={String(screen?.id ?? '')} disabled={disabled || !layout} onChange={id => onChange({ displayId: Number(id), frame: null })}>
        {!layout ? <QuickOption value="">Loading…</QuickOption> : layout.displays.map(display => <QuickOption key={display.id} value={display.id}>{display.name}</QuickOption>)}
      </QuickSelect>
      <QuickSelect label="Frame shape" value={guide.frame ? 'custom' : 'phone'} disabled={disabled || !layout} onChange={mode => onChange({ frame: mode === 'custom' ? layout!.frame : null })}><QuickOption value="phone">Phone · 9:16</QuickOption><QuickOption value="custom">Custom pixels</QuickOption></QuickSelect>
    </div>
    {guide.frame && screen ? <div className="quick-exact-frame" role="group" aria-label="Exact frame in screen pixels">
      <FrameNumber label="Width" value={guide.frame.width} min={16} max={screen.width - guide.frame.x} disabled={disabled} onCommit={value => updateFrame('width', value)} />
      <FrameNumber label="Height" value={guide.frame.height} min={16} max={screen.height - guide.frame.y} disabled={disabled} onCommit={value => updateFrame('height', value)} />
      <FrameNumber label="Left" value={guide.frame.x} min={0} max={screen.width - guide.frame.width} disabled={disabled} onCommit={value => updateFrame('x', value)} />
      <FrameNumber label="Top" value={guide.frame.y} min={0} max={screen.height - guide.frame.height} disabled={disabled} onCommit={value => updateFrame('y', value)} />
    </div> : <>
      <div className="quick-guide-range"><span>Frame size</span><QuickRange label="Frame size" value={guide.size} min={25} max={100} step={1} format={percent} disabled={disabled} onCommit={size => onChange({ size })} /></div>
      <div className="quick-field-pair"><div className="quick-guide-range"><span>Horizontal position</span><QuickRange label="Horizontal position" value={guide.horizontal} min={0} max={100} step={1} format={position} disabled={disabled} onCommit={horizontal => onChange({ horizontal })} /></div>
      <div className="quick-guide-range"><span>Vertical position</span><QuickRange label="Vertical position" value={guide.vertical} min={0} max={100} step={1} format={position} disabled={disabled} onCommit={vertical => onChange({ vertical })} /></div></div>
    </>}
    <div className="quick-guide-range"><span>Darken outside frame</span><QuickRange label="Darken outside frame" value={guide.dim} min={0} max={80} step={1} format={value => value === 0 ? 'Off' : percent(value)} disabled={disabled} onCommit={dim => onChange({ dim })} /></div>
    <QuickSelect label="Outline color" value={guide.color} disabled={disabled} onChange={color => onChange({ color: color as Guide['color'] })}><QuickOption value="white">White</QuickOption><QuickOption value="violet">Violet</QuickOption><QuickOption value="lime">Lime</QuickOption></QuickSelect>
    <details className="quick-frame-help"><summary>Recording & display tips</summary>
      <p className="quick-note">The guide stays on until you switch it off or quit Switchboard. Size and position use physical screen pixels, independent of Windows scaling. Changing displays restores a fitted 9:16 frame.</p>
      <p className="quick-note">This is a framing aid, not a recording crop. Save a replay, then choose the 9:16 canvas in the clip editor to export a Short.</p>
      <p className="quick-note">Exclusive fullscreen may cover the guide. Capture exclusion depends on the recorder; check a test clip first.</p>
    </details>
  </QuickSection>;
}

function FrameNumber({ label, value, min, max, disabled, onCommit }: { label: string; value: number; min: number; max: number; disabled: boolean; onCommit(value: number): void }) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { if (!disabled) { setDraft(String(value)); setInvalid(false); } }, [value, disabled]);
  const commit = () => {
    const number = Number(draft);
    if (!draft.trim() || !Number.isInteger(number) || number < min || number > max) { setInvalid(true); return; }
    setInvalid(false); if (!disabled && number !== value) onCommit(number);
  };
  return <label className="quick-frame-number"><span>{label}<small>px</small></span><input type="number" aria-label={`Frame ${label.toLowerCase()}`} aria-invalid={invalid} min={min} max={max} step={1} value={draft} disabled={disabled} onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />{invalid ? <small role="alert">{min}–{max} px</small> : null}</label>;
}
const percent = (value: number) => `${value}%`;
const position = (value: number) => value === 50 ? 'Center' : `${value}%`;
