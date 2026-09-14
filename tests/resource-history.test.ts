import { expect, test } from 'bun:test';
import { ResourceHistory } from '../src/main/services/resource-history';
import { NativeResourceCollector } from '../src/main/services/native-resource-collector';
import { resourceMonitorSchema, type NativeResourceSample } from '../src/shared/resource-monitor';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const nativeHost = resolve('engines/capture-host/bin/Debug/net10.0-windows/Capture.Host.exe');
const at = Date.UTC(2026, 8, 14);
const processSample = (cpuSeconds=10, startedAt='2026-09-14T00:00:00Z') => ({ pid: 42, startedAt, name: 'test', cpuSeconds, privateMb: 20, residentMb: 30, peakResidentMb: 50, readBytes: cpuSeconds*1000, writeBytes: cpuSeconds*2000, handles: 10 });
function input(index: number, processes: NativeResourceSample['processes'] = [processSample(10+index)]) {
  return { at: new Date(at+index*5000).toISOString(), native: { processes, requested: processes.length, inaccessible: 0, durationMs: 2, monitorPid: 42 },
    identities: [], logicalProcessors: 4, restarts: 0, error: null,
    host: { power: 'ac' as const, idleSeconds: 0, idleState: 'active', thermal: 'unavailable', cpuSpeedLimit: null, totalMemoryMb: 16000, freeMemoryMb: 8000 } };
}
test('native deltas normalize CPU, preserve lifetime peaks and exclude pre-recording I/O', () => {
  const history = new ResourceHistory();
  const first=history.record(input(0));
  expect(first.history[0]!.cpuPercent).toBeNull();
  expect(first.processes[0]!.observedReadBytes).toBe(0);
  const second=history.record(input(1));
  expect(second.history[1]!.cpuPercent).toBe(5);
  expect(second.history[1]!.readBps).toBe(200);
  expect(second.processes[0]!.observedCpuSeconds).toBe(1);
  expect(second.processes[0]!.peakResidentMb).toBe(50);
  expect(resourceMonitorSchema.safeParse(second).success).toBe(true);
});
test('PID reuse creates a new lifetime with unavailable first rates', () => {
  const history=new ResourceHistory();history.record(input(0));
  const value=history.record(input(1,[processSample(1,'2026-09-14T00:01:00Z')]));
  expect(value.processes).toHaveLength(2);
  expect(value.observedStarts).toBe(2);expect(value.observedExits).toBe(1);
  expect(value.processes[1]!.cpuPercent).toBeNull();
});
test('partial or unavailable collection makes gaps instead of zero totals', () => {
  const history=new ResourceHistory();history.record(input(0));
  const partial=input(1);partial.native.inaccessible=1;partial.native.requested=2;
  expect(history.record(partial).history.at(-1)!.residentMb).toBeNull();
  const failed=history.record({...input(2),native:null,error:'unavailable'});
  expect(failed.status).toBe('unavailable');expect(failed.history.at(-1)!.cpuPercent).toBeNull();
});
test('trend retention is bounded, snapshots are isolated, clear resets session', () => {
  const history=new ResourceHistory();for(let i=0;i<730;i++)history.record(input(i));
  const snapshot=history.snapshot()!;expect(snapshot.history).toHaveLength(720);snapshot.history.length=0;
  expect(history.snapshot()!.history).toHaveLength(720);history.clear();expect(history.snapshot()).toBeUndefined();
});
test.skipIf(process.platform!=='win32' || !existsSync(nativeHost))('real collector restarts after stop and includes its own Windows counters', async () => {
  const collector=new NativeResourceCollector(nativeHost);
  try {
    const first=await collector.collect([process.pid]);
    expect(first.processes.some(item=>item.pid===process.pid && item.handles!>0)).toBe(true);
    expect(first.processes.some(item=>item.pid===first.monitorPid)).toBe(true);
    collector.stop();collector.stop();
    const second=await collector.collect([process.pid]);
    expect(second.monitorPid).not.toBe(first.monitorPid);expect(collector.restarts).toBe(1);
    const pending=collector.collect([process.pid]);collector.stop();await expect(pending).rejects.toThrow('stopped');
  } finally { collector.stop(); }
});
