import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { listWorkspaceDirs } from './workspace-discovery.ts';
import type { WorkspaceConfig } from './types.ts';

const CONFIG_FILE = 'ailib.config.json';

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-ws-discovery-'));
}

async function writeConfig(dir: string, config: WorkspaceConfig) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

test('listWorkspaceDirs resolves explicit workspace override', async () => {
  const root = await makeRoot();
  const target = path.join(root, 'apps', 'web');
  await writeConfig(target, { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] });

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] },
    workspaceOverride: 'apps/web'
  });

  assert.deepEqual(dirs, [path.resolve(target)]);
});

test('listWorkspaceDirs rejects explicit override without config', async () => {
  const root = await makeRoot();
  await fs.mkdir(path.join(root, 'apps', 'missing'), { recursive: true });

  await assert.rejects(
    listWorkspaceDirs({
      rootDir: root,
      rootConfig: { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] },
      workspaceOverride: 'apps/missing'
    }),
    /Workspace has no ailib\.config\.json: apps\/missing/
  );
});

test('listWorkspaceDirs auto-discovery honors .gitignore wildcard patterns', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code']
  });

  const keepDir = path.join(root, 'service-keep');
  const ignoreDir = path.join(root, 'service-ignore');
  await writeConfig(keepDir, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });
  await writeConfig(ignoreDir, { language: 'typescript', modules: ['prettier'], targets: ['claude-code'] });
  await fs.writeFile(path.join(root, '.gitignore'), 'service-ign*\n', 'utf8');

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] }
  });

  assert.equal(dirs.includes(path.resolve(root)), true);
  assert.equal(dirs.includes(path.resolve(keepDir)), true);
  assert.equal(dirs.includes(path.resolve(ignoreDir)), false);
});

test('listWorkspaceDirs filters by workspace glob patterns', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code'],
    workspaces: ['apps/*']
  });

  const appWeb = path.join(root, 'apps', 'web');
  const appApi = path.join(root, 'apps', 'api');
  const serviceMl = path.join(root, 'services', 'ml');
  await writeConfig(appWeb, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });
  await writeConfig(appApi, { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] });
  await writeConfig(serviceMl, { language: 'python', modules: ['ruff'], targets: ['claude-code'] });

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['claude-code'],
      workspaces: ['apps/*']
    }
  });

  assert.deepEqual(dirs, [path.resolve(root), path.resolve(appApi), path.resolve(appWeb)]);
});

test('listWorkspaceDirs supports double-star workspace patterns', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code'],
    workspaces: ['apps/**']
  });

  const nestedApp = path.join(root, 'apps', 'group-a', 'service-a');
  await writeConfig(nestedApp, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['claude-code'],
      workspaces: ['apps/**']
    }
  });

  assert.equal(dirs.includes(path.resolve(nestedApp)), true);
});

test('listWorkspaceDirs supports slash and basename gitignore rules', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code']
  });

  const slashIgnored = path.join(root, 'apps', 'ignore', 'web');
  const nameIgnored = path.join(root, 'tmpignore');
  const kept = path.join(root, 'apps', 'keep', 'web');
  await writeConfig(slashIgnored, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });
  await writeConfig(nameIgnored, { language: 'typescript', modules: ['prettier'], targets: ['claude-code'] });
  await writeConfig(kept, { language: 'typescript', modules: ['eslint'], targets: ['claude-code'] });
  await fs.writeFile(path.join(root, '.gitignore'), 'apps/ignore/\ntmpignore\n', 'utf8');

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['claude-code']
    }
  });

  assert.equal(dirs.includes(path.resolve(slashIgnored)), false);
  assert.equal(dirs.includes(path.resolve(nameIgnored)), false);
  assert.equal(dirs.includes(path.resolve(kept)), true);
});

test('listWorkspaceDirs skips directories that fail readdir', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code']
  });

  const blocked = path.join(root, 'blocked');
  await fs.mkdir(blocked, { recursive: true });

  try {
    await fs.chmod(blocked, 0o000);
    const dirs = await listWorkspaceDirs({
      rootDir: root,
      rootConfig: {
        language: 'typescript',
        modules: ['eslint'],
        targets: ['claude-code']
      }
    });
    assert.equal(dirs.includes(path.resolve(root)), true);
  } finally {
    await fs.chmod(blocked, 0o755);
  }
});

test('listWorkspaceDirs skips symbolic link directories', async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code']
  });

  const realWorkspace = path.join(root, 'apps', 'web');
  const linkedWorkspace = path.join(root, 'apps-link');
  await writeConfig(realWorkspace, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });
  await fs.symlink(realWorkspace, linkedWorkspace, 'dir');

  const dirs = await listWorkspaceDirs({
    rootDir: root,
    rootConfig: {
      language: 'typescript',
      modules: ['eslint'],
      targets: ['claude-code']
    }
  });

  assert.equal(dirs.includes(path.resolve(realWorkspace)), true);
  assert.equal(dirs.includes(path.resolve(linkedWorkspace)), false);
});

test('listWorkspaceDirs tolerates lstat errors while walking', { concurrency: false }, async () => {
  const root = await makeRoot();
  await writeConfig(root, {
    language: 'typescript',
    modules: ['eslint'],
    targets: ['claude-code']
  });

  const nested = path.join(root, 'apps', 'web');
  await writeConfig(nested, { language: 'typescript', modules: ['biome'], targets: ['claude-code'] });

  const mutableFs = fs as unknown as { lstat: typeof fs.lstat };
  const originalLstat = mutableFs.lstat;
  mutableFs.lstat = (async () => {
    throw new Error('synthetic lstat failure');
  }) as typeof fs.lstat;

  try {
    const dirs = await listWorkspaceDirs({
      rootDir: root,
      rootConfig: {
        language: 'typescript',
        modules: ['eslint'],
        targets: ['claude-code']
      }
    });
    assert.deepEqual(dirs, [path.resolve(root)]);
  } finally {
    mutableFs.lstat = originalLstat;
  }
});
