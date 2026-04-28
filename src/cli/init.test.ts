import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initCommand, upsertWorkspaceLanguageOverrides } from './init.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';
import type { InitPromptIO } from './init-guided.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-init-'));
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

const registry: Registry = {
  version: 'test-registry',
  slots: ['linter'],
  languages: {
    typescript: { modules: { eslint: { slot: 'linter' } } },
    python: { modules: { ruff: { slot: 'linter' } } }
  },
  targets: { cursor: { output: '.cursor/rules/ai.md' }, 'claude-code': { output: 'CLAUDE.md' } },
  skills: {
    'task-driven-gh-flow': {
      display: 'Task-driven GH flow',
      path: 'skills/task-driven-gh-flow.md',
      skill_type: 'delivery',
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    },
    'release-readiness': {
      display: 'Release readiness',
      path: 'skills/release-readiness.md',
      skill_type: 'reliability',
      requires: ['task-driven-gh-flow'],
      compatible: {
        languages: ['typescript'],
        targets: ['cursor', 'claude-code']
      }
    }
  }
};

function createPromptIO(answers: string[]): InitPromptIO {
  const queue = [...answers];
  return {
    interactive: true,
    ask: async () => queue.shift() ?? '',
    write: () => {}
  };
}

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

test('initCommand guided flow selects targets language modules and skills', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"root"}\n', 'utf8');
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');

  await initCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: [] } as CliFlags,
    configFile: 'ailib.config.json',
    canonicalSlot: (_registry, slot) => slot || null,
    applyWorkspaceUpdate: async () => {},
    promptIO: createPromptIO([
      '1,2', // targets
      '2', // default language = typescript
      '1', // modules (eslint)
      '2,1', // skills (release-readiness + task-driven-gh-flow)
      'y' // apply summary
    ])
  });

  const config = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.equal(config.language, 'typescript');
  assert.deepEqual(config.modules, ['eslint']);
  assert.deepEqual(config.targets, ['claude-code', 'cursor']);
  assert.deepEqual(config.skills, ['release-readiness', 'task-driven-gh-flow']);
});

test('initCommand guided flow writes monorepo language override configs', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"root"}\n', 'utf8');
  await fs.mkdir(path.join(rootDir, 'apps', 'web'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'services', 'ml'), { recursive: true });
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');

  await initCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: [] } as CliFlags,
    configFile: 'ailib.config.json',
    canonicalSlot: (_registry, slot) => slot || null,
    applyWorkspaceUpdate: async () => {},
    promptIO: createPromptIO([
      '2', // targets (cursor)
      '2', // default language = typescript
      '', // modules -> none
      '', // skills -> none
      'y', // configure workspace overrides
      '', // apps/web -> keep default typescript
      '1', // services/ml -> python
      'y' // apply summary
    ])
  });

  const rootConfig = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.equal(rootConfig.language, 'typescript');

  const serviceConfig = JSON.parse(
    await fs.readFile(path.join(rootDir, 'services', 'ml', 'ailib.config.json'), 'utf8')
  ) as WorkspaceConfig;
  assert.equal(serviceConfig.language, 'python');
  assert.equal(serviceConfig.extends, '../../ailib.config.json');

  await assert.rejects(fs.readFile(path.join(rootDir, 'apps', 'web', 'ailib.config.json'), 'utf8'));
});

test('upsertWorkspaceLanguageOverrides updates existing workspace config', async () => {
  const rootDir = await tempDir();
  const workspaceDir = path.join(rootDir, 'services', 'ml');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    path.join(workspaceDir, 'ailib.config.json'),
    JSON.stringify(
      {
        $schema: 'https://ailib.dev/schema/config.schema.json',
        extends: '../../ailib.config.json',
        docs_path: './docs/',
        modules: ['ruff']
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  await upsertWorkspaceLanguageOverrides({
    rootDir,
    configFile: 'ailib.config.json',
    defaultLanguage: 'typescript',
    workspaceLanguageOverrides: { 'services/ml': 'python' }
  });

  const updated = JSON.parse(
    await fs.readFile(path.join(workspaceDir, 'ailib.config.json'), 'utf8')
  ) as WorkspaceConfig;
  assert.equal(updated.language, 'python');
  assert.deepEqual(updated.modules, ['ruff']);
});

test('initCommand waits for onboarding apply confirmation before writing files', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"root"}\n', 'utf8');
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');

  let applyCalled = false;
  let resolveConfirmReached: (() => void) | undefined;
  const confirmReached = new Promise<void>((resolve) => {
    resolveConfirmReached = resolve;
  });
  let releaseApplyConfirm: (() => void) | undefined;
  const applyConfirmGate = new Promise<void>((resolve) => {
    releaseApplyConfirm = resolve;
  });

  const runPromise = initCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: [], bare: true } as CliFlags,
    configFile: 'ailib.config.json',
    canonicalSlot: (_registry, slot) => slot || null,
    applyWorkspaceUpdate: async () => {
      applyCalled = true;
    },
    promptIO: {
      interactive: true,
      ask: async () => '',
      write: () => {},
      selectMany: async ({ title }) => {
        if (title === 'Targets') return ['cursor'];
        if (title === 'Modules (typescript)') return ['eslint'];
        if (title === 'Skills') return [];
        return [];
      },
      selectOne: async ({ title }) => {
        if (title === 'Default language') return 'typescript';
        throw new Error(`Unexpected single select: ${title}`);
      },
      confirm: async ({ question }) => {
        if (question.startsWith('Apply this setup?')) {
          resolveConfirmReached?.();
          await applyConfirmGate;
          return true;
        }
        return false;
      }
    }
  });

  await confirmReached;
  assert.equal(await fileExists(path.join(rootDir, 'ailib.config.json')), false);
  assert.equal(applyCalled, false);

  releaseApplyConfirm?.();
  await runPromise;
  assert.equal(await fileExists(path.join(rootDir, 'ailib.config.json')), true);
  assert.equal(applyCalled, true);
});
