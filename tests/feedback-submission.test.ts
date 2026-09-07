import { describe, expect, it } from 'bun:test';
import { feedbackSubmissionInputSchema, type FeedbackSubmissionInput } from '../src/shared/contracts';
import { feedbackEndpoint, submitFeedbackReport } from '../src/main/services/feedback-submission';

const input: FeedbackSubmissionInput = {
  kind: 'feedback', title: 'A useful utility', description: 'The device controls are easy to find.',
  email: 'reporter@example.com', includeDiagnostics: false,
};
const environment = { version: '0.8.5', runtime: 'Electron 44', platform: 'win32 x64', prototypeMode: false };
const mockSend = (handler: (url: string, init: RequestInit) => Promise<Response>) => handler as typeof fetch;

describe('direct feedback submission', () => {
  it('sends all report types to the fixed service and respects app detail consent', async () => {
    for (const kind of ['bug', 'feature', 'feedback'] as const) {
      for (const includeDiagnostics of [false, true]) {
        const result = await submitFeedbackReport({ ...input, kind, includeDiagnostics }, environment, mockSend(async (url, init) => {
          expect(url).toBe(feedbackEndpoint);
          expect(init.redirect).toBe('error');
          expect(init.signal).toBeInstanceOf(AbortSignal);
          const body = JSON.parse(init.body as string);
          expect(body.email).toBe(input.email);
          expect(body.message).toContain(input.description);
          expect(body.message.includes('Electron 44')).toBe(includeDiagnostics);
          expect(body.website).toBe('');
          return Response.json({ ok: true });
        }));
        expect(result.submitted).toBe(true);
      }
    }
  });
  it('rejects bad input before any network request', async () => {
    expect(feedbackSubmissionInputSchema.safeParse({ ...input, email: 'bad' }).success).toBe(false);
    expect(feedbackSubmissionInputSchema.safeParse({ ...input, email: 'x@example.com\r\nBcc:other@example.com' }).success).toBe(false);
    let calls = 0;
    await expect(submitFeedbackReport({ ...input, description: '' }, environment, mockSend(async () => {
      calls++; return Response.json({ ok: true });
    }))).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it('requires an affirmative service receipt, including on HTTP success', async () => {
    for (const response of [Response.json({ ok: false }), Response.json({}), new Response('not JSON'), Response.json({ ok: true }, { status: 503 })]) {
      const result = await submitFeedbackReport(input, environment, mockSend(async () => response));
      expect(result.submitted).toBe(false);
    }
  });
  it('keeps failures retryable without automatically sending a duplicate', async () => {
    let calls = 0;
    const result = await submitFeedbackReport(input, environment, mockSend(async () => { calls++; throw new Error('offline'); }));
    expect(calls).toBe(1);
    expect(result.submitted).toBe(false);
    expect(result.message).toContain('could not be confirmed');
    expect(result.message).toContain('duplicate');
    const limited = await submitFeedbackReport(input, environment, mockSend(async () => new Response('', { status: 429 })));
    expect(limited.message).toContain('Wait a few minutes');
  });
});
