import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previewDirectory = resolve(root, 'preview');
const outputPath = resolve(process.argv[2] ?? resolve(previewDirectory, 'standalone.html'));

const [html, css, javascript] = await Promise.all([
  readFile(resolve(previewDirectory, 'index.html'), 'utf8'),
  readFile(resolve(previewDirectory, 'styles.css'), 'utf8'),
  readFile(resolve(previewDirectory, 'app.js'), 'utf8'),
]);

const standalone = html
  .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="./app.js"></script>', `<script>\n${javascript.replaceAll('</script>', '<\\/script>')}\n</script>`);

await writeFile(outputPath, standalone, 'utf8');
console.log(`Wrote standalone preview: ${outputPath}`);
