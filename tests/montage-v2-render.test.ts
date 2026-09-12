import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
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
const complexSource = join(workspace, 'complex.mp4');

integration('montage v2 FFmpeg render', () => {
  beforeAll(async () => {
    await mkdir(workspace, { recursive: true });
    await run(ffmpeg!, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-vf', 'noise=alls=80:allf=t+u:all_seed=42',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-c:a', 'aac', '-y', complexSource,
    ]);
    process.env.SWITCHBOARD_FFMPEG = ffmpeg!;
    process.env.SWITCHBOARD_FFPROBE = ffprobe!;
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('automatically fits short complex segments under the target without truncating them', async () => {
    const clip = { ...fixtureClip('complex', complexSource), width: 1_280, height: 720 };
    const initial = createMontageProjectV2([clip, clip, clip, clip]);
    for (const withMusic of [false, true]) {
      const project = normalizeMontageProject({ ...initial,
        segments: initial.segments.map((segment) => ({ ...segment, trimStartMs: 100, trimEndMs: 700,
          videoEdits: { speed: 2, flipHorizontal: true },
        })),
        ...(withMusic ? { music: { ...createMontageMusicTrack({ id: randomUUID(), name: 'Music', originalName: 'complex.mp4',
          durationMs: 1_000, fileSize: (await stat(complexSource)).size, createdAt: Date.now() }),
          ducking: { enabled: true, amount: 0.5, attackMs: 50, releaseMs: 100 },
        } } : {}),
      });
      const destination = join(workspace, `complex-limited-${withMusic}.mp4`);
      const progress: number[] = [];
      let firstAttemptBytes: number | undefined;
      await renderMontageV2({ project,
        entries: project.segments.map((segment) => ({ clip, segment })), destination,
        ...(withMusic ? { musicPath: complexSource } : {}),
        preset: 'original', targetSizeMb: 0.15, onProgress: (value) => {
          progress.push(value);
          if (firstAttemptBytes === undefined && existsSync(destination)) firstAttemptBytes = statSync(destination).size;
        },
      });
      const output = JSON.parse(await run(ffprobe!, ['-v', 'error', '-show_entries',
        'stream=codec_type,nb_frames:format=duration,size', '-of', 'json', destination]));
      expect(firstAttemptBytes).toBeGreaterThan(0.15 * 1_048_576);
      expect(Number(output.format.size)).toBeLessThanOrEqual(0.15 * 1_048_576);
      expect(Number(output.format.duration)).toBeGreaterThanOrEqual(1.2);
      expect(Number(output.format.duration)).toBeLessThan(1.4);
      expect(Number(output.streams[0].nb_frames)).toBe(36);
      expect(output.streams.map((stream: { codec_type: string }) => stream.codec_type)).toEqual(['video', 'audio']);
      await run(ffmpeg!, ['-v', 'error', '-xerror', '-i', destination, '-f', 'null', '-']);
      expect(progress.at(-1)).toBe(1);
      expect(progress.slice(0, -1).every((value) => value < 1)).toBe(true);
      expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(true);
    }
  }, 30_000);

  test('cancels during automatic size correction without reporting success and can export again', async () => {
    const clip = { ...fixtureClip('complex', complexSource), width: 1_280, height: 720 };
    const initial = createMontageProjectV2([clip]);
    const project = normalizeMontageProject({ ...initial,
      segments: initial.segments.map((segment) => ({ ...segment, trimStartMs: 100, trimEndMs: 400 })),
    });
    const destination = join(workspace, 'cancelled-correction.mp4');
    const controller = new AbortController();
    const progress: number[] = [];
    let oversizedProgress: number | undefined;
    const input = { project, entries: [{ clip, segment: project.segments[0]! }], destination,
      preset: 'original' as const, targetSizeMb: 0.0375,
    };
    await expect(renderMontageV2({ ...input, signal: controller.signal, onProgress: (value) => {
      progress.push(value);
      if (oversizedProgress !== undefined && value > oversizedProgress && value < 1) controller.abort();
      if (oversizedProgress === undefined && existsSync(destination) && statSync(destination).size > 0.0375 * 1_048_576) {
        oversizedProgress = value;
      }
    } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.signal.aborted).toBe(true);
    expect(progress).not.toContain(1);
    await renderMontageV2(input);
    expect((await stat(destination)).size).toBeLessThanOrEqual(0.0375 * 1_048_576);
  }, 30_000);

  test('sizes edited video to its bitrate budget while preserving Original resolution and portrait framing', async () => {
    const source = join(workspace, 'detail.mp4');
    await run(ffmpeg!, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-y', source,
    ]);
    process.env.SWITCHBOARD_FFMPEG = ffmpeg!;
    process.env.SWITCHBOARD_FFPROBE = ffprobe!;
    const clip = { ...fixtureClip('detail', source), durationMs: 2_000, width: 1_280, height: 720, audioChannels: [] };
    for (const canvasSize of ['original', '9:16'] as const) {
      for (const limited of [false, true]) {
        const initial = createMontageProjectV2([clip]);
        const project = normalizeMontageProject({ ...initial, canvasSize,
          segments: initial.segments.map((segment) => ({ ...segment, videoEdits: { flipHorizontal: true } })),
        });
        const destination = join(workspace, `detail-${canvasSize.replace(':', '-')}-${limited}.mp4`);
        await renderMontageV2({ project, entries: [{ clip, segment: project.segments[0]! }], destination,
          preset: 'original', ...(limited ? { targetSizeMb: 0.15 } : {}),
        });
        const output = JSON.parse(await run(ffprobe!, ['-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height,avg_frame_rate:format=duration,size', '-of', 'json', destination]));
        const video = output.streams[0];
        expect(video.avg_frame_rate).toBe('30/1');
        expect(Number(output.format.duration)).toBeCloseTo(2, 1);
        expect(video.height).toBe(limited ? (canvasSize === 'original' ? 360 : 640) : 720);
        expect(video.width / video.height).toBeCloseTo(canvasSize === 'original' ? 16 / 9 : 9 / 16, 2);
        if (limited) expect(Number(output.format.size)).toBeLessThanOrEqual(0.15 * 1_048_576);
      }
    }
  }, 30_000);

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
