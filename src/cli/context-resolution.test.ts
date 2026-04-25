import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  detectProjectRoot,
  findNearestMonorepoRoot,
  isRootWorkspaceConfig,
  relativePathForPointers,
  resolveContext,
  resolveDefaultWorkspaceForMutation,
  resolveWorkspacePath,
  workspaceLabelFor
} from './context-resolution.ts';

const CONFIG_FILE = 'ailib.config.json';

async function makeTempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-context-'));
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('resolveWorkspacePath handles relative and absolute values', () => {
  const root = '/tmp/project';
  assert.equal(resolveWorkspacePath(root, 'apps/web'), path.resolve(root, 'apps/web'));
  assert.equal(resolveWorkspacePath(root, '/var/tmp/alt'), path.resolve('/var/tmp/alt'));
});

test('workspaceLabelFor and relativePathForPointers return dot for same dir', () => {
  const root = '/tmp/project';
  assert.equal(workspaceLabelFor(root, root), '.');
  assert.equal(relativePathForPointers(root, root), '.');
});

test('isRootWorkspaceConfig reflects workspaces presence', () => {
  assert.equal(isRootWorkspaceConfig(undefined), false);
  assert.equal(isRootWorkspaceConfig({ language: 'typescript' }), false);
  assert.equal(isRootWorkspaceConfig({ language: 'typescript', workspaces: ['apps/*'] }), true);
});

test('detectProjectRoot finds package markers', async () => {
  const root = await makeTempRoot();
  const nested = path.join(root, 'services', 'ml');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');

  const detected = await detectProjectRoot(nested);
  assert.equal(detected, path.resolve(root));
});

test('detectProjectRoot throws when no markers exist', async () => {
  const orphan = await makeTempRoot();
  await assert.rejects(detectProjectRoot(orphan), /Could not detect project root/);
});

test('findNearestMonorepoRoot returns nearest config with workspaces', async () => {
  const root = await makeTempRoot();
  const appDir = path.join(root, 'apps', 'web');
  await fs.mkdir(appDir, { recursive: true });
  await writeJson(path.join(root, CONFIG_FILE), { language: 'typescript', workspaces: ['apps/*'] });
  await writeJson(path.join(appDir, CONFIG_FILE), { language: 'typescript' });

  const found = await findNearestMonorepoRoot(appDir);
  assert.equal(found, path.resolve(root));
});

test('findNearestMonorepoRoot returns null when configs have no workspaces', async () => {
  const root = await makeTempRoot();
  const appDir = path.join(root, 'apps', 'web');
  await fs.mkdir(appDir, { recursive: true });
  await writeJson(path.join(root, CONFIG_FILE), { language: 'typescript' });
  await writeJson(path.join(appDir, CONFIG_FILE), { language: 'typescript' });

  const found = await findNearestMonorepoRoot(appDir);
  assert.equal(found, null);
});

test('resolveContext uses workspace and monorepo root when available', async () => {
  const root = await makeTempRoot();
  const appDir = path.join(root, 'apps', 'web');
  const nested = path.join(appDir, 'src');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  await writeJson(path.join(root, CONFIG_FILE), { language: 'typescript', workspaces: ['apps/*'] });
  await writeJson(path.join(appDir, CONFIG_FILE), { language: 'typescript' });

  const resolved = await resolveContext(nested);
  assert.deepEqual(resolved, { rootDir: path.resolve(root), workspaceDir: path.resolve(appDir) });
});

test('resolveContext falls back to project root when no workspace config', async () => {
  const root = await makeTempRoot();
  const nested = path.join(root, 'service', 'code');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(root, 'pyproject.toml'), '[tool]\nname="tmp"\n', 'utf8');

  const resolved = await resolveContext(nested);
  assert.deepEqual(resolved, { rootDir: path.resolve(root), workspaceDir: path.resolve(root) });
});

test('resolveContext uses workspace as root when no monorepo root exists', async () => {
  const root = await makeTempRoot();
  const appDir = path.join(root, 'apps', 'web');
  const nested = path.join(appDir, 'src');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  await writeJson(path.join(appDir, CONFIG_FILE), { language: 'typescript' });

  const resolved = await resolveContext(nested);
  assert.deepEqual(resolved, { rootDir: path.resolve(appDir), workspaceDir: path.resolve(appDir) });
});

test('resolveDefaultWorkspaceForMutation prioritizes flag then workspace', () => {
  const context = {
    rootDir: '/tmp/project',
    workspaceDir: '/tmp/project/apps/web'
  };
  assert.equal(resolveDefaultWorkspaceForMutation(context, 'apps/api'), path.resolve('/tmp/project/apps/api'));
  assert.equal(resolveDefaultWorkspaceForMutation(context), '/tmp/project/apps/web');
  assert.equal(
    resolveDefaultWorkspaceForMutation({ rootDir: '/tmp/project', workspaceDir: '/tmp/project' }),
    '/tmp/project'
  );
});
