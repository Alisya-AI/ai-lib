import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeRootConfig, resolveExtendsBase } from './workspace-config.ts';
import type { Registry, WorkspaceConfig } from './types.ts';

const registry: Registry = {
  version: '2.1.0',
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' }
      }
    }
  },
  targets: {
    'claude-code': { output: 'CLAUDE.md' },
    cursor: { output: '.cursor/rules/ailib.mdc' }
  }
};

const CONFIG_FILE = 'ailib.config.json';

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-workspace-config-'));
}

async function writeConfig(dir: string, config: WorkspaceConfig) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

test('normalizeRootConfig applies defaults', () => {
  const normalized = normalizeRootConfig({ language: 'typescript' }, registry);
  assert.equal(normalized.registry_ref, '2.1.0');
  assert.equal(normalized.on_conflict, 'merge');
  assert.deepEqual(normalized.targets, ['claude-code', 'cursor']);
  assert.equal(normalized.docs_path, 'docs/');
});

test('resolveExtendsBase returns normalized root config for root workspace', async () => {
  const root = await makeDir();
  await writeConfig(root, { language: 'typescript', modules: ['eslint'] });

  const resolved = await resolveExtendsBase({
    workspaceDir: root,
    rootDir: root,
    rootConfig: { language: 'typescript', modules: ['eslint'] },
    registry
  });
  assert.deepEqual(resolved.modules, ['eslint']);
  assert.equal(resolved.registry_ref, '2.1.0');
});

test('resolveExtendsBase resolves extends chains for workspace configs', async () => {
  const root = await makeDir();
  const shared = path.join(root, 'shared');
  const app = path.join(root, 'apps', 'web');

  await writeConfig(root, { language: 'typescript', modules: ['eslint'] });
  await writeConfig(shared, { language: 'typescript', modules: ['eslint'], targets: ['cursor'] });
  await writeConfig(app, { extends: '../../shared' });

  const resolved = await resolveExtendsBase({
    workspaceDir: app,
    rootDir: root,
    rootConfig: { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] },
    registry
  });

  assert.deepEqual(resolved.targets, ['cursor']);
  assert.deepEqual(resolved.modules, ['eslint']);
});

test('resolveExtendsBase fails for invalid extends path and circular extends', async () => {
  const root = await makeDir();
  const app = path.join(root, 'apps', 'web');
  await writeConfig(root, { language: 'typescript', modules: ['eslint'] });
  await writeConfig(app, { extends: './missing-base' });

  await assert.rejects(
    resolveExtendsBase({
      workspaceDir: app,
      rootDir: root,
      rootConfig: { language: 'typescript', modules: ['eslint'] },
      registry
    }),
    /Invalid extends path/
  );

  const circular = path.join(root, 'apps', 'circular');
  await writeConfig(circular, { extends: './' });
  await assert.rejects(
    resolveExtendsBase({
      workspaceDir: circular,
      rootDir: root,
      rootConfig: { language: 'typescript', modules: ['eslint'] },
      registry
    }),
    /Circular extends detected/
  );
});
