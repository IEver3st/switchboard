export const settingsCategoryIds = [
  'general',
  'devices',
  'audio',
  'capture',
  'clips',
  'games',
  'modules',
  'diagnostics',
  'about',
] as const;

export type SettingsCategoryId = (typeof settingsCategoryIds)[number];

export type SettingsSearchEntry = {
  id: string;
  category: SettingsCategoryId;
  title: string;
  description: string;
  keywords: readonly string[];
};

export const settingsCategories: ReadonlyArray<{
  id: SettingsCategoryId;
  label: string;
  resettable: boolean;
}> = [
  { id: 'general', label: 'General', resettable: true },
  { id: 'devices', label: 'Devices', resettable: true },
  { id: 'audio', label: 'Audio', resettable: true },
  { id: 'capture', label: 'Capture', resettable: true },
  { id: 'clips', label: 'Clips', resettable: true },
  { id: 'games', label: 'Games', resettable: true },
  { id: 'modules', label: 'Modules', resettable: true },
  { id: 'diagnostics', label: 'Diagnostics', resettable: true },
  { id: 'about', label: 'About', resettable: false },
];

export const settingsSearchEntries: readonly SettingsSearchEntry[] = [
  {
    id: 'general.startup',
    category: 'general',
    title: 'Start Switchboard with Windows',
    description: 'Launch the control plane automatically when you sign in.',
    keywords: ['startup', 'start up', 'login', 'boot', 'launch'],
  },
  {
    id: 'general.closeToTray',
    category: 'general',
    title: 'Close to tray',
    description: 'Keep hotkeys, profiles, and active engines available after closing the window.',
    keywords: ['tray', 'close', 'background', 'window'],
  },
  {
    id: 'general.destroyRenderer',
    category: 'general',
    title: 'Release interface memory in tray',
    description: 'Destroy the Chromium renderer while Switchboard is in the tray.',
    keywords: ['renderer', 'memory', 'ram', 'chromium', 'tray', 'resource'],
  },
  {
    id: 'about.automaticAppUpdates',
    category: 'about',
    title: 'Always keep Switchboard up to date',
    description: 'Check for application releases shortly after launch and every six hours.',
    keywords: ['app', 'application', 'automatic', 'update', 'upgrade', 'release', 'github'],
  },
  {
    id: 'about.automaticAppUpdateDownloads',
    category: 'about',
    title: 'Download updates automatically',
    description: 'Choose whether available application releases download in the background.',
    keywords: ['app', 'application', 'automatic', 'download', 'update', 'release'],
  },
  {
    id: 'about.installAppUpdatesOnNextStartup',
    category: 'about',
    title: 'Install for the next startup',
    description: 'Apply a downloaded release when Switchboard closes.',
    keywords: ['app', 'application', 'install', 'update', 'startup', 'restart', 'quit'],
  },
  {
    id: 'devices.connected',
    category: 'devices',
    title: 'Connected hardware',
    description: 'Review hardware identity and open per-device controls.',
    keywords: ['device', 'hardware', 'connected', 'identity', 'manufacturer', 'model'],
  },
  {
    id: 'devices.appearanceFallback',
    category: 'devices',
    title: 'Appearance fallback',
    description: 'Override the cosmetic variant only when hardware evidence cannot identify it.',
    keywords: ['device', 'variant', 'colorway', 'white', 'black', 'override', 'asset', 'render'],
  },
  {
    id: 'devices.workspace',
    category: 'devices',
    title: 'Per-device controls',
    description: 'Open the Devices workspace for hardware-specific configuration.',
    keywords: ['gain', 'dpi', 'polling rate', 'lighting', 'buttons', 'device page'],
  },
  {
    id: 'audio.engine',
    category: 'audio',
    title: 'Audio engine',
    description: 'Start the isolated Audio host now and restore it on the next launch.',
    keywords: ['audio', 'engine', 'startup', 'host', 'routing'],
  },
  {
    id: 'audio.output',
    category: 'audio',
    title: 'Default output',
    description: 'Choose the output used by the Game bus.',
    keywords: ['speaker', 'headphones', 'headset', 'endpoint', 'device', 'game'],
  },
  {
    id: 'audio.microphone',
    category: 'audio',
    title: 'Default microphone',
    description: 'Choose the input used by the Microphone bus.',
    keywords: ['mic', 'input', 'endpoint', 'device', 'voice'],
  },
  {
    id: 'audio.sampleRate',
    category: 'audio',
    title: 'Processing format',
    description: 'The Audio host currently runs a fixed 48 kHz float32 graph.',
    keywords: ['sample rate', '48 khz', 'format', 'quality', 'float32'],
  },
  {
    id: 'audio.mixer',
    category: 'audio',
    title: 'Mixer and processing',
    description: 'Open the Audio workspace for buses, ChatMix, monitoring, and processing.',
    keywords: ['mixer', 'dsp', 'chatmix', 'monitoring', 'bus', 'equalizer'],
  },
  {
    id: 'capture.engine',
    category: 'capture',
    title: 'Capture engine',
    description: 'Start or stop the isolated Capture host and restore its saved state at launch.',
    keywords: ['capture', 'replay', 'engine', 'host', 'start', 'stop'],
  },
  {
    id: 'capture.storage',
    category: 'clips',
    title: 'Clip storage location',
    description: 'Choose where saved replay clips are written.',
    keywords: ['clips', 'folder', 'directory', 'path', 'storage', 'videos'],
  },
  {
    id: 'capture.source',
    category: 'capture',
    title: 'Capture source',
    description: 'Choose how Instant Replay finds the content to capture.',
    keywords: ['game', 'window', 'display', 'monitor', 'screen'],
  },
  {
    id: 'capture.duration',
    category: 'clips',
    title: 'Default replay length',
    description: 'Set how much recent footage is retained for the next saved clip.',
    keywords: ['clips', 'duration', 'seconds', 'instant replay', 'buffer'],
  },
  {
    id: 'capture.resolution',
    category: 'clips',
    title: 'Resolution',
    description: 'Set the output size for newly encoded replay segments.',
    keywords: ['720p', '1080p', '1440p', '4k', '2160p', 'native'],
  },
  {
    id: 'capture.frameRate',
    category: 'clips',
    title: 'Frame rate',
    description: 'Set the target frame rate within the active capture host limit.',
    keywords: ['fps', 'frames', '30', '60', '120'],
  },
  {
    id: 'capture.quality',
    category: 'clips',
    title: 'Capture quality',
    description: 'Balance encoder bitrate against clip size.',
    keywords: ['bitrate', 'size', 'quality', 'compression'],
  },
  {
    id: 'capture.shortcut',
    category: 'capture',
    title: 'Save replay shortcut',
    description: 'Record the global keyboard shortcut used to save the current replay.',
    keywords: ['hotkey', 'keyboard', 'keybind', 'shortcut', 'save clip'],
  },
  {
    id: 'capture.microphone',
    category: 'capture',
    title: 'Record microphone',
    description: 'Include the selected microphone as a separate replay input.',
    keywords: ['mic', 'voice', 'track', 'audio'],
  },
  {
    id: 'capture.systemAudio',
    category: 'capture',
    title: 'Record system audio',
    description: 'Include desktop audio when the capture host supports it.',
    keywords: ['desktop audio', 'game audio', 'sound', 'track'],
  },
  {
    id: 'capture.cursor',
    category: 'capture',
    title: 'Capture cursor',
    description: 'Include the Windows pointer in saved footage.',
    keywords: ['mouse', 'pointer', 'cursor'],
  },
  {
    id: 'capture.encoder',
    category: 'capture',
    title: 'Preferred encoder',
    description: 'Let the host choose automatically or prefer an available encoder.',
    keywords: ['gpu', 'nvenc', 'amf', 'qsv', 'software', 'hardware'],
  },
  {
    id: 'capture.codec',
    category: 'capture',
    title: 'Video codec',
    description: 'Choose a codec reported by the active capture host.',
    keywords: ['h264', 'h.264', 'hevc', 'h265', 'av1', 'compression'],
  },
  {
    id: 'capture.workspace',
    category: 'capture',
    title: 'Capture controls and library',
    description: 'Open Capture to configure and save replays or manage clips.',
    keywords: ['save replay', 'clip library', 'instant replay', 'capture'],
  },
  {
    id: 'games.automaticScan',
    category: 'games',
    title: 'Automatically scan for games',
    description: 'Scan supported launcher libraries once when Switchboard starts.',
    keywords: ['games', 'detection', 'startup', 'steam', 'epic', 'launcher', 'automatic'],
  },
  {
    id: 'games.library',
    category: 'games',
    title: 'Detected games',
    description: 'Scan now or manually add a Windows game executable.',
    keywords: ['games', 'scan', 'add game', 'executable', 'exe', 'library', 'manual'],
  },
  {
    id: 'modules.create',
    category: 'modules',
    title: 'Create a device add-on',
    description: 'Scaffold a sandboxed device-discovery module with a manifest, tests, schema, and guide.',
    keywords: ['plugin', 'addon', 'add-on', 'author', 'developer', 'sdk', 'vid', 'pid', 'manifest', 'scaffold'],
  },
  {
    id: 'modules.local',
    category: 'modules',
    title: 'Local module projects',
    description: 'Validate, open, enable, or unlink a local add-on project.',
    keywords: ['plugin', 'addon', 'add-on', 'link', 'validate', 'sandbox', 'project', 'local'],
  },
  {
    id: 'modules.automaticUpdates',
    category: 'modules',
    title: 'Automatic bundled-module updates',
    description: 'Verify and install signed bundled module packages with rollback retained.',
    keywords: ['extensions', 'plugins', 'updates', 'signed', 'rollback'],
  },
  {
    id: 'modules.installed',
    category: 'modules',
    title: 'Installed modules',
    description: 'Review installed modules and change their enabled state.',
    keywords: ['extensions', 'plugins', 'drivers', 'hardware', 'disable', 'enable'],
  },
  {
    id: 'modules.available',
    category: 'modules',
    title: 'Available modules',
    description: 'Install modules detected for this setup.',
    keywords: ['extensions', 'plugins', 'drivers', 'hardware', 'install', 'discovery'],
  },
  {
    id: 'diagnostics.guard',
    category: 'diagnostics',
    title: 'Performance guard',
    description: 'Warn when sustained resource use crosses the performance budget.',
    keywords: ['cpu', 'memory', 'ram', 'performance', 'resource', 'budget'],
  },
  {
    id: 'diagnostics.retention',
    category: 'diagnostics',
    title: 'Local retention',
    description: 'Choose how long local crash and module failure records are retained.',
    keywords: ['logs', 'history', 'days', 'crash', 'privacy'],
  },
  {
    id: 'diagnostics.telemetry',
    category: 'diagnostics',
    title: 'Telemetry',
    description: 'Remote telemetry is hard-disabled in the current schema.',
    keywords: ['privacy', 'analytics', 'tracking', 'collection'],
  },
  {
    id: 'diagnostics.memory',
    category: 'diagnostics',
    title: 'Process usage',
    description: 'Inspect the latest low-frequency memory and CPU snapshot.',
    keywords: ['renderer memory', 'idle cpu', 'processes', 'ram'],
  },
  {
    id: 'diagnostics.engines',
    category: 'diagnostics',
    title: 'Engine status',
    description: 'Inspect the latest Audio and Capture host state.',
    keywords: ['audio host', 'capture host', 'stopped', 'running', 'pid'],
  },
  {
    id: 'diagnostics.deviceIdentity',
    category: 'diagnostics',
    title: 'Device identity',
    description: 'Inspect low-level hardware identifiers and asset-resolution evidence.',
    keywords: ['vid', 'pid', 'serial', 'hardware revision', 'device id', 'variant source', 'asset result'],
  },
  {
    id: 'diagnostics.capture-path',
    category: 'diagnostics',
    title: 'Capture pipeline',
    description: 'Inspect the selected backend, encoder, codec, resolution, frame rate, and target data rate.',
    keywords: ['wgc', 'nvenc', 'amf', 'quick sync', 'bitrate', 'codec', 'fps'],
  },
  {
    id: 'diagnostics.capture-health',
    category: 'diagnostics',
    title: 'Replay health',
    description: 'Inspect encoded and dropped frames, replay cache size, observed bitrate, and audio recovery.',
    keywords: ['dropped frames', 'audio sync', 'cache', 'observed bitrate', 'replay'],
  },
  {
    id: 'about.version',
    category: 'about',
    title: 'Version',
    description: 'View the current Switchboard application version.',
    keywords: ['build', 'release', 'about'],
  },
  {
    id: 'about.updates',
    category: 'about',
    title: 'Switchboard updates',
    description: 'Check update status or restart to install a downloaded release.',
    keywords: ['app', 'application', 'update', 'upgrade', 'release', 'download', 'restart', 'github'],
  },
  {
    id: 'about.runtime',
    category: 'about',
    title: 'Runtime',
    description: 'View the desktop runtime and platform reported to the renderer.',
    keywords: ['electron', 'windows', 'platform', 'architecture'],
  },
  {
    id: 'about.isolation',
    category: 'about',
    title: 'Renderer isolation',
    description: 'View the renderer sandbox and preload isolation state.',
    keywords: ['sandbox', 'preload', 'security', 'context isolation', 'node access'],
  },
];

export function categoryLabel(category: SettingsCategoryId): string {
  return settingsCategories.find((candidate) => candidate.id === category)?.label ?? category;
}

export function isSettingsCategory(value: string | null): value is SettingsCategoryId {
  return settingsCategoryIds.some((candidate) => candidate === value);
}

export function searchSettings(query: string): SettingsSearchEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return settingsSearchEntries
    .map((entry) => {
      const category = categoryLabel(entry.category).toLocaleLowerCase();
      const title = entry.title.toLocaleLowerCase();
      const haystack = [title, entry.description, category, ...entry.keywords].join(' ').toLocaleLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return null;
      const titleHit = terms.some((term) => title.includes(term));
      const categoryHit = terms.some((term) => category.includes(term));
      return { entry, score: titleHit ? 0 : categoryHit ? 1 : 2 };
    })
    .filter((result): result is { entry: SettingsSearchEntry; score: number } => result !== null)
    .sort((left, right) => left.score - right.score || left.entry.title.localeCompare(right.entry.title))
    .map(({ entry }) => entry);
}
