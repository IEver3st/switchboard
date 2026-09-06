import { useState } from 'react';
import { Check, CircleAlert, CircleMinus, LoaderCircle } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';

export function DiagnosticRunner({ snapshot }: { snapshot: SystemSnapshot }) {
  const run = snapshot.diagnostics;
  const running = run.status === 'running';
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const current = run.checks.find(check => check.status === 'running');
  const priority = { running: 0, fail: 1, warning: 2, pass: 3, skipped: 4 };
  const checks = [...run.checks].sort((a, b) => priority[a.status] - priority[b.status]);
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
  return <section id="setting-general.runDiagnostics" data-setting-id="general.runDiagnostics" className="diagnostic-runner" aria-labelledby="diagnostic-runner-title" tabIndex={-1}>
    <div className="diagnostic-runner__heading">
      <div><h3 id="diagnostic-runner-title">Troubleshoot capture</h3>
        <p>Check game detection, encoders, audio endpoints, and storage. Short capture tests use your source and selected display; test frames are discarded. Active recordings stay running.</p></div>
      <div className="diagnostic-runner__actions">
        {running ? <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act('cancel')}>{pending ? 'Cancelling…' : 'Cancel diagnostics'}</Button>
          : <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act('run')}>Run diagnostics</Button>}
        {run.id && !running && <Button variant="secondary" size="sm" disabled={pending} onClick={() => void act('save')}>Save diagnostics</Button>}
      </div>
    </div>
    {run.status !== 'idle' && <p className="diagnostic-runner__summary" role="status" aria-live="polite">
      {running ? `Running: ${current?.label ?? 'finishing checks'}…` : run.summary}
    </p>}
    {run.checks.length > 0 && <details className="diagnostic-runner__results" open={running || undefined}>
      <summary>{running ? 'Checks so far' : 'View results'} ({run.checks.filter(check => check.status !== 'running').length})</summary>
      <ol aria-label="Diagnostic checks">
        {checks.map(check => {
          const Icon = check.status === 'running' ? LoaderCircle : check.status === 'pass' ? Check : check.status === 'skipped' ? CircleMinus : CircleAlert;
          return <li key={check.id} data-status={check.status}>
            <Icon aria-hidden="true" className={check.status === 'running' ? 'animate-spin motion-reduce:animate-none' : undefined} />
            <details><summary><strong>{check.label}</strong><span>{check.status === 'fail' ? 'Failed' : check.status === 'pass' ? 'Passed' : check.status === 'skipped' ? 'Skipped' : check.status === 'warning' ? 'Warning' : 'Running'}</span></summary>
              <p>{check.detail}</p></details>
          </li>;
        })}
      </ol>
    </details>}
    {message && <p role="status" className="diagnostic-runner__message">{message}</p>}
  </section>;
}
