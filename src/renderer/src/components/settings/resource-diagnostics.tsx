import { useState } from 'react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';
import { SettingSection, SettingSwitch } from './settings-primitives';

export function ResourceDiagnostics({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore(state => state.updateSettings);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const debug = snapshot.settings.detailedDiagnostics ? snapshot.performance.debug : undefined;
  async function exportReport() {
    setExporting(true);
    setMessage('');
    try { setMessage(await switchboardApi.exportResourceDiagnostics() ? 'Report saved.' : 'Export canceled.'); }
    catch (error) {
      setMessage(error instanceof Error && error.message.includes('Enable detailed diagnostics')
        ? 'Enable detailed diagnostics and wait for a resource sample before exporting.'
        : 'Could not save the report. Check the destination and try again.');
    }
    finally { setExporting(false); }
  }
  return <SettingSection title="Resource debugging">
    <SettingSwitch settingId="diagnostics.detailed" title="Detailed resource diagnostics"
      description="Record process resources, operation timings, renderer activity, and main-loop delays locally every 5 seconds. Adds measurement overhead while enabled."
      checked={snapshot.settings.detailedDiagnostics} disabled={pending}
      onCheckedChange={enabled => {
        setMessage('');
        setPending(true);
        void updateSettings({ detailedDiagnostics: enabled }).finally(() => setPending(false));
      }} />
    <div className="resource-debug-report">
      <div className="resource-debug-actions">
        <p>{snapshot.settings.detailedDiagnostics
          ? debug ? `Recording since ${new Date(debug.startedAt).toLocaleTimeString()}. View updates every 30 seconds.` : 'Collecting the first sample…'
          : 'Off. Enable, reproduce the slowdown for at least 60 seconds, then export. The latest session remains exportable until restart or a new recording.'}</p>
        <Button variant="secondary" size="sm" disabled={exporting} onClick={() => void exportReport()}>{exporting ? 'Exporting…' : 'Export resource report'}</Button>
      </div>
      {message && <p role="status">{message}</p>}
      {debug && <>
        <p>Main loop busy {debug.eventLoopUtilizationPercent === null ? 'unavailable' : `${debug.eventLoopUtilizationPercent.toFixed(1)}%`} · p99 interval {debug.eventLoopDelayP99Ms ?? '—'} ms · max {debug.eventLoopDelayMaxMs ?? '—'} ms (20 ms probe).</p>
        <details>
          <summary>Process resources ({debug.processes.length})</summary>
          <div className="resource-debug-scroll"><table>
            <thead><tr><th>Process / PID</th><th>Private MB</th><th>Resident MB</th><th>CPU %</th></tr></thead>
            <tbody>{debug.processes.map(process => <tr key={`${process.role}:${process.pid}`}><th scope="row">{process.role} / {process.pid}</th><td>{process.privateMb.toFixed(1)}</td><td>{process.workingSetMb.toFixed(1)}</td><td>{process.cpuPercent?.toFixed(1) ?? 'Unavailable'}</td></tr>)}</tbody>
          </table></div>
        </details>
        <details>
          <summary>Operation timings ({debug.operations.length})</summary>
          <p>Since recording began, sorted by total elapsed time. Includes waiting and nested operations; these values cannot be added together or treated as CPU percentages.</p>
          <div className="resource-debug-scroll"><table>
            <thead><tr><th>Operation</th><th>Calls</th><th>Total ms</th><th>Max ms</th><th>Active / failed</th></tr></thead>
            <tbody>{debug.operations.map(operation => <tr key={operation.name}><th scope="row">{operation.name}</th><td>{operation.calls}</td><td>{operation.totalMs.toFixed(1)}</td><td>{operation.maxMs.toFixed(1)}</td><td>{operation.inFlight} / {operation.failures}</td></tr>)}</tbody>
          </table></div>
        </details>
      </>}
    </div>
  </SettingSection>;
}
