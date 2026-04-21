import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../src/cli.ts';

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

async function captureStdout(fn) {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    if (typeof callback === 'function') callback();
    return true;
  };

  try {
    await fn();
    return writes.join('');
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function runDoctorAndCapture(root) {
  process.exitCode = 0;
  const output = await captureStdout(async () => {
    await run(['doctor'], { cwd: root, packageRoot });
  });
  const exitCode = process.exitCode ?? 0;
  process.exitCode = 0;
  return { output, exitCode };
}

test('run prints help for empty argv and --help', async () => {
  const outputEmpty = await captureStdout(async () => {
    await run([], { packageRoot });
  });
  assert.match(outputEmpty, /ailib commands:/);

  const outputHelp = await captureStdout(async () => {
    await run(['--help'], { packageRoot });
  });
  assert.match(outputHelp, /ailib init/);
});

test('run throws for unknown command', async () => {
  await assert.rejects(
    run(['unknown-command'], { packageRoot }),
    /Unknown command: unknown-command/
  );
});

test('slots list prints canonical slots with metadata', async () => {
  const output = await captureStdout(async () => {
    await run(['slots', 'list'], { packageRoot });
  });
  assert.match(output, /slots:/);
  assert.match(output, /- backend_framework \(exclusive\)/);
  assert.match(output, /- frontend_framework \(exclusive\)/);
});

test('modules list prints modules for selected language', async () => {
  const output = await captureStdout(async () => {
    await run(['modules', 'list', '--language=typescript'], { packageRoot });
  });
  assert.match(output, /modules \(typescript\):/);
  assert.match(output, /- eslint \(slot: linter\)/);
  assert.match(output, /- nestjs \(slot: backend_framework\)/);
});

test('modules explain prints module details', async () => {
  const output = await captureStdout(async () => {
    await run(['modules', 'explain', 'nextjs'], { packageRoot });
  });
  assert.match(output, /module: nextjs/);
  assert.match(output, /slot: frontend_framework/);
  assert.match(output, /requires: react/);
  assert.match(output, /doc: languages\/typescript\/modules\/nextjs\.md/);
});

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

test('init supports generic target outputs including openai and gemini', async () => {
  const cwd = await makeProject();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,cursor,windsurf,openai,gemini', '--on-conflict=overwrite', '--bare'], { cwd, packageRoot });

  assert.equal(await exists(path.join(cwd, 'CLAUDE.md')), true);
  assert.equal(await exists(path.join(cwd, '.cursor/rules/ailib.mdc')), true);
  assert.equal(await exists(path.join(cwd, '.windsurf/rules/ailib.md')), true);
  assert.equal(await exists(path.join(cwd, '.windsurfrules')), true);
  assert.equal(await exists(path.join(cwd, 'AGENTS.md')), true);
  assert.equal(await exists(path.join(cwd, 'GEMINI.md')), true);
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

test('doctor fails when required pointer files are missing', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], { cwd: path.join(root, 'apps', 'web'), packageRoot });

  await fs.rm(path.join(root, 'apps', 'web', '.ailib', 'standards.md'));

  const { output, exitCode } = await runDoctorAndCapture(root);

  assert.match(output, /doctor failed:/);
  assert.match(output, /Missing pointer file: \.ailib\/standards\.md/);
  assert.equal(exitCode, 1);
});

test('doctor reports missing frontmatter fields for module pointers', async () => {
  const root = await makeMonorepo();
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=typescript', '--modules=biome', '--targets=claude-code'], { cwd: path.join(root, 'apps', 'web'), packageRoot });

  const modulePath = path.join(root, 'apps', 'web', '.ailib', 'modules', 'biome.md');
  const original = await fs.readFile(modulePath, 'utf8');
  const fieldPatterns = [/^updated:.*\n/mu, /^slot:.*\n/mu];
  const mutated = fieldPatterns.reduce((text, pattern) => text.replace(pattern, ''), original);
  await fs.writeFile(modulePath, mutated, 'utf8');

  const { output, exitCode } = await runDoctorAndCapture(root);

  assert.match(output, /doctor failed:/);
  assert.match(output, /Frontmatter missing 'updated': \.ailib\/modules\/biome\.md/);
  assert.match(output, /Frontmatter missing 'slot': \.ailib\/modules\/biome\.md/);
  assert.equal(exitCode, 1);
});

test('uninstall at monorepo root without --all removes root workspace artifacts but keeps lock', async () => {
  const root = await makeMonorepo();
  const serviceDir = path.join(root, 'services', 'ml');

  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], { cwd: serviceDir, packageRoot });

  await run(['uninstall'], { cwd: root, packageRoot });

  assert.equal(await exists(path.join(root, '.ailib')), false);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), false);
  const lockPath = path.join(root, 'ailib.lock');
  assert.equal(await exists(lockPath), true);
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  assert.ok(lock.workspaces['services/ml']);
  assert.equal(await exists(path.join(serviceDir, '.ailib')), true);
  assert.equal(await exists(path.join(serviceDir, 'ailib.config.json')), true);
});

test('uninstall in service workspace removes service and keeps root managed', async () => {
  const root = await makeMonorepo();
  const serviceDir = path.join(root, 'services', 'ml');
  await run(['init', '--language=typescript', '--modules=eslint', '--targets=claude-code,copilot', '--on-conflict=overwrite'], { cwd: root, packageRoot });
  await run(['init', '--language=python', '--modules=ruff', '--targets=claude-code,copilot'], { cwd: serviceDir, packageRoot });

  await run(['uninstall'], { cwd: serviceDir, packageRoot });

  assert.equal(await exists(path.join(serviceDir, '.ailib')), false);
  assert.equal(await exists(path.join(serviceDir, 'ailib.config.json')), false);
  assert.equal(await exists(path.join(root, '.ailib')), true);
  assert.equal(await exists(path.join(root, 'ailib.config.json')), true);
  assert.equal(await exists(path.join(root, 'ailib.lock')), true);
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
