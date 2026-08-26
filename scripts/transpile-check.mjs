import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadTypeScript() {
  const candidates = [
    'typescript',
    '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js',
    '/usr/local/lib/node_modules/typescript/lib/typescript.js',
  ];

  for (const candidate of candidates) {
    try {
      const loaded = require(candidate);
      if (typeof loaded.transpileModule === 'function') return loaded;
    } catch {
      // Try the next known installation location.
    }
  }

  throw new Error('TypeScript is not available. Install dependencies, then rerun `bun run check:source`.');
}

const ts = loadTypeScript();
const extensions = new Set(['.ts', '.tsx']);
const roots = [path.join(root, 'src'), path.join(root, 'electron.vite.config.ts')];
const files = [];

function collect(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (extensions.has(path.extname(target)) && !target.endsWith('.d.ts')) files.push(target);
    return;
  }

  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') continue;
    collect(path.join(target, entry.name));
  }
}

for (const target of roots) collect(target);

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  let result;
  try {
    result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
      useDefineForClassFields: true,
      verbatimModuleSyntax: true,
    },
    });
  } catch (error) {
    failures.push({ file: path.relative(root, file), message: error instanceof Error ? error.message : String(error) });
    continue;
  }

  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const position = diagnostic.file && typeof diagnostic.start === 'number'
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : undefined;
    failures.push({
      file: path.relative(root, file),
      line: position ? position.line + 1 : undefined,
      column: position ? position.character + 1 : undefined,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }
}

if (failures.length > 0) {
  console.error(`TypeScript transpilation failed with ${failures.length} error(s):`);
  for (const failure of failures) {
    const location = failure.line ? `:${failure.line}:${failure.column}` : '';
    console.error(`  ${failure.file}${location}  ${failure.message}`);
  }
  process.exit(1);
}

console.log(`Transpiled ${files.length} TypeScript/TSX files without syntax errors (TypeScript ${ts.version}).`);
