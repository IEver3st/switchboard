import { useState } from 'react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';
import { SettingSwitch } from './settings-primitives';

export function ResourceDiagnostics({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore(state => state.updateSettings);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const developerMode = snapshot.settings.developerMode === true;
  const recording = developerMode && snapshot.settings.detailedDiagnostics;
  const debug = recording ? snapshot.performance.debug : undefined;
  async function exportReport() {
    setExporting(true);
    setMessage('');
    try { setMessage(await switchboardApi.exportResourceDiagnostics() ? 'Report saved.' : 'Export canceled.'); }
    catch (error) {
      setMessage(error instanceof Error && error.message.includes('Developer mode')
        ? 'Enable Developer mode before exporting diagnostics.'
        : 'Could not save the report. Check the destination and try again.');
    }
    finally { setExporting(false); }
  }
  return <section className="diagnostics-recording" aria-labelledby="diagnostics-recording-title">
    <h3 id="diagnostics-recording-title">Debug recording</h3>
    <p>Developer mode records capture startup, FFmpeg errors, source and encoder selection, host events, and failed commands. Export after reproducing the problem.</p>
    <SettingSwitch settingId="diagnostics.detailed" title="Detailed resource diagnostics"
      description="Samples every 5 seconds. Adds measurement overhead."
      checked={recording} disabled={pending || !developerMode}
      onCheckedChange={enabled => {
        setMessage('');
        setPending(true);
        void updateSettings({ detailedDiagnostics: enabled }).finally(() => setPending(false));
      }} />
    <div className="resource-debug-report">
      <div className="resource-debug-actions">
        <p role="status" data-recording={recording}>{pending ? 'Saving…' : recording
          ? debug ? `Events and resources · since ${new Date(debug.startedAt).toLocaleTimeString()}` : 'Events recording · collecting resource sample…'
          : developerMode ? 'Events recording · resource sampling off' : 'Developer mode is off'}</p>
        <Button variant="secondary" size="sm" disabled={exporting || pending || !developerMode} onClick={() => void exportReport()} title="Save the event timeline, capture state, Windows and GPU details, and any resource samples. Paths and credentials are redacted.">{exporting ? 'Exporting…' : 'Export diagnostics'}</Button>
      </div>
      {message && <p role="status">{message}</p>}
      {debug && <>
        <div className="resource-debug-sample">
          <dl className="resource-debug-metrics">
            <div><dt>Main loop busy</dt><dd>{debug.eventLoopUtilizationPercent === null ? 'Unavailable' : `${debug.eventLoopUtilizationPercent.toFixed(1)}%`}</dd></div>
            <div><dt>p99 interval</dt><dd>{debug.eventLoopDelayP99Ms === null ? 'Unavailable' : `${debug.eventLoopDelayP99Ms} ms`}</dd></div>
            <div><dt>Max interval</dt><dd>{debug.eventLoopDelayMaxMs === null ? 'Unavailable' : `${debug.eventLoopDelayMaxMs} ms`}</dd></div>
          </dl>
          <p>20 ms probe · view updates every 30 seconds</p>
        </div>
        <details>
          <summary>Process resources ({debug.processes.length})</summary>
          <div className="resource-debug-scroll" role="region" aria-label="Process resources" tabIndex={0}><table>
            <thead><tr><th>Process / PID</th><th>Private MB</th><th>Resident MB</th><th>CPU %</th></tr></thead>
            <tbody>{debug.processes.length === 0 ? <tr><td colSpan={4} className="resource-debug-empty">No process samples.</td></tr> : debug.processes.map(process => <tr key={`${process.role}:${process.pid}`}><th scope="row">{process.role} / {process.pid}</th><td>{process.privateMb.toFixed(1)}</td><td>{process.workingSetMb.toFixed(1)}</td><td>{process.cpuPercent?.toFixed(1) ?? 'Unavailable'}</td></tr>)}</tbody>
          </table></div>
        </details>
        <details>
          <summary>Operation timings ({debug.operations.length})</summary>
          <p>Elapsed time since recording began, including waiting and nested calls. Values overlap and do not measure CPU use.</p>
          <div className="resource-debug-scroll" role="region" aria-label="Operation timings" tabIndex={0}><table>
            <thead><tr><th>Operation</th><th>Calls</th><th>Total ms</th><th>Max ms</th><th>Active / failed</th></tr></thead>
            <tbody>{debug.operations.length === 0 ? <tr><td colSpan={5} className="resource-debug-empty">No operations recorded.</td></tr> : debug.operations.map(operation => <tr key={operation.name}><th scope="row">{operation.name}</th><td>{operation.calls}</td><td>{operation.totalMs.toFixed(1)}</td><td>{operation.maxMs.toFixed(1)}</td><td>{operation.inFlight} / {operation.failures}</td></tr>)}</tbody>
          </table></div>
        </details>
      </>}
    </div>
  </section>;
}
