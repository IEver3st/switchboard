import { useRef, useState, type FormEvent } from 'react';
import { Bug, Send, CheckCircle2, Lightbulb, LoaderCircle, MessageSquarePlus } from 'lucide-react';
import type { FeedbackSubmissionInput, FeedbackReportKind } from '../../../../shared/contracts';
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
import { defaultFeedbackDiagnosticsIncluded } from '../../../../shared/feedback-report';

const titleMinimum = 5;
const descriptionMinimum = 10;

export function FeedbackDialog() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackReportKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [supportingDetails, setSupportingDetails] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(defaultFeedbackDiagnosticsIncluded);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'status' | 'error'; text: string } | null>(null);
  const canContinue = title.trim().length >= titleMinimum && description.trim().length >= descriptionMinimum && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isBug = kind === 'bug';

  const reset = () => {
    setSubmitted(false);
    setKind('bug');
    setTitle('');
    setDescription('');
    setSupportingDetails('');
    setIncludeDiagnostics(defaultFeedbackDiagnosticsIncluded);
    setPending(false);
    setMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (inFlight.current) return;
    setOpen(nextOpen);
    if (!nextOpen && submitted) reset();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || submitted) return;
    if (!canContinue) {
      setMessage({ tone: 'error', text: 'Add a summary of at least 5 characters, a message of at least 10 characters, and a valid email address.' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    const input: FeedbackSubmissionInput = {
      email: email.trim(),
      kind,
      title: title.trim(),
      description: description.trim(),
      ...(supportingDetails.trim() ? { supportingDetails: supportingDetails.trim() } : {}),
      includeDiagnostics,
    };

    try {
      const result = await switchboardApi.submitFeedbackReport(input);
      setSubmitted(result.submitted);
      setMessage({ tone: result.submitted ? 'status' : 'error', text: result.message });
    } catch {
      setMessage({
        tone: 'error',
        text: 'Switchboard could not send your feedback. Your draft is still here; check the fields and try again.',
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button ref={triggerRef} type="button" className="settings-feedback-trigger no-drag">
          <MessageSquarePlus aria-hidden />
          <span>Send feedback</span>
        </button>
      </DialogTrigger>

      <DialogContent
        className="settings-feedback-dialog no-drag"
        data-feedback-dialog
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader className="settings-feedback-dialog__header">
          <DialogTitle>Send product feedback</DialogTitle>
          <DialogDescription>
            Send a bug, idea, or comment directly to Means. No account needed.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="settings-feedback-success" role="status">
            <CheckCircle2 aria-hidden />
            <h3>Feedback sent</h3>
            <p>Thanks for helping improve Switchboard. We can reply to {email.trim()} if we need more details.</p>
            <Button type="button" variant="primary" autoFocus onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        ) : <form onSubmit={submit} className="settings-feedback-form" aria-busy={pending}>
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
              description="Something is broken"
              active={isBug}
              icon={Bug}
            />
            <FeedbackKindOption
              id="feedback-kind-feature"
              value="feature"
              title="Feature request"
              description="An idea to add"
              active={kind === 'feature'}
              icon={Lightbulb}
            />
            <FeedbackKindOption
              id="feedback-kind-feedback"
              value="feedback"
              title="Feedback"
              description="Anything else"
              active={kind === 'feedback'}
              icon={MessageSquarePlus}
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
                placeholder={isBug ? 'Briefly name the problem' : kind === 'feature' ? 'Briefly name your idea' : 'What is on your mind?'}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setMessage(null);
                }}
              />
            </label>

            <label className="settings-feedback-field" htmlFor="feedback-description">
              <span>
                {isBug ? 'What happened?' : kind === 'feature' ? 'What should Switchboard do?' : 'Tell us more'}
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
                  : kind === 'feature' ? 'Describe your idea and how it would help.' : 'Share what works well or what could be better.'}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setMessage(null);
                }}
              />
            </label>

            <label className="settings-feedback-field" htmlFor="feedback-email">
              <span>Email <small>For replies</small></span>
              <Input id="feedback-email" type="email" autoComplete="email" maxLength={254} required
                value={email} disabled={pending} placeholder="you@example.com"
                onChange={(event) => { setEmail(event.target.value); setMessage(null); }} />
            </label>
            <details className="settings-feedback-additional">
              <summary>{isBug ? 'Add steps to reproduce' : 'Add more context'} <span>Optional</span></summary>
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
            </details>
          </div>

          <div className="settings-feedback-diagnostics">
            <div>
              <strong>Include app details</strong>
              <span>App version, Electron runtime, platform, and architecture only.</span>
            </div>
            <Switch
              checked={includeDiagnostics}
              disabled={pending}
              aria-label="Include app details"
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
            <p>Sent privately to Means. Your email is used to reply.</p>
            <div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={pending} className="min-w-[154px]">
                {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                {pending ? 'Sending…' : 'Submit feedback'}
              </Button>
            </div>
          </footer>
        </form>}
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
