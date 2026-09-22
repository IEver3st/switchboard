// Bundle with Bun (--target=node --external electron), then run with Electron.
// Exercises the real main-process export service without creating any windows.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { app, dialog, shell } from 'electron';
import { MontageV2Service } from '../src/main/services/montage-v2';
import { getPreparedShareService, disposePreparedShareService } from '../src/main/services/prepared-share';
import type { Clip } from '../src/shared/contracts';
import type { MontageProjectV2 } from '../src/shared/montage-v2';

const execute = promisify(execFile);
async function verify() {
  const workspace = await mkdtemp(join(tmpdir(), 'switchboard-clip-share-'));
  app.setPath('userData', workspace);
  app.setPath('temp', workspace);
  await app.whenReady();
  const service = new MontageV2Service();
  const shares = getPreparedShareService();
  let dialogCalls = 0;
  const montageDestination = join(workspace, 'Montage.mp4');
  dialog.showSaveDialog = (async () => {
    dialogCalls += 1;
    return { canceled: false, filePath: montageDestination };
  }) as typeof dialog.showSaveDialog;
  let revealedPath: string | undefined;
  shell.showItemInFolder = (path) => { revealedPath = path; };

  try {
    const path = join(workspace, 'source.mp4');
    await execute(process.env.SWITCHBOARD_FFMPEG ?? 'ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=10:d=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-y', path,
    ], { windowsHide: true });
    const original = await readFile(path);
    const clip: Clip = {
      id: 'share-source', path, name: 'Share test', createdAt: Date.now(), durationMs: 1000,
      fileSize: (await stat(path)).size, width: 320, height: 180, fps: 10,
      favorite: false, titleEdited: true, canvasSize: 'original',
    };
    const project: MontageProjectV2 = {
      schemaVersion: 2, type: 'montage', id: randomUUID(), sourceClipId: clip.id,
      name: clip.name, createdAt: Date.now(), updatedAt: Date.now(), durationMs: 800,
      canvasSize: 'original', segments: [{
        id: randomUUID(), clipId: clip.id, sourceDurationMs: 1000, trimStartMs: 100,
        trimEndMs: 900, volume: 1, muted: false,
      }],
    };
    const preparedPaths: string[] = [];
    for (const preset of ['10mb', '10mb', 'original'] as const) {
      const exportId = randomUUID();
      const prepared = await service.export({ exportId, project, preset }, [clip]);
      assert(prepared && prepared.fileSize > 0);
      assert.equal(dialogCalls, 0, 'Prepare clip must never open Save As');
      const record = shares.resolve(prepared.id);
      assert(record?.temporary);
      assert(record.path.startsWith(join(workspace, 'Switchboard', 'Share')));
      assert.equal(record.name, `Share test${preset === 'original' ? '' : '-10mb'}.mp4`);
      assert(!preparedPaths.includes(record.path), 'Repeated preparations must not overwrite each other');
      preparedPaths.push(record.path);
      shares.reveal(prepared.id);
      assert.equal(revealedPath, record.path);
      const { stdout } = await execute(process.env.SWITCHBOARD_FFPROBE ?? 'ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', record.path,
      ], { windowsHide: true });
      assert(Math.abs(Number(JSON.parse(stdout).format.duration) - 0.8) < 0.2);
    }
    assert.deepEqual(await readFile(path), original, 'Preparing a share must preserve the source');

    const canceledId = randomUUID();
    const canceled = await service.export({ exportId: canceledId, project, preset: '10mb' }, [clip],
      'libx264', () => service.cancelExport(canceledId));
    assert.equal(canceled, null);
    assert.equal(shares.resolve(canceledId), null);
    assert(!existsSync(join(workspace, 'Switchboard', 'Share', String(process.pid), canceledId)));

    const brokenPath = join(workspace, 'broken.mp4');
    await writeFile(brokenPath, 'Invalid media');
    const failedId = randomUUID();
    await assert.rejects(service.export({ exportId: failedId, project, preset: '10mb' }, [{ ...clip, path: brokenPath }]));
    assert.equal(shares.resolve(failedId), null);
    assert(!existsSync(join(workspace, 'Switchboard', 'Share', String(process.pid), failedId)));
    assert.equal(service.hasActiveExports, false);
    assert.equal(dialogCalls, 0);

    const montage = { ...project, sourceClipId: undefined };
    const exported = await service.export({ exportId: randomUUID(), project: montage, preset: 'original' }, [clip]);
    assert(exported);
    assert.equal(dialogCalls, 1, 'Montage export retains its explicit destination choice');
    assert.equal(shares.resolve(exported.id)?.path, montageDestination);
    assert.equal(shares.resolve(exported.id)?.temporary, false);
    await disposePreparedShareService();
    assert(preparedPaths.every(path => !existsSync(path)), 'Session cleanup removes temporary shares');
    assert(existsSync(montageDestination), 'Session cleanup preserves saved montage exports');
    assert(existsSync(clip.path), 'Session cleanup preserves source clips');
    console.log('PASS: automatic clip shares, unique files, reveal, playable trim, source preservation, cancellation, failure cleanup, montage Save As, and session cleanup.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    service.dispose();
    await disposePreparedShareService();
    assert.equal(dirname(resolve(workspace)), resolve(tmpdir()));
    assert(workspace.includes('switchboard-clip-share-'));
    await rm(workspace, { recursive: true, force: true });
    app.exit(process.exitCode ?? 0);
  }
}

void verify().catch(error => {
  console.error(error);
  app.exit(1);
});
