import type {
  LightingCapability,
  LightingDirection,
  LightingEffect,
} from '../../../shared/contracts';

const rgbEffectsFeatureId = 0x8071;
const perKeyLightingV2FeatureId = 0x8081;
const allClusters = 0xff;
const infoGeneral = 0x00;
const persistUntilRelease = 0x01;
const softwareControlActive = [0x01, 0x03, 0x04] as const;
const softwareControlReleased = [0x01, 0x00, 0x00] as const;

export interface LogitechRgbTransport {
  request(
    deviceIndex: number,
    featureIndex: number,
    functionId: number,
    parameters?: readonly number[],
    timeoutMs?: number,
  ): Promise<Buffer>;
}

interface RgbEffectInfo {
  index: number;
  wireId: number;
  canonicalId: string;
  period: number;
}

interface RgbCluster {
  index: number;
  effectCount: number;
  effects: RgbEffectInfo[];
}

interface EffectDefinition {
  id: string;
  label: string;
  wireIds: readonly number[];
  controls: NonNullable<LightingEffect['controls']>;
}

const effectDefinitions: readonly EffectDefinition[] = [
  { id: 'off', label: 'Off', wireIds: [0x00], controls: [] },
  { id: 'static', label: 'Static', wireIds: [0x01], controls: ['color', 'zones', 'brightness'] },
  { id: 'pulse', label: 'Pulse', wireIds: [0x02], controls: ['color', 'brightness', 'speed'] },
  { id: 'cycle', label: 'Color cycle', wireIds: [0x15, 0x03], controls: ['brightness', 'speed'] },
  { id: 'wave', label: 'Color wave', wireIds: [0x16, 0x04], controls: ['brightness', 'speed', 'direction'] },
  { id: 'breathing', label: 'Breathing', wireIds: [0x0a], controls: ['color', 'brightness', 'speed'] },
  { id: 'ripple', label: 'Ripple', wireIds: [0x17, 0x0b], controls: ['color', 'speed'] },
  { id: 'signature', label: 'G signature', wireIds: [0x0f, 0x10], controls: ['brightness', 'speed'] },
  { id: 'decomposition', label: 'Decomposition', wireIds: [0x0e], controls: ['brightness', 'speed'] },
] as const;

const directions: readonly LightingDirection[] = [
  'cycle',
  'left',
  'right',
  'up',
  'down',
  'in',
  'out',
  'center-in',
  'center-out',
];

const directionBytes: Record<LightingDirection, number> = {
  cycle: 0,
  right: 1,
  down: 2,
  'center-out': 3,
  in: 4,
  out: 5,
  left: 6,
  up: 7,
  'center-in': 8,
};

export class LogitechRgbEffectsController {
  private color: string;
  private brightness: number;
  private speed: number;
  private direction: LightingDirection;
  private activeEffectId: string;
  private enabled: boolean;
  private acknowledged = false;
  private claimed = false;
  private perKeyPrepared = false;
  private readonly zoneColors = new Map<number, string>();

  private constructor(
    private readonly transport: LogitechRgbTransport,
    private readonly deviceIndex: number,
    private readonly featureIndex: number,
    private readonly perKeyFeatureIndex: number | null,
    private readonly clusters: RgbCluster[],
    private readonly availableEffects: LightingEffect[],
    zoneIds: number[],
    previous: LightingCapability | undefined,
  ) {
    this.color = previous?.color ?? '#89cff0';
    this.brightness = previous?.brightness ?? 100;
    this.speed = previous?.speed ?? 50;
    this.direction = previous?.direction ?? 'right';
    this.activeEffectId = this.availableEffects.some((effect) => effect.id === previous?.activeEffectId)
      ? previous!.activeEffectId
      : (this.availableEffects[0]?.id ?? 'static');
    this.enabled = previous?.enabled ?? true;
    for (const [index, zoneId] of zoneIds.entries()) {
      const previousZone = previous?.zones?.find((zone) => zone.id === zoneKey(zoneId));
      this.zoneColors.set(zoneId, previousZone?.color ?? this.color);
      if (index === 0 && previousZone) this.color = previousZone.color;
    }
  }

  public static async probe(
    transport: LogitechRgbTransport,
    deviceIndex: number,
    featureIndex: number | null,
    perKeyFeatureIndex: number | null,
    previous?: LightingCapability,
  ): Promise<LogitechRgbEffectsController | null> {
    if (featureIndex === null) return null;
    const general = await transport.request(deviceIndex, featureIndex, 0, [allClusters, allClusters, infoGeneral]);
    const clusterCount = general[6] ?? 0;
    if (clusterCount === 0 || clusterCount > 16) return null;

    const clusters: RgbCluster[] = [];
    for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
      const clusterResponse = await transport.request(deviceIndex, featureIndex, 0, [clusterIndex, allClusters, infoGeneral]);
      const effectCount = clusterResponse[8] ?? 0;
      if (effectCount === 0 || effectCount > 32) continue;
      const effects: RgbEffectInfo[] = [];
      for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
        const response = await transport.request(deviceIndex, featureIndex, 0, [clusterIndex, effectIndex, infoGeneral]);
        const wireId = ((response[6] ?? 0) << 8) | (response[7] ?? 0);
        const definition = effectDefinitions.find((candidate) => candidate.wireIds.some((candidateId) => candidateId === wireId));
        if (!definition) continue;
        effects.push({
          index: effectIndex,
          wireId,
          canonicalId: definition.id,
          period: ((response[10] ?? 0) << 8) | (response[11] ?? 0),
        });
      }
      if (effects.some((effect) => effect.canonicalId !== 'off')) {
        clusters.push({ index: clusterIndex, effectCount, effects });
      }
    }
    if (clusters.length === 0) return null;

    const availableEffects = effectDefinitions
      .filter((definition) => definition.id !== 'off')
      .filter((definition) => clusters.every((cluster) => cluster.effects.some((effect) => effect.canonicalId === definition.id)))
      .map(({ id, label, controls }) => ({ id, label, controls: [...controls] }));
    if (availableEffects.length === 0) return null;

    const zoneIds = perKeyFeatureIndex === null
      ? []
      : await readPerKeyZoneIds(transport, deviceIndex, perKeyFeatureIndex).catch(() => []);
    return new LogitechRgbEffectsController(
      transport,
      deviceIndex,
      featureIndex,
      perKeyFeatureIndex,
      clusters,
      availableEffects,
      zoneIds,
      previous,
    );
  }

  public buildCapability(writable: boolean): LightingCapability {
    const active = this.activeDefinition;
    const unavailableReason = writable
      ? undefined
      : 'Turn off onboard memory to use live LIGHTSYNC effects and zone colors.';
    const zonesWritable = writable && active?.id === 'static';
    return {
      writable,
      enabled: this.enabled,
      activeEffectId: this.activeEffectId,
      availableEffects: structuredClone(this.availableEffects),
      color: this.color,
      colorWritable: writable && Boolean(active?.controls.includes('color')),
      brightness: this.brightness,
      brightnessWritable: writable && Boolean(active?.controls.includes('brightness')),
      speed: this.speed,
      speedWritable: writable && Boolean(active?.controls.includes('speed')),
      direction: this.direction,
      availableDirections: [...directions],
      directionWritable: writable && Boolean(active?.controls.includes('direction')),
      zones: [...this.zoneColors].map(([zoneId, color], index) => ({
        id: zoneKey(zoneId),
        label: `Zone ${index + 1}`,
        color,
        colorWritable: zonesWritable,
      })),
      profiles: [],
      muteLinked: false,
      muteLinkedWritable: false,
      state: this.acknowledged ? 'acknowledged' : 'unknown',
      stateReason: this.acknowledged
        ? 'The mouse acknowledged the live lighting command; this HID++ effect path has no state readback.'
        : 'The mouse reports available effects and zones, but not the currently visible live effect. Choose a setting to take control.',
      physicalEffectVerified: false,
      profileMode: 'software',
      source: 'software',
      unavailableReason,
    };
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.enabled) return;
    await this.claim();
    if (enabled) {
      await this.applyEffect(this.activeEffectId);
      if (this.activeEffectId === 'static') await this.paintAllZones();
    } else {
      await this.applyOff();
    }
    this.enabled = enabled;
    this.acknowledged = true;
  }

  public async setEffect(effectId: string): Promise<void> {
    if (!this.availableEffects.some((effect) => effect.id === effectId)) {
      throw new Error('That LIGHTSYNC effect was not reported by this device.');
    }
    await this.claim();
    await this.applyEffect(effectId);
    if (effectId === 'static') await this.paintAllZones();
    this.activeEffectId = effectId;
    this.enabled = true;
    this.acknowledged = true;
  }

  public async setColor(color: string): Promise<void> {
    assertColor(color);
    const previousColor = this.color;
    const previousEffect = this.activeEffectId;
    const previousEnabled = this.enabled;
    const previousZones = new Map(this.zoneColors);
    const targetEffect = this.activeDefinition?.controls.includes('color')
      ? this.activeEffectId
      : 'static';
    if (!this.availableEffects.some((effect) => effect.id === targetEffect)) {
      throw new Error('The active LIGHTSYNC effect does not accept a custom color.');
    }
    try {
      this.color = color.toLowerCase();
      if (targetEffect === 'static') {
        for (const zoneId of this.zoneColors.keys()) this.zoneColors.set(zoneId, this.color);
      }
      await this.claim();
      await this.applyEffect(targetEffect);
      if (targetEffect === 'static') await this.paintAllZones();
      this.activeEffectId = targetEffect;
      this.enabled = true;
      this.acknowledged = true;
    } catch (error) {
      this.color = previousColor;
      this.activeEffectId = previousEffect;
      this.enabled = previousEnabled;
      this.zoneColors.clear();
      for (const [zoneId, previousColorValue] of previousZones) this.zoneColors.set(zoneId, previousColorValue);
      throw error;
    }
  }

  public async setZoneColor(zoneId: string, color: string): Promise<void> {
    assertColor(color);
    const numericId = parseZoneKey(zoneId);
    if (numericId === null || !this.zoneColors.has(numericId) || this.perKeyFeatureIndex === null) {
      throw new Error('That LIGHTSYNC zone is not available on this device.');
    }
    if (!this.availableEffects.some((effect) => effect.id === 'static')) {
      throw new Error('This device does not report the Static effect required for zone colors.');
    }
    const previousColor = this.zoneColors.get(numericId)!;
    const previousEffect = this.activeEffectId;
    const previousEnabled = this.enabled;
    try {
      this.zoneColors.set(numericId, color.toLowerCase());
      await this.claim();
      await this.applyEffect('static');
      this.activeEffectId = 'static';
      this.enabled = true;
      await this.paintAllZones();
      this.acknowledged = true;
    } catch (error) {
      this.zoneColors.set(numericId, previousColor);
      this.activeEffectId = previousEffect;
      this.enabled = previousEnabled;
      throw error;
    }
  }

  public async setBrightness(brightness: number): Promise<void> {
    if (!this.activeDefinition?.controls.includes('brightness')) {
      throw new Error('The selected LIGHTSYNC effect has no brightness control.');
    }
    const previousBrightness = this.brightness;
    const previousEnabled = this.enabled;
    try {
      this.brightness = clamp(Math.round(brightness), 0, 100);
      await this.claim();
      await this.applyEffect(this.activeEffectId);
      if (this.activeEffectId === 'static') await this.paintAllZones();
      this.enabled = true;
      this.acknowledged = true;
    } catch (error) {
      this.brightness = previousBrightness;
      this.enabled = previousEnabled;
      throw error;
    }
  }

  public async setSpeed(speed: number): Promise<void> {
    if (!this.activeDefinition?.controls.includes('speed')) throw new Error('The selected LIGHTSYNC effect has no speed control.');
    const previousSpeed = this.speed;
    const previousEnabled = this.enabled;
    try {
      this.speed = clamp(Math.round(speed), 1, 100);
      await this.claim();
      await this.applyEffect(this.activeEffectId);
      this.enabled = true;
      this.acknowledged = true;
    } catch (error) {
      this.speed = previousSpeed;
      this.enabled = previousEnabled;
      throw error;
    }
  }

  public async setDirection(direction: LightingDirection): Promise<void> {
    if (!this.activeDefinition?.controls.includes('direction')) throw new Error('The selected LIGHTSYNC effect has no direction control.');
    if (!directions.includes(direction)) throw new Error('That LIGHTSYNC direction is unavailable.');
    const previousDirection = this.direction;
    const previousEnabled = this.enabled;
    try {
      this.direction = direction;
      await this.claim();
      await this.applyEffect(this.activeEffectId);
      this.enabled = true;
      this.acknowledged = true;
    } catch (error) {
      this.direction = previousDirection;
      this.enabled = previousEnabled;
      throw error;
    }
  }

  public async release(): Promise<void> {
    if (!this.claimed) return;
    this.claimed = false;
    this.perKeyPrepared = false;
    try {
      await this.transport.request(this.deviceIndex, this.featureIndex, 5, softwareControlReleased, 350);
    } catch {
      // Closing the HID channel also returns control to firmware.
    }
  }

  private get activeDefinition(): EffectDefinition | undefined {
    return effectDefinitions.find((definition) => definition.id === this.activeEffectId);
  }

  private async claim(): Promise<void> {
    if (this.claimed) return;
    await this.transport.request(this.deviceIndex, this.featureIndex, 5, softwareControlActive);
    this.claimed = true;
  }

  private async applyOff(): Promise<void> {
    for (const cluster of this.clusters) {
      const off = preferredEffect(cluster, 'off');
      await this.transport.request(
        this.deviceIndex,
        this.featureIndex,
        1,
        [cluster.index, off?.index ?? cluster.effectCount, ...Array<number>(10).fill(0), persistUntilRelease],
      );
    }
  }

  private async applyEffect(effectId: string): Promise<void> {
    for (const cluster of this.clusters) {
      const effect = preferredEffect(cluster, effectId);
      if (!effect) throw new Error('The selected LIGHTSYNC effect is not available in every lighting cluster.');
      const parameters = buildEffectParameters(
        effect,
        this.color,
        this.brightness,
        this.speed,
        this.direction,
      );
      await this.transport.request(
        this.deviceIndex,
        this.featureIndex,
        1,
        [cluster.index, effect.index, ...parameters, persistUntilRelease],
      );
    }
  }

  private async preparePerKey(): Promise<void> {
    if (this.perKeyPrepared || this.perKeyFeatureIndex === null || this.zoneColors.size === 0) return;
    const firstCluster = this.clusters[0];
    await this.transport.request(
      this.deviceIndex,
      this.featureIndex,
      1,
      [allClusters, firstCluster?.effectCount ?? 0, ...Array<number>(10).fill(0), persistUntilRelease],
    );
    this.perKeyPrepared = true;
  }

  private async paintAllZones(): Promise<void> {
    if (this.perKeyFeatureIndex === null || this.zoneColors.size === 0) return;
    await this.preparePerKey();
    for (const [zoneId, color] of this.zoneColors) {
      const [red, green, blue] = scaledRgb(color, this.brightness);
      await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 1, [zoneId, red, green, blue]);
    }
    await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 7, [0]);
  }
}

export async function discoverLogitechRgbFeatureIndexes(
  transport: LogitechRgbTransport,
  deviceIndex: number,
): Promise<{ rgbEffects: number | null; perKeyLighting: number | null }> {
  const getFeatureIndex = async (featureId: number): Promise<number | null> => {
    const response = await transport.request(deviceIndex, 0x00, 0, [featureId >>> 8, featureId & 0xff, 0x00]);
    return response[4] ? response[4] : null;
  };
  const [rgbEffects, perKeyLighting] = await Promise.all([
    getFeatureIndex(rgbEffectsFeatureId),
    getFeatureIndex(perKeyLightingV2FeatureId),
  ]);
  return { rgbEffects, perKeyLighting };
}

async function readPerKeyZoneIds(
  transport: LogitechRgbTransport,
  deviceIndex: number,
  featureIndex: number,
): Promise<number[]> {
  const bitmap: number[] = [];
  for (let page = 0; page < 3; page += 1) {
    const response = await transport.request(deviceIndex, featureIndex, 0, [0, 0, page]);
    bitmap.push(...response.subarray(6, 20));
  }
  const zoneIds: number[] = [];
  for (let zoneId = 1; zoneId < Math.min(255, bitmap.length * 8); zoneId += 1) {
    if (((bitmap[Math.floor(zoneId / 8)] ?? 0) >> (zoneId % 8)) & 1) zoneIds.push(zoneId);
  }
  return zoneIds;
}

function preferredEffect(cluster: RgbCluster, canonicalId: string): RgbEffectInfo | undefined {
  const definition = effectDefinitions.find((candidate) => candidate.id === canonicalId);
  if (!definition) return undefined;
  for (const wireId of definition.wireIds) {
    const effect = cluster.effects.find((candidate) => candidate.wireId === wireId);
    if (effect) return effect;
  }
  return undefined;
}

function buildEffectParameters(
  effect: RgbEffectInfo,
  color: string,
  brightness: number,
  speed: number,
  direction: LightingDirection,
): number[] {
  const parameters = Array<number>(10).fill(0);
  const [red, green, blue] = scaledRgb(color, brightness);
  const intensity = clamp(Math.round(brightness), 0, 100);
  const period = speedPeriod(effect.wireId, speed, effect.period);
  const writeColor = (offset = 0) => parameters.splice(offset, 3, red, green, blue);
  const writePeriod = (offset: number) => parameters.splice(offset, 2, period >>> 8, period & 0xff);

  if (effect.wireId === 0x01) {
    writeColor();
    parameters[3] = 0x02;
  } else if (effect.wireId === 0x02) {
    writeColor();
    parameters[3] = clamp(Math.round((speed / 100) * 255), 1, 255);
  } else if (effect.wireId === 0x03) {
    writePeriod(5);
    parameters[7] = intensity;
  } else if (effect.wireId === 0x04) {
    writePeriod(6);
    parameters[9] = directionBytes[direction];
  } else if (effect.wireId === 0x0a) {
    writeColor();
    writePeriod(3);
    parameters[5] = 0x01;
    parameters[6] = intensity;
  } else if (effect.wireId === 0x0b) {
    writeColor();
    writePeriod(4);
  } else if (effect.wireId === 0x0e) {
    writePeriod(6);
    parameters[8] = intensity;
  } else if (effect.wireId === 0x0f || effect.wireId === 0x10) {
    writePeriod(5);
    parameters[7] = intensity;
  } else if (effect.wireId === 0x15) {
    parameters[1] = 0xff;
    writePeriod(6);
    parameters[8] = intensity;
  } else if (effect.wireId === 0x16) {
    parameters[1] = 0xff;
    writePeriod(6);
    parameters[8] = intensity;
    parameters[9] = directionBytes[direction];
  } else if (effect.wireId === 0x17) {
    writeColor();
    parameters[3] = 0xff;
    writePeriod(6);
  }
  return parameters;
}

function speedPeriod(wireId: number, speed: number, reportedDefault: number): number {
  const normalized = clamp(speed, 1, 100) / 100;
  const ripple = wireId === 0x0b || wireId === 0x17;
  const minimum = ripple ? 2 : 200;
  const maximum = ripple ? 200 : 10_000;
  const derived = Math.round(maximum - normalized * (maximum - minimum));
  if (reportedDefault <= 0) return derived;
  return clamp(derived, minimum, maximum);
}

function scaledRgb(color: string, brightness: number): [number, number, number] {
  assertColor(color);
  const scale = clamp(brightness, 0, 100) / 100;
  return [
    Math.round(Number.parseInt(color.slice(1, 3), 16) * scale),
    Math.round(Number.parseInt(color.slice(3, 5), 16) * scale),
    Math.round(Number.parseInt(color.slice(5, 7), 16) * scale),
  ];
}

function zoneKey(zoneId: number): string {
  return `zone-${zoneId}`;
}

function parseZoneKey(value: string): number | null {
  const match = /^zone-(\d{1,3})$/.exec(value);
  if (!match) return null;
  const zoneId = Number.parseInt(match[1]!, 10);
  return zoneId > 0 && zoneId < 255 ? zoneId : null;
}

function assertColor(color: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Lighting color must use #RRGGBB format.');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
