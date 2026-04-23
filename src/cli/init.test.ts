import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initCommand } from './init.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-init-'));
}

const registry: Registry = {
  version: 'test-registry',
  slots: ['linter'],
  languages: { typescript: { modules: { eslint: { slot: 'linter' } } } },
  targets: { cursor: { output: '.cursor/rules/ai.md' } }
};

test('initCommand writes root config and calls update', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"root"}\n', 'utf8');
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');

  let called = false;
  await initCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: [], language: 'typescript', modules: 'eslint', targets: 'cursor' } as CliFlags,
    configFile: 'ailib.config.json',
    canonicalSlot: (_registry, slot) => slot || null,
    applyWorkspaceUpdate: async ({ rootDir: updateRoot }) => {
      called = true;
      assert.equal(updateRoot, rootDir);
    }
  });

  const config = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.equal(config.language, 'typescript');
  assert.deepEqual(config.modules, ['eslint']);
  assert.ok(Array.isArray(config.workspaces));
  assert.equal(called, true);
});

test('initCommand in service context writes extends config', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'ailib.config.json'), '{"workspaces":["apps/*"]}\n', 'utf8');
  const serviceDir = path.join(rootDir, 'apps', 'api');
  await fs.mkdir(serviceDir, { recursive: true });
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');

  let calledOverride = '';
  await initCommand({
    cwd: serviceDir,
    packageRoot,
    flags: { _: [], language: 'typescript', 'no-inherit': false } as CliFlags,
    configFile: 'ailib.config.json',
    canonicalSlot: (_registry, slot) => slot || null,
    applyWorkspaceUpdate: async ({ workspaceOverride }) => {
      calledOverride = workspaceOverride || '';
    }
  });

  const config = JSON.parse(await fs.readFile(path.join(serviceDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.ok(config.extends);
  assert.equal(calledOverride, serviceDir);
});
