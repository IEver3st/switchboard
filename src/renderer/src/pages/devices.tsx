import { ArrowLeft, ArrowRight, Blocks, Usb } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import type { Device, SystemSnapshot } from '../../../shared/contracts';
import { devicesFromEnabledModules } from '../../../shared/device-module-state';
import { BatteryStatus } from '@/components/device-controls/BatteryStatus';
import { DeviceRender } from '@/components/shared/device-render';
import { StatusDot } from '@/components/shared/surface';
import { Badge } from '@/components/ui/badge';
import { useSystemStore } from '@/stores/use-system-store';

const MicrophoneDeviceEditor = lazy(() => import('@/components/device-controls/MicrophoneDeviceEditor').then((module) => ({ default: module.MicrophoneDeviceEditor })));
const KeyboardDeviceEditor = lazy(() => import('@/components/device-controls/KeyboardDeviceEditor').then((module) => ({ default: module.KeyboardDeviceEditor })));
const MouseDeviceEditor = lazy(() => import('@/components/device-controls/MouseDeviceEditor').then((module) => ({ default: module.MouseDeviceEditor })));

export function DevicesPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const selectedDeviceId = useSystemStore((state) => state.selectedDeviceId);
  const selectDevice = useSystemStore((state) => state.selectDevice);
  const clearDeviceSelection = useSystemStore((state) => state.clearDeviceSelection);
  const devices = devicesFromEnabledModules(snapshot.devices, snapshot.modules);
  const selected = devices.find((device) => device.id === selectedDeviceId);
  const selectedModule = selected ? snapshot.modules.find((module) => module.id === selected.moduleId) : undefined;
  const selectedFromLocalAddon = selectedModule?.source === 'local';
  const localModuleIds = new Set(snapshot.modules.filter((module) => module.source === 'local').map((module) => module.id));
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const deviceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusDeviceId = useRef<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selected) {
        backButtonRef.current?.focus();
        return;
      }
      const deviceId = returnFocusDeviceId.current;
      if (!deviceId) return;
      deviceButtonRefs.current.get(deviceId)?.focus();
      returnFocusDeviceId.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id]);

  if (devices.length === 0) {
    const devicesHiddenByModules = snapshot.devices.length > 0;
    return (
      <div className="device-gallery-page" data-state="empty">
        <DeviceGalleryHeader connectedCount={0} />
        <div className="device-gallery-empty">
          <div className="text-center">
            <Usb className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {devicesHiddenByModules ? 'No devices from enabled modules' : 'No supported devices detected'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {devicesHiddenByModules
                ? 'Enable the device module in Settings to show its devices here.'
                : 'Install a device module and connect hardware to see it here.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!selected) {
    const connectedCount = devices.filter((device) => device.connected).length;
    return (
      <div className="device-gallery-page">
        <DeviceGalleryHeader connectedCount={connectedCount} />
        <div className="device-gallery-stage">
          <ul className="device-gallery" aria-label="Switchboard devices" data-device-count={devices.length}>
            {devices.map((device) => {
              const localAddon = localModuleIds.has(device.moduleId);
              return <li key={device.id} className="device-gallery__entry" data-connected={device.connected} data-kind={device.kind}>
                <button
                  ref={(node) => {
                    if (node) deviceButtonRefs.current.set(device.id, node);
                    else deviceButtonRefs.current.delete(device.id);
                  }}
                  type="button"
                  onClick={() => {
                    returnFocusDeviceId.current = device.id;
                    selectDevice(device.id);
                  }}
                  className="device-gallery__item"
                  aria-label={`Open controls for ${device.identity.manufacturer ?? ''} ${device.displayName}`.trim()}
                >
                  <DeviceRender device={device} density="gallery" />
                  <span className="device-gallery__copy">
                    <span className="device-gallery__manufacturer">{device.identity.manufacturer}</span>
                    <span className="device-gallery__title-row">
                      <span className="device-gallery__name">{device.displayName}</span>
                      {device.connected && (device.capabilities.battery?.percentage ?? 100) <= 15 ? (
                        <Badge variant="warning">Low battery</Badge>
                      ) : null}
                    </span>
                    <span className="device-gallery__status">
                      <StatusDot active={device.connected} />
                      <span>{device.connected ? 'Connected' : 'Disconnected'}</span>
                      {device.connected ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{connectionLabel(device)}</span>
                        </>
                      ) : null}
                    </span>
                    {localAddon ? <span className="device-gallery__addon-state">Local add-on · identity only</span> : null}
                    <span className="device-gallery__telemetry">
                      {device.capabilities.battery ? (
                        <BatteryStatus
                          battery={device.capabilities.battery}
                          connectionLabel={device.identity.connection === 'wireless' ? 'Wireless' : connectionLabel(device)}
                          connected={device.connected}
                        />
                      ) : null}
                    </span>
                    <span className="device-gallery__configure" aria-hidden>
                      Configure <ArrowRight />
                    </span>
                  </span>
                </button>
              </li>;
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="device-workbench" data-device-kind={selected.kind}>
      <div className="device-workbench__toolbar">
        <button
          ref={backButtonRef}
          type="button"
          className="device-workbench__back"
          onClick={() => {
            returnFocusDeviceId.current = selected.id;
            clearDeviceSelection();
          }}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All devices
        </button>
        <div className="device-workbench__identity">
          <h2>{selected.displayName}</h2>
          <div className="device-workbench__meta">
            <StatusDot active={selected.connected} />
            <span>{selected.connected ? 'Connected' : 'Disconnected'}</span>
            <span aria-hidden>·</span>
            <span>{connectionLabel(selected)}</span>
            {selectedFromLocalAddon ? (
              <>
                <span aria-hidden>·</span>
                <span>Local add-on · identity only</span>
              </>
            ) : null}
          </div>
        </div>
        {selected.capabilities.battery ? (
          <BatteryStatus
            battery={selected.capabilities.battery}
            connected={selected.connected}
            variant="header"
            className="device-workbench__battery"
          />
        ) : null}
      </div>

      <Suspense fallback={<div className="grid min-h-60 place-items-center text-xs text-muted-foreground" role="status">Loading device controls…</div>}>
        {selectedFromLocalAddon ? (
          <LocalAddonDeviceSurface device={selected} moduleName={selectedModule?.name ?? selected.moduleId} />
        ) : selected.kind === 'mouse' ? (
          <MouseDeviceEditor device={selected} />
        ) : selected.kind === 'keyboard' ? (
          <KeyboardDeviceEditor device={selected} />
        ) : selected.kind === 'microphone' ? (
          <MicrophoneDeviceEditor device={selected} snapshot={snapshot} />
        ) : (
          <>
            <div className="device-workbench__hero">
              <DeviceRender device={selected} density="hero" />
            </div>
            <div className="device-workbench__controls">
              <p className="py-8 text-center text-xs text-muted-foreground">This device does not expose a control surface yet.</p>
            </div>
          </>
        )}
      </Suspense>
    </div>
  );
}

function LocalAddonDeviceSurface({ device, moduleName }: { device: Device; moduleName: string }) {
  const setPage = useSystemStore((state) => state.setPage);
  return (
    <div className="local-addon-device">
      <div className="device-workbench__hero">
        <DeviceRender device={device} density="hero" />
      </div>
      <section className="local-addon-device__boundary" aria-labelledby="local-addon-device-title">
        <Blocks aria-hidden />
        <div>
          <h3 id="local-addon-device-title">Identity supplied by {moduleName}</h3>
          <p>This sandboxed add-on matched the connected hardware. Module Host API v1 cannot publish writable controls or claim device-confirmed telemetry.</p>
          <dl>
            <div><dt>VID : PID</dt><dd>{formatUsbId(device.identity.vendorId)} : {formatUsbId(device.identity.productId)}</dd></div>
            <div><dt>Connection</dt><dd>{connectionLabel(device)}</dd></div>
            <div><dt>Capability state</dt><dd>Read-only identity</dd></div>
          </dl>
          <button type="button" className="local-addon-device__settings" onClick={() => setPage('modules')}>Open module project</button>
        </div>
      </section>
    </div>
  );
}

function DeviceGalleryHeader({ connectedCount }: { connectedCount: number }) {
  return (
    <header className="device-gallery-header">
      <div>
        <h2>Devices</h2>
        <p>Your connected hardware</p>
      </div>
      <span className="device-gallery-header__status" aria-live="polite">
        <StatusDot active={connectedCount > 0} />
        {connectedCount} connected
      </span>
    </header>
  );
}

function connectionLabel(device: Device): string {
  return device.identity.connectionLabel
    ?? (device.identity.connection === 'wireless' ? 'Wireless' : device.identity.connection?.toUpperCase())
    ?? 'Unknown connection';
}

function formatUsbId(value: number | undefined): string {
  return typeof value === 'number' ? value.toString(16).padStart(4, '0').toLocaleUpperCase() : '----';
}
