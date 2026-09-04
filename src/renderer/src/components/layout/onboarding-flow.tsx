import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioWaveform, Cable, Check, CircleDot, Flag, LayoutGrid, Pause, Play, TriangleAlert, type LucideIcon } from 'lucide-react';
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
  toggleDraftWorkspace,
  workspacePreset,
} from '../../../../shared/workspace-profile';
import {
  CaptureAudioDeviceSelect,
  captureAudioDeviceName,
  captureInputDevices,
  captureOutputDevices,
  chatAutomaticLabel,
  gameAutomaticLabel,
  micAutomaticLabel,
} from '@/components/capture/capture-audio-device-select';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Kbd } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { displayShortcut } from '@/lib/shortcut';
import { useSystemStore } from '@/stores/use-system-store';

const stepMeta: ReadonlyArray<{ id: string; title: string; description: string; icon: LucideIcon }> = [
  { id: 'welcome', title: 'Welcome', description: 'What Switchboard is and what setup covers.', icon: Flag },
  { id: 'workspaces', title: 'Choose your setup', description: 'Pick the parts of Switchboard you want to see.', icon: LayoutGrid },
  { id: 'capture', title: 'Set up capture', description: 'Replay, source, quality, and the save shortcut.', icon: CircleDot },
  { id: 'audio', title: 'Set up audio tracks', description: 'Choose which sound gets its own clip track.', icon: AudioWaveform },
  { id: 'finish', title: 'Review and finish', description: 'Confirm the choices and start working.', icon: Check },
];

const workspaceCards: ReadonlyArray<{ id: VisibleWorkspace; title: string; description: string; icon: LucideIcon }> = [
  { id: 'devices', title: 'Devices', description: 'Connected hardware and its controls.', icon: Cable },
  { id: 'audio', title: 'Audio', description: 'Unfinished routing and processing. Developer mode only.', icon: AudioWaveform },
  { id: 'capture', title: 'Capture', description: 'Replay, clips, and recording.', icon: CircleDot },
];

const sourceOptions: ReadonlyArray<{ value: CaptureSourceType; title: string; description: string }> = [
  { value: 'automatic-game', title: 'Automatic game', description: 'Follow the game in focus. Nothing to pick.' },
  { value: 'window', title: 'Window', description: 'Capture one window. Choose it in Capture later.' },
  { value: 'display', title: 'Display', description: 'Capture a whole monitor.' },
];

const resolutionOptions: ReadonlyArray<{ value: CaptureResolution; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p (Default)' },
  { value: '2160p', label: '2160p' },
  { value: 'native', label: 'Native source' },
];

const replayLengthOptions: ReadonlyArray<{ value: number; label: string }> = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 180, label: '3 minutes' },
  { value: 300, label: '5 minutes' },
];

const stageContentVariants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.02,
      staggerChildren: 0.035,
      staggerDirection: 1,
    },
  },
};

const stageItemVariants = {
  hidden: (direction: number) => ({ opacity: 0, y: direction > 0 ? 5 : -5 }),
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function sourceLabel(source: CaptureSourceType): string {
  return sourceOptions.find((option) => option.value === source)?.title ?? source;
}

function resolutionLabel(resolution: CaptureResolution): string {
  return resolutionOptions.find((option) => option.value === resolution)?.label ?? resolution;
}

function replayLengthLabel(seconds: number): string {
  return replayLengthOptions.find((option) => option.value === seconds)?.label ?? `${seconds} seconds`;
}

function workspaceName(workspace: VisibleWorkspace): string {
  return workspaceCards.find((card) => card.id === workspace)?.title ?? workspace;
}

function setupLabel(workspaces: ReadonlyArray<VisibleWorkspace>, developerMode: boolean): string {
  const preset = workspacePreset(workspaces, developerMode);
  if (preset === 'clipping') return 'Just clipping';
  if (preset === 'full') return 'Full setup';
  return workspaces.map(workspaceName).join(' · ');
}

export function OnboardingFlow({ snapshot }: { snapshot: SystemSnapshot }) {
  const developerMode = snapshot.settings.developerMode === true;
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [workspaces, setWorkspaces] = useState<VisibleWorkspace[]>(
    () => {
      const normalized = normalizeVisibleWorkspaces(snapshot.settings.visibleWorkspaces)
        ?? fullWorkspacesForDeveloperMode(snapshot.settings.developerMode === true);
      return snapshot.settings.developerMode === true
        ? normalized
        : normalized.filter((entry) => entry !== 'audio');
    },
  );
  const [source, setSource] = useState<CaptureSourceType>(snapshot.capture.config.source);
  const [resolution, setResolution] = useState<CaptureResolution>(snapshot.capture.config.resolution);
  const [replaySeconds, setReplaySeconds] = useState(snapshot.capture.config.replaySeconds);
  const [hotkey, setHotkey] = useState(snapshot.capture.config.hotkey);
  const [replay, setReplay] = useState(snapshot.capture.config.enabled);
  const [includeMic, setIncludeMic] = useState(snapshot.capture.config.includeMic);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(snapshot.capture.config.includeSystemAudio);
  const [includeChatAudio, setIncludeChatAudio] = useState(snapshot.capture.config.includeChatAudio);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | null>(snapshot.capture.config.microphoneDeviceId);
  const [systemAudioDeviceId, setSystemAudioDeviceId] = useState<string | null>(snapshot.capture.config.systemAudioDeviceId);
  const [chatAudioDeviceId, setChatAudioDeviceId] = useState<string | null>(snapshot.capture.config.chatAudioDeviceId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const currentHeadingRef = useRef<HTMLHeadingElement>(null);
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
    currentHeadingRef.current?.focus({ preventScroll: true });
  }, [active]);

  const fail = (message: string) => {
    setError(message);
    setPending(false);
  };

  const revisit = (index: number) => {
    if (pending) return;
    setError(null);
    setDirection(index >= active ? 1 : -1);
    setActive(index);
  };

  const advanceTo = (index: number) => {
    setDirection(index >= active ? 1 : -1);
    setActive(index);
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

  const continueFromWorkspaces = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().updateSettings({ visibleWorkspaces: workspaces });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    advanceTo(2);
  };

  const continueFromCapture = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().setCaptureConfig({
      source,
      ...(source === 'automatic-game' ? { sourceId: null } : {}),
      resolution,
      replaySeconds,
      hotkey,
      enabled: replay,
    });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    advanceTo(3);
  };

  const continueFromAudio = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().setCaptureConfig({
      includeMic,
      includeSystemAudio,
      includeChatAudio,
      microphoneDeviceId,
      systemAudioDeviceId,
      chatAudioDeviceId,
    });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    advanceTo(4);
  };

  const finish = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    const filtered = developerMode ? workspaces : workspaces.filter((entry) => entry !== 'audio');
    await useSystemStore.getState().updateSettings({ visibleWorkspaces: filtered, onboardingCompleted: true });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    useSystemStore.getState().setPage(defaultPageForProfile({ visibleWorkspaces: filtered, developerMode }));
  };

  const choosePreset = (preset: 'clipping' | 'full') => {
    setError(null);
    const draft = applyWorkspacePreset(
      {
        workspaces,
        source,
        resolution,
        replaySeconds,
        hotkey,
        replayEnabled: replay,
        includeMic,
        includeSystemAudio,
        includeChatAudio,
      },
      preset,
      developerMode,
    );
    setWorkspaces(draft.workspaces);
    setReplay(draft.replayEnabled);
  };

  const toggleWorkspace = (workspace: VisibleWorkspace) => {
    if (workspace === 'audio' && !developerMode) return;
    setError(null);
    const draft = toggleDraftWorkspace(
      {
        workspaces,
        source,
        resolution,
        replaySeconds,
        hotkey,
        replayEnabled: replay,
        includeMic,
        includeSystemAudio,
        includeChatAudio,
      },
      workspace,
      developerMode,
    );
    setWorkspaces(draft.workspaces);
  };

  const setAudioTrackState = (id: 'mic' | 'system' | 'chat', next: boolean) => {
    setError(null);
    if (id === 'mic') setIncludeMic(next);
    else if (id === 'system') setIncludeSystemAudio(next);
    else setIncludeChatAudio(next);
  };

  const audioSummary = `${includeMic ? 'Mic on' : 'Mic off'} · ${includeSystemAudio ? 'System on' : 'System off'} · ${includeChatAudio ? 'Chat on' : 'Chat off'}`;

  const statusOf = (index: number): 'done' | 'current' | 'todo' => (
    index < active ? 'done' : index === active ? 'current' : 'todo'
  );

  const doneSummary = (index: number): string => {
    if (index === 1) return setupLabel(workspaces, developerMode);
    if (index === 2) return `${replay ? 'Replay on' : 'Replay off'} · ${resolutionLabel(resolution)} · ${replayLengthLabel(replaySeconds)}`;
    if (index === 3) return audioSummary;
    return stepMeta[index]?.description ?? '';
  };

  const visibleWorkspaceCards = workspaceCards.filter((card) => developerMode || card.id !== 'audio');
  const activeStep = stepMeta[active] ?? stepMeta[0]!;
  const ActiveStepIcon = activeStep.icon;

  const stageTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="onboarding-screen">
      <div className="app-drag onboarding-topbar" aria-hidden="true">
        <img src="./switchboard-mark.png" alt="" draggable={false} />
        <span>Switchboard</span>
      </div>

      <main className="onboarding-main" aria-labelledby="onboarding-heading">
        <div className="onboarding-backdrop" data-paused={backgroundPaused || reduceMotion} aria-hidden="true">
          <div className="onboarding-contour-layer onboarding-contours__sweep">
            <svg className="onboarding-contours" viewBox="0 0 1600 1000" fill="none" preserveAspectRatio="xMidYMid slice">
              {Array.from({ length: 44 }, (_, index) => (
                <path
                  key={index}
                  d={`M ${-350 + index * 13} 1180 C ${-120 + index * 18} ${460 + index * 8}, ${620 + index * 8} ${1320 - index * 5}, ${1120 + index * 11} ${720 - index * 9} S ${1260 + index * 9} ${-60 - index * 6}, ${1810 + index * 8} -180`}
                  className={index % 7 === 0 ? 'onboarding-contours__accent' : undefined}
                />
              ))}
            </svg>
          </div>
          <div className="onboarding-contour-layer onboarding-contours__fold">
            <svg className="onboarding-contours" viewBox="0 0 1600 1000" fill="none" preserveAspectRatio="xMidYMid slice">
              {Array.from({ length: 24 }, (_, index) => (
                <path
                  key={index}
                  d={`M ${620 + index * 22} 1190 C ${400 + index * 20} ${760 - index * 8}, ${1510 - index * 12} ${980 - index * 13}, ${1770 - index * 5} ${140 - index * 11}`}
                />
              ))}
            </svg>
          </div>
        </div>
        <div className="onboarding-wrap">
          <h1 id="onboarding-heading">Set up Switchboard</h1>
          <p className="onboarding-sub">Complete these steps to get capture and hardware ready.</p>

          <p className="onboarding-count" aria-live="polite">
            <span>{active} of {stepMeta.length} completed</span>
          </p>
          <Progress
            value={(active / stepMeta.length) * 100}
            aria-label="Setup progress"
            className="onboarding-progress"
          />

          <div className="onboarding-workspace">
            <ol className="onboarding-list" aria-label="Setup steps">
              {stepMeta.map((step, index) => {
                const status = statusOf(index);
                const contents = (
                  <>
                    {status === 'current' ? (
                      <m.span
                        className="onboarding-live-marker"
                        layoutId="onboarding-live-marker"
                        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={`onboarding-status${status === 'done' ? ' onboarding-status--done' : status === 'current' ? ' onboarding-status--current' : ''}`}
                      aria-hidden="true"
                    >
                      {status === 'done' ? <Check /> : index + 1}
                    </span>
                    <span className="onboarding-card__copy">
                      <strong>{step.title}</strong>
                      <small>{status === 'done' ? doneSummary(index) : step.description}</small>
                    </span>
                  </>
                );

                return (
                  <li key={step.id} data-status={status}>
                    {status === 'done' ? (
                      <button
                        type="button"
                        className="onboarding-card"
                        data-status="done"
                        disabled={pending}
                        onClick={() => revisit(index)}
                        aria-label={`${step.title}, completed. Activate to revise.`}
                      >
                        {contents}
                      </button>
                    ) : (
                      <div
                        className="onboarding-card"
                        data-status={status}
                        aria-label={step.title}
                        aria-current={status === 'current' ? 'step' : undefined}
                        aria-disabled={status === 'todo' ? true : undefined}
                      >
                        {contents}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <section
              className="onboarding-stage"
              data-step-index={active}
              aria-labelledby="onboarding-current-heading"
              aria-busy={pending}
            >
              {active === 0 ? (
                <m.img
                  className="onboarding-welcome-mark"
                  src="./switchboard-mark.png"
                  alt=""
                  draggable={false}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <div className="onboarding-card__head">
                <m.span
                  key={`status-${active}`}
                  className="onboarding-status onboarding-status--current"
                  aria-hidden="true"
                  initial={reduceMotion ? false : { opacity: 0.5, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={stageTransition}
                >
                  {active + 1}
                </m.span>
                <span className="onboarding-card__copy">
                  <h2 id="onboarding-current-heading" ref={currentHeadingRef} tabIndex={-1}>{activeStep.title}</h2>
                  <small>{activeStep.description}</small>
                </span>
                <m.span
                  key={`icon-${activeStep.id}`}
                  initial={reduceMotion ? false : { opacity: 0, x: direction * 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={stageTransition}
                  aria-hidden="true"
                >
                  <ActiveStepIcon className="onboarding-card__icon" />
                </m.span>
              </div>

              <div className="onboarding-stage__viewport">
                <m.div
                  key={activeStep.id}
                  className="onboarding-stage__content"
                  custom={direction}
                  variants={reduceMotion ? undefined : stageContentVariants}
                  initial={reduceMotion ? false : 'hidden'}
                  animate={reduceMotion ? undefined : 'visible'}
                >

                      {active === 0 ? (
                        <>
                        <m.p className="onboarding-body" variants={stageItemVariants}>
                          Switchboard handles game capture and hardware controls from one quiet place.
                          Setup takes a couple of minutes, and everything stays changeable in Settings.
                        </m.p>
                        <m.div className="onboarding-welcome-features" variants={stageItemVariants}>
                          {workspaceCards.filter((card) => card.id !== 'audio').map((card) => (
                            <div key={card.id}>
                              <card.icon aria-hidden="true" />
                              <span><strong>{card.title}</strong><small>{card.description}</small></span>
                            </div>
                          ))}
                        </m.div>
                        </>
                      ) : null}

                      {active === 1 ? (
                        <>
                          <m.div className="onboarding-presets" role="group" aria-label="Setup presets" variants={stageItemVariants}>
                            <Button
                              type="button"
                              variant={workspacePreset(workspaces, developerMode) === 'clipping' ? 'primary' : 'secondary'}
                              size="sm"
                              disabled={pending}
                              onClick={() => choosePreset('clipping')}
                            >
                              Just clipping
                            </Button>
                            <Button
                              type="button"
                              variant={workspacePreset(workspaces, developerMode) === 'full' ? 'primary' : 'secondary'}
                              size="sm"
                              disabled={pending}
                              onClick={() => choosePreset('full')}
                            >
                              Full setup
                            </Button>
                          </m.div>
                          <m.div className="onboarding-checks" role="group" aria-label="Workspaces" variants={stageItemVariants}>
                            {visibleWorkspaceCards.map((card) => {
                              const locked = card.id === 'capture';
                              const checked = workspaces.includes(card.id);
                              const CardIcon = card.icon;
                              return (
                                <label
                                  key={card.id}
                                  htmlFor={`onboarding-workspace-${card.id}`}
                                  className="onboarding-check"
                                  data-state={checked ? 'checked' : 'unchecked'}
                                >
                                  <Checkbox
                                    id={`onboarding-workspace-${card.id}`}
                                    checked={checked}
                                    disabled={pending || locked}
                                    onCheckedChange={() => toggleWorkspace(card.id)}
                                    aria-label={card.title}
                                  />
                                  <CardIcon aria-hidden="true" />
                                  <span className="onboarding-check__copy">
                                    <strong>{card.title}</strong>
                                    <small>{card.description}</small>
                                  </span>
                                  {locked ? <span className="onboarding-check__locked">Always on</span> : null}
                                </label>
                              );
                            })}
                          </m.div>
                        </>
                      ) : null}

                      {active === 2 ? (
                        <>
                          <m.div variants={stageItemVariants}>
                            <div className="onboarding-row">
                              <span className="onboarding-row__copy">
                                <strong>Replay capture</strong>
                                <small>Record in the background so the shortcut can save a clip.</small>
                              </span>
                              <Switch
                                checked={replay}
                                disabled={pending}
                                onCheckedChange={setReplay}
                                aria-label="Replay capture"
                              />
                            </div>
                            <Separator className="onboarding-sep" />
                          </m.div>
                          <m.div variants={stageItemVariants}>
                            <RadioGroup
                              value={source}
                              onValueChange={(value) => { setError(null); setSource(value as CaptureSourceType); }}
                              disabled={pending}
                              aria-label="Capture source"
                              className="onboarding-picks"
                            >
                              {sourceOptions.map((option) => (
                                <label
                                  key={option.value}
                                  htmlFor={`onboarding-source-${option.value}`}
                                  className="onboarding-pick"
                                  data-state={source === option.value ? 'checked' : 'unchecked'}
                                >
                                  <RadioGroupItem id={`onboarding-source-${option.value}`} value={option.value} aria-label={option.title} />
                                  <span className="onboarding-pick__copy">
                                    <strong>{option.title}</strong>
                                    <small>{option.description}</small>
                                  </span>
                                </label>
                              ))}
                            </RadioGroup>
                            <Separator className="onboarding-sep" />
                          </m.div>
                          <m.div variants={stageItemVariants}>
                            <div className="onboarding-row">
                              <span className="onboarding-row__copy">
                                <strong id="onboarding-resolution-label">Resolution</strong>
                                <small>Output size for newly encoded clips.</small>
                              </span>
                              <Select
                                value={resolution}
                                onValueChange={(value) => { setError(null); setResolution(value as CaptureResolution); }}
                                disabled={pending}
                              >
                                <SelectTrigger aria-labelledby="onboarding-resolution-label" className="onboarding-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {resolutionOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Separator className="onboarding-sep" />
                          </m.div>
                          <m.div variants={stageItemVariants}>
                            <div className="onboarding-row">
                              <span className="onboarding-row__copy">
                                <strong id="onboarding-replay-length-label">Replay length</strong>
                                <small>How much recent footage each saved clip keeps.</small>
                              </span>
                              <Select
                                value={String(replaySeconds)}
                                onValueChange={(value) => { setError(null); setReplaySeconds(Number(value)); }}
                                disabled={pending}
                              >
                                <SelectTrigger aria-labelledby="onboarding-replay-length-label" className="onboarding-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {replayLengthOptions.map((option) => (
                                    <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Separator className="onboarding-sep" />
                          </m.div>
                          <m.div variants={stageItemVariants}>
                            <div className="onboarding-row">
                              <span className="onboarding-row__copy">
                                <strong>Save replay shortcut</strong>
                                <small>Select, then press a new combination. Escape cancels.</small>
                              </span>
                              <ShortcutRecorderButton
                                value={hotkey}
                                disabled={pending}
                                label="Save replay shortcut"
                                className="onboarding-shortcut"
                                onValueChange={(next) => { setError(null); setHotkey(next); }}
                              />
                            </div>
                          </m.div>
                        </>
                      ) : null}

                      {active === 3 ? (
                        <m.div variants={stageItemVariants}>
                          <OnboardingAudioTracks
                            snapshot={snapshot}
                            includeMic={includeMic}
                            includeSystemAudio={includeSystemAudio}
                            includeChatAudio={includeChatAudio}
                            microphoneDeviceId={microphoneDeviceId}
                            systemAudioDeviceId={systemAudioDeviceId}
                            chatAudioDeviceId={chatAudioDeviceId}
                            pending={pending}
                            onToggleTrack={setAudioTrackState}
                            onMicrophoneDeviceChange={(next) => { setError(null); setMicrophoneDeviceId(next); }}
                            onSystemDeviceChange={(next) => { setError(null); setSystemAudioDeviceId(next); }}
                            onChatDeviceChange={(next) => { setError(null); setChatAudioDeviceId(next); }}
                          />
                        </m.div>
                      ) : null}

                      {active === 4 ? (
                        <m.dl className="onboarding-summary" variants={stageItemVariants}>
                          <div>
                            <dt>Setup</dt>
                            <dd>{setupLabel(workspaces, developerMode)}</dd>
                          </div>
                          <div>
                            <dt>Replay capture</dt>
                            <dd>{replay ? 'On' : 'Off'}</dd>
                          </div>
                          <div>
                            <dt>Capture source</dt>
                            <dd>{sourceLabel(source)}</dd>
                          </div>
                          <div>
                            <dt>Resolution</dt>
                            <dd>{resolutionLabel(resolution)}</dd>
                          </div>
                          <div>
                            <dt>Replay length</dt>
                            <dd>{replayLengthLabel(replaySeconds)}</dd>
                          </div>
                          <div>
                            <dt>Audio tracks</dt>
                            <dd>{audioSummary}</dd>
                          </div>
                          <div>
                            <dt>Microphone device</dt>
                            <dd>{includeMic ? captureAudioDeviceName(snapshot, microphoneDeviceId, micAutomaticLabel(snapshot)) : 'Off'}</dd>
                          </div>
                          <div>
                            <dt>Game device</dt>
                            <dd>{includeSystemAudio ? captureAudioDeviceName(snapshot, systemAudioDeviceId, gameAutomaticLabel(snapshot)) : 'Off'}</dd>
                          </div>
                          <div>
                            <dt>Chat device</dt>
                            <dd>{includeChatAudio ? captureAudioDeviceName(snapshot, chatAudioDeviceId, chatAutomaticLabel()) : 'Off'}</dd>
                          </div>
                          <div>
                            <dt>Save replay shortcut</dt>
                            <dd className="onboarding-keys">
                              {displayShortcut(hotkey).split('+').map((key, keyIndex) => (
                                <span key={`${key}-${keyIndex}`} className="onboarding-keys__group">
                                  {keyIndex > 0 ? <span aria-hidden="true">+</span> : null}
                                  <Kbd>{key}</Kbd>
                                </span>
                              ))}
                            </dd>
                          </div>
                        </m.dl>
                      ) : null}

                      <AnimatePresence initial={false}>
                        {error ? (
                          <m.p
                            className="onboarding-error"
                            role="alert"
                            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                            transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
                          >
                            <TriangleAlert aria-hidden="true" />
                            <span>{error}</span>
                          </m.p>
                        ) : null}
                      </AnimatePresence>

                      <m.div className="onboarding-actions" variants={stageItemVariants}>
                        {active > 0 ? (
                          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => revisit(active - 1)}>
                            <ArrowLeft size={14} aria-hidden="true" /> Back
                          </Button>
                        ) : null}
                        {active === 0 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => advanceTo(1)}>
                            Get started <ArrowRight size={14} aria-hidden="true" />
                          </Button>
                        ) : null}
                        {active === 1 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void continueFromWorkspaces()}>
                            {pending ? 'Saving…' : 'Continue'}
                          </Button>
                        ) : null}
                        {active === 2 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void continueFromCapture()}>
                            {pending ? 'Saving…' : 'Continue'}
                          </Button>
                        ) : null}
                        {active === 3 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void continueFromAudio()}>
                            {pending ? 'Saving…' : 'Continue'}
                          </Button>
                        ) : null}
                        {active === 4 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void finish()}>
                            {pending ? 'Finishing…' : `Open ${workspaceName(workspaces[0] ?? 'capture')}`}
                          </Button>
                        ) : null}
                      </m.div>
                </m.div>
              </div>
            </section>
          </div>

          <div className="onboarding-foot">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => void skipSetup()}>
              Skip setup
            </Button>
            {!reduceMotion ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="onboarding-motion-toggle"
                aria-label={backgroundPaused ? 'Play background animation' : 'Pause background animation'}
                aria-pressed={backgroundPaused}
                onClick={() => setBackgroundPaused((paused) => !paused)}
              >
                {backgroundPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
                <span>{backgroundPaused ? 'Animation paused' : 'Pause animation'}</span>
              </Button>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

type OnboardingTrackId = 'mic' | 'system' | 'chat';

function OnboardingAudioTracks({
  snapshot,
  includeMic,
  includeSystemAudio,
  includeChatAudio,
  microphoneDeviceId,
  systemAudioDeviceId,
  chatAudioDeviceId,
  pending,
  onToggleTrack,
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
  onToggleTrack: (id: OnboardingTrackId, next: boolean) => void;
  onMicrophoneDeviceChange: (deviceId: string | null) => void;
  onSystemDeviceChange: (deviceId: string | null) => void;
  onChatDeviceChange: (deviceId: string | null) => void;
}) {
  const outputDevices = captureOutputDevices(snapshot);
  const inputDevices = captureInputDevices(snapshot);
  const hasAnyDevice = outputDevices.length > 0 || inputDevices.length > 0;
  const explicitMicUnavailable = Boolean(microphoneDeviceId)
    && !inputDevices.some((device) => device.id === microphoneDeviceId);
  const gameAndChatSame = includeSystemAudio && includeChatAudio
    && (systemAudioDeviceId ?? 'auto') === (chatAudioDeviceId ?? 'auto');

  const tracks: ReadonlyArray<{
    id: OnboardingTrackId;
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
      id: 'mic',
      title: 'Microphone',
      description: 'Your voice on its own track, mutable without losing game audio.',
      enabled: includeMic,
      deviceLabel: 'Microphone device',
      deviceValue: microphoneDeviceId,
      devices: inputDevices,
      automaticLabel: micAutomaticLabel(snapshot),
      onDeviceChange: onMicrophoneDeviceChange,
    },
    {
      id: 'system',
      title: 'System audio',
      description: 'Game and desktop sound on the main track.',
      enabled: includeSystemAudio,
      deviceLabel: 'Game audio device',
      deviceValue: systemAudioDeviceId,
      devices: outputDevices,
      automaticLabel: gameAutomaticLabel(snapshot),
      onDeviceChange: onSystemDeviceChange,
    },
    {
      id: 'chat',
      title: 'Chat audio',
      description: 'Discord or voice chat separated from the game mix.',
      enabled: includeChatAudio,
      deviceLabel: 'Chat audio device',
      deviceValue: chatAudioDeviceId,
      devices: outputDevices,
      automaticLabel: chatAutomaticLabel(),
      onDeviceChange: onChatDeviceChange,
    },
  ];

  return (
    <>
      {tracks.map((track, trackIndex) => (
        <div key={track.id}>
          {trackIndex > 0 ? <Separator className="onboarding-sep" /> : null}
          <div className="onboarding-row">
            <span className="onboarding-row__copy">
              <strong>{track.title}</strong>
              <small>{track.description}</small>
            </span>
            <Switch
              checked={track.enabled}
              disabled={pending}
              onCheckedChange={(next) => onToggleTrack(track.id, next)}
              aria-label={track.title}
            />
          </div>
          <div className="onboarding-device">
            <CaptureAudioDeviceSelect
              label={track.deviceLabel}
              value={track.deviceValue}
              devices={track.devices}
              automaticLabel={track.automaticLabel}
              disabled={pending || !track.enabled}
              onChange={track.onDeviceChange}
              className="onboarding-device__select"
            />
          </div>
        </div>
      ))}
      {!hasAnyDevice ? (
        <p className="onboarding-note" role="status">
          No audio devices are available yet. Continue with Automatic and choose exact devices later in Settings, Capture.
        </p>
      ) : (
        <p className="onboarding-note">
          Each input stays on its own track. Sonar users can assign Sonar Game, Sonar Chat, and the microphone separately. Devices stay changeable in Settings, Capture.
        </p>
      )}
      {explicitMicUnavailable && includeMic ? (
        <p className="onboarding-note onboarding-note--warning" role="status">
          The selected microphone is not currently available. Reconnect it or choose another input.
        </p>
      ) : null}
      {gameAndChatSame ? (
        <p className="onboarding-note onboarding-note--warning" role="status">
          Game and chat are using the same output, so their tracks will contain the same sound. Choose different devices to keep them separate.
        </p>
      ) : null}
    </>
  );
}
