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

async function exists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('init creates config, lock, and router files', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=typescript', '--modules=eslint,vitest', '--targets=claude-code,copilot', '--on-conflict=overwrite'], { cwd, packageRoot });

  assert.equal(await exists(path.join(cwd, 'ailib.config.json')), true);
  assert.equal(await exists(path.join(cwd, 'ailib.lock')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/core/behavior.md')), true);
  assert.equal(await exists(path.join(cwd, '.ailib/languages/typescript/modules/eslint.md')), true);
  assert.equal(await exists(path.join(cwd, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(cwd, '.github/copilot-instructions.md')), true);
});

test('add enforces slot conflicts', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], { cwd, packageRoot });

  await assert.rejects(
    () => run(['add', 'biome'], { cwd, packageRoot }),
    /Slot conflict 'linter'/
  );
});

test('doctor reports healthy installation', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=python', '--modules=ruff,pytest', '--targets=cursor', '--on-conflict=overwrite'], { cwd, packageRoot });
  process.exitCode = 0;
  await run(['doctor'], { cwd, packageRoot });
  assert.equal(process.exitCode ?? 0, 0);
});

test('uninstall removes generated files', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=python', '--modules=ruff', '--targets=jetbrains', '--on-conflict=overwrite'], { cwd, packageRoot });
  await run(['uninstall'], { cwd, packageRoot });

  assert.equal(await exists(path.join(cwd, '.ailib')), false);
  assert.equal(await exists(path.join(cwd, 'ailib.config.json')), false);
  assert.equal(await exists(path.join(cwd, 'ailib.lock')), false);
  assert.equal(await exists(path.join(cwd, '.junie/guidelines.md')), false);
});
