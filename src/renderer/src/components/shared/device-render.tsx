import { useEffect, useRef, useState } from 'react';
import type { Device } from '../../../../shared/contracts';
import g502XPlusBlackUrl from '@/assets/device-renders/g502-x-plus.png';
import g502XPlusWhiteUrl from '@/assets/device-renders/g502-x-plus-white.png';
import quadCast2Url from '@/assets/device-renders/quadcast-2.jpg';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import { cn } from '@/lib/cn';

type Colorway = 'black' | 'white' | 'unknown';
type LightingMask = 'saturated' | 'red';

interface DeviceArtwork {
  src: string;
  colorway: Colorway;
  removeLightBackground?: boolean;
  lightingMask?: LightingMask;
}

export function DeviceRender({
  device,
  density,
  className,
}: {
  device: Device;
  density: 'gallery' | 'hero';
  className?: string;
}) {
  const artwork = resolveDeviceArtwork(device);
  const lightingEnabled = device.capabilities.includes('lighting') && asBoolean(device.settings.lightingEnabled, false);
  const lightingColor = asColor(device.settings.lightingColor, device.kind === 'microphone' ? '#e51937' : '#ff658a');
  const label = `${device.vendor} ${device.name}`;

  return (
    <div
      className={cn('device-render', `device-render--${density}`, className)}
      data-image-key={device.imageKey}
      data-colorway={artwork?.colorway ?? 'unknown'}
      data-appearance-source={device.appearance?.source ?? 'unknown'}
      data-lighting-enabled={lightingEnabled}
      data-lighting-color={lightingColor}
    >
      {artwork ? (
        <ProductCanvas
          artwork={artwork}
          label={label}
          lighting={{ enabled: lightingEnabled, color: lightingColor }}
          fallback={<FallbackRender device={device} label={label} />}
        />
      ) : (
        <FallbackRender device={device} label={label} />
      )}
    </div>
  );
}

function FallbackRender({ device, label }: { device: Device; label: string }) {
  return (
    <div role="img" aria-label={label} className="device-render__fallback">
      <DeviceGlyph kind={device.kind} active={device.connected} large bare />
    </div>
  );
}

function ProductCanvas({
  artwork,
  label,
  lighting,
  fallback,
}: {
  artwork: DeviceArtwork;
  label: string;
  lighting: { enabled: boolean; color: string };
  fallback: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.decoding = 'async';
    setStatus('loading');

    image.onload = () => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        setStatus('failed');
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        if (artwork.removeLightBackground) {
          removeConnectedLightBackground(pixels.data, canvas.width, canvas.height);
          removeEnclosedLightMatte(pixels.data, canvas.width, canvas.height);
        }
        if (artwork.lightingMask) {
          applyLighting(pixels.data, artwork.lightingMask, lighting.enabled, lighting.color);
        }
        context.putImageData(pixels, 0, 0);
        setStatus('ready');
      } catch {
        setStatus('failed');
      }
    };
    image.onerror = () => active && setStatus('failed');
    image.src = artwork.src;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [artwork.lightingMask, artwork.removeLightBackground, artwork.src, lighting.color, lighting.enabled]);

  if (status === 'failed') return fallback;
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      aria-busy={status === 'loading'}
      data-render-state={status}
    />
  );
}

function resolveDeviceArtwork(device: Device): DeviceArtwork | null {
  if (device.imageKey === 'mouse-g502x') {
    const reported = device.appearance?.colorway;
    const inferredWhite = /\bwhite\b/i.test(`${device.name} ${device.imageKey}`);
    const colorway = reported === 'white' || (reported !== 'black' && inferredWhite) ? 'white' : 'black';
    return {
      src: colorway === 'white' ? g502XPlusWhiteUrl : g502XPlusBlackUrl,
      colorway,
      lightingMask: 'saturated',
    };
  }

  if (device.imageKey === 'mic-quadcast2') {
    return {
      src: quadCast2Url,
      colorway: device.appearance?.colorway ?? 'black',
      removeLightBackground: true,
      lightingMask: 'red',
    };
  }

  return null;
}

function removeConnectedLightBackground(data: Uint8ClampedArray, width: number, height: number): void {
  const pixelCount = width * height;
  if (pixelCount === 0) return;

  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;

  const enqueue = (pixelIndex: number) => {
    if (exterior[pixelIndex] || distanceFromWhite(data, pixelIndex) > 30) return;
    exterior[pixelIndex] = 1;
    queue[writeIndex] = pixelIndex;
    writeIndex += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex];
    readIndex += 1;
    if (pixelIndex === undefined) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    if (exterior[pixelIndex]) {
      data[offset + 3] = 0;
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const touchesExterior =
      (x > 0 && exterior[pixelIndex - 1]) ||
      (x + 1 < width && exterior[pixelIndex + 1]) ||
      (y > 0 && exterior[pixelIndex - width]) ||
      (y + 1 < height && exterior[pixelIndex + width]);
    if (!touchesExterior) continue;

    const distance = distanceFromWhite(data, pixelIndex);
    if (distance >= 96) continue;
    const alpha = clamp((distance - 12) / 84, 0, 1);
    if (alpha <= 0.02) {
      data[offset + 3] = 0;
      continue;
    }

    decontaminateLightEdge(data, offset, alpha);
  }
}

function removeEnclosedLightMatte(data: Uint8ClampedArray, width: number, height: number): void {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const matte = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);

  const isLightMatte = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    return (
      (data[offset + 3] ?? 0) > 0 &&
      (data[offset] ?? 0) > 215 &&
      (data[offset + 1] ?? 0) > 215 &&
      (data[offset + 2] ?? 0) > 215
    );
  };

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || !isLightMatte(start)) continue;
    let readIndex = 0;
    let writeIndex = 0;
    visited[start] = 1;
    queue[writeIndex] = start;
    writeIndex += 1;

    while (readIndex < writeIndex) {
      const pixelIndex = queue[readIndex];
      readIndex += 1;
      if (pixelIndex === undefined) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const neighbors = [
        x > 0 ? pixelIndex - 1 : -1,
        x + 1 < width ? pixelIndex + 1 : -1,
        y > 0 ? pixelIndex - width : -1,
        y + 1 < height ? pixelIndex + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || !isLightMatte(neighbor)) continue;
        visited[neighbor] = 1;
        queue[writeIndex] = neighbor;
        writeIndex += 1;
      }
    }

    if (writeIndex < 100) continue;
    for (let index = 0; index < writeIndex; index += 1) {
      const pixelIndex = queue[index];
      if (pixelIndex !== undefined) matte[pixelIndex] = 1;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const expanded = matte.slice();
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (matte[pixelIndex] || distanceFromWhite(data, pixelIndex) >= 105) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      if (
        (x > 0 && matte[pixelIndex - 1]) ||
        (x + 1 < width && matte[pixelIndex + 1]) ||
        (y > 0 && matte[pixelIndex - width]) ||
        (y + 1 < height && matte[pixelIndex + width])
      ) {
        expanded[pixelIndex] = 1;
      }
    }
    matte.set(expanded);
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (matte[pixelIndex]) data[pixelIndex * 4 + 3] = 0;
  }
}

function applyLighting(data: Uint8ClampedArray, mask: LightingMask, enabled: boolean, color: string): void {
  const target = parseHexColor(color);
  const targetMaximum = Math.max(target.red, target.green, target.blue, 1);

  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) <= 0) continue;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    const matches = mask === 'red'
      ? red > 70 && red - Math.max(green, blue) > 24
      : maximum > 60 && chroma > 22;
    if (!matches) continue;

    if (!enabled) {
      const neutral = Math.round((red * 0.2126 + green * 0.7152 + blue * 0.0722) * 0.24);
      data[offset] = neutral;
      data[offset + 1] = neutral;
      data[offset + 2] = neutral;
      continue;
    }

    const floor = minimum * 0.12;
    data[offset] = Math.round(floor + (target.red / targetMaximum) * (maximum - floor));
    data[offset + 1] = Math.round(floor + (target.green / targetMaximum) * (maximum - floor));
    data[offset + 2] = Math.round(floor + (target.blue / targetMaximum) * (maximum - floor));
  }
}

function distanceFromWhite(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  const red = 255 - (data[offset] ?? 255);
  const green = 255 - (data[offset + 1] ?? 255);
  const blue = 255 - (data[offset + 2] ?? 255);
  return Math.sqrt((red * red + green * green + blue * blue) / 3);
}

function decontaminateLightEdge(data: Uint8ClampedArray, offset: number, alpha: number): void {
  for (let channel = 0; channel < 3; channel += 1) {
    const observed = data[offset + channel] ?? 255;
    data[offset + channel] = clamp(Math.round((observed - 255 * (1 - alpha)) / alpha), 0, 255);
  }
  data[offset + 3] = Math.round(255 * alpha);
}

function parseHexColor(value: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
