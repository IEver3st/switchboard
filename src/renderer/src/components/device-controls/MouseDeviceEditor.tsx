import type { Device, MouseAction } from '../../../../shared/contracts';
import { DeviceRender } from '@/components/shared/device-render';
import { Separator } from '@/components/ui/separator';
import { useSystemStore } from '@/stores/use-system-store';
import { DeviceCallout } from './DeviceCallout';
import { DeviceHotspot } from './DeviceHotspot';
import { DpiControl } from './DpiControl';
import { LightingControl } from './LightingControl';
import { OnboardMemoryControl } from './OnboardMemoryControl';
import { ReportRateControl } from './ReportRateControl';

export function MouseDeviceEditor({ device }: { device: Device }) {
  return (
    <>
      <MouseStage device={device} />
      <MouseControls device={device} />
    </>
  );
}

function MouseStage({ device }: { device: Device }) {
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const capability = device.capabilities.buttonAssignments;
  const actions = capability?.availableActions ?? [];
  const leftBindings = capability?.bindings
    .filter((binding) => binding.hotspot.calloutSide === 'left')
    .sort(compareBindingOrder) ?? [];
  const rightBindings = capability?.bindings
    .filter((binding) => binding.hotspot.calloutSide === 'right')
    .sort(compareBindingOrder) ?? [];
  const renderCallout = (binding: NonNullable<typeof capability>['bindings'][number]) => {
    const assignedAction = actions.find((action) => action.id === binding.currentActionId) ?? customAction;
    const currentAction = binding.buttonId === 'dpi-shift'
      && assignedAction.id === 'mouse.dpi-shift'
      && device.capabilities.dpi?.shiftDpi !== undefined
      ? { ...assignedAction, label: `${device.capabilities.dpi.shiftDpi.toLocaleString()} DPI` }
      : assignedAction;
    return (
      <DeviceCallout
        key={binding.buttonId}
        binding={binding}
        currentAction={currentAction}
        availableActions={actions}
        disabled={!capability?.writable}
        unavailableReason={capability?.unavailableReason}
        onChange={(action) => void setDeviceControl({
          deviceId: device.id,
          change: { type: 'button-assignment', buttonId: binding.buttonId, actionId: action.id },
        })}
      />
    );
  };

  return (
    <section
      className="mouse-stage"
      data-callouts-disabled={!capability?.writable || undefined}
      aria-label={`${device.displayName} button assignments`}
    >
      <div className="mouse-stage__callouts mouse-stage__callouts--left">
        {leftBindings.map(renderCallout)}
      </div>
      <div className="mouse-stage__device">
        <DeviceRender device={device} density="hero" className="mouse-stage__render" />
        {capability?.bindings.map((binding) => <DeviceHotspot key={binding.buttonId} hotspot={binding.hotspot} />)}
      </div>
      <div className="mouse-stage__callouts mouse-stage__callouts--right">
        {rightBindings.map(renderCallout)}
      </div>
    </section>
  );
}

function MouseControls({ device }: { device: Device }) {
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const { dpi, reportRate, lighting, onboardMemory } = device.capabilities;

  if (!dpi && !reportRate && !lighting && !onboardMemory) {
    return (
      <section className="device-controls mouse-config mouse-config--unavailable">
        <p>Configuration is unavailable while the Logitech device service is not responding.</p>
      </section>
    );
  }

  return (
    <section className="device-controls mouse-config" aria-label="Mouse configuration">
      <div className="mouse-config__section-heading">
        <span>Sensitivity</span>
        <p>{dpi?.profileMode === 'onboard' ? 'Using settings stored on the mouse.' : 'Changes apply to the current profile.'}</p>
      </div>
      <div className="mouse-config__sensitivity">
        {dpi ? (
          <DpiControl
            capability={dpi}
            onChange={(value) => void setDeviceControl({ deviceId: device.id, change: { type: 'dpi', value } })}
            onStagesChange={(stages) => void setDeviceControl({ deviceId: device.id, change: { type: 'dpi-stages', stages } })}
            onShiftChange={(value) => void setDeviceControl({ deviceId: device.id, change: { type: 'dpi-shift', value } })}
          />
        ) : null}
        {reportRate ? (
          <ReportRateControl
            capability={reportRate}
            onChange={(value) => void setDeviceControl({ deviceId: device.id, change: { type: 'report-rate', value } })}
          />
        ) : null}
      </div>

      {(onboardMemory || lighting) ? <Separator className="mouse-config__separator" /> : null}

      <div className="mouse-config__secondary">
        {onboardMemory ? (
          <div className="mouse-config__device-group">
            <div className="mouse-config__section-heading">
              <span>Device</span>
            </div>
            <OnboardMemoryControl
              capability={onboardMemory}
              onChange={(enabled) => void setDeviceControl({
                deviceId: device.id,
                change: { type: 'onboard-memory', enabled },
              })}
            />
          </div>
        ) : null}
        {lighting ? (
          <div className="mouse-config__lighting-group">
            <div className="mouse-config__section-heading">
              <span>Lighting</span>
            </div>
            <LightingControl
              capability={lighting}
              onEnabledChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-enabled', enabled } })}
              onColorChange={(color) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-color', color } })}
              onBrightnessChange={(brightness) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-brightness', brightness } })}
              onEffectChange={(effectId) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-effect', effectId } })}
              onSpeedChange={(speed) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-speed', speed } })}
              onDirectionChange={(direction) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-direction', direction } })}
              onZoneColorChange={(zoneId, color) => void setDeviceControl({
                deviceId: device.id,
                change: { type: 'lighting-zone-color', zoneId, color },
              })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function compareBindingOrder(
  left: NonNullable<Device['capabilities']['buttonAssignments']>['bindings'][number],
  right: NonNullable<Device['capabilities']['buttonAssignments']>['bindings'][number],
): number {
  return left.hotspot.order - right.hotspot.order;
}

const customAction: MouseAction = {
  id: 'system.custom',
  label: 'Custom G HUB assignment',
  category: 'system',
  searchTerms: [],
  selectable: false,
};
