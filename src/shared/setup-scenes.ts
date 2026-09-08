import { sceneAudioSchema, sceneValuesSchema, type Device, type DeviceControlChange, type SceneValues, type SystemSnapshot } from './contracts';

export function snapshotSceneValues(snapshot: SystemSnapshot, scope = { includeAudio: true, includeCapture: true, includeDevices: true }): SceneValues {
  const { hotkey: _hotkey, clipsDirectory: _directory, ...capture } = snapshot.capture.config;
  return sceneValuesSchema.parse({
    audio: scope.includeAudio ? sceneAudioSchema.parse(snapshot.audio) : null,
    capture: scope.includeCapture ? capture : null,
    devices: scope.includeDevices ? snapshot.devices.filter(device => device.connected).map(snapshotSceneDevice)
      .filter(device => device.dpi !== undefined || device.reportRate !== undefined || device.lighting !== undefined) : [],
  });
}

export function snapshotSceneDevice(device: Device): SceneValues['devices'][number] {
  const { dpi, reportRate, lighting } = device.capabilities;
  return {
    deviceId: device.id, name: device.displayName,
    dpi: dpi?.writable ? dpi.defaultDpi : undefined,
    reportRate: reportRate?.writable ? reportRate.value : undefined,
    lighting: lighting?.writable && lighting.state !== 'unknown' ? {
      enabled: lighting.batteryLightingEnabled ?? lighting.enabled,
      effectId: lighting.activeEffectId,
      color: lighting.colorWritable ? lighting.color : undefined,
      brightness: lighting.brightnessWritable ? lighting.brightness : undefined,
      speed: lighting.speedWritable ? lighting.speed : undefined,
      zones: lighting.zones?.filter(zone => zone.colorWritable && zone.color).map(zone => ({ id: zone.id, color: zone.color! })) ?? [],
    } : undefined,
  };
}

export function sceneDeviceCommands(target: SceneValues['devices'][number], device: Device): DeviceControlChange[] {
  const current = snapshotSceneDevice(device);
  const commands: DeviceControlChange[] = [];
  if (target.dpi !== undefined && target.dpi !== current.dpi) commands.push({ type: 'dpi', value: target.dpi });
  if (target.reportRate !== undefined && target.reportRate !== current.reportRate) commands.push({ type: 'report-rate', value: target.reportRate });
  const light = target.lighting;
  if (light && JSON.stringify(light) !== JSON.stringify(current.lighting)) {
    // Apply effect parameters first; restore Off last, since color/effect writes can turn LEDs on.
    if (light.effectId) commands.push({ type: 'lighting-effect', effectId: light.effectId });
    if (light.color) commands.push({ type: 'lighting-color', color: light.color });
    if (light.brightness !== undefined) commands.push({ type: 'lighting-brightness', brightness: light.brightness });
    if (light.speed !== undefined) commands.push({ type: 'lighting-speed', speed: light.speed });
    for (const zone of light.zones) commands.push({ type: 'lighting-zone-color', zoneId: zone.id, color: zone.color });
    commands.push({ type: 'lighting-enabled', enabled: light.enabled });
  }
  return commands;
}

/** Automatic restoration leaves any subsystem the user changed during the scene alone. */
export function sceneRestoreValues(before: SceneValues, applied: SceneValues, current: SceneValues, preserveChanges: boolean): SceneValues {
  if (!preserveChanges) return structuredClone(before);
  const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  return {
    audio: equal(applied.audio, current.audio) ? before.audio : null,
    capture: equal(applied.capture, current.capture) ? before.capture : null,
    devices: before.devices.filter(device => equal(applied.devices.find(item => item.deviceId === device.deviceId),
      current.devices.find(item => item.deviceId === device.deviceId))),
  };
}
