import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addCommand, removeCommand, updateCommand } from './module-mutations.ts';
import type { CliFlags, Registry, WorkspaceConfig } from './types.ts';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ailib-module-mutations-'));
}

const registry: Registry = {
  version: 'test',
  slots: ['linter'],
  languages: {
    typescript: {
      modules: {
        eslint: { slot: 'linter' },
        biome: { slot: 'linter' }
      }
    }
  },
  targets: {
    cursor: { output: '.cursor/rules/ai.md' }
  }
};

test('updateCommand forwards workspace override and prints updated message', async () => {
  const rootDir = await tempDir();
  await fs.writeFile(path.join(rootDir, 'package.json'), '{"name":"tmp"}\n', 'utf8');
  let calledWith: { workspaceOverride?: string } | null = null;
  const stdout: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: typeof process.stdout.write }).write = ((chunk) => {
    stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  try {
    await updateCommand({
      cwd: rootDir,
      packageRoot: rootDir,
      flags: { _: [], workspace: 'apps/api' } as CliFlags,
      configFile: 'ailib.config.json',
      localOverrideFile: 'ailib.local.json',
      canonicalSlot: (_r, slot) => slot || null,
      applyWorkspaceUpdate: async (args) => {
        calledWith = { workspaceOverride: args.workspaceOverride };
      }
    });
  } finally {
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = originalWrite;
  }
  assert.ok(calledWith?.workspaceOverride?.endsWith('apps/api'));
  assert.match(stdout.join(''), /ailib updated/);
});

test('addCommand writes module into config and triggers update', async () => {
  const rootDir = await tempDir();
  const packageRoot = path.join(rootDir, 'pkg');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'registry.json'), `${JSON.stringify(registry)}\n`, 'utf8');
  const rootConfig: WorkspaceConfig = { language: 'typescript', modules: [], targets: ['cursor'] };
  await fs.writeFile(path.join(rootDir, 'ailib.config.json'), `${JSON.stringify(rootConfig)}\n`, 'utf8');

  let called = false;
  await addCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: ['eslint'] } as CliFlags,
    configFile: 'ailib.config.json',
    localOverrideFile: 'ailib.local.json',
    canonicalSlot: (_r, slot) => slot || null,
    applyWorkspaceUpdate: async () => {
      called = true;
    }
  });

  const updated = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.deepEqual(updated.modules, ['eslint']);
  assert.equal(called, true);
});

test('removeCommand removes module from config and triggers update', async () => {
  const rootDir = await tempDir();
  const packageRoot = await tempDir();
  await fs.writeFile(
    path.join(rootDir, 'ailib.config.json'),
    `${JSON.stringify({ language: 'typescript', modules: ['eslint', 'biome'], targets: [] })}\n`,
    'utf8'
  );

  let called = false;
  await removeCommand({
    cwd: rootDir,
    packageRoot,
    flags: { _: ['eslint'] } as CliFlags,
    configFile: 'ailib.config.json',
    applyWorkspaceUpdate: async () => {
      called = true;
    }
  });

  const updated = JSON.parse(await fs.readFile(path.join(rootDir, 'ailib.config.json'), 'utf8')) as WorkspaceConfig;
  assert.deepEqual(updated.modules, ['biome']);
  assert.equal(called, true);
});
