import type { NativeResourceSample, ResourceMonitorSnapshot, ResourceProcess } from '../../shared/resource-monitor';

export type ResourceIdentity = { pid: number; role: string; group: ResourceProcess['group'] };
type Host = ResourceMonitorSnapshot['host'];
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const delta = (current: number | null, previous: number | null) => current === null || previous === null ? null : Math.max(0, current - previous);

export class ResourceHistory {
  private state: ResourceMonitorSnapshot | undefined;
  private previous = new Map<string, { at: number; value: NativeResourceSample['processes'][number] }>();
  clear(): void { this.state = undefined; this.previous.clear(); }
  snapshot(): ResourceMonitorSnapshot | undefined { return this.state ? structuredClone(this.state) : undefined; }
  attachRuntime(runtime: ResourceMonitorSnapshot['runtime'], events: ResourceMonitorSnapshot['events']): ResourceMonitorSnapshot | undefined {
    if (this.state) { this.state.runtime = runtime; this.state.events = events; }
    return this.snapshot();
  }

  record(input: { at: string; native: NativeResourceSample | null; identities: ResourceIdentity[]; host: Host;
    logicalProcessors: number; restarts: number; error: string | null }): ResourceMonitorSnapshot {
    const { native, at, host, logicalProcessors } = input;
    const state = this.state ??= { startedAt: at, sampledAt: at, status: 'unavailable', error: null,
      sampleCount: 0, observedStarts: 0, observedExits: 0, droppedProcesses: 0, collectionMs: 0, requested: 0,
      inaccessible: 0, restarts: 0, monitorPid: null, logicalProcessors, host, history: [], processes: [] };
    state.sampledAt = at; state.host = host; state.restarts = input.restarts;
    state.status = native ? native.inaccessible ? 'partial' : 'available' : 'unavailable'; state.error = input.error;
    state.collectionMs = native?.durationMs ?? 0; state.requested = native?.requested ?? input.identities.length;
    state.inaccessible = native?.inaccessible ?? input.identities.length;
    state.monitorPid = native?.monitorPid ?? null;
    const identities = new Map(input.identities.map(identity => [identity.pid, identity]));
    if (native) identities.set(native.monitorPid, { pid: native.monitorPid, role: 'Resource collector', group: 'monitor' });
    for (const process of state.processes) {
      if (process.active && !identities.has(process.pid)) { process.active = false; state.observedExits++; }
      process.cpuPercent = null; process.readBps = null; process.writeBps = null;
    }
    const current: ResourceProcess[] = [];
    for (const value of native?.processes ?? []) {
      const identity = identities.get(value.pid);
      if (!identity) continue;
      const key = `${value.pid}:${value.startedAt}`;
      const previous = this.previous.get(key);
      const elapsed = previous ? (Date.parse(at) - previous.at) / 1000 : 0;
      const cpu = previous && elapsed > 0 ? delta(value.cpuSeconds, previous.value.cpuSeconds) : null;
      const read = previous && elapsed > 0 ? delta(value.readBytes, previous.value.readBytes) : null;
      const write = previous && elapsed > 0 ? delta(value.writeBytes, previous.value.writeBytes) : null;
      let row = state.processes.find(process => process.pid === value.pid && process.startedAt === value.startedAt);
      if (!row) {
        // PID reuse is a new lifetime, never a delta against the old process.
        for (const old of state.processes.filter(process => process.pid === value.pid && process.active)) { old.active = false; state.observedExits++; }
        if (state.processes.length >= 256) {
          const inactive = state.processes.findIndex(process => !process.active);
          if (inactive < 0) { state.droppedProcesses++; continue; }
          const removed = state.processes.splice(inactive, 1)[0]!;
          this.previous.delete(`${removed.pid}:${removed.startedAt}`); state.droppedProcesses++;
        }
        row = { ...value, ...identity, cpuPercent: null, peakCpuPercent: null, observedCpuSeconds: 0,
          readBps: null, writeBps: null, observedReadBytes: 0, observedWriteBytes: 0, samples: 0, active: true, sampledAt: at };
        state.processes.push(row); state.observedStarts++;
      }
      Object.assign(row, value, { active: true, sampledAt: at });
      row.cpuPercent = cpu === null ? null : cpu / elapsed / logicalProcessors * 100;
      row.peakCpuPercent = row.cpuPercent === null ? row.peakCpuPercent : Math.max(row.peakCpuPercent ?? 0, row.cpuPercent);
      row.observedCpuSeconds += cpu ?? 0; row.observedReadBytes += read ?? 0; row.observedWriteBytes += write ?? 0;
      row.readBps = read === null ? null : read / elapsed; row.writeBps = write === null ? null : write / elapsed;
      row.samples++;
      this.previous.set(key, { at: Date.parse(at), value }); current.push(row);
    }
    state.sampleCount++;
    const complete = native && native.inaccessible === 0 && current.length > 0 && current.length === identities.size;
    if (native) {
      state.requested = identities.size;
      state.inaccessible = Math.max(native.inaccessible, identities.size - current.length);
      state.status = complete ? 'available' : 'partial';
    }
    const rate = (field: 'cpuPercent' | 'readBps' | 'writeBps') => complete && current.every(row => row[field] !== null)
      ? sum(current.map(row => row[field]!)) : null;
    state.history.push({ at, cpuPercent: rate('cpuPercent'), privateMb: complete ? sum(current.map(row => row.privateMb)) : null,
      residentMb: complete ? sum(current.map(row => row.residentMb)) : null, readBps: rate('readBps'), writeBps: rate('writeBps'), processes: current.length });
    if (state.history.length > 720) state.history.shift();
    return structuredClone(state);
  }
}
