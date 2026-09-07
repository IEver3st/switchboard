import { useState } from 'react';
import { Check, CircleAlert, CircleMinus, LoaderCircle } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';

export function DiagnosticRunner({ snapshot, expanded = false }: { snapshot: SystemSnapshot; expanded?: boolean }) {
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const run = snapshot.diagnostics;
  const running = run.status === 'running';
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const current = run.checks.find(check => check.status === 'running');
  const priority = { running: 0, fail: 1, warning: 2, pass: 3, skipped: 4 };
  const checks = [...run.checks].sort((a, b) => priority[a.status] - priority[b.status]);
  const attention = checks.filter(check => check.status === 'fail' || check.status === 'warning');
  const visible = checks.filter(check => (!attentionOnly || check.status === 'fail' || check.status === 'warning')
    && `${check.label} ${check.detail} ${check.status}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function act(action: 'run' | 'cancel' | 'save') {
    setPending(true);
    setMessage('');
    try {
      if (action === 'run') await switchboardApi.runDiagnostics();
      else if (action === 'cancel') await switchboardApi.cancelDiagnostics();
      else setMessage(await switchboardApi.exportResourceDiagnostics() ? 'Diagnostics saved. Attach the JSON file when asking for help.' : 'Save cancelled.');
    } catch { setMessage(action === 'save' ? 'Could not save diagnostics. Choose another location and try again.' : action === 'cancel' ? 'Could not cancel diagnostics. Please try again.' : 'Could not start diagnostics. Please try again.'); }
    finally { setPending(false); }
  }
  return <section id="setting-general.runDiagnostics" data-setting-id="general.runDiagnostics" className="diagnostic-runner" data-expanded={expanded || undefined} aria-labelledby="diagnostic-runner-title" tabIndex={-1}>
    <div className="diagnostic-runner__heading">
      <div className="diagnostic-runner__copy"><h3 id="diagnostic-runner-title">{expanded ? 'Capture checks' : 'Troubleshoot capture'}</h3>
        <p>Check game detection, encoders, audio endpoints, and storage.</p>
        <p className="diagnostic-runner__note">Short tests use your capture source and display. Test frames are discarded; active recordings stay running.</p></div>
      <div className="diagnostic-runner__actions">
        {running ? <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act('cancel')}>{pending ? 'Cancelling…' : 'Cancel diagnostics'}</Button>
          : <Button variant={expanded ? "primary" : "secondary"} size="sm" disabled={pending} onClick={() => void act('run')}>{pending ? 'Starting…' : run.id ? 'Run again' : 'Run diagnostics'}</Button>}
        {!expanded && run.id && !running && <Button variant="ghost" size="sm" disabled={pending} onClick={() => void act('save')}>Save diagnostics</Button>}
      </div>
    </div>
    {run.status !== 'idle' && <p className="diagnostic-runner__summary" role="status" aria-live="polite">
      {running ? `Running: ${current?.label ?? 'preparing checks'}…` : run.summary}
      {expanded && run.completedAt && <time dateTime={run.completedAt}>Completed {new Date(run.completedAt).toLocaleString()}</time>}
    </p>}
    {expanded && run.status === 'idle' && <div className="diagnostic-empty-state"><CircleMinus aria-hidden /><div><strong>No checks run in this session</strong><p>Run diagnostics to test detection, encoders, audio, and storage. Live pipeline and device details are available in the other views.</p></div></div>}
    {run.checks.length > 0 && <details className="diagnostic-runner__results" open={expanded || running || undefined}>
      <summary>{expanded ? 'Check results' : running ? 'Checks so far' : 'View results'} ({run.checks.filter(check => check.status !== 'running').length})</summary>
      {expanded && <div className="diagnostic-result-tools">
        <label><span className="sr-only">Search diagnostic checks</span><input type="search" placeholder="Find a check, error, or encoder…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(!attentionOnly)}>Needs attention · {attention.length}</button>
        <span>{checks.filter(check => check.status === 'pass').length} passed · {checks.filter(check => check.status === 'skipped').length} skipped</span>
      </div>}
      <ol aria-label="Diagnostic checks">
        {(expanded ? visible : checks).map(check => {
          const Icon = check.status === 'running' ? LoaderCircle : check.status === 'pass' ? Check : check.status === 'skipped' ? CircleMinus : CircleAlert;
          return <li key={check.id} data-status={check.status}>
            <Icon aria-hidden="true" className={check.status === 'running' ? 'animate-spin motion-reduce:animate-none' : undefined} />
            <details open={expanded && (check.status === 'fail' || check.status === 'warning' || check.status === 'running') || undefined}><summary><strong>{check.label}</strong><span>{check.status === 'fail' ? 'Failed' : check.status === 'pass' ? 'Passed' : check.status === 'skipped' ? 'Skipped' : check.status === 'warning' ? 'Warning' : 'Running'}{expanded && check.durationMs !== undefined && <small>{check.durationMs.toLocaleString()} ms</small>}</span></summary>
              <p>{check.detail || 'Waiting for this check to return details.'}</p></details>
          </li>;
        })}
      </ol>
      {expanded && visible.length === 0 && <p className="diagnostics-empty">{query ? 'No checks match your search.' : 'No checks need attention.'} <button type="button" onClick={() => { setQuery(''); setAttentionOnly(false); }}>Show all checks</button></p>}
    </details>}
    {message && <p role="status" className="diagnostic-runner__message">{message}</p>}
  </section>;
}
