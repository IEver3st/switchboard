import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Device } from '../../../../shared/contracts';
import g502XPlusBlackUrl from '@/assets/device-renders/g502-x-plus.png';
import g502XPlusWhiteUrl from '@/assets/device-renders/g502-x-plus-white.png';
import quadCast2Url from '@/assets/device-renders/quadcast-2.png';
import huntsmanV2AnalogUrl from '@/assets/device-renders/huntsman-v2-analog.png';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import {
  adaptBlackHardwareForDarkSurface,
  applyLighting,
  type LightingMask,
} from '@/components/shared/device-lighting';
import { cn } from '@/lib/cn';

type ToneProfile = 'black-hardware-on-dark';

interface DeviceArtwork {
  src: string;
  lightingMask?: LightingMask;
  toneProfile?: ToneProfile;
}

interface ProcessedArtwork {
  pixels: ImageData;
  width: number;
  height: number;
}

const processedArtworkCache = new Map<string, ProcessedArtwork>();
const maximumCachedArtwork = 6;
const artworkByAssetKey: Record<string, DeviceArtwork> = {
  'logitech-g502-x-plus-black': { src: g502XPlusBlackUrl, lightingMask: 'g502-rgb' },
  'logitech-g502-x-plus-white': { src: g502XPlusWhiteUrl, lightingMask: 'g502-rgb' },
  'hyperx-quadcast-2': {
    src: quadCast2Url,
    lightingMask: 'red-dominant',
    toneProfile: 'black-hardware-on-dark',
  },
  'razer-huntsman-v2-analog': { src: huntsmanV2AnalogUrl },
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
  const lightingBrightness = lighting?.brightness ?? 100;
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
      data-lighting-brightness={lightingBrightness}
    >
      {artwork ? (
        <ProductCanvas
          artwork={artwork}
          label={label}
          lighting={{ enabled: lightingEnabled, color: lightingColor, brightness: lightingBrightness }}
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
  lighting: { enabled: boolean; color: string; brightness: number };
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let active = true;
    const cacheKey = [
      artwork.src,
      artwork.lightingMask ?? 'no-lighting',
      artwork.toneProfile ?? 'source-tone',
      artwork.lightingMask ? (lighting.enabled ? 'on' : 'off') : 'static',
      artwork.lightingMask ? lighting.color : 'source-color',
      artwork.lightingMask ? lighting.brightness : 'source-brightness',
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
          applyLighting(pixels.data, artwork.lightingMask, lighting.enabled, lighting.color, lighting.brightness);
        }
        if (artwork.toneProfile === 'black-hardware-on-dark') {
          adaptBlackHardwareForDarkSurface(pixels.data);
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
  }, [artwork.lightingMask, artwork.src, artwork.toneProfile, lighting.brightness, lighting.color, lighting.enabled]);

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

function asColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
