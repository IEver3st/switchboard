import type { WebContents } from 'electron';
import type { Profiler } from 'node:inspector';
import { setTimeout as delay } from 'node:timers/promises';
import type { DevelopmentProfileRequest } from '../../shared/development-feedback';

export type CpuProfile = Profiler.Profile;
export type ProfileResult = { target: 'main' | 'renderer'; profile?: CpuProfile; error?: string };

// No inspector session or debugger attachment exists outside these short recordings.
export async function recordDevelopmentProfiles(
  request: Pick<DevelopmentProfileRequest, 'target' | 'durationMs'>,
  renderer: WebContents | null,
  signal: AbortSignal,
): Promise<ProfileResult[]> {
  async function record(target: 'main' | 'renderer'): Promise<ProfileResult> {
    let close = () => {};
    try {
      signal.throwIfAborted();
      let send: (method: string, params?: Record<string, unknown>) => Promise<any>;
      if (target === 'main') {
        const { Session } = await import('node:inspector/promises');
        signal.throwIfAborted();
        const session = new Session();
        session.connect();
        close = () => session.disconnect();
        send = (method, params) => session.post(method, params);
      } else {
        if (!renderer || renderer.isDestroyed()) throw new Error('No renderer is running (it may be destroyed in tray).');
        if (renderer.debugger.isAttached() || renderer.isDevToolsOpened()) throw new Error('Renderer debugger is already in use; close DevTools to profile it.');
        renderer.debugger.attach('1.3');
        close = () => { if (!renderer.isDestroyed() && renderer.debugger.isAttached()) renderer.debugger.detach(); };
        send = (method, params) => renderer.debugger.sendCommand(method, params);
      }
      const command = (method: string, params?: Record<string, unknown>) => boundedCommand(send(method, params), signal);
      await command('Profiler.enable');
      await command('Profiler.setSamplingInterval', { interval: 1_000 });
      await command('Profiler.start');
      await delay(request.durationMs, undefined, { signal });
      const { profile } = await command('Profiler.stop');
      return { target, profile };
    } catch (error) {
      return { target, error: error instanceof Error ? error.message : String(error) };
    } finally {
      try { close(); } catch { /* Renderer exit/detach may win the race. */ }
    }
  }
  return Promise.all((request.target === 'both' ? ['main', 'renderer'] as const : [request.target]).map(record));
}

function boundedCommand<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Profiler command timed out.')), 2_000);
    const abort = () => finish(new Error('Profiling cancelled.'));
    function finish(error?: Error, value?: T) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void task.then(value => finish(undefined, value), error => finish(error));
  });
}

/** Leaf samples represent self time; async operation timings elsewhere are inclusive wall time. */
export function summarizeCpuProfile(profile: CpuProfile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
  const parents = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const rows = new Map<number, number>();
  let sampledUs = 0;
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const id = profile.samples![index]!;
    const micros = Math.max(0, profile.timeDeltas?.[index] ?? 0);
    sampledUs += micros;
    rows.set(id, (rows.get(id) ?? 0) + micros);
  }
  return {
    durationMs: (profile.endTime - profile.startTime) / 1_000,
    samples: profile.samples?.length ?? 0,
    hotspots: [...rows].filter(([id]) => !['(idle)', '(root)'].includes(nodes.get(id)?.functionName ?? ''))
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, micros]) => {
        const frame = nodes.get(id);
        const callers: Array<{ function: string; url: string; line: number }> = [];
        let parent = parents.get(id);
        while (parent !== undefined && callers.length < 6) {
          const caller = nodes.get(parent);
          if (!caller || caller.functionName === '(root)') break;
          callers.push({ function: caller.functionName || '(anonymous)', url: caller.url, line: caller.lineNumber + 1 });
          parent = parents.get(parent);
        }
        return { function: frame?.functionName || '(anonymous)', url: frame?.url ?? '', line: (frame?.lineNumber ?? -1) + 1,
          selfMs: Math.round(micros / 100) / 10, percent: sampledUs ? Math.round(micros / sampledUs * 1_000) / 10 : 0, callers };
      }),
  };
}
