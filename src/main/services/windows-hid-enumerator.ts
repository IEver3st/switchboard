import { execFile } from 'node:child_process';
import type { Device as HidDevice } from 'node-hid';

const hidClassGuid = '{745a17a0-74d3-11d0-b6fe-00a0c90f57da}';
const hidInterfaceGuid = '{4d1e55b2-f16f-11cf-88cb-001111000030}';
const maximumOutputBytes = 4 * 1024 * 1024;
const enumerationTimeoutMs = 2_500;

export async function enumerateWindowsHidDevices(): Promise<HidDevice[]> {
  const stdout = await runPnpUtil([
    '/enum-devices',
    '/connected',
    '/class',
    hidClassGuid,
    '/deviceids',
    '/interfaces',
    '/format',
    'csv',
  ]);
  return parsePnpUtilHidDevices(stdout);
}

export function parsePnpUtilHidDevices(csv: string): HidDevice[] {
  const rows = parseCsv(csv).filter((row) => row.length >= 11);
  const metadataByInstanceId = new Map<string, string[]>();

  for (const row of rows) {
    const instanceId = row[0]?.trim();
    const hardwareIds = row[10]?.trim();
    if (!instanceId || !hardwareIds) continue;
    metadataByInstanceId.set(instanceId.toLowerCase(), row);
  }

  const devices: HidDevice[] = [];
  for (const row of rows) {
    const instanceId = row[0]?.trim();
    const path = row[12]?.trim();
    if (!instanceId || !path || !path.toLowerCase().endsWith(`#${hidInterfaceGuid}`)) continue;

    const metadata = metadataByInstanceId.get(instanceId.toLowerCase());
    if (!metadata) continue;
    const hardwareIds = metadata[10] ?? '';
    const identityText = `${instanceId};${hardwareIds}`;
    const product = identityText.match(/VID_([0-9a-f]{4})&PID_([0-9a-f]{4})/i);
    if (!product) continue;
    const usage = hardwareIds.match(/UP:([0-9a-f]{4})_U:([0-9a-f]{4})/i);
    const revision = hardwareIds.match(/REV_([0-9a-f]{4})/i);
    const interfaceNumber = instanceId.match(/&MI_([0-9a-f]{2})/i);

    devices.push({
      vendorId: Number.parseInt(product[1]!, 16),
      productId: Number.parseInt(product[2]!, 16),
      path,
      manufacturer: metadata[4] || undefined,
      product: metadata[1] || undefined,
      release: revision ? Number.parseInt(revision[1]!, 16) : 0,
      interface: interfaceNumber ? Number.parseInt(interfaceNumber[1]!, 16) : -1,
      ...(usage ? {
        usagePage: Number.parseInt(usage[1]!, 16),
        usage: Number.parseInt(usage[2]!, 16),
      } : {}),
    });
  }

  return devices;
}

function runPnpUtil(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('pnputil.exe', args, {
      encoding: 'utf8',
      maxBuffer: maximumOutputBytes,
      timeout: enumerationTimeoutMs,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) {
        reject(new Error(`Windows HID interface discovery failed: ${error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && value[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
