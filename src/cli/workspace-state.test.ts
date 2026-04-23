import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyLocalOverrides, buildWorkspaceState, getEffectiveWorkspaceConfig } from './workspace-state.ts';
import type { Registry, WorkspaceConfig } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-workspace-state-'));
}

const configFile = 'ailib.config.json';
const localOverrideFile = 'ailib.local.json';

const registry: Registry = {
  version: 'test-registry',
  slots: ['linter'],
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' },
        biome: { slot: 'linter' }
      }
    }
  },
  targets: {
    cursor: { output: '.cursor/rules' }
  }
};

const rootConfig: WorkspaceConfig = {
  $schema: 'https://ailib.dev/schema/config.schema.json',
  language: 'typescript',
  modules: ['eslint'],
  targets: ['cursor'],
  docs_path: 'docs/'
};

const canonicalSlot = (slot: string | undefined) => {
  if (!slot) return null;
  return registry.slot_aliases?.[slot] || slot;
};

test('applyLocalOverrides returns original values when local file is absent', async () => {
  const rootDir = await tempDir();
  const result = await applyLocalOverrides({
    rootDir,
    workspaceDir: rootDir,
    rootConfig,
    registry,
    language: 'typescript',
    modules: ['eslint'],
    targets: ['cursor'],
    canonicalSlot,
    localOverrideFile
  });
  assert.deepEqual(result, { modules: ['eslint'], targets: ['cursor'], warnings: [] });
});

test('getEffectiveWorkspaceConfig applies local override module swap', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootConfig, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(rootDir, localOverrideFile),
    `${JSON.stringify({ version: '1', default_override: { modules: { set: ['biome'] } } }, null, 2)}\n`,
    'utf8'
  );

  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir: rootDir,
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.deepEqual(effective.modules, ['biome']);
  assert.deepEqual(effective.localModules, ['biome']);
  assert.deepEqual(effective.targets, ['cursor']);
});

test('buildWorkspaceState includes root behavior file for root workspace', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootConfig, null, 2)}\n`, 'utf8');

  const state = await buildWorkspaceState({
    workspaceDir: rootDir,
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.ok(state.requiredFiles.includes('.ailib/behavior.md'));
  assert.ok(state.requiredFiles.includes('.ailib/standards.md'));
});

test('getEffectiveWorkspaceConfig propagates module merge warnings', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/web');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootConfig, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, configFile),
    `${JSON.stringify({ language: 'typescript', modules: ['biome'], targets: ['cursor'] }, null, 2)}\n`,
    'utf8'
  );

  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir,
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.equal(effective.modules[0], 'biome');
  assert.match(effective.warnings.join('\n'), /Slot override 'linter': eslint -> biome/);
});
