import type { FeedbackReportInput } from './contracts';

export const switchboardIssueUrl = 'https://github.com/IEver3st/switchboard/issues/new';
export const defaultFeedbackDiagnosticsIncluded = false;

export type FeedbackEnvironment = {
  version: string;
  runtime: string;
  platform: string;
  prototypeMode: boolean;
};

export function buildFeedbackReportMarkdown(
  input: FeedbackReportInput,
  environment?: FeedbackEnvironment,
): string {
  const isBug = input.kind === 'bug';
  const sections = [
    `## ${isBug ? 'Bug description' : 'Requested capability'}`,
    input.description.trim(),
  ];

  const supportingDetails = input.supportingDetails?.trim();
  if (supportingDetails) {
    sections.push(
      `## ${isBug ? 'Steps to reproduce' : 'Use case'}`,
      supportingDetails,
    );
  }

  if (input.includeDiagnostics && environment) {
    sections.push(
      '## Environment',
      [
        `- Switchboard: ${environment.version}${environment.prototypeMode ? ' (prototype mode)' : ''}`,
        `- Runtime: ${environment.runtime}`,
        `- Platform: ${environment.platform}`,
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

export function buildFeedbackIssueUrl(
  input: FeedbackReportInput,
  environment?: FeedbackEnvironment,
): string {
  const url = new URL(switchboardIssueUrl);
  url.searchParams.set('title', `${input.kind === 'bug' ? '[Bug]' : '[Feature]'} ${input.title.trim()}`);
  url.searchParams.set('body', buildFeedbackReportMarkdown(input, environment));
  // Public reporters may not have permission to apply labels through URL parameters.
  // Keep the report kind in the title and let maintainers assign labels on GitHub.
  return url.toString();
}

export function buildFeedbackClipboardText(
  input: FeedbackReportInput,
  environment?: FeedbackEnvironment,
): string {
  const prefix = input.kind === 'bug' ? 'Bug' : 'Feature';
  return `# [${prefix}] ${input.title.trim()}\n\n${buildFeedbackReportMarkdown(input, environment)}`;
}
