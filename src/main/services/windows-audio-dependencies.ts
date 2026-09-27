import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AudioSetupCancelled, audioSetupInventorySchema, type AudioDependency, type AudioSetupBackend, type AudioSetupInventory } from './audio-dependency-setup';

// Official, unmodified vendor packages. Updating a URL requires reviewing its hash and signer.
export const audioDependencyPackages = {
  cable: { url: 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip',
    sha256: 'b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb',
    executable: 'VBCABLE_Setup_x64.exe', signer: 'A77952D93229D0EC36E2543081EEA7D125732B9C' },
  microphone: { url: 'https://download.vb-audio.com/Download_CABLE/HiFiCableAsioBridgeSetup_v1007.zip',
    sha256: '3ecf204bfd8579d36bb918f9856eb1eaddd49c75146f5e8a8f59dcb8375ae89a',
    executable: 'HiFiCableAsioBridgeSetup.exe', signer: '1EC834D910706BDA99DAE3A78B84C4E5EBEA441A' },
} as const;
const maxDownloadBytes = 32 * 1024 * 1024;
type NativeCommand = { command: string; arguments: string[]; cwd: string };
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const receiptSchema = z.object({ bootTimeMs: z.number().finite() });

export class WindowsAudioDependencies implements AudioSetupBackend {
  constructor(private readonly directory: string, private readonly native: () => NativeCommand) {}
  private supported() {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Audio driver setup currently supports Windows x64.');
  }
  async inspect() {
    this.supported();
    const cmd = this.native();
    return audioSetupInventorySchema.parse(JSON.parse(await run(cmd.command, cmd.arguments, { cwd: cmd.cwd, input: 'null\n', timeout: 30_000 })));
  }
  async configure(before: AudioSetupInventory) {
    const cmd = this.native();
    return audioSetupInventorySchema.parse(JSON.parse(await run(cmd.command, cmd.arguments, { cwd: cmd.cwd, input: JSON.stringify({ defaults: before.defaults, installed: null }) + '\n', timeout: 30_000 })));
  }
  async receipt() {
    try { return receiptSchema.parse(JSON.parse(await readFile(join(this.directory, 'restart.json'), 'utf8'))).bootTimeMs; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Audio setup restart information could not be read.'); }
  }
  async record(bootTimeMs: number | null) {
    await mkdir(this.directory, { recursive: true });
    if (bootTimeMs === null) { await rm(join(this.directory, 'restart.json'), { force: true }); return; }
    await writeFile(join(this.directory, 'restart.tmp'), JSON.stringify({ bootTimeMs }));
    await rename(join(this.directory, 'restart.tmp'), join(this.directory, 'restart.json'));
  }
  async acquire() {
    this.supported();
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, 'install.lock');
    // The helper PID replaces the app PID before elevation, keeping other profiles out.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const lock = await open(path, 'wx');
        await lock.writeFile(String(process.pid)); await lock.close();
        return async () => { await rm(path, { force: true }); };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const pid = z.coerce.number().int().positive().parse(await readFile(path, 'utf8'));
        let alive = true;
        try { process.kill(pid, 0); } catch (failure) { if ((failure as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
        if (alive) throw new Error('Another Switchboard audio installer is running. Finish or close it first.');
        await rm(path, { force: true });
      }
    }
    throw new Error('Audio setup is busy.');
  }
  async download(kind: AudioDependency, signal: AbortSignal, progress: (percent: number) => void) {
    this.supported();
    const pkg = audioDependencyPackages[kind];
    const directory = join(this.directory, `${kind}-${pkg.sha256.slice(0, 12)}`);
    await mkdir(directory, { recursive: true });
    const archive = join(directory, 'package.zip');
    const response = await fetch(pkg.url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
    if (!response.ok || !response.body) throw new Error(`The official ${kind === 'cable' ? 'VB-CABLE' : 'Hi-Fi Cable'} download is unavailable. Try again later.`);
    const total = Number(response.headers.get('content-length'));
    if (total > maxDownloadBytes) throw new Error('Audio driver package exceeds the allowed size.');
    const hash = createHash('sha256');
    const file = await open(archive, 'w'); let size = 0; let last = -1;
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted(); size += chunk.length;
        if (size > maxDownloadBytes) throw new Error('Audio driver package exceeds the allowed size.');
        hash.update(chunk); await file.writeFile(chunk);
        const next = total > 0 ? Math.min(99, Math.floor(size * 100 / total)) : 0;
        if (next !== last) { progress(next); last = next; }
      }
    } finally { await file.close(); }
    if (hash.digest('hex') !== pkg.sha256) throw new Error('The audio driver download failed verification. Nothing was installed.');
    const extracted = join(directory, 'package');
    await powershell(`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)} -Force
$signature = Get-AuthenticodeSignature -LiteralPath ${quote(join(extracted, pkg.executable))}
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne ${quote(pkg.signer)}) { throw 'Audio installer publisher verification failed. Nothing was installed.' }`, 30_000, signal);
    progress(100); return extracted;
  }
  async install(kind: AudioDependency, directory: string, before: AudioSetupInventory) {
    const pkg = audioDependencyPackages[kind];
    const cmd = this.native();
    const defaults = join(this.directory, 'restore-defaults.json');
    await writeFile(defaults, JSON.stringify({ defaults: before.defaults, installed: kind }));
    // The outer helper stays unelevated. It restores defaults even if Electron closes.
    // Do not hide the vendor window: Hi-Fi Cable requires its own Install click.
    const script = `$ErrorActionPreference = 'Stop'
$PID | Set-Content -LiteralPath ${quote(join(this.directory, 'install.lock'))}
$installer = $null
$cancelled = $false
try {
  $signature = Get-AuthenticodeSignature -LiteralPath ${quote(join(directory, pkg.executable))}
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne ${quote(pkg.signer)}) { throw 'Audio installer publisher verification failed.' }
  $installer = Start-Process -FilePath ${quote(join(directory, pkg.executable))} -WorkingDirectory ${quote(directory)} -Verb RunAs -WindowStyle Normal -PassThru
  $installer.WaitForExit()
  if ($installer.ExitCode -notin @(0, 3010, 1641)) { throw 'The Windows audio installer did not complete. Close its window and retry.' }
} catch {
  if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) { $cancelled = $true }
  else { throw }
} finally {
  $restoreExit = 0
  if ($null -ne $installer) {
    $nativeArguments = @(${cmd.arguments.map(quote).join(',')})
    Get-Content -Raw -LiteralPath ${quote(defaults)} | & ${quote(cmd.command)} @nativeArguments
    $restoreExit = $LASTEXITCODE
  }
  if (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { ${process.pid} | Set-Content -LiteralPath ${quote(join(this.directory, 'install.lock'))} }
  else { Remove-Item -LiteralPath ${quote(join(this.directory, 'install.lock'))} -Force -ErrorAction SilentlyContinue }
  if ($restoreExit -ne 0) { throw 'Windows audio setup needs attention. Check your default devices and Hi-Fi Cable sample rates.' }
}
if ($cancelled) { exit 1223 }`;
    await powershell(script); // A user-owned installer may wait for interaction; never kill it mid-install.
  }
}

function powershell(script: string, timeout?: number, signal?: AbortSignal) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference='Stop'\n$ProgressPreference='SilentlyContinue'\ntry {\n${script}\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`, 'utf16le').toString('base64')], { timeout, signal });
}
function run(command: string, args: string[], options: { cwd?: string; input?: string; timeout?: number; signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, PSModulePath: undefined } });
    let out = ''; let err = ''; let failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const abort = () => stop(new Error('Audio setup download cancelled.'));
    const timer = options.timeout ? setTimeout(() => stop(new Error('Audio setup timed out. Try again.')), options.timeout) : null;
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => { out += String(data); if (out.length > 65536) stop(new Error('Audio setup returned too much data.')); });
    child.stderr.on('data', data => { err = (err + String(data)).slice(-4000); });
    child.on('error', error => { failure ??= error; });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure ?? (code === 1223 ? new AudioSetupCancelled() : new Error(err.trim() || 'Windows audio setup failed.')));
      else resolve(out.trim());
    });
    child.stdin.end(options.input ?? '');
    if (options.signal?.aborted) abort();
  });
}
