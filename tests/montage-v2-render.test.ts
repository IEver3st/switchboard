import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clip } from '../src/shared/contracts';
import { createMontageMusicTrack, createMontageProjectV2, normalizeMontageProject } from '../src/renderer/src/components/capture/montage-v2-model';
import { renderMontageV2 } from '../src/main/services/montage-v2-renderer';

const ffmpeg = process.env.SWITCHBOARD_FFMPEG_INTEGRATION;
const ffprobe = process.env.SWITCHBOARD_FFPROBE_INTEGRATION;
const integration = ffmpeg && ffprobe ? describe : describe.skip;
const workspace = join(tmpdir(), `switchboard-montage-render-${randomUUID()}`);

integration('montage v2 FFmpeg render', () => {
  beforeAll(async () => {
    await mkdir(workspace, { recursive: true });
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('renders repeated clips with looped imported music into a playable MP4', async () => {
    const clipAPath = join(workspace, 'clip-a.mp4');
    const clipBPath = join(workspace, 'clip-b.mp4');
    const musicPath = join(workspace, 'music.mp3');
    const destination = join(workspace, 'montage.mp4');

    await Promise.all([
      createVideoFixture(clipAPath, 'red', 440),
      createVideoFixture(clipBPath, 'blue', 660),
      run(ffmpeg!, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=0.45',
        '-c:a', 'libmp3lame', '-q:a', '5', '-y', musicPath,
      ]),
    ]);

    const clipA = fixtureClip('clip-a', clipAPath);
    const clipB = fixtureClip('clip-b', clipBPath);
    const initial = createMontageProjectV2([clipA, clipA, clipB]);
    const segments = initial.segments.map((segment) => ({ ...segment, trimStartMs: 100, trimEndMs: 700 }));
    const project = normalizeMontageProject({
      ...initial,
      segments,
      music: {
        ...createMontageMusicTrack({
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Music',
          originalName: 'music.mp3',
          durationMs: 450,
          fileSize: (await stat(musicPath)).size,
          codec: 'mp3',
          createdAt: Date.now(),
        }),
        volume: 0.2,
        fadeInMs: 100,
        fadeOutMs: 150,
        loop: true,
      },
    });
    const clipsById = new Map([[clipA.id, clipA], [clipB.id, clipB]]);

    process.env.SWITCHBOARD_FFMPEG = ffmpeg!;
    process.env.SWITCHBOARD_FFPROBE = ffprobe!;
    await renderMontageV2({
      project,
      entries: project.segments.map((segment) => ({ clip: clipsById.get(segment.clipId)!, segment })),
      musicPath,
      destination,
      preset: 'original',
    });

    const output = JSON.parse(await run(ffprobe!, [
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration,size:stream=codec_type',
      destination,
    ])) as {
      format?: { duration?: string; size?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    const duration = Number(output.format?.duration ?? 0);
    expect(duration).toBeGreaterThan(1.7);
    expect(duration).toBeLessThan(2.05);
    expect(Number(output.format?.size ?? 0)).toBeGreaterThan(1_000);
    expect(output.streams?.some((stream) => stream.codec_type === 'video')).toBe(true);
    expect(output.streams?.some((stream) => stream.codec_type === 'audio')).toBe(true);
  }, 30_000);
});

async function createVideoFixture(path: string, color: string, frequency: number): Promise<void> {
  await run(ffmpeg!, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=30:d=1`,
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=1`,
    '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-y', path,
  ]);
}

function fixtureClip(id: string, path: string): Clip {
  return {
    id,
    path,
    name: id,
    createdAt: Date.now(),
    durationMs: 1_000,
    fileSize: 100_000,
    width: 320,
    height: 180,
    fps: 30,
    codec: 'h264',
    favorite: false,
    titleEdited: false,
    canvasSize: 'original',
    audioChannels: ['game'],
  };
}

function run(executable: string, arguments_: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = Bun.spawn([executable, ...arguments_], { stdout: 'pipe', stderr: 'pipe' });
    Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      .then(([stdout, stderr, code]) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `${executable} exited with code ${code}`));
      })
      .catch(reject);
  });
}
