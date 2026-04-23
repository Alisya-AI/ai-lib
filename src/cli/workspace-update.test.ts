import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyWorkspaceUpdate } from './workspace-update.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-workspace-update-'));
}

function canonicalSlot() {
  return null;
}

test('applyWorkspaceUpdate fails when root config is missing', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), '{"version":"test"}\n', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'package.json'), '{"version":"1.0.0"}\n', 'utf8');

  await assert.rejects(
    applyWorkspaceUpdate({
      packageRoot,
      rootDir,
      configFile: 'ailib.config.json',
      localOverrideFile: 'ailib.local.json',
      canonicalSlot
    }),
    /Missing ailib\.config\.json at root/
  );
});

test('applyWorkspaceUpdate generates workspace assets and lockfile', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(path.join(packageRoot, 'core'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'languages', 'typescript', 'modules'), { recursive: true });

  await fs.writeFile(path.join(packageRoot, 'core', 'behavior.md'), '# behavior', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core', 'development-standards.md'), '# dev', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core', 'test-standards.md'), '# test', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages', 'typescript', 'core.md'), '# standards', 'utf8');
  await fs.writeFile(
    path.join(packageRoot, 'registry.json'),
    `${JSON.stringify(
      {
        version: 'test-registry',
        slots: [],
        languages: { typescript: { modules: {} } },
        targets: { cursor: { output: '.cursor/rules/ai.md', display: 'Cursor' } }
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await fs.writeFile(path.join(packageRoot, 'package.json'), '{"version":"1.0.0"}\n', 'utf8');
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify(
      {
        $schema: 'https://ailib.dev/schema/config.schema.json',
        language: 'typescript',
        modules: [],
        targets: ['cursor'],
        docs_path: 'docs/'
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await applyWorkspaceUpdate({
    packageRoot,
    rootDir,
    configFile: 'ailib.config.json',
    localOverrideFile: 'ailib.local.json',
    canonicalSlot
  });

  assert.equal(await fs.readFile(path.join(rootDir, '.ailib', 'behavior.md'), 'utf8'), '# behavior');
  assert.equal(await fs.readFile(path.join(rootDir, '.cursor/rules/ai.md'), 'utf8').then(Boolean), true);
  assert.equal(await fs.readFile(path.join(rootDir, 'ailib.lock'), 'utf8').then(Boolean), true);
});
