import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import type { Device } from '../../../../shared/contracts';
import { BatteryStatus } from '@/components/device-controls/BatteryStatus';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import { DeviceRender } from '@/components/shared/device-render';
import { StatusDot } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { useSystemStore } from '@/stores/use-system-store';
import './device-carousel.css';

// Survives route changes so returning to Devices keeps the same device in front.
let rememberedActiveDeviceId: string | null = null;

const neutralStageTone = '#7f8aa0';
// Selection changes only move existing artwork. Device telemetry still updates
// the render, but carousel and lighting state must not reconcile its canvas.
const CarouselDeviceRender = memo(DeviceRender);

export function DeviceCarousel({
  devices,
  localModuleIds,
  returnDeviceId,
  onOpen,
  registerButton,
}: {
  devices: Device[];
  localModuleIds: ReadonlySet<string>;
  returnDeviceId: string | null;
  onOpen: (device: Device) => void;
  registerButton: (deviceId: string, node: HTMLButtonElement | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [activeId, setActiveId] = useState<string | null>(() => returnDeviceId ?? rememberedActiveDeviceId);
  const activeIndex = Math.max(0, devices.findIndex((device) => device.id === activeId));
  const active = devices[activeIndex]!;
  const connectedCount = devices.filter((device) => device.connected).length;
  const multiple = devices.length > 1;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      setStageSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const activate = (index: number, focus = false) => {
    const next = devices[Math.min(devices.length - 1, Math.max(0, index))];
    if (!next) return;
    rememberedActiveDeviceId = next.id;
    setActiveId(next.id);
    if (focus) requestAnimationFrame(() => document.getElementById(slideId(next.id))?.focus());
  };

  const onStageKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!multiple) return;
    if (event.key === 'ArrowRight') activate(activeIndex + 1, true);
    else if (event.key === 'ArrowLeft') activate(activeIndex - 1, true);
    else if (event.key === 'Home') activate(0, true);
    else if (event.key === 'End') activate(devices.length - 1, true);
    else return;
    event.preventDefault();
  };

  const layout = slideLayout(devices, activeIndex, stageSize);
  const lighting = useStageLighting(stageToneFor(active));

  return (
    <div className="device-carousel-page">
      <DeviceStageBackdrop lighting={lighting} />

      <header className="device-carousel-header">
        <div>
          <h2>Devices</h2>
          <p>{devices.length} {devices.length === 1 ? 'device' : 'devices'}</p>
        </div>
        <span className="device-carousel-header__status" aria-live="polite">
          <StatusDot active={connectedCount > 0} />
          {connectedCount} connected
        </span>
      </header>

      <section
        className="device-carousel"
        aria-roledescription="carousel"
        aria-label="Switchboard devices"
        onKeyDown={onStageKeyDown}
      >
        <div ref={stageRef} className="device-carousel__stage">
          {lighting.map((layer) => (
            <span key={layer.key} className="device-carousel__lighting" data-layer={layer.state} style={{ '--stage-tone': layer.tone } as CSSProperties} aria-hidden>
              <span className="device-carousel__floor" />
              <span className="device-carousel__pedestal" />
            </span>
          ))}
          <ul className="device-gallery" data-device-count={devices.length}>
            {devices.map((device, index) => {
              const position = layout[index]!;
              const isActive = index === activeIndex;
              const label = [device.identity.manufacturer, device.displayName].filter(Boolean).join(' ');
              return (
                <li
                  key={device.id}
                  className="device-gallery__entry"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${devices.length}`}
                  data-active={isActive || undefined}
                  data-connected={device.connected}
                  data-kind={device.kind}
                  data-distance={Math.min(3, Math.abs(index - activeIndex))}
                  style={{
                    '--slide-width': `${position.width}px`,
                    '--slide-x': `${position.x}px`,
                    '--slide-scale': position.scale,
                  } as CSSProperties}
                >
                  <button
                    ref={(node) => registerButton(device.id, node)}
                    id={slideId(device.id)}
                    type="button"
                    className="device-gallery__item"
                    tabIndex={isActive ? 0 : -1}
                    aria-hidden={position.hidden || undefined}
                    aria-label={`Open controls for ${label}`}
                    onClick={() => {
                      rememberedActiveDeviceId = device.id;
                      onOpen(device);
                    }}
                  >
                    <CarouselDeviceRender device={device} density="hero" />
                  </button>
                </li>
              );
            })}
          </ul>

          {multiple ? (
            <>
              <button
                type="button"
                className="device-carousel__arrow device-carousel__arrow--previous"
                aria-label="Previous device"
                disabled={activeIndex === 0}
                onClick={() => activate(activeIndex - 1)}
              >
                <ChevronLeft aria-hidden />
              </button>
              <button
                type="button"
                className="device-carousel__arrow device-carousel__arrow--next"
                aria-label="Next device"
                disabled={activeIndex === devices.length - 1}
                onClick={() => activate(activeIndex + 1)}
              >
                <ChevronRight aria-hidden />
              </button>
            </>
          ) : null}
        </div>

        <p className="sr-only" aria-live="polite">{`${active.displayName}, ${activeIndex + 1} of ${devices.length}`}</p>
        <DeviceDetails
          key={active.id}
          device={active}
          localAddon={localModuleIds.has(active.moduleId)}
          onOpen={() => {
            rememberedActiveDeviceId = active.id;
            onOpen(active);
          }}
        />

        {multiple ? (
          <nav className="device-carousel__index" aria-label="Choose a device">
            {devices.map((device, index) => (
              <button
                key={device.id}
                type="button"
                className={cn('device-carousel__index-item', index === activeIndex && 'is-active')}
                aria-current={index === activeIndex ? 'true' : undefined}
                aria-label={`Show ${device.displayName}`}
                data-connected={device.connected}
                onClick={() => activate(index)}
              >
                <DeviceGlyph kind={device.kind} active={device.connected} bare />
                <span>{device.displayName}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function DeviceDetails({ device, localAddon, onOpen }: { device: Device; localAddon: boolean; onOpen: () => void }) {
  const battery = device.capabilities.battery;
  const lowBattery = device.connected && battery !== undefined && battery.percentage <= 15;
  return (
    <div className="device-carousel__details">
      <span className="device-carousel__manufacturer">{device.identity.manufacturer ?? 'Unknown manufacturer'}</span>
      <h3 className="device-carousel__name">{device.displayName}</h3>
      <div className="device-carousel__status">
        <span className="device-carousel__status-item">
          <StatusDot active={device.connected} warning={lowBattery} />
          {device.connected ? 'Connected' : 'Disconnected'}
        </span>
        {device.connected ? <span className="device-carousel__status-item"><span aria-hidden>·</span>{connectionLabel(device)}</span> : null}
        {battery ? (
          <><span className="device-carousel__status-separator" aria-hidden>·</span><BatteryStatus
            battery={battery}
            connected={device.connected}
            className="device-carousel__battery"
          /></>
        ) : null}
      </div>
      {lowBattery ? <p className="device-carousel__note" data-tone="warning">Battery is low. Charge soon to avoid a disconnect.</p> : null}
      {localAddon ? <p className="device-carousel__note" data-tone="warning">Local add-on · identity only</p> : null}
      {!device.connected ? <p className="device-carousel__note">Reconnect this device to change its settings.</p> : null}
      <button type="button" className="device-carousel__configure" onClick={onOpen} aria-label={`Configure ${device.displayName}`}>
        Configure
        <ArrowRight aria-hidden />
      </button>
    </div>
  );
}

interface SlidePosition {
  x: number;
  width: number;
  scale: number;
  hidden: boolean;
}

// Keyboards are wide objects; every other device is framed as a portrait.
function baseSlideWidth(device: Device, stage: { width: number; height: number }): number {
  const height = Math.min(maximumSlideHeight, Math.max(220, stage.height));
  return device.kind === 'keyboard'
    ? Math.min(height * 1.6, stage.width * 0.52, 880)
    : Math.min(height * 0.74, stage.width * 0.34);
}

const sideScales = [1, 0.56, 0.4, 0.3];
// Matches the slide max-height in device-carousel.css.
const maximumSlideHeight = 580;

function slideLayout(devices: Device[], activeIndex: number, stage: { width: number; height: number }): SlidePosition[] {
  const gap = Math.max(20, stage.width * 0.035);
  const positions: SlidePosition[] = devices.map((device, index) => {
    const distance = Math.abs(index - activeIndex);
    const scale = sideScales[Math.min(distance, sideScales.length - 1)]!;
    return { x: 0, width: baseSlideWidth(device, stage), scale, hidden: distance > 2 };
  });
  for (const direction of [1, -1] as const) {
    let edge = positions[activeIndex]!.width / 2;
    for (let index = activeIndex + direction; index >= 0 && index < devices.length; index += direction) {
      const position = positions[index]!;
      // Portrait renders carry built-in transparent margin, so they may sit a
      // little closer than wide keyboards without appearing to touch.
      const visualWidth = position.width * position.scale * (devices[index]!.kind === 'keyboard' ? 1 : 0.78);
      position.x = direction * (edge + gap + visualWidth / 2);
      edge += gap + visualWidth;
    }
  }
  return positions;
}

interface StageLightLayer {
  key: number;
  tone: string;
  state: 'static' | 'in' | 'out';
}

const stageLightFadeMs = 520;
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const prefersReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

// Large translucent lighting surfaces dominate CPU compositing. Keep the same
// lighting but update it once in software/reduced-motion mode; slides still move.
// Hardware mode crossfades opacity and releases the extra surface when finished.
export function useStageLighting(tone: string): StageLightLayer[] {
  const softwareRendering = useSystemStore((state) => state.snapshot?.settings.softwareRendering ?? false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const animate = !softwareRendering && !reducedMotion;
  const [layers, setLayers] = useState<StageLightLayer[]>(() => [{ key: 0, tone, state: 'static' }]);
  useEffect(() => {
    if (!animate) return;
    setLayers((current) => {
      const top = current[current.length - 1]!;
      if (top.tone === tone) return current;
      return [{ ...top, state: 'out' }, { key: top.key + 1, tone, state: 'in' }];
    });
  }, [tone, animate]);
  useEffect(() => {
    if (!animate || layers.length < 2) return;
    const timer = window.setTimeout(() => setLayers((current) => [{ ...current[current.length - 1]!, state: 'static' }]), stageLightFadeMs + 40);
    return () => window.clearTimeout(timer);
  }, [layers, animate]);
  return animate ? layers : [{ key: 0, tone, state: 'static' }];
}

export function DeviceStageBackdrop({ lighting }: { lighting: StageLightLayer[] }) {
  return (
    <div className="device-stage-backdrop" aria-hidden>
      {lighting.map((layer) => (
        <span key={layer.key} className="device-stage-backdrop__light" data-layer={layer.state} style={{ '--stage-tone': layer.tone } as CSSProperties} />
      ))}
      <span className="device-stage-backdrop__grid" />
    </div>
  );
}

export function stageToneFor(device: Device): string {
  const lighting = device.capabilities.lighting;
  if (!device.connected || !lighting?.enabled || !lighting.color) return neutralStageTone;
  if (lighting.muteLinked && device.capabilities.muteState?.muted === true) return neutralStageTone;
  return lighting.color;
}

function slideId(deviceId: string): string {
  return `device-slide-${deviceId.replace(/[^a-z0-9_-]/gi, '-')}`;
}

export function connectionLabel(device: Device): string {
  return device.identity.connectionLabel
    ?? (device.identity.connection === 'wireless' ? 'Wireless' : device.identity.connection?.toUpperCase())
    ?? 'Unknown connection';
}
