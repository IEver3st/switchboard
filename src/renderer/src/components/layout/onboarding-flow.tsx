import './onboarding.css';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Gamepad2,
  Headphones,
  Keyboard,
  Mic,
  Monitor,
  MessagesSquare,
  Mouse,
  Play,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import type {
  CaptureResolution,
  CaptureSourceType,
  SystemSnapshot,
  VisibleWorkspace,
} from '../../../../shared/contracts';
import {
  applyWorkspacePreset,
  defaultPageForProfile,
  fullWorkspacesForDeveloperMode,
  normalizeVisibleWorkspaces,
  workspacePreset,
} from '../../../../shared/workspace-profile';
import {
  CaptureAudioDeviceSelect,
  captureInputDevices,
  captureOutputDevices,
  chatAutomaticLabel,
  gameAutomaticLabel,
  micAutomaticLabel,
} from '@/components/capture/capture-audio-device-select';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { displayShortcut } from '@/lib/shortcut';
import { useSystemStore } from '@/stores/use-system-store';

const baseSteps = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'setup', label: 'Your setup' },
  { id: 'capture', label: 'Capture' },
  { id: 'audio', label: 'Audio tracks' },
  { id: 'finish', label: 'Ready' },
] as const;

const sourceOptions: ReadonlyArray<{ value: CaptureSourceType; title: string; description: string; icon: LucideIcon }> = [
  { value: 'automatic-game', title: 'Automatic game', description: 'Follows the game in focus', icon: Gamepad2 },
  { value: 'window', title: 'One window', description: 'Pick the window in Capture', icon: AppWindow },
  { value: 'display', title: 'Whole display', description: 'Records a full monitor', icon: Monitor },
];

const resolutionOptions: ReadonlyArray<{ value: CaptureResolution; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p (Default)' },
  { value: '2160p', label: '2160p' },
  { value: 'native', label: 'Native source' },
];

const commonReplayLengths = [30, 60, 120, 300] as const;

const ease = [0.22, 1, 0.36, 1] as const;

// The exiting step reads the latest direction through AnimatePresence custom.
const stepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -20, transition: { duration: 0.14, ease: 'easeIn' as const } }),
};

const reducedStepVariants = {
  enter: { opacity: 1 },
  center: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0 } },
};

function replayLengthLabel(seconds: number, short = false): string {
  if (seconds < 60) return short ? `${seconds}s` : `${seconds} seconds`;
  const minutes = seconds / 60;
  if (short) return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function resolutionLabel(resolution: CaptureResolution): string {
  return resolutionOptions.find((option) => option.value === resolution)?.label.replace(' (Default)', '') ?? resolution;
}

function sourceLabel(source: CaptureSourceType): string {
  return sourceOptions.find((option) => option.value === source)?.title ?? source;
}

function workspaceName(workspace: VisibleWorkspace): string {
  return workspace === 'devices' ? 'Devices' : 'Capture';
}

export function OnboardingFlow({ snapshot }: { snapshot: SystemSnapshot }) {
  const developerMode = snapshot.settings.developerMode === true;
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [workspaces, setWorkspaces] = useState<VisibleWorkspace[]>(() => {
    const normalized = normalizeVisibleWorkspaces(snapshot.settings.visibleWorkspaces)
      ?? fullWorkspacesForDeveloperMode(developerMode);
    return normalized;
  });
  const steps = baseSteps;
  const finishIndex = steps.length - 1;
  const [source, setSource] = useState<CaptureSourceType>(snapshot.capture.config.source);
  const [resolution, setResolution] = useState<CaptureResolution>(snapshot.capture.config.resolution);
  const [replaySeconds, setReplaySeconds] = useState(snapshot.capture.config.replaySeconds);
  const [hotkey, setHotkey] = useState(snapshot.capture.config.hotkey);
  const [replay, setReplay] = useState(!snapshot.settings.onboardingCompleted || snapshot.capture.config.enabled);
  const [includeMic, setIncludeMic] = useState(snapshot.capture.config.includeMic);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(snapshot.capture.config.includeSystemAudio);
  const [includeChatAudio, setIncludeChatAudio] = useState(snapshot.capture.config.includeChatAudio);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | null>(snapshot.capture.config.microphoneDeviceId);
  const [systemAudioDeviceId, setSystemAudioDeviceId] = useState<string | null>(snapshot.capture.config.systemAudioDeviceId);
  const [chatAudioDeviceId, setChatAudioDeviceId] = useState<string | null>(snapshot.capture.config.chatAudioDeviceId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // Move focus to the new step heading after the enter animation starts.
    const timer = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), reduceMotion ? 0 : 60);
    return () => window.clearTimeout(timer);
  }, [active, reduceMotion]);

  const fail = (message: string) => {
    setError(message);
    setPending(false);
  };

  const goTo = (index: number) => {
    if (pending) return;
    setError(null);
    setDirection(index >= active ? 1 : -1);
    setActive(index);
  };

  const run = async (work: () => Promise<void>, next: number) => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await work();
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    setDirection(1);
    setActive(next);
  };

  const skipSetup = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().updateSettings({
      visibleWorkspaces: fullWorkspacesForDeveloperMode(developerMode),
      onboardingCompleted: true,
    });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    useSystemStore.getState().setPage('devices');
  };

  const continueFromSetup = () => run(
    () => useSystemStore.getState().updateSettings({ visibleWorkspaces: workspaces }),
    2,
  );

  const continueFromCapture = () => run(
    () => useSystemStore.getState().setCaptureConfig({
      source,
      ...(source === 'automatic-game' ? { sourceId: null } : {}),
      resolution,
      replaySeconds,
      hotkey,
      // Persist setup choices without starting/probing an encoder between steps.
      enabled: false,
    }),
    3,
  );

  const continueFromAudio = () => run(
    () => useSystemStore.getState().setCaptureConfig({
      includeMic,
      includeSystemAudio,
      includeChatAudio,
      microphoneDeviceId,
      systemAudioDeviceId,
      chatAudioDeviceId,
    }),
    4,
  );

  const finish = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().setCaptureConfig({ enabled: replay });
    const captureFailure = useSystemStore.getState().error;
    if (captureFailure) {
      fail(captureFailure);
      return;
    }
    const filtered = workspaces;
    await useSystemStore.getState().updateSettings({ visibleWorkspaces: filtered, onboardingCompleted: true });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    useSystemStore.getState().setPage(defaultPageForProfile({ visibleWorkspaces: filtered, developerMode }));
  };

  const draft = () => ({
    workspaces,
    source,
    resolution,
    replaySeconds,
    hotkey,
    replayEnabled: replay,
    includeMic,
    includeSystemAudio,
    includeChatAudio,
  });

  const choosePreset = (preset: 'clipping' | 'full') => {
    setError(null);
    const next = applyWorkspacePreset(draft(), preset, developerMode);
    setWorkspaces(next.workspaces);
    setReplay(next.replayEnabled);
  };

  const preset = workspacePreset(workspaces, developerMode);
  const primaryLabel = active === 0
    ? 'Get started'
    : active === finishIndex
      ? `Open ${workspaceName(workspaces[0] ?? 'capture')}`
      : 'Continue';
  const onPrimary = () => {
    if (active === 0) goTo(1);
    else if (active === 1) void continueFromSetup();
    else if (active === 2) void continueFromCapture();
    else if (active === 3) void continueFromAudio();
    else if (active < finishIndex) goTo(finishIndex);
    else void finish();
  };

  const stepTransition = reduceMotion ? { duration: 0 } : { duration: 0.26, ease };
  const enter = (index: number) => (reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.28, ease, delay: 0.06 + index * 0.045 } });

  return (
    <div className="onboarding-screen ob" data-step={steps[active]?.id}>
      <header className="app-drag ob-header">
        <div className="ob-brand" aria-hidden="true">
          <img src="./switchboard-mark.png" alt="" draggable={false} />
          <span>Switchboard</span>
        </div>
        {active > 0 && active < steps.length ? (
          <ol className="ob-progress" aria-label={`Step ${active} of ${steps.length - 1}`}>
            {steps.slice(1).map((step, index) => {
              const position = index + 1;
              const state = position < active ? 'done' : position === active ? 'current' : 'todo';
              return (
                <li key={step.id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="ob-progress__track">
                    <m.span
                      className="ob-progress__fill"
                      initial={false}
                      animate={{ scaleX: state === 'todo' ? 0 : 1 }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease }}
                    />
                  </span>
                  <span className="ob-progress__label">{step.label}</span>
                </li>
              );
            })}
          </ol>
        ) : <span />}
        <div className="ob-header__actions no-drag">
          <Button type="button" variant="ghost" size="sm" className="ob-skip" disabled={pending} onClick={() => void skipSetup()}>
            Skip setup
          </Button>
        </div>
      </header>

      <div className="ob-body">
        <SignalField step={active} animate={!reduceMotion} />
        <main className="onboarding-main ob-main" aria-labelledby="onboarding-heading" aria-busy={pending}>

          <h1 id="onboarding-heading" className="sr-only">Set up Switchboard</h1>

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.section
              key={steps[active]?.id}
              className="onboarding-stage ob-stage"
              data-step-index={active}
              aria-labelledby="onboarding-current-heading"
              custom={direction}
              variants={reduceMotion ? reducedStepVariants : stepVariants}
              initial={reduceMotion ? false : 'enter'}
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              {active === 0 ? (
                <div className="ob-welcome">
                  <m.img
                    className="ob-welcome__mark"
                    src="./switchboard-mark.png"
                    alt=""
                    draggable={false}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.86, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.6, ease }}
                  />
                  <m.h2 {...enter(1)} id="onboarding-current-heading" ref={headingRef} tabIndex={-1}>Welcome to Switchboard</m.h2>
                  <m.p {...enter(2)} className="ob-lede">
                    Save great moments the second they happen, and keep your hardware in one quiet place.
                  </m.p>
                  <m.ul {...enter(3)} className="ob-points">
                    <WelcomePoint icon={Play} title="Instant Replay" text="Switchboard keeps the last moments ready. One shortcut saves them as a clip." />
                    <WelcomePoint icon={Mouse} title="Your devices" text="Supported mice, keyboards, and microphones, without the vendor suite." />
                    <WelcomePoint icon={AudioLines} title="Separate tracks" text="Game, chat, and your voice stay apart so you can fix the mix later." />
                  </m.ul>
                  <m.p {...enter(4)} className="ob-footnote">Setup takes about a minute. You can change everything later in Settings.</m.p>
                </div>
              ) : null}

              {active === 1 ? (
                <div className="ob-step">
                  <StepHeading
                    headingRef={headingRef}
                    eyebrow="Your setup"
                    title="What do you want Switchboard for?"
                    description="This decides which pages you see. You can switch any time in Settings, Features."
                    motion={enter(0)}
                  />
                  <m.div {...enter(1)} className="ob-choices" role="radiogroup" aria-label="Setup">
                    <ChoiceTile
                      selected={preset === 'clipping'}
                      disabled={pending}
                      title="Just clipping"
                      description="Instant Replay and your clip library. Nothing else in the way."
                      art={<ClipArt />}
                      reduceMotion={reduceMotion}
                      onSelect={() => choosePreset('clipping')}
                    />
                    <ChoiceTile
                      selected={preset === 'full'}
                      disabled={pending}
                      title="Clips and hardware"
                      description="Everything in Just clipping, plus Devices for your mouse, keyboard, and microphone."
                      art={<ClipArt withDevices />}
                      reduceMotion={reduceMotion}
                      onSelect={() => choosePreset('full')}
                    />
                  </m.div>
                </div>
              ) : null}

              {active === 2 ? (
                <div className="ob-step">
                  <StepHeading
                    headingRef={headingRef}
                    eyebrow="Capture"
                    title="How should Switchboard record?"
                    description="Replay records in the background to disk and only keeps what you save."
                    motion={enter(0)}
                  />
                  <m.div {...enter(1)} className="ob-sources" role="radiogroup" aria-label="Capture source">
                    {sourceOptions.map((option) => (
                      <SourceTile
                        key={option.value}
                        option={option}
                        selected={source === option.value}
                        disabled={pending}
                        reduceMotion={reduceMotion}
                        onSelect={() => { setError(null); setSource(option.value); }}
                      />
                    ))}
                  </m.div>
                  <m.div {...enter(2)} className="ob-fields">
                    <div className="ob-field">
                      <span id="onboarding-replay-length-label">Keep the last</span>
                      <div className="ob-segmented" role="radiogroup" aria-labelledby="onboarding-replay-length-label">
                        {[...new Set<number>([...commonReplayLengths, replaySeconds])].sort((a, b) => a - b).map((seconds) => (
                          <button
                            key={seconds}
                            type="button"
                            role="radio"
                            aria-checked={replaySeconds === seconds}
                            disabled={pending}
                            onClick={() => { setError(null); setReplaySeconds(seconds); }}
                          >
                            {replaySeconds === seconds ? (
                              <m.span className="ob-segmented__thumb" layoutId="ob-replay-thumb" transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease }} />
                            ) : null}
                            <span>{replayLengthLabel(seconds, true)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ob-field">
                      <span id="onboarding-resolution-label">Resolution</span>
                      <Select value={resolution} onValueChange={(value) => { setError(null); setResolution(value as CaptureResolution); }} disabled={pending}>
                        <SelectTrigger aria-labelledby="onboarding-resolution-label" className="ob-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {resolutionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </m.div>
                  <m.div {...enter(3)} className="ob-shortcut">
                    <span>
                      <strong>Save a clip with</strong>
                      <small>Select the shortcut, then press a new combination. Escape cancels.</small>
                    </span>
                    <ShortcutRecorderButton
                      value={hotkey}
                      disabled={pending}
                      label="Save replay shortcut"
                      className="ob-shortcut__recorder"
                      onValueChange={(next) => { setError(null); setHotkey(next); }}
                    />
                  </m.div>
                  <m.label {...enter(4)} className="ob-inline-toggle">
                    <span>
                      <strong>Start Instant Replay when setup finishes</strong>
                      <small>{replay ? 'Recording begins in the background as soon as you finish.' : 'You can start it later from Capture.'}</small>
                    </span>
                    <Switch checked={replay} disabled={pending} onCheckedChange={setReplay} aria-label="Capture engine" />
                  </m.label>
                </div>
              ) : null}

              {active === 3 ? (
                <div className="ob-step">
                  <StepHeading
                    headingRef={headingRef}
                    eyebrow="Audio tracks"
                    title="Which sounds get their own track?"
                    description="Separate tracks let you turn down chat or your voice later without losing the game."
                    motion={enter(0)}
                  />
                  <m.div {...enter(1)}>
                    <AudioTracks
                      snapshot={snapshot}
                      includeMic={includeMic}
                      includeSystemAudio={includeSystemAudio}
                      includeChatAudio={includeChatAudio}
                      microphoneDeviceId={microphoneDeviceId}
                      systemAudioDeviceId={systemAudioDeviceId}
                      chatAudioDeviceId={chatAudioDeviceId}
                      pending={pending}
                      onToggle={(id, next) => {
                        setError(null);
                        if (id === 'mic') setIncludeMic(next);
                        else if (id === 'system') setIncludeSystemAudio(next);
                        else setIncludeChatAudio(next);
                      }}
                      onMicrophoneDeviceChange={(next) => { setError(null); setMicrophoneDeviceId(next); }}
                      onSystemDeviceChange={(next) => { setError(null); setSystemAudioDeviceId(next); }}
                      onChatDeviceChange={(next) => { setError(null); setChatAudioDeviceId(next); }}
                    />
                  </m.div>
                </div>
              ) : null}

              {active === finishIndex ? (
                <div className="ob-finish">
                  <SuccessMark reduceMotion={reduceMotion} />
                  <m.h2 {...enter(1)} id="onboarding-current-heading" ref={headingRef} tabIndex={-1}>You’re all set</m.h2>
                  {replay ? (
                    <m.div {...enter(2)} className="ob-finish__hint">
                      <span>Press</span>
                      <span className="ob-keys" aria-label={displayShortcut(hotkey)}>
                        {displayShortcut(hotkey).split('+').map((key, index) => (
                          <m.kbd
                            key={`${key}-${index}`}
                            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.3, ease, delay: reduceMotion ? 0 : 0.28 + index * 0.07 }}
                          >
                            {key}
                          </m.kbd>
                        ))}
                      </span>
                      <span>to save the last {replayLengthLabel(replaySeconds)}.</span>
                    </m.div>
                  ) : (
                    <m.p {...enter(2)} className="ob-lede">Instant Replay stays off for now. Start it from Capture whenever you’re ready.</m.p>
                  )}
                  <m.dl {...enter(3)} className="ob-summary">
                    <SummaryRow label="Setup" value={preset === 'clipping' ? 'Just clipping' : preset === 'full' ? 'Clips and hardware' : workspaces.map(workspaceName).join(' · ')} disabled={pending} onEdit={() => goTo(1)} />
                    <SummaryRow label="Recording" value={`${sourceLabel(source)} · ${resolutionLabel(resolution)} · ${replay ? 'Starts now' : 'Off'}`} disabled={pending} onEdit={() => goTo(2)} />
                    <SummaryRow label="Tracks" value={[includeSystemAudio && 'Game', includeChatAudio && 'Chat', includeMic && 'Microphone'].filter(Boolean).join(' · ') || 'Video only'} disabled={pending} onEdit={() => goTo(3)} />
                  </m.dl>
                </div>
              ) : null}
            </m.section>
          </AnimatePresence>
        </main>
      </div>

      <footer className="ob-footer">
        <div className="ob-footer__side">
          {active > 0 ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => goTo(active - 1)}>
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {error ? (
            <m.p
              className="onboarding-error ob-error"
              role="alert"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease }}
            >
              <TriangleAlert aria-hidden="true" />
              <span>{error}</span>
            </m.p>
          ) : null}
        </AnimatePresence>
        <Button type="button" variant="primary" className="ob-primary" data-onboarding-next disabled={pending} onClick={onPrimary}>
          {pending ? (active === finishIndex ? 'Finishing…' : 'Saving…') : primaryLabel}
          {!pending && active < finishIndex ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </footer>
    </div>
  );
}

/**
 * Signal-path backdrop: fanned inputs converge into one bundle and flow on, echoing
 * the product. Paths are computed once at module load and the component is memoized,
 * so step changes only update one compositor transform. Nothing animates at rest.
 */
const signalPaths = (() => {
  const count = 30;
  const accents: Record<number, string> = { 6: 'game', 11: 'chat', 18: 'media', 23: 'microphone' };
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const startY = 40 + t * 920;
    const bundleY = 650 + (t - 0.5) * 70;
    const endY = 360 + (t - 0.5) * 420;
    return {
      d: `M 0 ${startY.toFixed(1)} C 620 ${startY.toFixed(1)}, 760 ${bundleY.toFixed(1)}, 1320 ${bundleY.toFixed(1)} C 1860 ${bundleY.toFixed(1)}, 2020 ${endY.toFixed(1)}, 2600 ${endY.toFixed(1)}`,
      channel: accents[index],
    };
  });
})();

const SignalField = memo(function SignalField({ step, animate }: { step: number; animate: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Software rasterization avoids Chromium retaining a GPU path cache for
    // these decorative curves after the renderer closes. Paint only on resize.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const paint = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const tokens = getComputedStyle(document.documentElement);
      const matrix = new DOMMatrix().scale(canvas.width / 2600, canvas.height / 1000);
      for (const path of signalPaths) {
        const scaled = new Path2D();
        scaled.addPath(new Path2D(path.d), matrix);
        context.strokeStyle = tokens.getPropertyValue(path.channel ? `--channel-${path.channel}` : '--text-muted').trim();
        context.lineWidth = (path.channel ? 1.25 : 0.75) * scale;
        context.globalAlpha = path.channel ? 0.45 : 0.2;
        context.stroke(scaled);
      }
    };
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, []);
  return (
    <div className="onboarding-backdrop ob-bg" aria-hidden="true">
      <div
        className="ob-bg__field"
        data-animate={animate || undefined}
        style={{ transform: `translate3d(${step * -64}px, 0, 0)` }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
});

function StepHeading({
  headingRef,
  eyebrow,
  title,
  description,
  motion,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  eyebrow: string;
  title: string;
  description: string;
  motion: object;
}) {
  return (
    <m.div className="ob-heading" {...motion}>
      <span className="ob-eyebrow">{eyebrow}</span>
      <h2 id="onboarding-current-heading" ref={headingRef} tabIndex={-1}>{title}</h2>
      <p>{description}</p>
    </m.div>
  );
}

function WelcomePoint({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <li>
      <Icon aria-hidden="true" />
      <span><strong>{title}</strong><small>{text}</small></span>
    </li>
  );
}

function SelectedBadge({ selected, reduceMotion }: { selected: boolean; reduceMotion: boolean }) {
  return (
    <span className="ob-badge" aria-hidden="true">
      <AnimatePresence initial={false}>
        {selected ? (
          <m.span
            className="ob-badge__on"
            initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 30 }}
          >
            <Check />
          </m.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function ChoiceTile({
  selected,
  disabled,
  title,
  description,
  art,
  reduceMotion,
  onSelect,
}: {
  selected: boolean;
  disabled: boolean;
  title: string;
  description: string;
  art: ReactNode;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} className="ob-choice" data-selected={selected || undefined} disabled={disabled} onClick={onSelect}>
      <span className="ob-choice__art" aria-hidden="true">{art}</span>
      <span className="ob-choice__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <SelectedBadge selected={selected} reduceMotion={reduceMotion} />
    </button>
  );
}

/** Abstract composition of the pages each setup shows. Not product data. */
function ClipArt({ withDevices = false }: { withDevices?: boolean }) {
  return (
    <span className="ob-art" data-devices={withDevices || undefined}>
      <span className="ob-art__clips">
        <span className="ob-art__clip"><Play /></span>
        <span className="ob-art__clip" />
        <span className="ob-art__clip" />
      </span>
      {withDevices ? (
        <span className="ob-art__devices">
          <Mouse />
          <Keyboard />
          <Mic />
        </span>
      ) : null}
    </span>
  );
}

function SourceTile({
  option,
  selected,
  disabled,
  reduceMotion,
  onSelect,
}: {
  option: (typeof sourceOptions)[number];
  selected: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  return (
    <button type="button" role="radio" aria-checked={selected} className="ob-source" data-selected={selected || undefined} disabled={disabled} onClick={onSelect}>
      <Icon className="ob-source__icon" aria-hidden="true" />
      <strong>{option.title}</strong>
      <small>{option.description}</small>
      <SelectedBadge selected={selected} reduceMotion={reduceMotion} />
    </button>
  );
}

function SummaryRow({ label, value, disabled, onEdit }: { label: string; value: string; disabled: boolean; onEdit: () => void }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" disabled={disabled} onClick={onEdit} aria-label={`Change ${label.toLocaleLowerCase()}`}>Change</button>
    </div>
  );
}

function SuccessMark({ reduceMotion }: { reduceMotion: boolean }) {
  const draw = (delay: number) => (reduceMotion
    ? { initial: false as const, animate: { pathLength: 1 } }
    : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.5, ease, delay } });
  return (
    <svg className="ob-success" viewBox="0 0 56 56" aria-hidden="true">
      <m.circle cx="28" cy="28" r="25" {...draw(0.05)} />
      <m.path d="M17 29 L25 37 L40 20" {...draw(0.4)} />
    </svg>
  );
}

type TrackId = 'mic' | 'system' | 'chat';

function AudioTracks({
  snapshot,
  includeMic,
  includeSystemAudio,
  includeChatAudio,
  microphoneDeviceId,
  systemAudioDeviceId,
  chatAudioDeviceId,
  pending,
  onToggle,
  onMicrophoneDeviceChange,
  onSystemDeviceChange,
  onChatDeviceChange,
}: {
  snapshot: SystemSnapshot;
  includeMic: boolean;
  includeSystemAudio: boolean;
  includeChatAudio: boolean;
  microphoneDeviceId: string | null;
  systemAudioDeviceId: string | null;
  chatAudioDeviceId: string | null;
  pending: boolean;
  onToggle: (id: TrackId, next: boolean) => void;
  onMicrophoneDeviceChange: (deviceId: string | null) => void;
  onSystemDeviceChange: (deviceId: string | null) => void;
  onChatDeviceChange: (deviceId: string | null) => void;
}) {
  const outputDevices = captureOutputDevices(snapshot);
  const inputDevices = captureInputDevices(snapshot);
  const hasAnyDevice = outputDevices.length > 0 || inputDevices.length > 0;
  const explicitMicUnavailable = Boolean(microphoneDeviceId) && inputDevices.length > 0
    && !inputDevices.some((device) => device.id === microphoneDeviceId);
  const gameAndChatSame = includeSystemAudio && includeChatAudio
    && snapshot.capture.config.systemAudioMode !== 'game'
    && Boolean(systemAudioDeviceId) && systemAudioDeviceId === chatAudioDeviceId;

  const tracks: ReadonlyArray<{
    id: TrackId;
    channel: 'game' | 'chat' | 'microphone';
    icon: LucideIcon;
    title: string;
    description: string;
    enabled: boolean;
    deviceLabel: string;
    deviceValue: string | null;
    devices: ReturnType<typeof captureOutputDevices>;
    automaticLabel: string;
    onDeviceChange: (deviceId: string | null) => void;
  }> = [
    {
      id: 'system', channel: 'game', icon: Headphones, title: 'Game', description: 'Game and desktop sound.',
      enabled: includeSystemAudio, deviceLabel: 'Game audio device', deviceValue: systemAudioDeviceId, devices: outputDevices,
      automaticLabel: gameAutomaticLabel(snapshot), onDeviceChange: onSystemDeviceChange,
    },
    {
      id: 'chat', channel: 'chat', icon: MessagesSquare, title: 'Chat', description: 'Discord or voice chat, apart from the game.',
      enabled: includeChatAudio, deviceLabel: 'Chat audio device', deviceValue: chatAudioDeviceId, devices: outputDevices,
      automaticLabel: chatAutomaticLabel(snapshot), onDeviceChange: onChatDeviceChange,
    },
    {
      id: 'mic', channel: 'microphone', icon: Mic, title: 'Microphone', description: 'Your voice, mutable without losing the game.',
      enabled: includeMic, deviceLabel: 'Microphone device', deviceValue: microphoneDeviceId, devices: inputDevices,
      automaticLabel: micAutomaticLabel(snapshot), onDeviceChange: onMicrophoneDeviceChange,
    },
  ];

  return (
    <div className="ob-tracks">
      {tracks.map((track) => {
        const Icon = track.icon;
        return (
          <div key={track.id} className="ob-track" data-channel={track.channel} data-enabled={track.enabled || undefined}>
            <span className="ob-track__lane" aria-hidden="true" />
            <Icon className="ob-track__icon" aria-hidden="true" />
            <span className="ob-track__copy">
              <strong>{track.title}</strong>
              <small>{track.description}</small>
            </span>
            <CaptureAudioDeviceSelect
              label={track.deviceLabel}
              value={track.deviceValue}
              devices={track.devices}
              automaticLabel={track.automaticLabel}
              disabled={pending || !track.enabled}
              onChange={track.onDeviceChange}
              className="ob-track__select"
            />
            <Switch checked={track.enabled} disabled={pending} onCheckedChange={(next) => onToggle(track.id, next)} aria-label={`Record ${track.title} track`} />
          </div>
        );
      })}
      <p className="ob-note" role={!hasAnyDevice ? 'status' : undefined}>
        {!hasAnyDevice
          ? 'No audio devices are available yet. Continue with Automatic and choose exact devices later in Settings, Capture.'
          : 'Automatic records the Windows default devices. Devices stay changeable in Settings, Capture.'}
      </p>
      {explicitMicUnavailable && includeMic ? (
        <p className="ob-note ob-note--warning" role="status">The selected microphone is not currently available. Reconnect it or choose another input.</p>
      ) : null}
      {gameAndChatSame ? (
        <p className="ob-note ob-note--warning" role="status">Game and chat use the same output, so both tracks will contain the same sound. Choose different devices to keep them apart.</p>
      ) : null}
    </div>
  );
}
