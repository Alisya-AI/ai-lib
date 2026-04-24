import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureWorkspaceAssets } from './workspace-assets.ts';
import type { Registry, WorkspaceState } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-workspace-assets-'));
}

const registry: Registry = {
  version: 'test-registry',
  languages: {
    typescript: {
      modules: {}
    }
  },
  targets: {
    cursor: { output: '.cursor/rules/ailib.mdc' }
  },
  skills: {
    'architecture-decision-flow': {
      display: 'Architecture decision flow',
      path: 'skills/architecture-decision-flow.md'
    },
    'task-driven-gh-flow': {
      display: 'Task-driven GH flow',
      path: '.cursor/skills/task-driven-gh-flow/SKILL.md'
    },
    'legacy-skill': {
      display: 'Legacy skill',
      path: '.cursor/skills/legacy-skill/SKILL.md'
    },
    'custom-only': {
      display: 'Custom only skill',
      path: '.cursor/skills/custom-only/SKILL.md'
    }
  }
};

function state(localModules: string[], localSkills: string[] = []): WorkspaceState {
  return {
    effective: {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      registry_ref: 'test-registry',
      on_conflict: 'merge',
      language: 'typescript',
      modules: localModules,
      targets: ['cursor'],
      skills: localSkills,
      docs_path: 'docs/',
      inheritedModules: [],
      localModules,
      inheritedSkills: [],
      localSkills,
      warnings: []
    },
    inheritedModules: [],
    localModules,
    inheritedSkills: [],
    localSkills,
    requiredFiles: [],
    warnings: []
  };
}

async function seedPackage(packageRoot: string) {
  await fs.mkdir(path.join(packageRoot, 'core'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'languages/typescript/modules'), { recursive: true });
  await fs.mkdir(path.join(packageRoot, 'skills'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'core/behavior.md'), 'behavior', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core/development-standards.md'), 'dev', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'core/test-standards.md'), 'test', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages/typescript/core.md'), 'lang-core', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages/typescript/modules/eslint.md'), 'eslint', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'skills/architecture-decision-flow.md'), 'architecture-flow', 'utf8');
  await fs.mkdir(path.join(packageRoot, '.cursor/skills/task-driven-gh-flow'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'skill-flow', 'utf8');
}

test('ensureWorkspaceAssets copies core and module assets for root workspace', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);

  await ensureWorkspaceAssets({
    workspaceDir: rootDir,
    packageRoot,
    state: state(['eslint']),
    rootDir,
    registry
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
    rootDir,
    registry
  });

  assert.equal(await fs.readFile(path.join(workspaceDir, '.ailib/modules/custom.md'), 'utf8'), 'custom');
  await assert.rejects(fs.readFile(path.join(workspaceDir, '.ailib/modules/stale.md'), 'utf8'));
});

test('ensureWorkspaceAssets copies and prunes skill assets', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);
  await fs.mkdir(path.join(workspaceDir, '.ailib/skills'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, '.ailib/skills/legacy-skill.md'), 'stale-skill', 'utf8');
  await fs.writeFile(path.join(workspaceDir, '.ailib/skills/custom.md'), 'custom-skill', 'utf8');

  await ensureWorkspaceAssets({
    workspaceDir,
    packageRoot,
    state: state([], ['task-driven-gh-flow']),
    rootDir,
    registry
  });

  assert.equal(
    await fs.readFile(path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'), 'utf8'),
    'skill-flow'
  );
  await assert.rejects(fs.readFile(path.join(workspaceDir, '.ailib/skills/legacy-skill.md'), 'utf8'));
  assert.equal(await fs.readFile(path.join(workspaceDir, '.ailib/skills/custom.md'), 'utf8'), 'custom-skill');
});

test('ensureWorkspaceAssets copies built-in skill assets from package sources', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);

  await ensureWorkspaceAssets({
    workspaceDir,
    packageRoot,
    state: state([], ['architecture-decision-flow']),
    rootDir,
    registry
  });

  assert.equal(
    await fs.readFile(path.join(workspaceDir, '.ailib/skills/architecture-decision-flow.md'), 'utf8'),
    'architecture-flow'
  );
});

test('ensureWorkspaceAssets prefers local custom skill over package source', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);
  await fs.mkdir(path.join(workspaceDir, '.cursor/skills/task-driven-gh-flow'), { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, '.cursor/skills/task-driven-gh-flow/SKILL.md'),
    'workspace-local-skill',
    'utf8'
  );
  await fs.mkdir(path.join(rootDir, '.cursor/skills/task-driven-gh-flow'), { recursive: true });
  await fs.writeFile(path.join(rootDir, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'root-local-skill', 'utf8');

  await ensureWorkspaceAssets({
    workspaceDir,
    packageRoot,
    state: state([], ['task-driven-gh-flow']),
    rootDir,
    registry
  });

  assert.equal(
    await fs.readFile(path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'), 'utf8'),
    'workspace-local-skill'
  );
});

test('ensureWorkspaceAssets prefers root local custom skill over package source', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);
  await fs.mkdir(path.join(rootDir, '.cursor/skills/task-driven-gh-flow'), { recursive: true });
  await fs.writeFile(path.join(rootDir, '.cursor/skills/task-driven-gh-flow/SKILL.md'), 'root-local-skill', 'utf8');

  await ensureWorkspaceAssets({
    workspaceDir,
    packageRoot,
    state: state([], ['task-driven-gh-flow']),
    rootDir,
    registry
  });

  assert.equal(
    await fs.readFile(path.join(workspaceDir, '.ailib/skills/task-driven-gh-flow.md'), 'utf8'),
    'root-local-skill'
  );
});

test('ensureWorkspaceAssets fails with actionable message for missing local custom skill source', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'apps/api');
  const packageRoot = path.join(rootDir, 'pkg');
  await seedPackage(packageRoot);

  await assert.rejects(
    ensureWorkspaceAssets({
      workspaceDir,
      packageRoot,
      state: state([], ['custom-only']),
      rootDir,
      registry
    }),
    /Missing local custom skill source: custom-only/
  );
});
