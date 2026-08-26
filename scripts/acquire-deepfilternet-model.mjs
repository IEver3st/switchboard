import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const revision = '978576aa8400552a4ce9730838c635aa30db5e61';
const modelName = 'DeepFilterNet3_onnx.tar.gz';
const expectedHash = 'C94D91F70911001C946E0FABB4AA9ADC37045F45A03B56008CB0C8244CB63616';
const source = `https://raw.githubusercontent.com/Rikorose/DeepFilterNet/${revision}/models/${modelName}`;
const acknowledgement = '--acknowledge-model-license-unresolved';

if (!process.argv.includes(acknowledgement)) {
  console.error([
    'DeepFilterNet3 pretrained-weight redistribution terms are not explicitly resolved upstream.',
    'Switchboard does not package these weights. This command downloads the pinned artifact only at your request.',
    `Review https://github.com/Rikorose/DeepFilterNet/issues/697, then rerun with ${acknowledgement}.`,
  ].join('\n'));
  process.exit(2);
}
if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is unavailable.');

const response = await fetch(source, { redirect: 'follow' });
if (!response.ok) throw new Error(`Official model download failed: HTTP ${response.status}.`);
const bytes = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
if (sha256 !== expectedHash) throw new Error(`Model hash mismatch. Expected ${expectedHash}, received ${sha256}.`);

const output = join(process.env.LOCALAPPDATA, 'Switchboard', 'models', 'deepfilternet');
await mkdir(output, { recursive: true });
await writeFile(join(output, modelName), bytes);
await writeFile(join(output, 'acquisition.json'), `${JSON.stringify({
  schemaVersion: 1,
  source,
  upstreamRepository: 'https://github.com/Rikorose/DeepFilterNet',
  upstreamRevision: revision,
  modelName,
  sha256,
  modelWeightsLicense: 'UNRESOLVED - user initiated acquisition; not redistributed by Switchboard',
  acquiredAt: new Date().toISOString(),
}, null, 2)}\n`, 'utf8');
console.log(`Pinned DeepFilterNet3 model acquired in ${output}.`);
