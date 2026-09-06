import { diagnosticCheckSchema, type DiagnosticCheck } from '../../shared/contracts';
import { redactDiagnosticText } from './developer-diagnostics';

export function sanitizeDiagnosticCheck(input: unknown): DiagnosticCheck {
  const check = diagnosticCheckSchema.parse(input);
  return { ...check, label: redactDiagnosticText(check.label), detail: redactDiagnosticText(check.detail).slice(0, 8192) };
}

export function summarizeDiagnosticChecks(checks: DiagnosticCheck[]): string {
  const status = (id: string) => checks.find(check => check.id === id)?.status;
  if (status('capture.software') === 'fail' && status('capture.duplication') === 'pass') {
    return 'Windows Graphics Capture failed, but the Desktop Duplication display test passed. Share the diagnostics file to investigate the capture backend.';
  }
  if (status('capture.hardware') === 'fail' && status('capture.software') === 'pass') {
    return 'The hardware capture path failed while software H.264 worked. Use software H.264 for now and share the diagnostics file.';
  }
  if (status('capture.hardware') === 'fail' && status('capture.software') === 'fail') {
    return 'Both hardware and software display capture failed. Codec selection alone does not explain the problem; the file includes the capture errors.';
  }
  if (status('game-detection') === 'warning' && (status('capture.hardware') === 'pass' || status('capture.software') === 'pass')) {
    return 'Display capture works, but automatic game detection did not select a game. Keep the game open and unminimized, or select its window or display.';
  }
  const failed = checks.filter(check => check.status === 'fail').length;
  const warnings = checks.filter(check => check.status === 'warning').length;
  if (failed || warnings) return `${failed} failed ${failed === 1 ? 'check' : 'checks'} and ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}. Review the results and save the diagnostics file.`;
  if (status('capture.active') === 'skipped') return 'Replay stayed running. Non-invasive checks completed; direct encoder and capture tests were skipped.';
  return 'The checks that ran passed. This short test does not prove long-running replay or recorded audio. Save diagnostics to share the results.';
}
