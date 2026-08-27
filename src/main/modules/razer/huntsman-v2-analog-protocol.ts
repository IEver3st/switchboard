export const razerVendorId = 0x1532;
export const huntsmanV2AnalogProductId = 0x0266;
export const razerReportLength = 91;

export type HuntsmanLightingEffectId =
  | 'off'
  | 'static'
  | 'breathing'
  | 'spectrum'
  | 'wave-left'
  | 'wave-right'
  | 'reactive'
  | 'starlight'
  | 'wheel-left'
  | 'wheel-right';

export interface RazerCommand {
  transactionId: number;
  commandClass: number;
  commandId: number;
  arguments: readonly number[];
}

export interface RazerResponse {
  status: number;
  arguments: Buffer;
}

const lightingTransactionId = 0x1f;
const generalTransactionId = 0xff;
const lightingCommandClass = 0x0f;

export function buildRazerReport(command: RazerCommand): Buffer {
  if (command.arguments.length > 80) throw new Error('Razer HID commands accept at most 80 argument bytes.');
  const report = Buffer.alloc(razerReportLength);
  report[2] = byte(command.transactionId);
  report[6] = command.arguments.length;
  report[7] = byte(command.commandClass);
  report[8] = byte(command.commandId);
  report.set(command.arguments.map(byte), 9);
  report[89] = razerCrc(report);
  return report;
}

export function parseRazerResponse(report: Buffer, request: RazerCommand): RazerResponse {
  if (report.byteLength !== razerReportLength) {
    throw new Error(`Expected a ${razerReportLength}-byte Razer response, received ${report.byteLength}.`);
  }
  if (report[2] !== byte(request.transactionId) || report[7] !== byte(request.commandClass) || report[8] !== byte(request.commandId)) {
    throw new Error('The Razer response did not match the pending command.');
  }
  if (report[89] !== razerCrc(report)) throw new Error('The Razer response checksum was invalid.');
  const size = report[6] ?? 0;
  if (size > 80) throw new Error('The Razer response declared an invalid payload size.');
  return { status: report[1] ?? 0, arguments: Buffer.from(report.subarray(9, 9 + size)) };
}

export function razerCrc(report: Uint8Array): number {
  let crc = 0;
  for (let index = 3; index <= 88; index += 1) crc ^= report[index] ?? 0;
  return crc;
}

export function firmwareVersionCommand(): RazerCommand {
  return { transactionId: generalTransactionId, commandClass: 0x00, commandId: 0x81, arguments: [0, 0] };
}

export function serialNumberCommand(): RazerCommand {
  return { transactionId: generalTransactionId, commandClass: 0x00, commandId: 0x82, arguments: Array(22).fill(0) };
}

export function brightnessReadCommand(): RazerCommand {
  return { transactionId: lightingTransactionId, commandClass: lightingCommandClass, commandId: 0x84, arguments: [0x01, 0x05, 0x00] };
}

export function brightnessWriteCommand(brightness: number): RazerCommand {
  return {
    transactionId: lightingTransactionId,
    commandClass: lightingCommandClass,
    commandId: 0x04,
    arguments: [0x01, 0x05, percentToByte(brightness)],
  };
}

export function effectWriteCommand(effectId: HuntsmanLightingEffectId, color: string): RazerCommand {
  const [red, green, blue] = parseColor(color);
  const argumentsByEffect: Record<HuntsmanLightingEffectId, readonly number[]> = {
    off: [0x01, 0x05, 0x00, 0x00, 0x00, 0x00],
    static: [0x01, 0x05, 0x01, 0x00, 0x00, 0x01, red, green, blue],
    breathing: [0x01, 0x05, 0x02, 0x01, 0x00, 0x01, red, green, blue],
    spectrum: [0x01, 0x05, 0x03, 0x00, 0x00, 0x00],
    'wave-left': [0x01, 0x05, 0x04, 0x01, 0x28, 0x00],
    'wave-right': [0x01, 0x05, 0x04, 0x02, 0x28, 0x00],
    reactive: [0x01, 0x05, 0x05, 0x00, 0x02, 0x01, red, green, blue],
    starlight: [0x01, 0x05, 0x07, 0x00, 0x02, 0x01, red, green, blue],
    'wheel-left': [0x01, 0x05, 0x0a, 0x01, 0x28, 0x00],
    'wheel-right': [0x01, 0x05, 0x0a, 0x02, 0x28, 0x00],
  };
  return {
    transactionId: lightingTransactionId,
    commandClass: lightingCommandClass,
    commandId: 0x02,
    arguments: argumentsByEffect[effectId],
  };
}

export function parseFirmwareVersion(response: RazerResponse): string {
  if (response.arguments.length < 2) throw new Error('The keyboard returned an incomplete firmware version.');
  return `${response.arguments[0]}.${String(response.arguments[1]).padStart(2, '0')}`;
}

export function parseSerialNumber(response: RazerResponse): string | undefined {
  const value = response.arguments.toString('ascii').replaceAll('\0', '').trim();
  return value || undefined;
}

export function parseBrightness(response: RazerResponse): number {
  if (response.arguments.length < 3) throw new Error('The keyboard returned an incomplete brightness value.');
  return Math.round(((response.arguments[2] ?? 0) / 255) * 100);
}

export function isHuntsmanLightingEffect(value: unknown): value is HuntsmanLightingEffectId {
  return typeof value === 'string' && [
    'off',
    'static',
    'breathing',
    'spectrum',
    'wave-left',
    'wave-right',
    'reactive',
    'starlight',
    'wheel-left',
    'wheel-right',
  ].includes(value);
}

function parseColor(color: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Lighting color must be a six-digit hex value.');
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function percentToByte(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Brightness must be between 0 and 100.');
  return Math.round((value / 100) * 255);
}

function byte(value: number): number {
  return value & 0xff;
}
