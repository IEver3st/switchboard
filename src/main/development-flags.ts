export function requestsDemoUpdate(
  arguments_: readonly string[],
  isPackaged: boolean,
  additionalData: unknown = undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (isPackaged) return false;
  if (arguments_.includes('--demo-update')) return true;
  if (environment.SWITCHBOARD_DEMO_UPDATE === '1') return true;
  return isRecord(additionalData) && additionalData.demoUpdate === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
