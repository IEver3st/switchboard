import type { FeedbackHandoffResult, FeedbackReportInput } from '../../shared/contracts';
import {
  buildFeedbackClipboardText,
  buildFeedbackIssueUrl,
  type FeedbackEnvironment,
} from '../../shared/feedback-report';

export type FeedbackHandoffOperations = {
  writeClipboard(text: string): void;
  openExternal(url: string): Promise<unknown>;
};

export async function performFeedbackHandoff(
  input: FeedbackReportInput,
  environment: FeedbackEnvironment,
  operations: FeedbackHandoffOperations,
): Promise<FeedbackHandoffResult> {
  let copied = true;
  try {
    operations.writeClipboard(buildFeedbackClipboardText(input, environment));
  } catch {
    copied = false;
  }

  let opened = true;
  try {
    await operations.openExternal(buildFeedbackIssueUrl(input, environment));
  } catch {
    opened = false;
  }

  return { copied, opened };
}
