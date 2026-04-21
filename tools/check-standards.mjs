import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const requiredFiles = [
  'docs/development-standards.md',
  'docs/test-standards.md',
  'core/development-standards.md',
  'core/test-standards.md',
  '.github/pull_request_template.md',
  'README.md'
];

const requiredTemplateSnippets = [
  '`docs/development-standards.md`',
  '`docs/test-standards.md`',
  '`bun run typecheck`',
  '`bun run check`',
  'Refs #'
];

const requiredReadmeLinks = [
  '[docs/development-standards.md](docs/development-standards.md)',
  '[docs/test-standards.md](docs/test-standards.md)'
];

async function ensureFileExists(relPath) {
  const fullPath = path.join(root, relPath);
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(`Missing required standards file: ${relPath}`);
  }
}

async function assertContains(relPath, snippets) {
  const fullPath = path.join(root, relPath);
  const content = await fs.readFile(fullPath, 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      throw new Error(`Missing required snippet in ${relPath}: ${snippet}`);
    }
  }
}

async function main() {
  for (const relPath of requiredFiles) {
    await ensureFileExists(relPath);
  }

  await assertContains('.github/pull_request_template.md', requiredTemplateSnippets);
  await assertContains('README.md', requiredReadmeLinks);

  process.stdout.write('standards checks passed\n');
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
