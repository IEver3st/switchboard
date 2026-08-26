import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Device } from '../../../../shared/contracts';
import g502XPlusBlackUrl from '@/assets/device-renders/g502-x-plus.png';
import g502XPlusWhiteUrl from '@/assets/device-renders/g502-x-plus-white.png';
import quadCast2Url from '@/assets/device-renders/quadcast-2.png';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import { cn } from '@/lib/cn';

type LightingMask = 'red';

interface DeviceArtwork {
  src: string;
  lightingMask?: LightingMask;
}

interface ProcessedArtwork {
  pixels: ImageData;
  width: number;
  height: number;
}

const processedArtworkCache = new Map<string, ProcessedArtwork>();
const maximumCachedArtwork = 6;
const artworkByAssetKey: Record<string, DeviceArtwork> = {
  'logitech-g502-x-plus-black': { src: g502XPlusBlackUrl },
  'logitech-g502-x-plus-white': { src: g502XPlusWhiteUrl },
  'hyperx-quadcast-2': { src: quadCast2Url, lightingMask: 'red' },
};

export function DeviceRender({
  device,
  density,
  className,
}: {
  device: Device;
  density: 'gallery' | 'hero';
  className?: string;
}) {
  const artwork = artworkByAssetKey[device.asset.key];
  const lighting = device.capabilities.lighting;
  const lightingEnabled = Boolean(
    lighting?.enabled
    && !(lighting.muteLinked && device.capabilities.muteState?.muted === true),
  );
  const lightingColor = asColor(lighting?.color, device.kind === 'microphone' ? '#e51937' : '#ff658a');
  const label = [device.identity.manufacturer, device.displayName].filter(Boolean).join(' ');

  return (
    <div
      className={cn('device-render', `device-render--${density}`, className)}
      data-asset-key={device.asset.key}
      data-asset-match={device.asset.matchedBy}
      data-colorway={device.identity.colorway ?? 'unknown'}
      data-variant-source={device.variantResolution.source}
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
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let active = true;
    const cacheKey = [
      artwork.src,
      artwork.lightingMask ?? 'no-lighting',
      artwork.lightingMask ? (lighting.enabled ? 'on' : 'off') : 'static',
      artwork.lightingMask ? lighting.color : 'source-color',
    ].join('|');
    const cached = processedArtworkCache.get(cacheKey);
    if (cached && canvasRef.current && paintProcessedArtwork(canvasRef.current, cached)) {
      setStatus('ready');
      return () => {
        active = false;
      };
    }

    const image = new Image();
    image.decoding = 'async';
    setStatus('loading');

    image.onload = () => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ready = processedArtworkCache.get(cacheKey);
      if (ready && paintProcessedArtwork(canvas, ready)) {
        setStatus('ready');
        return;
      }
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        setStatus('failed');
        return;
      }

      // The gallery displays at at most ~330 CSS px. Processing a 520 px working
      // copy preserves native-window sharpness without blocking the renderer on
      // multi-megapixel background/lighting masks during startup.
      const processingScale = Math.min(1, 520 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * processingScale);
      canvas.height = Math.round(image.naturalHeight * processingScale);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        if (artwork.lightingMask) {
          applyLighting(pixels.data, lighting.enabled, lighting.color);
        }

        const bounds = findVisibleBounds(pixels.data, canvas.width, canvas.height);
        canvas.width = bounds.width;
        canvas.height = bounds.height;
        const output = canvas.getContext('2d');
        if (!output) {
          setStatus('failed');
          return;
        }
        output.imageSmoothingEnabled = true;
        output.imageSmoothingQuality = 'high';
        output.putImageData(pixels, -bounds.left, -bounds.top);
        rememberProcessedArtwork(cacheKey, {
          pixels: output.getImageData(0, 0, bounds.width, bounds.height),
          width: bounds.width,
          height: bounds.height,
        });
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
  }, [artwork.lightingMask, artwork.src, lighting.color, lighting.enabled]);

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

function paintProcessedArtwork(canvas: HTMLCanvasElement, artwork: ProcessedArtwork): boolean {
  canvas.width = artwork.width;
  canvas.height = artwork.height;
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.putImageData(artwork.pixels, 0, 0);
  return true;
}

function rememberProcessedArtwork(key: string, artwork: ProcessedArtwork): void {
  processedArtworkCache.delete(key);
  processedArtworkCache.set(key, artwork);
  if (processedArtworkCache.size <= maximumCachedArtwork) return;
  const oldest = processedArtworkCache.keys().next().value;
  if (typeof oldest === 'string') processedArtworkCache.delete(oldest);
}

function applyLighting(data: Uint8ClampedArray, enabled: boolean, color: string): void {
  const target = parseHexColor(color);
  const targetMaximum = Math.max(target.red, target.green, target.blue, 1);

  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset + 3] ?? 0) <= 0) continue;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const matches = red > 70 && red - Math.max(green, blue) > 24;
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

function findVisibleBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) <= 4) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return { left: 0, top: 0, width, height };
  const padding = 2;
  const paddedLeft = Math.max(0, left - padding);
  const paddedTop = Math.max(0, top - padding);
  const paddedRight = Math.min(width - 1, right + padding);
  const paddedBottom = Math.min(height - 1, bottom + padding);
  return {
    left: paddedLeft,
    top: paddedTop,
    width: paddedRight - paddedLeft + 1,
    height: paddedBottom - paddedTop + 1,
  };
}

function parseHexColor(value: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function asColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
