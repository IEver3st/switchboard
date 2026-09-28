import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultAudioPathPresets } from '../src/shared/audio-presets';
import { equalizerResponseDb } from '../src/renderer/src/lib/eq-response';

// Feed the shipped definitions to the real host parser/DSP, rather than keeping
// a second set of C# preset constants that can silently diverge.
const directory = await mkdtemp(join(tmpdir(), 'switchboard-preset-dsp-'));
try {
  const path = join(directory, 'presets.json');
  await writeFile(path, JSON.stringify(defaultAudioPathPresets.filter(p => p.kind === 'microphone').map(preset => ({
    id: preset.id,
    processors: preset.processors,
    response: [30, 60, 120, 180, 250, 500, 1_000, 2_000, 3_500, 7_000, 14_000].map(frequency => ({
      frequency,
      db: equalizerResponseDb(frequency, preset.processors.find(p => p.id === 'equalizer')!.parameters.bands),
    })),
  }))));
  const child = Bun.spawn(['dotnet', 'run', '--configuration', 'Release', '--project',
    'engines/audio-host-tests/Audio.Host.Tests.csproj', '--', '--microphone-presets', path, ...process.argv.slice(2)],
  { stdout: 'inherit', stderr: 'inherit' });
  process.exitCode = await child.exited;
} finally {
  await rm(directory, { recursive: true, force: true });
}
