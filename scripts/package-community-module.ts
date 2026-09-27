import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeModuleRepository, packageDigest, verifyCommunityPackage, maximumCommunityPackageBytes } from '../src/main/services/community-modules';
import { validateModuleProject } from '../src/main/services/module-authoring';
import projectPackage from '../package.json';

const [command, ...args] = process.argv.slice(2);
if (command === 'keygen' && args.length === 1) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  await writeFile(resolve(args[0]!), privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  console.log(`Signing key created. Keep it private and reuse it for updates.\nPublic key fingerprint: ${packageDigest(publicKey.export({ type: 'spki', format: 'der' }))}`);
} else if (command === 'pack' && args.length === 4) {
  const [project, repository, keyPath, output] = args as [string, string, string, string];
  const validation = await validateModuleProject(resolve(project), projectPackage.version);
  if (validation.status !== 'ready' || !validation.manifest || !validation.entrypointPath) {
    throw new Error(validation.issues.map(issue => issue.message).join('\n') || 'Module validation failed.');
  }
  const key = createPrivateKey(await readFile(resolve(keyPath)));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Use an Ed25519 signing key.');
  const repo = normalizeModuleRepository(repository);
  const payload = Buffer.from(JSON.stringify({
    repository: repo,
    manifest: { ...validation.manifest, entrypoint: 'src/index.js' },
    source: await readFile(validation.entrypointPath, 'utf8'),
  }));
  const bytes = Buffer.from(JSON.stringify({
    format: 1,
    payload: payload.toString('base64'),
    publicKey: createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64'),
    signature: sign(null, payload, key).toString('base64'),
  }));
  verifyCommunityPackage(bytes, repo);
  if (bytes.length > maximumCommunityPackageBytes) throw new Error('The signed package exceeds 1 MB.');
  await writeFile(resolve(output), bytes, { flag: 'wx' });
  console.log(`Created ${resolve(output)}\nSHA-256: ${packageDigest(bytes)}\nUpload as switchboard-module.json to a stable GitHub release in ${repo}.`);
} else {
  console.error('Usage:\n  bun scripts/package-community-module.ts keygen <private-key.pem>\n  bun scripts/package-community-module.ts pack <project-folder> <owner/repository> <private-key.pem> <output-file>');
  process.exitCode = 1;
}
