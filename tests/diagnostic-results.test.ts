import { describe, expect, it } from 'bun:test';
import { sanitizeDiagnosticCheck, summarizeDiagnosticChecks } from '../src/main/services/diagnostic-results';
import { diagnosticRunSchema, idleDiagnosticRun, type DiagnosticCheck } from '../src/shared/contracts';

const check = (id: string, status: DiagnosticCheck['status']): DiagnosticCheck => ({ id, status, label: id, detail: '' });

describe('one-click diagnostic findings', () => {
  it('separates game detection, hardware encoding, and capture backend failures', () => {
    expect(summarizeDiagnosticChecks([check('game-detection', 'warning'), check('capture.hardware', 'pass')]))
      .toContain('Display capture works, but automatic game detection');
    expect(summarizeDiagnosticChecks([check('capture.hardware', 'fail'), check('capture.software', 'pass')]))
      .toContain('hardware capture path failed');
    expect(summarizeDiagnosticChecks([check('capture.hardware', 'fail'), check('capture.software', 'fail'), check('capture.duplication', 'pass')]))
      .toContain('Desktop Duplication display test passed');
    expect(summarizeDiagnosticChecks([check('capture.hardware', 'fail'), check('capture.software', 'fail')]))
      .toContain('Codec selection alone does not explain');
  });
  it('does not call skipped recording probes a capture pass', () => {
    expect(summarizeDiagnosticChecks([check('capture.active', 'skipped')])).toContain('direct encoder and capture tests were skipped');
    expect(summarizeDiagnosticChecks([check('encoder.h264_nvenc', 'skipped')])).toContain('does not prove long-running replay');
  });
  it('bounds and redacts exported diagnostic text at the host boundary', () => {
    const result = sanitizeDiagnosticCheck({ ...check('capture.current', 'fail'), detail: 'Failed C:\\Users\\Friend\\Videos\\private.mkv token=secret-value' });
    expect(result.detail).not.toContain('Friend');
    expect(result.detail).not.toContain('secret-value');
    expect(() => sanitizeDiagnosticCheck({ ...result, detail: 'x'.repeat(8193) })).toThrow();
    expect(diagnosticRunSchema.parse(idleDiagnosticRun).status).toBe('idle');
  });
});
