import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadLocalOverrideConfig, validateLocalOverrideConfig } from './local-override-config.ts';
import type { LocalOverrideConfig, Registry, WorkspaceConfig } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-local-override-config-'));
}

const rootConfig: WorkspaceConfig = {
  language: 'typescript',
  modules: [],
  targets: ['cursor'],
  docs_path: 'docs/'
};

const registry: Registry = {
  version: 'test',
  slots: ['linter'],
  slot_aliases: { lint: 'linter' },
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' }
      }
    }
  },
  targets: {
    cursor: { output: '.cursor/rules' }
  },
  skills: {
    'task-driven-gh-flow': {
      display: 'Task-driven GH flow',
      path: '.cursor/skills/task-driven-gh-flow/SKILL.md'
    }
  }
};

const canonicalSlot = (slot: string | undefined) => {
  if (!slot) return null;
  return registry.slot_aliases?.[slot] || slot;
};

test('loadLocalOverrideConfig returns null when file is missing', async () => {
  const rootDir = await tempDir();
  const result = await loadLocalOverrideConfig({
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    localOverrideFile: 'ailib.local.json'
  });
  assert.equal(result, null);
});

test('loadLocalOverrideConfig throws for invalid JSON', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'ailib.local.json'), '{broken', 'utf8');
  await assert.rejects(
    loadLocalOverrideConfig({
      rootDir,
      rootConfig,
      registry,
      canonicalSlot,
      localOverrideFile: 'ailib.local.json'
    }),
    /Invalid ailib\.local\.json: invalid JSON/
  );
});

test('validateLocalOverrideConfig reports unknown workspace and shape issues', async () => {
  const rootDir = await tempDir();
  const config = {
    version: '',
    workspace_overrides: {
      'apps/missing': { targets: { set: ['cursor'] } }
    }
  } as unknown as LocalOverrideConfig;

  const errors = await validateLocalOverrideConfig({ rootDir, rootConfig, registry, config, canonicalSlot });
  assert.ok(errors.some((error) => error.includes("missing required string 'version'")));
  assert.ok(errors.some((error) => error.includes("unknown workspace override key 'apps/missing'")));
});

test('loadLocalOverrideConfig accepts a valid override file', async () => {
  const rootDir = await tempDir();
  const config: LocalOverrideConfig = {
    version: '1',
    default_override: {
      modules: { set: ['eslint'] },
      skills: { add: ['task-driven-gh-flow'] }
    }
  };
  await fs.writeFile(path.join(rootDir, 'ailib.local.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const loaded = await loadLocalOverrideConfig({
    rootDir,
    rootConfig,
    registry,
    canonicalSlot,
    localOverrideFile: 'ailib.local.json'
  });
  assert.deepEqual(loaded, config);
});
