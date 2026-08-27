import { useState, type FormEvent } from 'react';
import { Bug, ExternalLink, Lightbulb, LoaderCircle, MessageSquarePlus } from 'lucide-react';
import type { FeedbackReportInput, FeedbackReportKind } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { switchboardApi } from '@/lib/demo-api';

const titleMinimum = 5;
const descriptionMinimum = 10;

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackReportKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [supportingDetails, setSupportingDetails] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'status' | 'error'; text: string } | null>(null);
  const canContinue = title.trim().length >= titleMinimum && description.trim().length >= descriptionMinimum;
  const isBug = kind === 'bug';

  const reset = () => {
    setKind('bug');
    setTitle('');
    setDescription('');
    setSupportingDetails('');
    setIncludeDiagnostics(true);
    setPending(false);
    setMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handoff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue || pending) return;
    setPending(true);
    setMessage(null);
    const input: FeedbackReportInput = {
      kind,
      title: title.trim(),
      description: description.trim(),
      ...(supportingDetails.trim() ? { supportingDetails: supportingDetails.trim() } : {}),
      includeDiagnostics,
    };

    try {
      const result = await switchboardApi.handoffFeedbackReport(input);
      if (result.opened) {
        handleOpenChange(false);
        return;
      }
      setMessage({
        tone: result.copied ? 'status' : 'error',
        text: result.copied
          ? 'The report is copied. GitHub could not be opened, so paste it into the project issue tracker.'
          : 'Switchboard could not copy the report or open GitHub. Your draft is still here.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Switchboard could not prepare this report.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className="settings-feedback-trigger no-drag">
          <MessageSquarePlus aria-hidden />
          <span>Bug or feature</span>
        </button>
      </DialogTrigger>

      <DialogContent
        className="settings-feedback-dialog no-drag"
        data-feedback-dialog
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="settings-feedback-dialog__header">
          <DialogTitle>Send product feedback</DialogTitle>
          <DialogDescription>
            Prepare a focused report, copy it to the clipboard, and continue to the Switchboard issue tracker.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handoff} className="settings-feedback-form">
          <RadioGroup
            value={kind}
            onValueChange={(value) => {
              setKind(value as FeedbackReportKind);
              setMessage(null);
            }}
            disabled={pending}
            aria-label="Feedback type"
            className="settings-feedback-kind"
          >
            <FeedbackKindOption
              id="feedback-kind-bug"
              value="bug"
              title="Bug report"
              description="Something is broken or behaves unexpectedly."
              active={isBug}
              icon={Bug}
            />
            <FeedbackKindOption
              id="feedback-kind-feature"
              value="feature"
              title="Feature request"
              description="A capability or workflow would make Switchboard better."
              active={!isBug}
              icon={Lightbulb}
            />
          </RadioGroup>

          <div className="settings-feedback-fields">
            <label className="settings-feedback-field" htmlFor="feedback-title">
              <span>
                Summary
                <small>{title.length}/120</small>
              </span>
              <Input
                id="feedback-title"
                value={title}
                minLength={titleMinimum}
                maxLength={120}
                required
                disabled={pending}
                autoComplete="off"
                placeholder={isBug ? 'Briefly name the problem' : 'Briefly name the capability'}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setMessage(null);
                }}
              />
            </label>

            <label className="settings-feedback-field" htmlFor="feedback-description">
              <span>
                {isBug ? 'What happened?' : 'What should Switchboard do?'}
                <small>{description.length}/2000</small>
              </span>
              <textarea
                id="feedback-description"
                value={description}
                minLength={descriptionMinimum}
                maxLength={2_000}
                required
                disabled={pending}
                placeholder={isBug
                  ? 'Describe the behavior you saw and what you expected instead.'
                  : 'Describe the requested behavior and the outcome it should enable.'}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setMessage(null);
                }}
              />
            </label>

            <label className="settings-feedback-field" htmlFor="feedback-supporting-details">
              <span>
                {isBug ? 'Steps to reproduce' : 'Use case'}
                <small>Optional · {supportingDetails.length}/1200</small>
              </span>
              <textarea
                id="feedback-supporting-details"
                value={supportingDetails}
                maxLength={1_200}
                disabled={pending}
                className="settings-feedback-field__supporting"
                placeholder={isBug
                  ? 'List the shortest reliable sequence that triggers the problem.'
                  : 'Explain where this fits into your usual workflow.'}
                onChange={(event) => {
                  setSupportingDetails(event.target.value);
                  setMessage(null);
                }}
              />
            </label>
          </div>

          <div className="settings-feedback-diagnostics">
            <div>
              <strong>Include app diagnostics</strong>
              <span>App version, Electron runtime, platform, and architecture only.</span>
            </div>
            <Switch
              checked={includeDiagnostics}
              disabled={pending}
              aria-label="Include app diagnostics"
              onCheckedChange={setIncludeDiagnostics}
            />
          </div>

          {message ? (
            <p
              className={cn('settings-feedback-message', message.tone === 'error' && 'settings-feedback-message--error')}
              role={message.tone === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          ) : null}

          <footer className="settings-feedback-footer">
            <p>The report is copied before GitHub opens. Repository access is required to submit it.</p>
            <div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={pending || !canContinue} className="min-w-[154px]">
                {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />}
                {pending ? 'Preparing…' : 'Copy & continue'}
              </Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackKindOption({
  id,
  value,
  title,
  description,
  active,
  icon: Icon,
}: {
  id: string;
  value: FeedbackReportKind;
  title: string;
  description: string;
  active: boolean;
  icon: typeof Bug;
}) {
  return (
    <label htmlFor={id} className="settings-feedback-kind__option" data-state={active ? 'checked' : 'unchecked'}>
      <Icon aria-hidden />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <RadioGroupItem id={id} value={value} aria-label={title} />
    </label>
  );
}
