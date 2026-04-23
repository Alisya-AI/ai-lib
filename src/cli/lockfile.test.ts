import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRootLock } from './lockfile.ts';
import type { WorkspaceState } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-lockfile-'));
}

async function writeWorkspaceFiles(workspaceDir: string, modules: string[]) {
  await fs.mkdir(path.join(workspaceDir, '.ailib/modules'), { recursive: true });
  await fs.writeFile(path.join(workspaceDir, '.ailib/development-standards.md'), 'dev-standards', 'utf8');
  await fs.writeFile(path.join(workspaceDir, '.ailib/test-standards.md'), 'test-standards', 'utf8');
  await fs.writeFile(path.join(workspaceDir, '.ailib/standards.md'), 'lang-standards', 'utf8');
  if (modules.length > 0) {
    for (const mod of modules) {
      await fs.writeFile(path.join(workspaceDir, `.ailib/modules/${mod}.md`), `module:${mod}`, 'utf8');
    }
  }
}

function state(language: string, localModules: string[]): WorkspaceState {
  return {
    effective: {
      $schema: 'https://ailib.dev/schema/config.schema.json',
      registry_ref: 'test-registry',
      on_conflict: 'merge',
      language,
      modules: localModules,
      targets: ['cursor'],
      docs_path: 'docs/',
      inheritedModules: [],
      localModules,
      warnings: []
    },
    inheritedModules: [],
    localModules,
    requiredFiles: [],
    warnings: []
  };
}

test('writeRootLock writes root and workspace entries with source fallback', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  const workspaceDir = path.join(rootDir, 'apps', 'api');

  await fs.mkdir(path.join(packageRoot, 'languages', 'typescript', 'modules'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), '{"version":"test"}\n', 'utf8');
  await fs.writeFile(path.join(packageRoot, 'languages', 'typescript', 'modules', 'eslint.md'), '# eslint', 'utf8');

  await fs.mkdir(workspaceDir, { recursive: true });
  await writeWorkspaceFiles(rootDir, ['eslint']);
  await fs.writeFile(path.join(rootDir, '.ailib/behavior.md'), 'behavior', 'utf8');
  await writeWorkspaceFiles(workspaceDir, ['eslint', 'custom-module']);

  const allStates = new Map<string, WorkspaceState>([
    [rootDir, state('typescript', ['eslint'])],
    [workspaceDir, state('typescript', ['eslint', 'custom-module'])]
  ]);

  await writeRootLock({
    rootDir,
    packageRoot,
    packageVersion: '1.2.3',
    registryRef: 'test-registry',
    allStates
  });

  const lock = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.lock'), 'utf8')) as {
    cli_version: string;
    registry_ref: string;
    workspaces: Record<string, { files: Record<string, { source: string; sha256: string }> }>;
  };

  assert.equal(lock.cli_version, '1.2.3');
  assert.equal(lock.registry_ref, 'test-registry');
  assert.ok(lock.workspaces['.']?.files['.ailib/behavior.md']);
  assert.equal(
    lock.workspaces['.']?.files['.ailib/modules/eslint.md']?.source,
    'languages/typescript/modules/eslint.md'
  );
  assert.equal(lock.workspaces['apps/api']?.files['.ailib/modules/custom-module.md']?.source, 'local');
  assert.match(lock.workspaces['apps/api']?.files['.ailib/modules/custom-module.md']?.sha256 || '', /^[a-f0-9]{64}$/);
});
