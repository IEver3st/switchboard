import { useEffect, useRef, useState } from 'react';
import { Check, CircleDot, Flag, LayoutGrid, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { CaptureSourceType, SystemSnapshot, WorkspaceProfile } from '../../../../shared/contracts';
import { applyProfileToDraft } from '../../../../shared/workspace-profile';
import { ShortcutRecorderButton } from '@/components/shared/ShortcutRecorderButton';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { displayShortcut } from '@/lib/shortcut';
import { useSystemStore } from '@/stores/use-system-store';

const stepMeta: ReadonlyArray<{ id: string; title: string; description: string; icon: LucideIcon }> = [
  { id: 'welcome', title: 'Welcome', description: 'What Switchboard is and what setup covers.', icon: Flag },
  { id: 'setup', title: 'Choose your setup', description: 'Clipping only, or the full control surface.', icon: LayoutGrid },
  { id: 'capture', title: 'Set up capture', description: 'Replay, source, and the save shortcut.', icon: CircleDot },
  { id: 'finish', title: 'Review and finish', description: 'Confirm the choices and start working.', icon: Check },
];

const profileOptions: ReadonlyArray<{ value: WorkspaceProfile; title: string; description: string }> = [
  { value: 'clipping', title: 'Just clipping', description: 'Capture and Clips only. Devices and Audio stay hidden.' },
  { value: 'full', title: 'Full setup', description: 'Devices, Audio, and Capture. Everything stays visible.' },
];

const sourceOptions: ReadonlyArray<{ value: CaptureSourceType; title: string; description: string }> = [
  { value: 'automatic-game', title: 'Automatic game', description: 'Follow the game in focus. Nothing to pick.' },
  { value: 'window', title: 'Window', description: 'Capture one window. Choose it in Capture later.' },
  { value: 'display', title: 'Display', description: 'Capture a whole monitor.' },
];

function sourceLabel(source: CaptureSourceType): string {
  return sourceOptions.find((option) => option.value === source)?.title ?? source;
}

function profileLabel(profile: WorkspaceProfile | null): string {
  return profile === 'clipping' ? 'Just clipping' : 'Full setup';
}

type CardStatus = 'done' | 'current' | 'todo';

export function OnboardingFlow({ snapshot }: { snapshot: SystemSnapshot }) {
  const [active, setActive] = useState(0);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(snapshot.settings.workspaceProfile);
  const [source, setSource] = useState<CaptureSourceType>(snapshot.capture.config.source);
  const [hotkey, setHotkey] = useState(snapshot.capture.config.hotkey);
  const [replay, setReplay] = useState(snapshot.capture.config.enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [active]);

  const fail = (message: string) => {
    setError(message);
    setPending(false);
  };

  const revisit = (index: number) => {
    if (pending) return;
    setError(null);
    setActive(index);
  };

  const skipSetup = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().updateSettings({ workspaceProfile: 'full', onboardingCompleted: true });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    useSystemStore.getState().setPage('devices');
  };

  const continueFromSetup = async () => {
    if (!profile) {
      setError('Choose Just clipping or Full setup to continue.');
      return;
    }
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().updateSettings({ workspaceProfile: profile });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    setActive(2);
  };

  const continueFromCapture = async () => {
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().setCaptureConfig({
      source,
      ...(source === 'automatic-game' ? { sourceId: null } : {}),
      hotkey,
      enabled: replay,
    });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    setActive(3);
  };

  const finish = async () => {
    const finalProfile = profile ?? 'full';
    setPending(true);
    setError(null);
    useSystemStore.getState().clearError();
    await useSystemStore.getState().updateSettings({ workspaceProfile: finalProfile, onboardingCompleted: true });
    const failure = useSystemStore.getState().error;
    if (failure) {
      fail(failure);
      return;
    }
    setPending(false);
    useSystemStore.getState().setPage(finalProfile === 'clipping' ? 'capture' : 'devices');
  };

  const chooseProfile = (next: WorkspaceProfile) => {
    setError(null);
    const draft = applyProfileToDraft({ profile, source, hotkey, replayEnabled: replay }, next);
    setProfile(draft.profile);
    setReplay(draft.replayEnabled);
  };

  const statusOf = (index: number): CardStatus => (index < active ? 'done' : index === active ? 'current' : 'todo');

  const doneSummary = (index: number): string => {
    if (index === 1) return profileLabel(profile);
    if (index === 2) return `${replay ? 'Replay on' : 'Replay off'} · ${sourceLabel(source)} · ${displayShortcut(hotkey)}`;
    return stepMeta[index]?.description ?? '';
  };

  return (
    <div className="onboarding-screen">
      <div className="app-drag onboarding-topbar" aria-hidden="true">
        <img src="./switchboard-mark.png" alt="" draggable={false} />
        <span>Switchboard</span>
      </div>

      <main className="onboarding-main" aria-labelledby="onboarding-heading">
        <div className="onboarding-wrap">
          <h1 id="onboarding-heading" ref={headingRef} tabIndex={-1}>Set up Switchboard</h1>
          <p className="onboarding-sub">Complete these steps to get capture, audio, and hardware ready.</p>

          <p className="onboarding-count" aria-live="polite">{active} of {stepMeta.length} completed</p>
          <Progress value={(active / stepMeta.length) * 100} aria-label="Setup progress" />

          <ol className="onboarding-list" aria-label="Setup steps">
            {stepMeta.map((step, index) => {
              const status = statusOf(index);
              const StepIcon = step.icon;
              return (
                <li key={step.id}>
                  {status === 'done' ? (
                    <button
                      type="button"
                      className="onboarding-card"
                      data-status="done"
                      disabled={pending}
                      onClick={() => revisit(index)}
                      aria-label={`${step.title}, completed. Activate to revise.`}
                    >
                      <span className="onboarding-status onboarding-status--done" aria-hidden="true"><Check /></span>
                      <span className="onboarding-card__copy">
                        <strong>{step.title}</strong>
                        <small>{doneSummary(index)}</small>
                      </span>
                      <StepIcon className="onboarding-card__icon" aria-hidden="true" />
                    </button>
                  ) : status === 'current' ? (
                    <section className="onboarding-card" data-status="current" aria-label={`${step.title}, current step`}>
                      <div className="onboarding-card__head">
                        <span className="onboarding-status onboarding-status--current" aria-hidden="true">{index + 1}</span>
                        <span className="onboarding-card__copy">
                          <strong>{step.title}</strong>
                          <small>{step.description}</small>
                        </span>
                        <StepIcon className="onboarding-card__icon" aria-hidden="true" />
                      </div>

                      {index === 0 ? (
                        <p className="onboarding-body">
                          Switchboard handles game capture, audio routing, and hardware controls from one quiet place.
                          Setup takes less than a minute, and everything stays changeable in Settings.
                        </p>
                      ) : null}

                      {index === 1 ? (
                        <RadioGroup
                          value={profile ?? ''}
                          onValueChange={(value) => chooseProfile(value as WorkspaceProfile)}
                          disabled={pending}
                          aria-label="Setup"
                          className="onboarding-options"
                        >
                          {profileOptions.map((option) => (
                            <label
                              key={option.value}
                              htmlFor={`onboarding-profile-${option.value}`}
                              className="onboarding-option"
                              data-state={profile === option.value ? 'checked' : 'unchecked'}
                            >
                              <span className="onboarding-option__copy">
                                <strong>{option.title}</strong>
                                <small>{option.description}</small>
                              </span>
                              <RadioGroupItem id={`onboarding-profile-${option.value}`} value={option.value} aria-label={option.title} />
                            </label>
                          ))}
                        </RadioGroup>
                      ) : null}

                      {index === 2 ? (
                        <>
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
                          <div className="onboarding-row">
                            <span className="onboarding-row__copy">
                              <strong id="onboarding-shortcut-label">Save replay shortcut</strong>
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
                        </>
                      ) : null}

                      {index === 3 ? (
                        <dl className="onboarding-summary">
                          <div>
                            <dt>Setup</dt>
                            <dd>{profileLabel(profile)}</dd>
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
                        </dl>
                      ) : null}

                      {error ? (
                        <p className="onboarding-error" role="alert">
                          <TriangleAlert aria-hidden="true" />
                          <span>{error}</span>
                        </p>
                      ) : null}

                      <div className="onboarding-actions">
                        {index === 0 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => setActive(1)}>
                            Get started
                          </Button>
                        ) : null}
                        {index === 1 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void continueFromSetup()}>
                            {pending ? 'Saving…' : 'Continue'}
                          </Button>
                        ) : null}
                        {index === 2 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void continueFromCapture()}>
                            {pending ? 'Saving…' : 'Continue'}
                          </Button>
                        ) : null}
                        {index === 3 ? (
                          <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => void finish()}>
                            {pending ? 'Finishing…' : profile === 'clipping' ? 'Open Capture' : 'Open Devices'}
                          </Button>
                        ) : null}
                      </div>
                    </section>
                  ) : (
                    <div className="onboarding-card" data-status="todo" aria-disabled="true">
                      <span className="onboarding-status" aria-hidden="true">{index + 1}</span>
                      <span className="onboarding-card__copy">
                        <strong>{step.title}</strong>
                        <small>{step.description}</small>
                      </span>
                      <StepIcon className="onboarding-card__icon" aria-hidden="true" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="onboarding-foot">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => void skipSetup()}>
              Skip setup
            </Button>
            <p>Everything stays changeable in Settings.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
