import { describe, expect, it } from 'bun:test';
import { feedbackReportInputSchema, type FeedbackReportInput } from '../src/shared/contracts';
import {
  buildFeedbackClipboardText,
  buildFeedbackIssueUrl,
  buildFeedbackReportMarkdown,
  defaultFeedbackDiagnosticsIncluded,
  switchboardIssueUrl,
} from '../src/shared/feedback-report';

const bugReport: FeedbackReportInput = {
  kind: 'bug',
  title: 'Capture shortcut stops responding',
  description: 'The saved shortcut no longer creates a replay after the host restarts.',
  supportingDetails: '1. Start Capture\n2. Restart the host\n3. Press the shortcut',
  includeDiagnostics: true,
};

const environment = {
  version: '0.5.0',
  runtime: 'Electron 44.0.0',
  platform: 'win32 x64',
  prototypeMode: true,
};

describe('feedback report handoff', () => {
  it('requires an affirmative choice before diagnostics are included', () => {
    expect(defaultFeedbackDiagnosticsIncluded).toBeFalse();
  });

  it('validates bounded report input at the IPC boundary', () => {
    expect(feedbackReportInputSchema.parse(bugReport)).toEqual(bugReport);
    expect(feedbackReportInputSchema.safeParse({ ...bugReport, title: 'No' }).success).toBe(false);
    expect(feedbackReportInputSchema.safeParse({ ...bugReport, description: 'Too short' }).success).toBe(false);
    expect(feedbackReportInputSchema.safeParse({ ...bugReport, kind: 'support' }).success).toBe(false);
  });

  it('builds a fixed-origin, prefilled GitHub issue without interpolating a destination', () => {
    const url = new URL(buildFeedbackIssueUrl(bugReport, environment));
    const destination = new URL(switchboardIssueUrl);

    expect(url.origin).toBe(destination.origin);
    expect(url.pathname).toBe(destination.pathname);
    expect(url.searchParams.get('title')).toBe('[Bug] Capture shortcut stops responding');
    expect(url.searchParams.has('labels')).toBe(false);
    expect(url.searchParams.get('body')).toContain('## Steps to reproduce');
    expect(url.searchParams.get('body')).toContain('Electron 44.0.0');
  });

  it('omits diagnostics when the user turns them off and keeps the copied report self-contained', () => {
    const feature = { ...bugReport, kind: 'feature' as const, includeDiagnostics: false };
    const markdown = buildFeedbackReportMarkdown(feature, environment);
    const clipboard = buildFeedbackClipboardText(feature, environment);
    const url = new URL(buildFeedbackIssueUrl(feature, environment));

    expect(url.pathname).toBe('/IEver3st/switchboard/issues/new');
    expect(url.searchParams.get('title')).toBe('[Feature] Capture shortcut stops responding');
    expect(url.searchParams.get('body')).toBe(markdown);
    expect(url.searchParams.has('labels')).toBe(false);
    expect(markdown).toContain('## Requested capability');
    expect(markdown).not.toContain('## Environment');
    expect(clipboard).toStartWith('# [Feature] Capture shortcut stops responding');
    expect(clipboard).toContain(markdown);
  });

  it('includes only allowlisted environment fields', () => {
    const contaminatedEnvironment = {
      ...environment,
      username: 'private-user',
      homeDirectory: 'C:\\Users\\private-user',
      token: 'secret-token',
    };
    const markdown = buildFeedbackReportMarkdown(bugReport, contaminatedEnvironment);

    expect(markdown).toContain('Electron 44.0.0');
    expect(markdown).not.toContain('private-user');
    expect(markdown).not.toContain('secret-token');
  });
});
