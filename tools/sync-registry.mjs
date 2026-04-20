import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const registryRoot = path.join(packageRoot, 'registry');
const corePath = path.join(registryRoot, 'core.json');
const languageDir = path.join(registryRoot, 'languages');
const outputPath = path.join(packageRoot, 'registry.json');

const checkOnly = process.argv.includes('--check');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function listLanguageFiles() {
  const entries = await fs.readdir(languageDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

async function buildRegistry() {
  const core = await readJson(corePath);
  if ('languages' in core) {
    throw new Error('registry/core.json must not contain a top-level `languages` key');
  }

  const languages = {};
  for (const file of await listLanguageFiles()) {
    const languageId = file.replace(/\.json$/u, '');
    languages[languageId] = await readJson(path.join(languageDir, file));
  }

  return { ...core, languages };
}

function toJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function run() {
  const built = await buildRegistry();
  const nextText = toJsonText(built);

  if (checkOnly) {
    const currentText = await fs.readFile(outputPath, 'utf8');
    if (currentText !== nextText) {
      process.stderr.write('registry.json is out of sync. Run: node tools/sync-registry.mjs\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('registry.json is up to date\n');
    return;
  }

  await fs.writeFile(outputPath, nextText, 'utf8');
  process.stdout.write('registry.json updated from split sources\n');
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
