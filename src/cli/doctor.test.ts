import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { doctorCommand } from './doctor.ts';
import type { CliFlags } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-doctor-'));
}

async function captureStdout(fn: () => Promise<void>) {
  const chunks: string[] = [];
  const mutableStdout = process.stdout as unknown as { write: typeof process.stdout.write };
  const originalWrite = mutableStdout.write.bind(process.stdout);
  mutableStdout.write = ((chunk, encoding, callback) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    const done = typeof encoding === 'function' ? encoding : callback;
    if (typeof done === 'function') done();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
    return chunks.join('');
  } finally {
    mutableStdout.write = originalWrite;
  }
}

test('doctorCommand reports missing managed pointer files', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, 'registry.json'),
    `${JSON.stringify({ version: 'test', slots: [], languages: { typescript: { modules: {} } }, targets: {} })}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify({ language: 'typescript', modules: [], targets: [] })}\n`,
    'utf8'
  );

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const output = await captureStdout(() =>
    doctorCommand({
      cwd: rootDir,
      packageRoot,
      flags: { _: [] } as CliFlags,
      configFile: 'ailib.config.json',
      localOverrideFile: 'ailib.local.json',
      canonicalSlot: (_registry, slot) => slot || null
    })
  );

  assert.match(output, /doctor failed:/);
  assert.match(output, /Missing pointer file: \.ailib\/behavior\.md/);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

test('doctorCommand reports workspace state build errors', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  const workspaceDir = path.join(rootDir, 'apps/web');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(
    path.join(packageRoot, 'registry.json'),
    `${JSON.stringify({ version: 'test', slots: [], languages: { typescript: { modules: {} } }, targets: {} })}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify({ language: 'typescript', modules: [], targets: [], workspaces: ['apps/*'] })}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(workspaceDir, 'ailib.config.json'),
    `${JSON.stringify({ language: 'unknownlang', modules: [], targets: [] })}\n`,
    'utf8'
  );

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const output = await captureStdout(() =>
    doctorCommand({
      cwd: rootDir,
      packageRoot,
      flags: { _: [] } as CliFlags,
      configFile: 'ailib.config.json',
      localOverrideFile: 'ailib.local.json',
      canonicalSlot: (_registry, slot) => slot || null
    })
  );

  assert.match(output, /\[apps\/web\] Unsupported language: unknownlang/);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});
