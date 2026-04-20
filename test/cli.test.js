import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../src/cli.js';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ailib-test-'));
  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  return dir;
}

async function makeMonorepo() {
  const root = await makeProject();
  await fs.mkdir(path.join(root, 'apps', 'web'), { recursive: true });
  await fs.mkdir(path.join(root, 'services', 'ml'), { recursive: true });
  return root;
}

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('init creates root config, root lock, and routers with new layout', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=typescript', '--modules=eslint,vitest', '--targets=claude-code,copilot', '--on-conflict=overwrite', '--bare'], { cwd, packageRoot });

  assert.equal(await exists(path.join(cwd, 'ailib.config.json')), true);
  assert.equal(await exists(path.join(cwd, 'ailib.lock')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/behavior.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/standards.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/modules/eslint.md')), true);
  assert.equal(await exists(path.join(cwd, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(cwd, '.github/copilot-instructions.md')), true);
});

test('monorepo update inherits root and supports service override modules', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,cursor,copilot', '--on-conflict=overwrite'], { cwd: root, packageRoot });

  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code,cursor,copilot'], { cwd: path.join(root, 'apps', 'web'), packageRoot });
  await run(['init', '--language=python', '--modules=ruff,pytest,fastapi', '--targets=claude-code,copilot'], { cwd: path.join(root, 'services', 'ml'), packageRoot });

  await run(['update'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib/behavior.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/biome.md')), true);
  assert.equal(await exists(path.join(root, 'apps', 'web', '.ailib/modules/eslint.md')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/standards.md')), true);
  assert.equal(await exists(path.join(root, '.github/instructions', 'apps__web.instructions.md')), true);

  const copilot = await fs.readFile(path.join(root, '.github/copilot-instructions.md'), 'utf8');
  assert.match(copilot, /## Workspace: \./);
  assert.match(copilot, /## Workspace: apps\/web/);
  assert.match(copilot, /## Workspace: services\/ml/);
});

test('add/remove can target workspace in monorepo', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code'], { cwd: path.join(root, 'services', 'ml'), packageRoot });

  await run(['add', 'pytest', '--workspace=services/ml'], { cwd: root, packageRoot });
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/modules/pytest.md')), true);

  await run(['remove', 'pytest', '--workspace=services/ml'], { cwd: root, packageRoot });
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib/modules/pytest.md')), false);
});

test('doctor validates all workspaces and keeps healthy status', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], { cwd: path.join(root, 'apps', 'web'), packageRoot });

  process.exitCode = 0;
  await run(['doctor'], { cwd: root, packageRoot });
  assert.equal(process.exitCode ?? 0, 0);
});

test('uninstall --all at root removes root and service outputs', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], { cwd: path.join(root, 'services', 'ml'), packageRoot });

  await run(['uninstall', '--all'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib')), false);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), false);
  assert.equal(await exists(path.join(root, 'ailib.lock')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', '.ailib')), false);
  assert.equal(await exists(path.join(root, 'services', 'ml', 'ailib.config.json')), false);
});
