import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEffectiveWorkspaceConfig,
  resolveWorkspaceLanguage,
  splitModuleOwnership
} from './workspace-state-pipeline.ts';
import type { Registry, WorkspaceConfig } from './types.ts';

const registry: Registry = {
  version: '1',
  languages: { typescript: { modules: {} } },
  targets: {}
};

test('resolveWorkspaceLanguage picks workspace then base language', () => {
  const base: WorkspaceConfig = { language: 'typescript' };
  const workspaceRaw: WorkspaceConfig = {};
  assert.equal(
    resolveWorkspaceLanguage({
      workspaceRaw,
      base,
      registry,
      configFile: 'ailib.config.json',
      workspaceDir: '/tmp'
    }),
    'typescript'
  );
});

test('splitModuleOwnership separates inherited and local', () => {
  const ownership = splitModuleOwnership({
    modules: ['eslint', 'biome'],
    inheritedModules: ['eslint']
  });
  assert.deepEqual(ownership.inherited, ['eslint']);
  assert.deepEqual(ownership.local, ['biome']);
});

test('buildEffectiveWorkspaceConfig builds expected shape', () => {
  const workspaceRaw: WorkspaceConfig = {};
  const base: WorkspaceConfig = {};
  const result = buildEffectiveWorkspaceConfig({
    workspaceRaw,
    base,
    isRootWorkspace: true,
    language: 'typescript',
    modules: ['eslint'],
    targets: ['cursor'],
    inheritedModules: [],
    localModules: ['eslint'],
    warnings: ['warn']
  });
  assert.equal(result.docs_path, 'docs/');
  assert.deepEqual(result.warnings, ['warn']);
});
