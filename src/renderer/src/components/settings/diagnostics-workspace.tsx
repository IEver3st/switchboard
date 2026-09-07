import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { switchboardApi } from '@/lib/demo-api';
import './diagnostics-workspace.css';

export function DiagnosticsWorkspace({ children, targetSetting }: { children: ReactNode; targetSetting?: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('checks');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyFallback, setCopyFallback] = useState('');
  useEffect(() => {
    if (!targetSetting) return;
    const pane = document.getElementById(`setting-${targetSetting}`)?.closest<HTMLElement>('[data-diagnostic-pane]');
    if (pane?.dataset.diagnosticPane) setView(pane.dataset.diagnosticPane);
  }, [targetSetting]);
  async function copy() {
    const pane = root.current?.querySelector<HTMLElement>(`[data-diagnostic-pane="${view}"]`);
    const overview = root.current?.querySelector<HTMLElement>('.diagnostics-overview');
    const details = Array.from(pane?.querySelectorAll('h3, h4, dt, dd, p, output, summary, th, td') ?? [])
      .map(element => element.textContent?.trim()).filter(Boolean).join('\n');
    const text = `Switchboard diagnostics · ${new Date().toISOString()}\n\n${overview?.innerText ?? ''}\n\n${details}`;
    setCopyFallback('');
    try {
      await navigator.clipboard.writeText(text);
      setMessage('View copied. Review identifiers and paths before sharing.');
    } catch { setCopyFallback(text); setMessage('Clipboard unavailable. Select the text below to copy it. Review identifiers and paths before sharing.'); }
  }
  async function save() {
    setSaving(true);
    setMessage('');
    setCopyFallback('');
    try { setMessage(await switchboardApi.exportResourceDiagnostics() ? 'Diagnostics saved. Paths and credentials are redacted in the JSON export.' : 'Save cancelled.'); }
    catch { setMessage('Could not save diagnostics. Choose another location and try again.'); }
    finally { setSaving(false); }
  }
  return <div className="diagnostics-workspace" ref={root} data-view={view}>
    <div className="diagnostics-toolbar">
      <div role="group" aria-label="Diagnostic views" className="diagnostics-views">
        {(['checks', 'pipelines', 'devices', 'resources'] as const).map(id => <button type="button" key={id}
          aria-pressed={view === id} aria-controls={`diagnostic-pane-${id}`} onClick={() => { setView(id); setMessage(''); setCopyFallback(''); }}>
          {{ checks: 'Checks', pipelines: 'Pipelines', devices: 'Devices', resources: 'Resources' }[id]}
        </button>)}
      </div>
      <div className="diagnostics-tools">
        <Button size="sm" variant="ghost" onClick={() => void copy()}><Copy aria-hidden className="size-3.5" />Copy view</Button>
        <Button size="sm" disabled={saving} onClick={() => void save()}><Download aria-hidden className="size-3.5" />{saving ? 'Saving…' : 'Export JSON'}</Button>
      </div>
    </div>
    {message && <p className="diagnostics-feedback" role="status">{message}</p>}
    {copyFallback && <textarea className="diagnostics-copy-fallback" aria-label="Diagnostics text to copy" readOnly value={copyFallback} onFocus={event => event.currentTarget.select()} />}
    {children}
  </div>;
}
