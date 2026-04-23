import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { uninstallCommand, uninstallWorkspace } from './uninstall.ts';
import type { Registry, WorkspaceConfig } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-uninstall-'));
}

const registry: Registry = {
  version: 'test',
  languages: { typescript: { modules: {} } },
  targets: {
    cursor: { output: '.cursor/rules/ai.md', root_output: '.cursor/rules/root.md' },
    copilot: { output: '.github/copilot-instructions.md' }
  }
};

test('uninstallWorkspace removes managed outputs and root extras', async () => {
  const rootDir = await tempDir();
  const config: WorkspaceConfig = { workspaces: ['apps/*'], targets: ['cursor', 'copilot'] };
  await fs.mkdir(path.join(rootDir, '.ailib'), { recursive: true });
  await fs.mkdir(path.join(rootDir, '.cursor/rules'), { recursive: true });
  await fs.mkdir(path.join(rootDir, '.github/instructions'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'ailib.config.json'), '{}', 'utf8');
  await fs.writeFile(path.join(rootDir, '.cursor/rules/ai.md'), 'x', 'utf8');
  await fs.writeFile(path.join(rootDir, '.cursor/rules/root.md'), 'x', 'utf8');

  await uninstallWorkspace(rootDir, config, registry, 'ailib.config.json');

  await assert.rejects(fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8'));
  await assert.rejects(fs.readFile(path.join(rootDir, '.cursor/rules/ai.md'), 'utf8'));
  await assert.rejects(fs.readFile(path.join(rootDir, '.cursor/rules/root.md'), 'utf8'));
  await assert.rejects(fs.readdir(path.join(rootDir, '.github/instructions')));
});

test('uninstallCommand uninstalls root workspace in monorepo without --all', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(path.join(packageRoot), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');
  await fs.mkdir(path.join(rootDir, '.ailib'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify({ workspaces: ['apps/*'], targets: ['cursor'] })}\n`,
    'utf8'
  );

  let applyCalled = false;
  await uninstallCommand({
    cwd: rootDir,
    packageRoot,
    flags: {},
    configFile: 'ailib.config.json',
    lockFile: 'ailib.lock',
    applyWorkspaceUpdate: async () => {
      applyCalled = true;
    }
  });
  assert.equal(applyCalled, false);
  await assert.rejects(fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8'));
});
