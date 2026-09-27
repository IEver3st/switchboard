import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Cable, CheckCircle2, CircleDashed, ExternalLink, Loader2, Mic, Power, RefreshCw } from 'lucide-react';
import type { AudioDependencyState } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { useSystemStore } from '@/stores/use-system-store';
import './audio-dependency-setup.css';

type Kind = 'cable' | 'microphone';
type Tone = 'neutral' | 'busy' | 'success' | 'warning' | 'danger';

const drivers: ReadonlyArray<{ kind: Kind; title: string; product: string; purpose: string; icon: typeof Cable }> = [
  { kind: 'cable', title: 'App mixing', product: 'VB-CABLE', purpose: 'Gives each app its own mixer channel', icon: Cable },
  { kind: 'microphone', title: 'Processed microphone', product: 'Hi-Fi Cable', purpose: 'Sends your processed voice to chat apps', icon: Mic },
];

// A focus re-check only runs while setup is incomplete and idle; it never polls.
const focusRecheckMs = 15_000;

export function AudioDependencySetupPanel({ state, readyHint = 'Turn on the audio engine to start mixing.' }: { state: AudioDependencyState; readyHint?: string }) {
  const setup = useSystemStore(s => s.audioDependencySetup);
  const checked = useRef(false);
  const lastCheck = useRef(0);
  const available = Boolean(window.switchboard);
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  const missing = drivers.filter(driver => !state[driver.kind]);
  const current = drivers.find(driver => driver.kind === state.current)?.product ?? 'the driver';

  useEffect(() => {
    if (!checked.current && state.phase === 'idle' && available) {
      checked.current = true;
      lastCheck.current = Date.now();
      void setup('check');
    }
  }, [available, setup, state.phase]);

  // Returning from the Windows installer or Sound settings refreshes detection.
  useEffect(() => {
    if (!available || state.phase !== 'idle') return;
    const onFocus = () => {
      if (Date.now() - lastCheck.current < focusRecheckMs) return;
      lastCheck.current = Date.now();
      void setup('check');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [available, setup, state.phase]);

  const summary = describe(state, missing.length, current, readyHint);
  const install = !busy && ['idle', 'error'].includes(state.phase);
  const installLabel = state.phase === 'error' ? 'Retry audio setup'
    : missing.length === 0 ? 'Finish setup'
    : missing.length === 1 ? `Install ${missing[0]!.product}`
    : 'Install audio drivers';

  return (
    <section
      className="driver-setup"
      data-phase={state.phase}
      aria-label="Audio driver setup"
      aria-busy={busy}
      id="setting-audio.dependencies"
      tabIndex={-1}
      data-setting-id="audio.dependencies"
    >
      <div className="driver-setup__summary" data-tone={summary.tone}>
        <span className="driver-setup__summary-icon" aria-hidden>{summary.icon}</span>
        <div className="driver-setup__summary-copy" role={state.phase === 'error' ? 'alert' : 'status'} aria-live="polite">
          <strong>{summary.title}</strong>
          {summary.detail ? <small>{summary.detail}</small> : null}
        </div>
        <div className="driver-setup__actions">
          {state.phase === 'downloading' ? (
            <Button size="sm" variant="secondary" onClick={() => void setup('cancel')}>Cancel download</Button>
          ) : null}
          {install ? (
            <Button size="sm" disabled={!available} onClick={() => void setup('install')}>{installLabel}</Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !available}
            onClick={() => { lastCheck.current = Date.now(); void setup('check'); }}
          >
            <RefreshCw aria-hidden className={state.phase === 'checking' ? 'animate-spin motion-reduce:animate-none' : undefined} />
            Check again
          </Button>
        </div>
      </div>

      <ul className="driver-setup__list" aria-label="Audio drivers">
        {drivers.map(driver => {
          const status = driverStatus(state, driver.kind);
          const Icon = driver.icon;
          return (
            <li key={driver.kind} className="driver-setup__driver" data-tone={status.tone}>
              <Icon className="driver-setup__driver-icon" aria-hidden />
              <span className="driver-setup__driver-copy">
                <strong>{driver.title}</strong>
                <small>{driver.product} · {driver.purpose}</small>
              </span>
              <span className="driver-setup__state">
                {status.icon}
                {status.label}
              </span>
              {status.progress !== undefined ? (
                <span
                  className="driver-setup__progress"
                  role="progressbar"
                  aria-label={`Downloading ${driver.product}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={status.progress ?? undefined}
                  data-indeterminate={status.progress === null || undefined}
                >
                  <span style={{ width: `${status.progress ?? 100}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="driver-setup__note">
        {available
          ? 'Official VB-Audio donationware, downloaded only when you choose Install. No purchase is required. '
          : 'Driver installation is available in the Windows desktop app. '}
        <a href="https://vb-audio.com/Services/licensing.htm" target="_blank" rel="noreferrer">
          VB-Audio licensing and support<ExternalLink aria-hidden />
        </a>
      </p>
    </section>
  );
}

function describe(state: AudioDependencyState, missing: number, current: string, readyHint: string): { tone: Tone; icon: ReactNode; title: string; detail: string | null } {
  switch (state.phase) {
    case 'checking':
      return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" />, title: 'Checking installed audio drivers…', detail: null };
    case 'downloading':
      return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" />, title: `Downloading ${current}${state.progress === null ? '' : ` · ${state.progress}%`}`, detail: 'The official installer opens when the download finishes.' };
    case 'installing':
      return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" />, title: `Finish ${current} in the Windows installer`, detail: 'Approve the administrator prompt and click Install if asked.' };
    case 'restart-required':
      return { tone: 'warning', icon: <Power />, title: 'Restart Windows to finish audio setup', detail: 'Then return here and choose Check again.' };
    case 'ready':
      return { tone: 'success', icon: <CheckCircle2 />, title: 'Audio drivers are ready', detail: readyHint };
    case 'error':
      return { tone: 'danger', icon: <AlertTriangle />, title: 'Audio setup did not finish', detail: state.error };
    default:
      return missing === 0
        ? { tone: 'neutral', icon: <CircleDashed />, title: 'Drivers found, setup not finished', detail: 'Finish setup to configure the processed microphone format.' }
        : { tone: 'neutral', icon: <CircleDashed />, title: missing === 1 ? '1 audio driver needed' : '2 audio drivers needed', detail: 'Windows asks for administrator approval and may need a restart.' };
  }
}

function driverStatus(state: AudioDependencyState, kind: Kind): { tone: Tone; icon: ReactNode; label: string; progress?: number | null } {
  if (state.current === kind && state.phase === 'downloading') {
    return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />, label: state.progress === null ? 'Downloading' : `${state.progress}%`, progress: state.progress };
  }
  if (state.current === kind && state.phase === 'installing') {
    return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />, label: 'Installing' };
  }
  if (state[kind]) return { tone: 'success', icon: <CheckCircle2 aria-hidden />, label: 'Installed' };
  if (state.phase === 'checking') return { tone: 'busy', icon: <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />, label: 'Checking' };
  if (state.phase === 'restart-required') return { tone: 'warning', icon: <Power aria-hidden />, label: 'After restart' };
  return { tone: 'neutral', icon: <CircleDashed aria-hidden />, label: 'Not installed' };
}
