import { useMemo, useState, type CSSProperties } from 'react';
import { Activity, ArrowDown, ArrowUp, Clock3, Search } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import type { ResourceMonitorSnapshot } from '../../../../shared/resource-monitor';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingSwitch } from './settings-primitives';
import './resource-diagnostics.css';

type Point = ResourceMonitorSnapshot['history'][number];
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const number = (value: number | null | undefined, suffix = '') => value == null ? 'Unavailable' : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
const bytes = (value: number | null | undefined) => value == null ? 'Unavailable' : value >= 1048576 ? `${number(value / 1048576)} MB` : value >= 1024 ? `${number(value / 1024)} KB` : `${number(value)} B`;
const memory = (value: number | null | undefined) => value == null ? 'Unavailable' : value >= 1024 ? `${number(value / 1024)} GB` : `${number(value)} MB`;
const clock = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const groupNames = { desktop: 'Desktop', capture: 'Capture', audio: 'Audio', monitor: 'Collector' };
const roleNames: Record<string, string> = { Browser: 'Main process', Tab: 'Renderer', GPU: 'GPU process', Utility: 'Utility' };

function Reading({ value, format, rate = false }: { value: number | null | undefined; format(value: number): string; rate?: boolean }) {
  return <output data-unavailable={value == null || undefined}>{value == null ? <><span aria-hidden>—</span><span className="sr-only">Unavailable</span></> : <>{format(value)}{rate && <small>/s</small>}</>}</output>;
}

function ResourceTimeRange({ minutes, onChange }: { minutes: number; onChange(minutes: number): void }) {
  return <Select value={String(minutes)} onValueChange={value => onChange(Number(value))}>
    <SelectTrigger className="resource-timeframe" aria-label="Resource time range">
      <Clock3 size={14} aria-hidden /><SelectValue />
    </SelectTrigger>
    <SelectContent className="resource-timeframe-menu" align="end" onEscapeKeyDown={event => event.stopPropagation()}>
      <div className="resource-timeframe-menu__label" aria-hidden>History window</div>
      {[5, 15, 30, 60].map(value => <SelectItem key={value} value={String(value)}>{value === 60 ? 'Last hour' : `Last ${value} minutes`}</SelectItem>)}
    </SelectContent>
  </Select>;
}

function Trace({ points, field, secondary, color, label, format, start, end }: {
  points: Point[]; field: 'cpuPercent' | 'residentMb' | 'readBps'; secondary?: 'privateMb' | 'writeBps';
  color: string; label: string; format(value: number | null): string; start: number; end: number;
}) {
  const values = points.flatMap(point => [point[field], ...(secondary ? [point[secondary]] : [])]).filter((value): value is number => value !== null);
  const maximum = Math.max(field === 'cpuPercent' ? 1 : 0.1, ...values) * 1.15;
  function path(key: typeof field | NonNullable<typeof secondary>) {
    let connected = false, previousAt = 0;
    return points.map(point => {
      const value = point[key];
      if (value === null) { connected = false; return ''; }
      const timestamp = Date.parse(point.at);
      const x = 3 + (timestamp - start) / Math.max(1, end - start) * 594;
      const y = 84 - value / maximum * 76;
      const command = connected && timestamp - previousAt <= 15_000 ? 'L' : 'M';
      connected = true; previousAt = timestamp;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }
  return <><div className="resource-trace" data-empty={!values.length || undefined} style={{ '--trace-color': color } as CSSProperties}>
    {values.length > 0 && <div className="resource-trace__scale"><span>{format(maximum)}</span><span>0</span></div>}
    <svg viewBox="0 0 600 94" preserveAspectRatio="none" role="img" aria-label={`${label}, ${points.length} samples. Peak ${format(values.length ? Math.max(...values) : null)}.`}>
      <line x1="0" y1="8" x2="600" y2="8" className="resource-trace__grid" />
      <line x1="0" y1="46" x2="600" y2="46" className="resource-trace__grid" />
      <line x1="0" y1="84" x2="600" y2="84" className="resource-trace__grid" />
      <path d={path(field)} className="resource-trace__line" />
      {secondary && <path d={path(secondary)} className={`resource-trace__line resource-trace__line--${secondary}`} />}
    </svg>
    {points.length > 0 && points.filter(point => point[field] !== null).length < 2 && <span className="resource-trace__empty">{values.length ? 'Waiting for the next sample' : 'No measurements yet'}</span>}
  </div><div className="resource-trace-time" data-empty={!points.length || undefined}><span>{end ? clock(new Date(start).toISOString()) : '—'}</span><span>{end ? clock(new Date(end).toISOString()) : '—'}</span></div></>;
}

export function ResourceDiagnostics({ snapshot, showExport = true }: { snapshot: SystemSnapshot; showExport?: boolean }) {
  const updateSettings = useSystemStore(state => state.updateSettings);
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'privateMb' | 'cpuPercent' | 'observedCpuSeconds' | 'observedReadBytes' | 'observedWriteBytes'>('privateMb');
  const [descending, setDescending] = useState(true);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const developerMode = snapshot.settings.developerMode === true;
  const diagnosticRunActive = snapshot.diagnostics.status === 'running';
  const recording = diagnosticRunActive || developerMode && snapshot.settings.detailedDiagnostics;
  const debug = snapshot.performance.debug;
  const resources = snapshot.performance.resources;
  const end = resources ? Date.parse(resources.sampledAt) : 0;
  const start = end - minutes * 60_000;
  const points = useMemo(() => resources?.history.filter(point => Date.parse(point.at) >= start) ?? [], [resources, start]);
  const latest = resources?.history.at(-1);
  const processes = resources?.processes ?? [];
  const active = processes.filter(process => process.active && process.sampledAt === resources?.sampledAt);
  const visible = processes.filter(process => `${process.name} ${process.role} ${process.pid} ${groupNames[process.group]}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (descending ? -1 : 1) * ((a[sort] ?? -1) - (b[sort] ?? -1)) || a.pid - b.pid);
  const maxMemory = Math.max(1, ...processes.map(process => process.privateMb));
  const sortedHeader = (key: typeof sort, title: string) => <th scope="col" aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => { setSort(key); setDescending(sort === key ? !descending : true); }}>{title}{sort === key && (descending ? <ArrowDown size={11} aria-hidden /> : <ArrowUp size={11} aria-hidden />)}</button></th>;
  async function exportReport() {
    setExporting(true); setMessage('');
    try { setMessage(await switchboardApi.exportResourceDiagnostics() ? 'Report saved.' : 'Export canceled.'); }
    catch { setMessage('Could not save the report. Check the destination and try again.'); }
    finally { setExporting(false); }
  }
  return <section className="resource-monitor" aria-label="Resource monitor">
    <div className="resource-monitor__recording">
      <SettingSwitch settingId="diagnostics.detailed" title="Detailed resource diagnostics"
        description={diagnosticRunActive ? 'One-minute diagnostic collection is running.' : developerMode ? 'Collect process history while diagnosing a problem.' : 'Run diagnostics from Checks, or enable Developer mode to record.'}
        checked={recording} disabled={pending || !developerMode || diagnosticRunActive}
        onCheckedChange={enabled => { setMessage(''); setPending(true); void updateSettings({ detailedDiagnostics: enabled }).catch(() => setMessage('Could not change recording. Try again.')).finally(() => setPending(false)); }} />
      {showExport && <Button variant="secondary" size="sm" disabled={exporting || pending || !developerMode && !snapshot.diagnostics.id} onClick={() => void exportReport()}>{exporting ? 'Exporting…' : 'Export diagnostics'}</Button>}
      {!recording && <Button size="sm" variant="secondary" disabled={pending} onClick={() => {
        setPending(true); setMessage(''); void switchboardApi.runDiagnostics().catch(() => setMessage('Could not start diagnostics. Try again.')).finally(() => setPending(false));
      }}>Run diagnostics</Button>}
      {diagnosticRunActive && <Button size="sm" variant="secondary" disabled={pending} onClick={() => {
        setPending(true); setMessage(''); void switchboardApi.cancelDiagnostics().catch(() => setMessage('Could not cancel diagnostics. Try again.')).finally(() => setPending(false));
      }}>Cancel diagnostics</Button>}
    </div>
    {message && <p role="status">{message}</p>}
    <div className="resource-monitor__heading">
      <div className="resource-monitor__identity"><h3><Activity size={15} aria-hidden />Switchboard footprint</h3>
        {(recording || resources) && <span className="resource-recording-state" data-recording={recording || undefined}>{recording ? resources ? 'Recording' : 'Collecting…' : `Last recorded ${clock(resources!.sampledAt)}`}</span>}
      </div>
      <ResourceTimeRange minutes={minutes} onChange={setMinutes} />
    </div>
    {resources?.error && <p className="resource-monitor__error" role="status">{recording
      ? 'Resource counters are temporarily unavailable. Retrying automatically; other diagnostics remain available.'
      : 'Some resource samples could not be collected. Available diagnostics can still be exported.'}</p>}
    {resources?.status === 'partial' && <p className="resource-monitor__error" role="status">{resources.inaccessible} processes could not be read. Aggregate charts show gaps for incomplete samples.</p>}
    <div className="resource-instruments">
      <section className="resource-instrument resource-instrument--cpu" aria-label="CPU history">
        <div className="resource-instrument__label">CPU <span>normalized</span></div>
        <Reading value={latest?.cpuPercent} format={value => number(value, '%')} />
        <p>{processes.length ? `${number(total(processes.map(process => process.observedCpuSeconds)), ' s')} observed CPU time` : '\u00a0'}</p>
        <Trace points={points} field="cpuPercent" color="var(--accent-brand)" label="CPU percentage" format={value => number(value, '%')} start={start} end={end} />
        <div className="resource-legend"><span>CPU</span>{points.some(point => point.cpuPercent !== null) && <span>Peak {number(Math.max(...points.map(point => point.cpuPercent ?? 0)), '%')}</span>}</div>
      </section>
      <section className="resource-instrument resource-instrument--memory" aria-label="Memory history">
        <div className="resource-instrument__label">Resident memory <span>working set</span></div>
        <Reading value={latest?.residentMb} format={memory} />
        <p>{latest?.privateMb != null ? `${memory(latest.privateMb)} private memory` : '\u00a0'}</p>
        <Trace points={points} field="residentMb" secondary="privateMb" color="var(--channel-game)" label="Resident and private memory" format={memory} start={start} end={end} />
        <div className="resource-legend"><span>Resident</span><span className="resource-legend__private">Private</span></div>
      </section>
      <section className="resource-instrument resource-instrument--io" aria-label="I/O history">
        <div className="resource-instrument__label">I/O throughput <span>read / write</span></div>
        <div className="resource-io-readout"><Reading value={latest?.readBps} format={bytes} rate /><Reading value={latest?.writeBps} format={bytes} rate /></div>
        <p>{processes.length ? `${bytes(total(processes.map(process => process.observedReadBytes)))} read · ${bytes(total(processes.map(process => process.observedWriteBytes)))} written` : '\u00a0'}</p>
        <Trace points={points} field="readBps" secondary="writeBps" color="var(--channel-chat)" label="I/O bytes per second" format={value => `${bytes(value)}/s`} start={start} end={end} />
        <div className="resource-legend"><span>Read</span><span className="resource-legend__write">Write</span></div>
      </section>
    {!points.length && <p className="resource-history-empty">{recording ? 'Waiting for the first resource sample…' : 'No resource samples yet. Run diagnostics to begin.'}</p>}
    </div>
    {resources && <>
      <div className="resource-groups" aria-label="Resource attribution">{(['desktop', 'capture', 'audio', 'monitor'] as const).map(group => {
        const rows = active.filter(process => process.group === group);
        const inactive = (group === 'audio' || group === 'capture') && !snapshot.engines.some(engine => engine.kind === group && (engine.state === 'running' || engine.state === 'starting'));
        return <div key={group} className={`resource-group resource-group--${group}`}><h4>{groupNames[group]}<span>{rows.length} {rows.length === 1 ? 'process' : 'processes'}</span></h4>
          <strong>{rows.length ? <>{memory(total(rows.map(process => process.residentMb)))} <small>resident</small></> : inactive ? 'Inactive' : 'No sample'}</strong><span>{rows.length && rows.every(row => row.cpuPercent !== null) ? `${number(total(rows.map(row => row.cpuPercent!)), '%')} CPU` : inactive ? 'Engine stopped' : 'CPU unavailable'}</span>
        </div>;
      })}</div>
      <div className="resource-monitor__heading resource-process-heading"><h3>Process activity <small>{active.length} measured · {processes.filter(process => !process.active).length} exited</small></h3><label className="resource-search"><Search size={13} aria-hidden /><input type="search" aria-label="Filter processes" placeholder="Filter processes" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <div className="resource-process-scroll" role="region" aria-label="Process activity" tabIndex={0}><table className="resource-processes">
        <thead><tr><th scope="col">Process</th>{sortedHeader('privateMb', 'Private')}{sortedHeader('cpuPercent', 'CPU')}{sortedHeader('observedCpuSeconds', 'CPU time')}{sortedHeader('observedReadBytes', 'Read')}{sortedHeader('observedWriteBytes', 'Written')}<th scope="col">Peak RSS</th><th scope="col">Handles</th></tr></thead>
        <tbody>{visible.length ? visible.map(process => <tr key={`${process.pid}:${process.startedAt}`} data-inactive={!process.active}>
          <th scope="row"><details><summary><strong>{roleNames[process.role] ?? process.role}</strong><span>{process.pid} · {process.active ? process.sampledAt === resources.sampledAt ? groupNames[process.group] : 'Not read' : 'Exited'}</span></summary>
            <dl className="resource-process-detail"><div><dt>Executable</dt><dd>{process.name}</dd></div><div><dt>Started</dt><dd>{clock(process.startedAt)}</dd></div><div><dt>Last measured</dt><dd>{clock(process.sampledAt)}</dd></div><div><dt>Resident</dt><dd>{memory(process.residentMb)}</dd></div><div><dt>Peak CPU</dt><dd>{number(process.peakCpuPercent, '%')}</dd></div><div><dt>Read /s</dt><dd>{bytes(process.readBps)}</dd></div><div><dt>Write /s</dt><dd>{bytes(process.writeBps)}</dd></div><div><dt>Samples</dt><dd>{process.samples}</dd></div></dl>
          </details></th>
          <td><span className="resource-memory-bar" style={{ '--memory-share': `${process.privateMb / maxMemory * 100}%` } as CSSProperties}>{memory(process.privateMb)}</span></td><td>{number(process.cpuPercent, '%')}</td><td>{number(process.observedCpuSeconds, ' s')}</td><td>{bytes(process.observedReadBytes)}</td><td>{bytes(process.observedWriteBytes)}</td><td>{memory(process.peakResidentMb)}</td><td>{number(process.handles)}</td>
        </tr>) : <tr><td colSpan={8} className="resource-empty">{query ? 'No processes match this filter.' : 'No process measurements available.'}</td></tr>}</tbody>
      </table></div>
      <p className="resource-note">Totals cover observed intervals. Process peaks include time before recording. I/O includes files, network and devices. Expand a process for rates and lifetime details.</p>
      <details className="resource-disclosure"><summary>Host & collection <span>{resources.status === 'available' ? `${active.length} processes measured` : 'Partial or unavailable measurements'} · {number(resources.collectionMs, ' ms')}</span></summary>
        <div className="resource-host-columns"><dl>
          <div><dt>Power source</dt><dd>{resources.host.power === 'ac' ? 'External power' : resources.host.power === 'battery' ? 'Battery' : 'Unknown'}</dd></div><div><dt>System idle</dt><dd>{resources.host.idleState} · {number(resources.host.idleSeconds, ' s')}</dd></div>
          <div><dt>System memory</dt><dd>{memory(resources.host.freeMemoryMb)} free / {memory(resources.host.totalMemoryMb)}</dd></div><div><dt>Logical processors</dt><dd>{resources.logicalProcessors}</dd></div><div><dt>Thermal / CPU speed limit</dt><dd>Unavailable on this collector</dd></div>
        </dl><dl><div><dt>Coverage</dt><dd>{active.length} / {resources.requested} requested</dd></div><div><dt>Inaccessible or exited during collection</dt><dd>{resources.inaccessible}</dd></div><div><dt>Collector PID / restarts</dt><dd>{resources.monitorPid ?? 'Unavailable'} / {resources.restarts}</dd></div><div><dt>Observed starts / exits</dt><dd>{resources.observedStarts} / {resources.observedExits}</dd></div><div><dt>Discarded process lifetimes</dt><dd>{resources.droppedProcesses}</dd></div></dl></div>
        {resources.error && <p className="resource-note">Last collection detail: {resources.error}</p>}
        <p className="resource-note">Starts count first observations. Processes that start and exit between samples are not captured. Charts retain up to 720 points; exports also retain the latest 120 full samples. Display refreshes every 30 seconds and when collection recovers.</p>
      </details>
    </>}
    {debug && <details className="resource-disclosure"><summary>Main loop & operations <span>{debug.operations.length} operations</span></summary>
      <dl className="resource-loop"><div><dt>Main loop busy</dt><dd>{number(debug.eventLoopUtilizationPercent, '%')}</dd></div><div><dt>p99 loop interval</dt><dd>{number(debug.eventLoopDelayP99Ms, ' ms')}</dd></div><div><dt>Max loop interval</dt><dd>{number(debug.eventLoopDelayMaxMs, ' ms')}</dd></div></dl>
      <p className="resource-note">20 ms timing probe. Operation durations include waiting and nested calls; they overlap and do not measure CPU usage.</p>
      <div className="resource-process-scroll" role="region" aria-label="Operation timings" tabIndex={0}><table className="resource-processes"><thead><tr><th>Operation</th><th>Calls</th><th>Total ms</th><th>Max ms</th><th>Active / failed</th></tr></thead><tbody>{debug.operations.length ? debug.operations.map(operation => <tr key={operation.name}><th scope="row">{operation.name}</th><td>{operation.calls}</td><td>{number(operation.totalMs)}</td><td>{number(operation.maxMs)}</td><td>{operation.inFlight} / {operation.failures}</td></tr>) : <tr><td colSpan={5}>No operations recorded.</td></tr>}</tbody></table></div>
    </details>}
    {resources?.runtime && <details className="resource-disclosure"><summary>Runtime memory & objects <span>Main and renderer</span></summary><div className="resource-host-columns"><dl>
      <div><dt>Main JS heap</dt><dd>{memory(resources.runtime.mainHeapMb)}</dd></div><div><dt>External / array buffers</dt><dd>{memory(resources.runtime.mainExternalMb)} / {memory(resources.runtime.mainArrayBuffersMb)}</dd></div>
      <div><dt>Active main resources</dt><dd>{Object.entries(resources.runtime.activeResources).map(([name, count]) => `${name}: ${count}`).join(' · ') || 'None'}</dd></div>
    </dl><dl><div><dt>Renderer JS heap (approximate)</dt><dd>{memory(resources.runtime.rendererHeapMb)}</dd></div><div><dt>DOM nodes</dt><dd>{number(resources.runtime.domNodes)}</dd></div><div><dt>Canvas / image / video objects</dt><dd>{number(resources.runtime.canvases)} / {number(resources.runtime.images)} / {number(resources.runtime.videos)}</dd></div><div><dt>Observed renderer long tasks</dt><dd>{number(resources.runtime.longTasks)}</dd></div></dl></div></details>}
    {resources?.events && <details className="resource-disclosure"><summary>Recent activity <span>{resources.events.length} retained events</span></summary>
      <div className="resource-event-filter"><button type="button" aria-pressed={errorsOnly} onClick={() => setErrorsOnly(!errorsOnly)}>Warnings & errors only</button><span>Latest 60 events · full bounded timeline in export</span></div>
      <div className="resource-process-scroll" role="region" aria-label="Diagnostic activity" tabIndex={0}><table className="resource-processes resource-events"><thead><tr><th>Event</th><th>Source</th><th>Level</th><th>Time</th></tr></thead><tbody>
        {resources.events.filter(event => !errorsOnly || event.level === 'warning' || event.level === 'error').map((event, index) => <tr key={`${event.at}:${index}`} data-level={event.level}><th scope="row"><details><summary>{event.event}</summary><pre>{event.detail}</pre></details></th><td>{event.source}</td><td>{event.level}</td><td>{clock(event.at)}</td></tr>)}
        {!resources.events.some(event => !errorsOnly || event.level === 'warning' || event.level === 'error') && <tr><td colSpan={4}>No matching events in this sample.</td></tr>}
      </tbody></table></div>
    </details>}
  </section>;
}
