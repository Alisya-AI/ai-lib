import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function exists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntimeBundle() {
  const runtimePath = path.join(packageRoot, 'dist', 'runtime', 'cli.js');
  if (await exists(runtimePath)) {
    return;
  }
  const result = await runBun(['build', 'src/cli.ts', '--target', 'bun', '--outfile', 'dist/runtime/cli.js']);
  assert.equal(result.code, 0, result.stderr);
}

function runBun(args: string[], cwd = packageRoot): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bun', args, { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('bin entrypoint runs with Bun and prints help', async () => {
  const binPath = path.join(packageRoot, 'bin', 'ailib.js');
  const result = await runBun([binPath, '--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /ailib commands:/);
});

test('bin entrypoint reports CLI errors through stderr', async () => {
  const binPath = path.join(packageRoot, 'bin', 'ailib.js');
  const result = await runBun([binPath, 'nope-command']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown command: nope-command/);
});

test('package files list points to existing release paths', async () => {
  await ensureRuntimeBundle();
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const fileEntries = pkg.files || [];
  assert.ok(fileEntries.length > 0, 'package.json files array should not be empty');

  for (const entry of fileEntries) {
    assert.equal(await exists(path.join(packageRoot, entry)), true, `missing packaged path: ${entry}`);
  }
});

test('release-critical entry files are present and executable', async () => {
  await ensureRuntimeBundle();
  const binPath = path.join(packageRoot, 'bin', 'ailib.js');
  const runtimePath = path.join(packageRoot, 'dist', 'runtime', 'cli.js');
  const registryPath = path.join(packageRoot, 'registry.json');
  const docsPath = path.join(packageRoot, 'docs', 'homebrew-publishing.md');

  assert.equal(await exists(binPath), true, 'missing bin/ailib.js');
  assert.equal(await exists(runtimePath), true, 'missing dist/runtime/cli.js');
  assert.equal(await exists(docsPath), true, 'missing docs/homebrew-publishing.md');
  assert.equal(await exists(registryPath), true, 'missing registry.json');

  const bin = await fs.readFile(binPath, 'utf8');
  const binStat = await fs.stat(binPath);
  assert.match(bin, /^#!\/usr\/bin\/env bun$/mu);
  assert.match(bin, /'\.\.\/dist\/runtime\/cli\.js'/mu);
  assert.match(bin, /'\.\.\/src\/cli\.ts'/mu);
  assert.ok((binStat.mode & 0o111) !== 0, 'bin/ailib.js should be executable');
});
