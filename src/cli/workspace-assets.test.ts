import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureWorkspaceAssets } from './workspace-assets.ts';
import type { WorkspaceState } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-workspace-assets-'));
}

function state(localModules: string[]): WorkspaceState {
  return {
    effective: {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      registry_ref: 'test-registry',
      on_conflict: 'merge',
      language: 'typescript',
      modules: localModules,
      targets: ['cursor'],
      skills: [],
      docs_path: 'docs/',
      inheritedModules: [],
      localModules,
      inheritedSkills: [],
      localSkills: [],
      warnings: []
    },
    inheritedModules: [],
    localModules,
    inheritedSkills: [],
    localSkills: [],
    requiredFiles: [],
    warnings: []
  };
}

async function seedPackage(packageRoot: string) {
  await fs.mkdir(path.join(packageRoot, 'core'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'languages/typescript/modules'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'core/behavior.md'), 'behavior', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core/development-standards.md'), 'dev', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core/test-standards.md'), 'test', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages/typescript/core.md'), 'lang-core', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages/typescript/modules/eslint.md'), 'eslint', 'utf8');
}

test('ensureWorkspaceAssets copies core and module assets for root workspace', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);

  await ensureWorkspaceAssets({
    workspaceDir: rootDir,
    packageRoot,
    state: state(['eslint']),
    rootDir
  });

  assert.equal(await fs.readFile(path.join(rootDir, '.ailib/behavior.md'), 'utf8'), 'behavior');
  assert.equal(await fs.readFile(path.join(rootDir, '.ailib/standards.md'), 'utf8'), 'lang-core');
  assert.equal(await fs.readFile(path.join(rootDir, '.ailib/modules/eslint.md'), 'utf8'), 'eslint');
});

test('ensureWorkspaceAssets keeps local-only modules and removes stale module files', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);
  await fs.mkdir(path.join(workspaceDir, '.ailib/modules'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, '.ailib/modules/custom.md'), 'custom', 'utf8');
  await fs.writeFile(path.join(workspaceDir, '.ailib/modules/stale.md'), 'stale', 'utf8');

  await ensureWorkspaceAssets({
    workspaceDir,
    packageRoot,
    state: state(['custom']),
    rootDir
  });

  assert.equal(await fs.readFile(path.join(workspaceDir, '.ailib/modules/custom.md'), 'utf8'), 'custom');
  await assert.rejects(fs.readFile(path.join(workspaceDir, '.ailib/modules/stale.md'), 'utf8'));
});
