import { describe, expect, it } from 'bun:test';
import type { FeedbackReportInput } from '../src/shared/contracts';
import { performFeedbackHandoff } from '../src/main/services/feedback-handoff';

const input: FeedbackReportInput = {
  kind: 'bug',
  title: 'Capture shortcut stops responding',
  description: 'The saved shortcut no longer creates a replay after the host restarts.',
  supportingDetails: 'Restart Capture.Host, then press the shortcut.',
  includeDiagnostics: false,
};

const environment = {
  version: '0.5.0',
  runtime: 'Electron 44.0.0',
  platform: 'win32 x64',
  prototypeMode: true,
};

describe('feedback handoff operations', () => {
  it('copies the fallback before opening the fixed GitHub destination', async () => {
    const calls: string[] = [];
    const result = await performFeedbackHandoff(input, environment, {
      writeClipboard: (text) => calls.push(`copy:${text}`),
      openExternal: async (url) => calls.push(`open:${url}`),
    });

    expect(result).toEqual({ copied: true, opened: true });
    expect(calls[0]).toStartWith('copy:# [Bug] Capture shortcut stops responding');
    expect(new URL(calls[1].slice('open:'.length)).pathname).toBe('/IEver3st/switchboard/issues/new');
  });

  it('still opens GitHub when the clipboard is unavailable', async () => {
    const result = await performFeedbackHandoff(input, environment, {
      writeClipboard: () => { throw new Error('clipboard unavailable'); },
      openExternal: async () => undefined,
    });

    expect(result).toEqual({ copied: false, opened: true });
  });

  it('preserves a copied fallback when the browser cannot open', async () => {
    const result = await performFeedbackHandoff(input, environment, {
      writeClipboard: () => undefined,
      openExternal: async () => { throw new Error('browser unavailable'); },
    });

    expect(result).toEqual({ copied: true, opened: false });
  });

  it('reports both failures without discarding the caller draft', async () => {
    const result = await performFeedbackHandoff(input, environment, {
      writeClipboard: () => { throw new Error('clipboard unavailable'); },
      openExternal: async () => { throw new Error('browser unavailable'); },
    });

    expect(result).toEqual({ copied: false, opened: false });
  });
});
