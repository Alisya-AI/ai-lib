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
  skills: ['task-driven-gh-flow'],
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
  assert.deepEqual(effective.skills, ['task-driven-gh-flow']);
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

test('applyLocalOverrides supports workspace-specific overrides', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/web');
  await fs.mkdir(workspaceDir, { recursive: true });
  const rootWithWorkspaces: WorkspaceConfig = {
    ...rootConfig,
    workspaces: ['apps/*']
  };
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootWithWorkspaces, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, configFile),
    `${JSON.stringify({ language: 'typescript', modules: ['eslint'], targets: ['cursor'] }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, localOverrideFile),
    `${JSON.stringify(
      {
        version: '1',
        default_override: { targets: { add: ['cursor'] } },
        workspace_overrides: {
          'apps/web': {
            modules: { set: ['biome'] }
          }
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const result = await applyLocalOverrides({
    rootDir,
    workspaceDir,
    rootConfig: rootWithWorkspaces,
    registry,
    language: 'typescript',
    modules: ['eslint'],
    targets: ['cursor'],
    canonicalSlot,
    localOverrideFile
  });

  assert.deepEqual(result.modules, ['biome']);
  assert.deepEqual(result.targets, ['cursor']);
});

test('getEffectiveWorkspaceConfig falls back to base modules and targets for root workspace', async () => {
  const rootDir = await tempDir();
  const rootConfigFromCaller: WorkspaceConfig = {
    ...rootConfig,
    modules: ['eslint'],
    targets: ['cursor']
  };
  await fs.writeFile(
    path.join(rootDir, configFile),
    `${JSON.stringify({ language: 'typescript' }, null, 2)}\n`,
    'utf8'
  );

  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir: rootDir,
    rootDir,
    rootConfig: rootConfigFromCaller,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.deepEqual(effective.modules, ['eslint']);
  assert.deepEqual(effective.targets, ['cursor']);
  assert.deepEqual(effective.skills, ['task-driven-gh-flow']);
  assert.deepEqual(effective.localSkills, ['task-driven-gh-flow']);
  assert.equal(effective.docs_path, 'docs/');
});

test('getEffectiveWorkspaceConfig inherits parent modules in non-root workspace', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/web');
  const rootWithWorkspaces: WorkspaceConfig = {
    ...rootConfig,
    workspaces: ['apps/*']
  };
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootWithWorkspaces, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, configFile),
    `${JSON.stringify({ language: 'typescript', targets: ['cursor'] }, null, 2)}\n`,
    'utf8'
  );

  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir,
    rootDir,
    rootConfig: rootWithWorkspaces,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.deepEqual(effective.inheritedModules, ['eslint']);
  assert.deepEqual(effective.localModules, []);
  assert.deepEqual(effective.modules, ['eslint']);
  assert.deepEqual(effective.inheritedSkills, ['task-driven-gh-flow']);
  assert.deepEqual(effective.localSkills, []);
  assert.deepEqual(effective.skills, ['task-driven-gh-flow']);
});

test('getEffectiveWorkspaceConfig merges inherited and local skills in workspace', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/web');
  const rootWithWorkspaces: WorkspaceConfig = {
    ...rootConfig,
    skills: ['task-driven-gh-flow'],
    workspaces: ['apps/*']
  };
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(path.join(rootDir, configFile), `${JSON.stringify(rootWithWorkspaces, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(workspaceDir, configFile),
    `${JSON.stringify(
      {
        language: 'typescript',
        modules: ['eslint'],
        targets: ['cursor'],
        skills: ['task-driven-gh-flow', 'code-review']
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const effective = await getEffectiveWorkspaceConfig({
    workspaceDir,
    rootDir,
    rootConfig: rootWithWorkspaces,
    registry,
    canonicalSlot,
    configFile,
    localOverrideFile
  });

  assert.deepEqual(effective.skills, ['task-driven-gh-flow', 'code-review']);
  assert.deepEqual(effective.inheritedSkills, ['task-driven-gh-flow']);
  assert.deepEqual(effective.localSkills, ['code-review']);
});
