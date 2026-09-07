import { z } from 'zod';
import { feedbackSubmissionInputSchema, type FeedbackSubmissionInput, type FeedbackSubmissionResult } from '../../shared/contracts';
import { buildFeedbackClipboardText, type FeedbackEnvironment } from '../../shared/feedback-report';

export const feedbackEndpoint = 'https://frommeans.com/api/correspond';
const receiptSchema = z.object({ ok: z.literal(true) });

// Credentials and delivery stay in the existing Means correspondence service.
// Never retry automatically: a lost response can follow a successful delivery.
export async function submitFeedbackReport(
  raw: FeedbackSubmissionInput,
  environment: FeedbackEnvironment,
  send: typeof fetch = fetch,
): Promise<FeedbackSubmissionResult> {
  const input = feedbackSubmissionInputSchema.parse(raw);
  try {
    const response = await send(feedbackEndpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: 'Switchboard feedback',
        email: input.email,
        message: buildFeedbackClipboardText(input, environment),
        website: '',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok && receiptSchema.safeParse(await response.json()).success) {
      return { submitted: true, message: 'Feedback sent. Thank you for helping improve Switchboard.' };
    }
    return {
      submitted: false,
      message: response.status === 429
        ? 'Too many submissions. Wait a few minutes before trying again. Your draft is still here.'
        : 'The feedback service could not accept your message. Your draft is still here; try again later.',
    };
  } catch {
    return { submitted: false, message: 'Delivery could not be confirmed. Check your connection before trying again. Your draft is still here; retrying may send a duplicate.' };
  }
}
